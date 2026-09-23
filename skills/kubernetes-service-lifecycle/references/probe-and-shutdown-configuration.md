# Probe and shutdown configuration

## A three-probe fragment, with the arithmetic

```yaml
# Conceptual: only the lifecycle-relevant fields.
spec:
  terminationGracePeriodSeconds: 45 # budget hook + app + any sidecar shutdown + margin
  containers:
    - name: api
      lifecycle:
        preStop:
          sleep: { seconds: 10 } # requires enabled PodLifecycleSleepAction; GA in 1.34
      startupProbe:
        httpGet: { path: /actuator/health/liveness, port: 8081 }
        periodSeconds: 5
        failureThreshold: 30 # nominal boot allowance ≈ 150 s; measure actual timing
      livenessProbe:
        httpGet: { path: /actuator/health/liveness, port: 8081 }
        periodSeconds: 10
        timeoutSeconds: 2
        failureThreshold: 3 # detection ≈ 10 × 3 = 30 s
      readinessProbe:
        httpGet: { path: /actuator/health/readiness, port: 8081 }
        periodSeconds: 5
        timeoutSeconds: 2
        failureThreshold: 2 # removal from endpoints ≈ 10 s
        successThreshold: 1
```

Read the three numbers as answers to three questions:

- **Boot budget approximation** = `startupProbe.periodSeconds × failureThreshold`, adjusted
  for initial delay and probe execution timing. Set it from a chosen cold-start percentile
  plus explicit margin on production-equivalent throttled pods; "p99 times two" is not a
  universal reliability target.
- **Crash detection approximation** = `livenessProbe.periodSeconds × failureThreshold`. Shorter means
  faster recovery and more spurious restarts under load; that is the trade to argue about.
- **Traffic removal** = `readinessProbe.periodSeconds × failureThreshold`, plus however long
  the EndpointSlice change takes to reach every data plane — not bounded by the manifest, and
  the reason preStop exists.

Startup success gates the other probes, but do not assume their configured initial delays
have no effect. Inspect the target kubelet behavior and remove old delay settings only when
the startup check covers their intent. Derive timeouts from measured local-check tails under
throttling and pauses plus margin; an unbounded worst case is not a usable timeout target.

## Version-dependent pieces

- **`sleep` preStop action** — alpha in 1.29 with `PodLifecycleSleepAction` enabled explicitly,
  beta and enabled by default in 1.30, stable in 1.34. Where the native action is unavailable,
  an alternative is `exec: { command: ["/bin/sleep", "10"] }`, which requires the referenced
  binary in the image. Distroless and scratch images commonly lack it. A failing hook does
  not block termination, but kubelet records a `FailedPreStopHook` event when retained.
- **`grpc` probe** — a first-class probe type, stable since 1.27. On older clusters use
  `exec` with a gRPC health-check client binary shipped in the image.
- **Probe-level `terminationGracePeriodSeconds`** — overrides the pod value when a liveness
  or startup probe kills the container; GA in 1.28. Useful when a wedged process should be
  killed faster than a normal rollout drains.
- **Native sidecars** — an init container with `restartPolicy: Always` runs for the whole pod
  lifetime, starts before the app containers and terminates after them. Introduced as alpha
  in 1.28 and enabled by default from 1.29, stable in 1.33. Check the enabled gate and target
  release's termination behavior, especially the initial alpha implementation. Supported
  ordering keeps a native proxy sidecar running while app containers stop, but it does not add
  grace time: a slow app can leave the sidecar little or no time before forced termination.
  A proxy declared as a regular app container does not receive native-sidecar ordering.

Verify the cluster version before relying on any of these. Assume nothing from a blog post.

## The shutdown budget is one sum

```
terminationGracePeriodSeconds  >=  preStop  +  total application shutdown  +  margin
       45 s                    >=   10 s    +            20 s             +  15 s
```

The countdown starts when the pod is marked for deletion. `preStop` runs inside it, and the
runtime stop signal is requested after the hook returns. If a hook is still running at grace
expiry, kubelet currently requests a small one-off extension; this is emergency behavior,
not budget. The application shares the remainder across all sequential lifecycle phases,
bean destruction, other shutdown hooks and required sidecar cleanup. The example has no
additional sidecar allowance; add one when the pod needs it. A 20 s timeout per phase does not bound the whole
application to 20 s: enumerate phases, dependencies and other waits before using this example.
Get the inequality backwards and forced
termination can cut a request without giving the JVM a final logging opportunity.

A sleep-only preStop allowance can cover measured routing propagation, while hooks doing
actual work also consume that time. Correlate failures with endpoint and connection events;
do not keep increasing sleep for errors caused by application failures or incompatible
versions. Test repeated deploys with the real ingress, keep-alive and stream behavior.

## Spring Boot side

```yaml
server:
  shutdown: graceful # explicit across baselines; Boot 3.4+ defaults to graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s # per phase, NOT total; measure all phases
management:
  server:
    port: 8081 # example only; separate management listener has blind spots below
  endpoint:
    health:
      probes:
        enabled: true # auto-enabled when Boot detects Kubernetes; be explicit
      group:
        liveness:
          include: livenessState
        readiness:
          include: readinessState # evaluate dependency failure semantics before adding
      show-details: never
  endpoints:
    web:
      exposure:
        include: health
```

This produces `/actuator/health/liveness` and `/actuator/health/readiness` as separate
endpoints — the whole point, since the aggregate `/actuator/health` includes every registered
indicator, downstream ones included, and is therefore the wrong target for liveness.

Notes that decide correctness:

- `livenessState` and `readinessState` are in-process states, not dependency checks. Code
  signals an unrecoverable condition by publishing an availability change with
  `LivenessState.BROKEN`; Spring already moves readiness to `REFUSING_TRAFFIC` when the
  context begins closing.
- A group with `include: readinessState,db` fails on every replica when the database fails.
  Prefer checks that distinguish an unusable pod from replicas that can still serve. A shared
  dependency can justify a deliberate fail-closed readiness policy, but first compare losing
  all ready backends with serving degraded responses or using a fallback. Document the
  availability tradeoff and verify what clients and upstream routers do when none remain.
- A separate management listener can stay healthy while the main listener is broken. Prefer
  probing health groups on the main server when that matches the failure to detect. On Boot
  versions supporting `management.endpoint.health.probes.add-additional-paths=true`, this
  exposes `/livez` and `/readyz` there; update probe paths and ports together. Alternatively
  configure a group additional path such as `server:/readyz` where supported.
- The configured probe must reach the actual listener at the pod IP with the correct path
  and security rules. Numeric probe ports do not require a `containerPort` declaration or
  a Service port; named ports require a matching named container port. A stale path can
  return 404 and fail the probe.
- Verify the HTTP response, not just the health body: kubelet does not interpret a JSON
  `DOWN` or `OUT_OF_SERVICE`. HTTP 200 passes even with that body; a same-host redirect to
  a login page returning 200 can also pass without consulting the health group. Use a direct
  health response with the intended access rules; do not expose unrelated Actuator endpoints
  or disable application security to make a probe green.
- Check effective status mappings as well as group membership. In Boot 3.4, a custom
  `management.endpoint.health.status.http-mapping` replaces the default `DOWN` and
  `OUT_OF_SERVICE` mappings to 503; unmapped statuses return 200. Groups inherit the system
  mapper unless overridden. Inspect group-specific mappings and custom `HttpCodeStatusMapper`
  beans too. When adding a custom status, explicitly retain `down: 503` and
  `out-of-service: 503` if those states must fail the probe. Preserve an adequate existing
  mapping; changing thresholds cannot repair a response that always reports success.

When verifying a changed readiness response, use an isolated lifecycle test to switch
readiness from accepting to refusing traffic and back. Check the status returned on the
configured path/port with the probe's headers and access rules, then observe the pod's
readiness transition after its configured thresholds. A login redirect or HTTP 200 with an
unhealthy body must fail this validation even if kubelet reports success. This checks the
probe contract, not the rollout's complete availability SLO.

## Resources and disruption

- `requests` influence scheduling and QoS; memory limits can trigger kills and CPU limits
  impose quota throttling. Guaranteed QoS requires every relevant container to specify equal
  non-zero CPU and memory requests/limits. QoS affects eviction ordering but is not an
  absolute "evicted last" guarantee across priorities and resource conditions. The memory
  limit is enforced against the whole container, not the heap — sizing
  the heap and the non-heap under it is `container-awareness`.
- A PodDisruptionBudget applies only to evictions through the Eviction API (`kubectl drain`,
  autoscaler, node upgrades). It does not constrain a node crash, a direct pod deletion, or a
  Deployment's own rollout.
- `minAvailable: 1` with `replicas: 1` disallows a healthy-pod eviction through the Eviction
  API, so a compliant drain retries until capacity appears or its own timeout expires. Run
  enough replicas for the availability objective or explicitly accept/bypass the disruption.
- A PDB whose pods are already unhealthy can block the very drain that would fix them.
  `unhealthyPodEvictionPolicy: AlwaysAllow` (beta in 1.27, stable in 1.31) permits eviction of
  running-but-unready pods even when the healthy budget is not met. Healthy pods remain subject
  to the PDB; choose the policy deliberately because an evicted starting pod may have recovered.

## Sources

- [Kubernetes probe configuration](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/): scheduling, thresholds and probe-level grace.
- [Kubernetes 1.34 HTTP probe implementation](https://github.com/kubernetes/kubernetes/blob/v1.34.0/pkg/probe/http/http.go): response-status interpretation and redirect handling.
- [Kubernetes 1.34 feature gates](https://v1-34.docs.kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/): sleep-action and native-sidecar release/gate conditions.
- [Kubernetes sidecar lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/): termination ordering and the shared grace budget.
- [Kubernetes disruption budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/): unhealthy-pod eviction policy and its availability tradeoff.
- [Boot 3.4 release notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.4-Release-Notes): graceful shutdown default.
- [Boot Actuator probes](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.kubernetes-probes): main-port health groups and management-port blind spots. Match properties to the deployed Boot line.
- [Boot 3.4 health status mappings](https://docs.spring.io/spring-boot/3.4/reference/actuator/endpoints.html#actuator.endpoints.health.writing-custom-health-indicators): custom mappings replace defaults; health groups can inherit or override the system mapper.
