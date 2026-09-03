# Probe and shutdown configuration

## A three-probe fragment, with the arithmetic

```yaml
# Conceptual: only the lifecycle-relevant fields.
spec:
  terminationGracePeriodSeconds: 45 # must exceed preStop + app drain, with margin
  containers:
    - name: api
      lifecycle:
        preStop:
          sleep: { seconds: 10 } # Kubernetes 1.29+; see the note below
      startupProbe:
        httpGet: { path: /actuator/health/liveness, port: 8081 }
        periodSeconds: 5
        failureThreshold: 30 # 5 × 30 = 150 s of boot budget
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

With a `startupProbe` present, `initialDelaySeconds` on the other two is redundant: neither
runs until startup first succeeds. Delete it rather than tuning it. `timeoutSeconds` is a hard
ceiling on the check, so it must sit above the endpoint's worst case under the safepoint
pauses and CPU throttling the pod actually sees — not the numbers from a laptop.

## Version-dependent pieces

- **`sleep` preStop action** — added in 1.29, enabled by default from 1.30. Before that, the
  portable form is `exec: { command: ["/bin/sleep", "10"] }`, which requires the referenced
  binary in the image. Distroless and scratch images commonly lack it. A failing hook does
  not block termination, but kubelet records a `FailedPreStopHook` event when retained.
- **`grpc` probe** — a first-class probe type, stable since 1.27. On older clusters use
  `exec` with a gRPC health-check client binary shipped in the image.
- **Probe-level `terminationGracePeriodSeconds`** — overrides the pod value when a liveness
  or startup probe kills the container; GA in 1.25. Useful when a wedged process should be
  killed faster than a normal rollout drains.
- **Native sidecars** — an init container with `restartPolicy: Always` runs for the whole pod
  lifetime, starts before the app containers and terminates after them. Introduced as alpha
  in 1.28 and enabled by default from 1.29, stable in 1.33. This is what stops a mesh proxy
  from exiting while the application is still draining; on an older cluster that ordering
  does not exist and must be worked around in the proxy's own configuration.

Verify the cluster version before relying on any of these. Assume nothing from a blog post.

## The shutdown budget is one sum

```
terminationGracePeriodSeconds  >  preStop  +  application drain  +  margin
       45 s                    >   10 s    +        20 s          +  15 s
```

The countdown starts when the pod is marked for deletion. `preStop` runs inside it, and the
runtime stop signal is requested after the hook returns. If a hook is still running at grace
expiry, kubelet currently requests a small one-off extension; this is emergency behavior,
not budget. Whatever remains is what the application has — here,
`spring.lifecycle.timeout-per-shutdown-phase`. Get the inequality backwards and forced
termination can cut a request without giving the JVM a final logging opportunity.

The preStop value is not "how long shutdown takes" — it is how long endpoint removal takes to
propagate to every proxy in the path. Measure it: deploy repeatedly under an open-loop client
and raise it until the error count reaches zero.

## Spring Boot side

```yaml
server:
  shutdown: graceful # explicit across baselines; current Boot 4 defaults to graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s # default 30s; must fit the pod budget above
management:
  server:
    port: 8081 # probes hit this port, not the traffic port
  endpoint:
    health:
      probes:
        enabled: true # auto-enabled when Boot detects Kubernetes; be explicit
      group:
        liveness:
          include: livenessState
        readiness:
          include: readinessState # add a dependency here only if it is pod-local
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
  Put a dependency in readiness only when losing it makes _this pod_ useless while other pods
  stay useful.
- Moving management to its own port means the probe `port` must be that port, and the port
  must be exposed on the container. A probe left on the traffic port after a
  `management.server.port` change gets a 404, and a 404 counts as a probe failure.
- `management.endpoint.health.group.readiness.additional-path` publishes the readiness group
  on the main server port as well, for environments where only one port is reachable.

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
  `unhealthyPodEvictionPolicy: AlwaysAllow` (beta since 1.27) exists for that case.
