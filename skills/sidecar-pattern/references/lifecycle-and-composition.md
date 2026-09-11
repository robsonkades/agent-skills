# Lifecycle and composition mechanics of a two-container pod

## Native versus ordinary sidecar

```yaml
# Conceptual: only the composition-relevant fields.
spec:
  initContainers:
    - name: proxy # native sidecar: a restartable init container
      image: registry.example/proxy:1.14.2
      restartPolicy: Always # <- this line is the whole mechanism
      # Assumes this image serves a meaningful startup check on port 15002.
      startupProbe:
        httpGet: { path: /startup, port: 15002 }
        periodSeconds: 1
        failureThreshold: 30
      ports:
        - containerPort: 15001 # distinct from the app's port: one port space per pod
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits: { cpu: 100m, memory: 128Mi } # equal to requests: keeps the pod Guaranteed
      volumeMounts:
        - { name: proxy-config, mountPath: /etc/proxy, readOnly: true }
  containers:
    - name: api
      image: registry.example/api:2026.8.1
      ports: [{ containerPort: 8080 }]
      resources:
        requests: { cpu: '1', memory: 1Gi }
        limits: { cpu: '1', memory: 1Gi }
  volumes:
    - name: proxy-config
      configMap: { name: proxy-config }
```

`restartPolicy: Always` on an init container is what makes it a sidecar rather than a
one-shot init step. Alpha in Kubernetes 1.28, enabled by default from 1.29, **stable in
1.33**. In 1.28 it required an explicitly enabled alpha feature gate; older or incompatible
API servers may reject the field. Test admission and node support rather than assuming it is
silently ignored, especially during mixed-version upgrades.

Sidecar containers accept `startupProbe`, `readinessProbe` and `livenessProbe` like any other
container; what each probe should answer is `kubernetes-service-lifecycle`, not this skill.

## Ordering, at both edges

The native shutdown semantics below apply to Kubernetes 1.29+ with effective feature support.
The 1.28 alpha had different termination behavior; an enabled 1.28 deployment can still satisfy
a startup-only requirement. API acceptance alone does not establish the node's lifecycle
behavior. Keep an adequate independent shutdown protocol where needed; feature availability
does not by itself require an upgrade. See the [version-specific adoption guidance](https://v1-34.docs.kubernetes.io/docs/tutorials/configuration/pod-sidecar-containers/).

| Moment           | Ordinary sidecar                                                                                 | Native sidecar                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Startup          | No guarantee the peer is up when the app starts serving                                          | Process started; startupProbe, if configured, must succeed before app containers                          |
| Steady state     | Restarts independently; pod stays Running                                                        | Same                                                                                                      |
| Shutdown         | No defined order; the peer may exit while the app is draining                                    | Stopped after app containers during graceful termination; same Pod grace budget                           |
| `Job` completion | A helper that never exits blocks successful completion; an explicit exit protocol can avoid this | Sidecar does not block completion after app containers finish; Job success still depends on their outcome |

StartupProbe success must represent the dependency the app needs; a readinessProbe alone
is not a startup gate. Sidecar readiness contributes to the whole Pod: for an optional log
shipper, making all app traffic unready may be the wrong policy. Native sidecars stop in
reverse specification order; if apps consume the grace period, sidecars may have almost no
time to flush before SIGKILL. Ordering does not guarantee durable log delivery.

Native sidecars supply kubelet lifecycle ordering when supported; ordinary containers can instead
use an explicit bounded application admission/retry and termination protocol. Validate that
protocol's readiness, failed-app and shutdown cases. A fixed sleep does not establish readiness,
and an ordinary init step cannot wait for regular containers that start only after it finishes.

The two symptoms this produces on an ordinary sidecar are worth naming, because they are read
as application bugs:

- **Boot window errors.** For the first hundreds of milliseconds to seconds, the app is up and
  the proxy is not; every outbound call to `localhost` fails with connection refused. The
  usual mis-fix is a `sleep` in the app entrypoint, which trades a real error for a slower
  rollout and still races under load.
- **Drain window errors.** The proxy exits while the app is finishing in-flight work, so the
  last requests fail with no server-side log. The endpoint-removal side of that window is
  `kubernetes-service-lifecycle`; premature proxy termination is a hypothesis to confirm from
  aligned request/container events, not a diagnosis from the symptom alone.

## The localhost contract

The pod shares one network namespace. Consequences you must design around:

- One port space: conflicting address/port/protocol bindings collide. Different addresses
  or protocols can coexist; containerPort does not allocate or isolate a listening socket.
- `127.0.0.1` reaches the peer without leaving the pod — no Service, no DNS, no kube-proxy.
- The peer is still reachable from the pod's IP unless the process binds only to loopback.
  Binding a sidecar's admin port to `0.0.0.0` exposes it to anything with pod-network access.
- Ordinary filesystem mounts are distinct. To share a volume (often `emptyDir`), declare
  mounts in both containers; this does not merge their root filesystems.
- The PID namespace is **not** shared unless `shareProcessNamespace: true`. With it, the
  sidecar can see and signal the app's processes — which is occasionally the point (a
  debugger, a core dumper) and otherwise a security surface you did not need.
  It also exposes process information and access through `/proc/$pid/root`, subject to Unix
  and filesystem permissions; mounted volumes are not the only possible filesystem access path.

Shared networking or PID visibility does not authenticate a peer or grant every management
capability. Deliberate JMX/JVMTI/agent integration needs supported interfaces, credentials and
permissions for the actual operations. Protect administrative listeners and mounted secrets;
do not infer authorization from `localhost` or shared placement.
JVMTI itself is an in-process native agent interface; a separate controller can communicate
with that agent. Sharing a PID namespace does not itself install or enable the agent.

An application talking to a sidecar must configure the call as a network call:

```java
// Partial Java 11+ client sketch; connection/request timeout only, no retry here —
// prefer one retry owner, or enforce one coordinated total budget (see ambassador-pattern).
HttpClient toSidecar = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(200))   // illustrative; derive from remaining budget
        .build();

HttpRequest req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:15001/v1/tokens"))
        .timeout(Duration.ofMillis(500))          // must be inside the caller's own deadline
        .GET()
        .build();
```

These values do not bound every streaming body, queue or retry. Select the body handler,
read/cancellation limits and payload bound; connectTimeout matters when a connection is
established, not when an existing connection is reused.

A local request timeout does not automatically propagate a deadline to the proxy. If several
layers retry, coordinate total attempts and remaining time across queues, backoff and the next
hop; require replayable requests and appropriate idempotency. Independent per-layer maxima can
multiply attempts. Verify the proxy/client's actual mechanism rather than inventing a header.

A pool pointed at the peer must discard failed/closed connections and reconnect within the
request deadline after a sidecar restart. Validation on borrow can detect stale connections
earlier but adds work; protocol health checks, max lifetime and failure eviction are alternatives.
Use the HTTP client/proxy's actual connection and stream contracts here; `connection-pool-sizing`
owns JDBC/HikariCP sizing, not generic HTTP pool configuration.

## Resources: per container, consequences per pod

- Resources are traditionally declared per container; newer clusters can also enable Pod-level
  resources. Inspect the resulting cgroup hierarchy rather than assuming only one model.
- The **QoS class is per pod**. With container-level resources, Guaranteed requires matching
  positive CPU and memory requests/limits for every container. With Kubernetes 1.34+ Pod-level
  resources enabled, matching Pod-level requests/limits can establish Guaranteed QoS instead.
- Under node pressure, inspect priority and usage relative to requests. QoS can help estimate
  memory-pressure eviction risk; the label is not itself an eviction-order input. A sidecar with
  no request makes the pod's total request underestimate its usage and can increase eviction
  risk; it does not define a universal deterministic rank by itself.
- A native sidecar's requests count towards the pod's effective requests for scheduling, so
  adding one can make a previously schedulable pod pending on a full node.
- CPU limits enforce throttling and need a deliberate policy; requests, limit omission and
  accepted QoS must fit the workload and cluster constraints. The example's equal limits are
  one container-level Guaranteed configuration, not a universal deployment requirement.
- Sidecar memory is paid per replica. For a resource/placement change, use peak replica and
  rollout populations, distinguish requests/limits/working set, and check Pod and node headroom.

## Failure matrix

| Event                        | Kubernetes sees                     | The application sees                          | What to do about it                                                                                                                      |
| ---------------------------- | ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sidecar crashes and restarts | `RESTARTS` climbs, events           | Connection refused, then stale pooled sockets | Evict failed connections; optional validation; investigate restart rate and reason                                                       |
| Sidecar suspected OOM-killed | Termination reason/events           | Same as above, recurring under load           | Confirm reason/signal and cgroup/node evidence; exit 137 alone proves neither SIGKILL nor OOM; explicit exits can use that code          |
| Sidecar up but broken        | May be unready if probes detect it  | Wrong answers, or latency with no errors      | Its own readiness probe; the app's own error rate against `localhost` as an alert                                                        |
| App crashes                  | Restart depends on effective policy | Sidecar may keep running while app restarts   | Reconcile lease ownership with the actual restart/terminal lifecycle; release or expiry needs stale-actor protection, not just a timeout |
| Sidecar cannot start         | Pod stuck in `Init`                 | App never starts at all (native sidecar)      | This is the intended trade: a native sidecar makes its failure a pod failure                                                             |
| Pod evicted                  | Pod deleted                         | Both die together                             | Inspect eviction reason, pressure, priority and controller events; not uniquely a requests bug                                           |

Gray failures without an adequate probe can produce long incidents. Give the sidecar its own
metrics and meaningful health checks; record available peer identity/version on failures
without assuming the app automatically knows another container's image tag.

For a lease, establish which process owns/renews it and which resource enforces ownership when
effects are committed. Expiry or release alone cannot stop a paused former actor from resuming;
use fencing or equivalent checked ownership at the effect boundary. Apply the matrix to relevant
faults; a narrow explanation does not require an unrelated full cluster campaign.

## Primary references

- [Kubernetes 1.34 sidecar containers](https://v1-34.docs.kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/) — started/probe semantics, readiness, shutdown and restart.
- [Kubernetes 1.34 Pod QoS](https://v1-34.docs.kubernetes.io/docs/concepts/workloads/pods/pod-qos/) — effective resource model.
- [Kubernetes 1.34 Pod lifecycle](https://v1-34.docs.kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — grace and failure conditions.
- [Kubernetes 1.34 process namespace sharing](https://v1-34.docs.kubernetes.io/docs/tasks/configure-pod-container/share-process-namespace/) — process and filesystem visibility with permissions.
- [Kubernetes 1.34 node-pressure eviction](https://v1-34.docs.kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) — actual ranking inputs and QoS limits.
- [Java 11 HttpClient connect timeout](<https://docs.oracle.com/en/java/javase/11/docs/api/java.net.http/java/net/http/HttpClient.Builder.html#connectTimeout(java.time.Duration)>) and [response body handlers](https://docs.oracle.com/en/java/javase/11/docs/api/java.net.http/java/net/http/HttpResponse.BodyHandlers.html) — verify actual completion/streaming scope.
- [Java 25 JVMTI specification](https://docs.oracle.com/en/java/javase/25/docs/specs/jvmti.html) — in-process agent and possible external controller; inspect the target JVM's support.
