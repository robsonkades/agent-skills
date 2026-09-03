# Lifecycle and composition mechanics of a two-container pod

## Native versus ordinary sidecar

```yaml
# Conceptual: only the composition-relevant fields.
spec:
  initContainers:
    - name: proxy # a NATIVE sidecar: an init container that never exits
      image: registry.example/proxy:1.14.2
      restartPolicy: Always # <- this line is the whole mechanism
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

| Moment           | Ordinary sidecar                                              | Native sidecar                                                    |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Startup          | No guarantee the peer is up when the app starts serving       | Started, and its startup probe satisfied, before app containers   |
| Steady state     | Restarts independently; pod stays Running                     | Same                                                              |
| Shutdown         | No defined order; the peer may exit while the app is draining | Terminated after the last app container exits                     |
| `Job` completion | Pod never completes — the sidecar never exits                 | Kubelet terminates it once app containers exit; the Job completes |

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

- One port space: no two containers may bind the same port.
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
// Conceptual: a client for the in-pod peer. Bounded everywhere, no retry here —
// retry policy belongs to one layer only (see ambassador-pattern).
HttpClient toSidecar = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(200))   // loopback: if it is not immediate it is down
        .build();

HttpRequest req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:15001/v1/tokens"))
        .timeout(Duration.ofMillis(500))          // must be inside the caller's own deadline
        .GET()
        .build();
```

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

| Event                        | Kubernetes sees           | The application sees                          | What to do about it                                                                |
| ---------------------------- | ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Sidecar crashes and restarts | `RESTARTS` climbs, events | Connection refused, then stale pooled sockets | Validate connections on borrow; alert on restart rate, not on restart count        |
| Sidecar suspected OOM-killed | Termination reason/events | Same as above, recurring under load           | Confirm `OOMKilled` and cgroup/node evidence; exit 137 alone is only `SIGKILL`     |
| Sidecar up but broken        | **Nothing**               | Wrong answers, or latency with no errors      | Its own readiness probe; the app's own error rate against `localhost` as an alert  |
| App crashes                  | App container restarts    | Sidecar keeps running with no traffic         | Usually fine; a sidecar holding a lease must expire it, not depend on its own exit |
| Sidecar cannot start         | Pod stuck in `Init`       | App never starts at all (native sidecar)      | This is the intended trade: a native sidecar makes its failure a pod failure       |
| Pod evicted                  | Pod deleted               | Both die together                             | See the QoS note above; this is usually a requests bug                             |

The row with no Kubernetes signal is the one that produces long incidents. It is the reason a
sidecar needs its own probe and its own metrics, and the reason the app should log the peer's
identity (container name, image tag) on every failure against it.
