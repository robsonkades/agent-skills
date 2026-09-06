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

| Moment           | Ordinary sidecar                                              | Native sidecar                                                                   |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Startup          | No guarantee the peer is up when the app starts serving       | Process started; startupProbe, if configured, must succeed before app containers |
| Steady state     | Restarts independently; pod stays Running                     | Same                                                                             |
| Shutdown         | No defined order; the peer may exit while the app is draining | Stopped after app containers during graceful termination; same Pod grace budget  |
| `Job` completion | Pod never completes — the sidecar never exits                 | Kubelet terminates it once app containers exit; the Job completes                |

StartupProbe success must represent the dependency the app needs; a readinessProbe alone
is not a startup gate. Sidecar readiness contributes to the whole Pod: for an optional log
shipper, making all app traffic unready may be the wrong policy. Native sidecars stop in
reverse specification order; if apps consume the grace period, sidecars may have almost no
time to flush before SIGKILL. Ordering does not guarantee durable log delivery.

The two symptoms this produces on an ordinary sidecar are worth naming, because they are read
as application bugs:

- **Boot window errors.** For the first hundreds of milliseconds to seconds, the app is up and
  the proxy is not; every outbound call to `localhost` fails with connection refused. The
  usual mis-fix is a `sleep` in the app entrypoint, which trades a real error for a slower
  rollout and still races under load.
- **Drain window errors.** The proxy exits while the app is finishing in-flight work, so the
  last requests fail with no server-side log. The endpoint-removal side of that window is
  `kubernetes-service-lifecycle`; this half is caused by container ordering alone.

## The localhost contract

The pod shares one network namespace. Consequences you must design around:

- One port space: conflicting address/port/protocol bindings collide. Different addresses
  or protocols can coexist; containerPort does not allocate or isolate a listening socket.
- `127.0.0.1` reaches the peer without leaving the pod — no Service, no DNS, no kube-proxy.
- The peer is still reachable from the pod's IP unless the process binds only to loopback.
  Binding a sidecar's admin port to `0.0.0.0` exposes it to anything with pod-network access.
- Filesystems are **not** shared. Only an explicitly mounted volume (usually `emptyDir`) is,
  and it must be declared in both containers.
- The PID namespace is **not** shared unless `shareProcessNamespace: true`. With it, the
  sidecar can see and signal the app's processes — which is occasionally the point (a
  debugger, a core dumper) and otherwise a security surface you did not need.

An application talking to a sidecar must configure the call as a network call:

```java
// Partial Java 11+ client sketch; connection/request timeout only, no retry here —
// retry policy belongs to one layer only (see ambassador-pattern).
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

A pool pointed at the peer must discard failed/closed connections and reconnect within the
request deadline after a sidecar restart. Validation on borrow can detect stale connections
earlier but adds work; protocol health checks, max lifetime and failure eviction are alternatives.
General pool arithmetic is `connection-pool-sizing`.

## Resources: per container, consequences per pod

- Resources are traditionally declared per container; newer clusters can also enable Pod-level
  resources. Inspect the resulting cgroup hierarchy rather than assuming only one model.
- The **QoS class is per pod**. With container-level resources, Guaranteed requires matching
  positive CPU and memory requests/limits for every container. With Kubernetes 1.34+ Pod-level
  resources enabled, matching Pod-level requests/limits can establish Guaranteed QoS instead.
- Under node pressure, QoS, priority and usage relative to requests all matter. A sidecar with
  no request makes the pod's total request underestimate its usage and can increase eviction
  risk; it does not define a universal deterministic rank by itself.
- A native sidecar's requests count towards the pod's effective requests for scheduling, so
  adding one can make a previously schedulable pod pending on a full node.
- Sidecar memory is paid per replica. Before merging, multiply by the replica count at peak
  and compare it with the node's allocatable memory.

## Failure matrix

| Event                        | Kubernetes sees                     | The application sees                          | What to do about it                                                                                 |
| ---------------------------- | ----------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sidecar crashes and restarts | `RESTARTS` climbs, events           | Connection refused, then stale pooled sockets | Evict failed connections; optional validation; investigate restart rate and reason                  |
| Sidecar suspected OOM-killed | Termination reason/events           | Same as above, recurring under load           | Confirm `OOMKilled` and cgroup/node evidence; exit 137 alone is only `SIGKILL`                      |
| Sidecar up but broken        | May be unready if probes detect it  | Wrong answers, or latency with no errors      | Its own readiness probe; the app's own error rate against `localhost` as an alert                   |
| App crashes                  | Restart depends on effective policy | Sidecar may keep running while app restarts   | A sidecar holding a lease must expire it; inspect terminal Pod/Job lifecycle when no restart occurs |
| Sidecar cannot start         | Pod stuck in `Init`                 | App never starts at all (native sidecar)      | This is the intended trade: a native sidecar makes its failure a pod failure                        |
| Pod evicted                  | Pod deleted                         | Both die together                             | Inspect eviction reason, pressure, priority and controller events; not uniquely a requests bug      |

Gray failures without an adequate probe can produce long incidents. Give the sidecar its own
metrics and meaningful health checks; record available peer identity/version on failures
without assuming the app automatically knows another container's image tag.

## Primary references

- [Kubernetes sidecar containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/) — started/probe semantics, readiness, shutdown and restart.
- [Pod QoS](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/) — effective resource model.
- [Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — grace and failure conditions.
