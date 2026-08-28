# Routing modes: algorithms, health, ejection and drain

## Algorithms, by the property each equalises

| Algorithm                         | Equalises                              | Right when                                                            | Fails when                                                                                                    |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Round-robin                       | Request **count** per backend          | Request cost is uniform and backends are homogeneous                  | Cost varies: counts are even, latency is not. A slow backend receives its full share until ejected            |
| Weighted round-robin              | Count in proportion to a static weight | Backends differ in capacity by a known, stable factor                 | The weight is a guess that nobody revisits after the instance types change                                    |
| Least-request / least-connections | **Outstanding** work per backend       | Cost varies; the good default for HTTP services with variable latency | Requests are extremely short-lived, so the counter is stale by the time it is read                            |
| Power of two random choices       | Outstanding work, approximately        | The balancer is one of many and its view of load is stale             | Nothing much — this is the practical default in distributed balancers                                         |
| Random                            | Nothing, in expectation everything     | Backends are homogeneous and you want zero coordination               | Small fleets: variance is high, and a hot backend gets no relief                                              |
| Consistent hashing on a key       | Key → backend **placement**            | The backend caches or owns per-key state                              | A backend is added or removed: some fraction of keys move. This is `sharding-and-partitioning`, not balancing |
| Session affinity (cookie / IP)    | Client → backend stickiness            | State is per-connection and derivable                                 | The backend dies, drains, or the affinity table rebuilds — see `stateless-service-design`                     |

### Why two random choices beats global least-loaded

A single balancer with a perfect view would always pick the least-loaded backend. Distributed
balancers do not have a perfect view: each holds a slightly old picture, and — critically —
they all hold _the same_ old picture. Every balancer therefore identifies the same replica as
idlest and sends its next request there, so the fleet herds onto whichever replica most
recently looked free. The replica becomes the hottest, the next update herds everyone onto a
different one, and load oscillates.

Picking two backends at random and choosing the less loaded of the two removes the shared
signal: the two draws differ per balancer, so there is no common target to herd onto. It gives
most of the benefit of least-loaded and none of the synchronisation, which is why it is the
practical default in real balancers and meshes.

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

**The fleet-ejection hazard.** Health checks assume failures are independent. When every
replica depends on the same database, the same cache or the same downstream, a blip fails all
of them simultaneously and the balancer ejects all of them — turning a partial degradation
into a total outage exactly like a liveness probe that checks a dependency
(`kubernetes-service-lifecycle`). Two defences, and use both:

1. Cap the ejection percentage, so a floor of backends always remains in rotation.
2. Prefer a **fail-open** panic behaviour: when the healthy fraction falls below a threshold,
   route to all backends regardless of health. Serving a degraded response beats serving none,
   and the health signal has stopped being informative anyway.

**Do not run two independent failure detectors.** Kubernetes readiness already removes a pod
from the EndpointSlice. A balancer health check with different timing will disagree with it
during startup and shutdown — the two windows where it matters. Either point the balancer at
the same readiness endpoint with compatible timings, or let readiness own removal and use only
passive ejection at the balancer.

## The drain sequence

Ordered. Reversing any pair produces resets that look like application errors.

1. The pod is marked not-ready or deregistered; the balancer's data plane begins converging.
2. **Wait for propagation.** New connections still arrive during this window, because endpoint
   removal and SIGTERM are concurrent, not ordered. This is what the pod's `preStop` sleep
   buys — the budget arithmetic is `kubernetes-service-lifecycle`.
3. The process stops accepting new work and finishes in-flight requests (Spring Boot:
   `server.shutdown=graceful`).
4. Non-HTTP work drains: consumers, schedulers, executors.
5. The process exits, inside `terminationGracePeriodSeconds`.

A deregistration delay shorter than the balancer's propagation time is the direct cause of
"502s only during deploys". For HTTP/2 and gRPC, add one step: the server should send GOAWAY
so clients migrate their streams rather than losing them on close.

## Choosing among the three placements

| Question                                  | L4                  | L7 proxy | Client-side                              |
| ----------------------------------------- | ------------------- | -------- | ---------------------------------------- |
| Balances per request                      | No — per connection | Yes      | Yes                                      |
| Works for HTTP/2 and gRPC                 | Pins load           | Yes      | Yes                                      |
| Can retry, route by header, split traffic | No                  | Yes      | Yes, if every client implements it       |
| Extra network hop                         | Minimal             | Yes      | No                                       |
| Policy change without redeploying callers | n/a                 | Yes      | **No** — policy ships inside each client |
| Works for third-party or polyglot callers | Yes                 | Yes      | No                                       |
| Per-request observability at the balancer | No                  | Yes      | Only in the client's own metrics         |

An in-pod proxy (the ambassador form) is client-side balancing with the policy moved out of
the application process — `ambassador-pattern` owns that shape.

## Verifying the routing, not reviewing it

- **Skew test.** Under steady load, record per-pod request rate for ten minutes and report
  `max/min`. State the number; "traffic looks balanced" is not a measurement.
- **Scale-up test.** Add a replica under load and watch how long it takes to reach its share.
  With multiplexed connections and no recycling, the answer is "never" — and that is the
  finding.
- **Rollout test.** An open-loop client through a full deploy, counting non-2xx and resets. A
  closed-loop client throttles itself against the disruption and under-reports it, which is
  `coordinated-omission`.
- **Ejection drill.** Fault-inject errors into one backend and confirm it is ejected; then
  inject into _all_ backends and confirm the ejection cap or panic behaviour keeps traffic
  flowing. The second drill is the one nobody runs, and the one that matters.
