# Routing modes: algorithms, health, ejection and drain

## Algorithms, by the property each equalises

| Algorithm                      | Equalises                                  | Right when                                                      | Fails when                                                                                                    |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Round-robin                    | Request **count** per backend              | Request cost is uniform and backends are homogeneous            | Cost varies: counts are even, latency is not. A slow backend receives its full share until ejected            |
| Weighted round-robin           | Count in proportion to a static weight     | Backends differ in capacity by a known, stable factor           | The weight is a guess that nobody revisits after the instance types change                                    |
| Least-request                  | Outstanding request count (often weighted) | Duration varies and active count correlates with remaining work | Long streams, heterogeneous costs/capacity or cold endpoints distort the signal                               |
| Least-connections              | Open transport connections                 | Connections are comparable units of work                        | HTTP/2 multiplexing or idle pools make connections incomparable                                               |
| Power of two random choices    | Chosen load signal over two candidates     | Global load state is costly/stale and endpoint set is large     | Tiny/locality-constrained pools, bad load signal, or heterogeneous weights need adaptation                    |
| Random                         | Nothing, in expectation everything         | Backends are homogeneous and you want zero coordination         | Small fleets: variance is high, and a hot backend gets no relief                                              |
| Consistent hashing on a key    | Key → backend **placement**                | The backend caches or owns per-key state                        | A backend is added or removed: some fraction of keys move. This is `sharding-and-partitioning`, not balancing |
| Session affinity (cookie / IP) | Client → backend stickiness                | State is per-connection and derivable                           | The backend dies, drains, or the affinity table rebuilds — see `stateless-service-design`                     |

### Why two random choices beats global least-loaded

A single balancer with a perfect view would always pick the least-loaded backend. Distributed
balancers do not have a perfect view: each holds a slightly old picture, and — critically —
they all hold _the same_ old picture. Every balancer therefore identifies the same replica as
idlest and sends its next request there, so the fleet herds onto whichever replica most
recently looked free. The replica becomes the hottest, the next update herds everyone onto a
different one, and load oscillates.

Picking two candidates independently and choosing the less loaded reduces shared herding and
gives strong theoretical balance under assumptions of homogeneous servers and independent
arrivals. Real implementations need weighting, locality, circuit state and a meaningful local
load signal; it is a candidate default, not universally best.

## Health checking and outlier ejection

Two different mechanisms; keep them distinct.

- **Active health check** — the balancer probes the backend on an interval. It costs a request
  per backend per interval and detects an unresponsive backend even with no traffic.
- **Passive health check / outlier ejection** — the balancer observes real responses and
  temporarily removes a backend that produces consecutive errors or gateway failures. It costs
  nothing extra and detects only what traffic reveals.

Settings that decide the behaviour, by role:

| Setting                     | Role                                                                | Getting it wrong                                                                                 |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Interval                    | How often the backend is probed                                     | Too short: probe load is real background traffic on every backend, forever                       |
| Unhealthy threshold         | Consecutive failures before removal                                 | 1 means a single blip removes a healthy backend                                                  |
| Healthy threshold           | Consecutive successes before return                                 | 1 means a flapping backend re-enters and fails again, repeatedly                                 |
| Timeout                     | How long a probe may take                                           | Below the check's own p99 the probe fails exactly under the load it exists to survive            |
| Ejection duration / base    | How long an ejected backend stays out, usually growing per ejection | Too long: capacity you still need is idle; too short: flapping                                   |
| **Max ejection percentage** | Cap on how much of the upstream may be ejected at once              | Unset or 100%: a shared-dependency blip ejects the entire fleet and the balancer has no backends |

**The fleet-ejection hazard.** Policies often behave as though failures are independent. When every
replica depends on the same database, the same cache or the same downstream, a blip fails all
of them simultaneously and the balancer ejects all of them — turning a partial degradation
into a total outage exactly like a liveness probe that checks a dependency
(`kubernetes-service-lifecycle`). Select controls by failure semantics:

1. Cap the ejection percentage, so a floor of backends always remains in rotation.
2. Reserve overload headroom and couple ejection to admission control; otherwise ejecting one
   endpoint overloads the next.
3. Use **fail-open** panic behaviour only when degraded attempts are safer than rejection. For
   corruption, identity or incompatible-version signals, fail closed or use a known-good set.

Kubernetes readiness and balancer checks can be complementary: one reports endpoint lifecycle,
the other observes a specific network path or request class. Align semantics/timing and expose
why each excluded a host. Do not make readiness depend on a shared downstream whose failure
would remove every caller simultaneously.

## The drain sequence

Ordered. Reversing any pair produces resets that look like application errors.

1. The pod is marked not-ready or deregistered; the balancer's data plane begins converging.
2. **Allow for measured propagation.** New flows/requests may still arrive because
   EndpointSlice, proxies, DNS/client discovery and external LBs converge independently. A
   `preStop` sleep is one coarse guard, not proof of removal.
3. The process stops accepting new work and finishes in-flight requests (Spring Boot:
   `server.shutdown=graceful`).
4. Non-HTTP work drains: consumers, schedulers, executors.
5. The process exits, inside `terminationGracePeriodSeconds`.

A deregistration delay shorter than the balancer's propagation time is the direct cause of
"502s only during deploys". For HTTP/2 and gRPC, add one step: the server should send GOAWAY
so clients migrate their streams rather than losing them on close.

## Choosing among the three placements

| Question                                  | L4                             | L7 proxy                                                | Client-side                              |
| ----------------------------------------- | ------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| Balances per request/stream               | No — per flow                  | Usually, at configured L7 unit                          | Depends on resolver/policy               |
| Handles HTTP/2/gRPC multiplexing          | One backend per TCP connection | Can route new streams; one streaming RPC remains pinned | Can spread calls/channels                |
| Can retry, route by header, split traffic | No                             | Yes                                                     | Yes, if every client implements it       |
| Additional application-proxy hop          | No                             | Maybe — depends on topology                             | No centralized hop                       |
| Policy change without redeploying callers | n/a                            | Yes                                                     | **No** — policy ships inside each client |
| Works for third-party or polyglot callers | Yes                            | Yes                                                     | No                                       |
| Per-request observability at the balancer | No                             | Yes                                                     | Only in the client's own metrics         |

An in-pod proxy (the ambassador form) is client-side balancing with the policy moved out of
the application process — `ambassador-pattern` owns that shape.

## Verifying the routing, not reviewing it

- **Skew test.** Under steady realistic load, report capacity-normalized work distribution,
  max/median and top-endpoint share. Avoid `max/min` when idle/zero endpoints make it infinite.
- **Scale-up test.** Add a replica under load and watch how long it takes to reach its share.
  With multiplexed connections and no recycling, the answer is "never" — and that is the
  finding.
- **Rollout test.** An open-loop client through a full deploy, counting non-2xx and resets. A
  closed-loop client throttles itself against the disruption and under-reports it, which is
  `coordinated-omission`.
- **Ejection drill.** Fault-inject errors into one backend and confirm it is ejected; then
  inject into all backends and confirm the chosen cap, admission and fail-open/closed contract.
  Assert survivor saturation and recovery hysteresis, not merely that traffic kept flowing.

## Primary references

- [Envoy load-balancing architecture](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/overview)
- [Envoy outlier detection](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier)
- [Kubernetes Services networking](https://kubernetes.io/docs/concepts/services-networking/service/)
- [The Power of Two Random Choices](https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf)
