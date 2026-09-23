# Routing modes: algorithms, health, ejection and drain

## Algorithms, by the property each equalises

Round-robin rows below describe request-level routing; at L4 their unit is a transport flow.

| Algorithm                      | Equalises                                              | Right when                                                             | Fails when                                                                                                    |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Round-robin                    | Request **count** per backend                          | Request cost is uniform and backends are homogeneous                   | Cost varies: counts are even, latency is not. A slow backend receives its full share until ejected            |
| Weighted round-robin           | Count in proportion to a static weight                 | Backends differ in capacity by a known, stable factor                  | The weight is a guess that nobody revisits after the instance types change                                    |
| Least-request                  | Outstanding request count (often weighted)             | Duration varies and active count correlates with remaining work        | Long streams, heterogeneous costs/capacity or cold endpoints distort the signal                               |
| Least-connections              | Open transport connections                             | Connections are comparable units of work                               | HTTP/2 multiplexing or idle pools make connections incomparable                                               |
| Power of two random choices    | Chosen load signal over two candidates                 | Global load state is costly/stale and endpoint set is large            | Tiny/locality-constrained pools, bad load signal, or heterogeneous weights need adaptation                    |
| Random                         | Expected routing-unit share under chosen probabilities | Backends are homogeneous and you want no load coordination             | Too few selections or unequal request cost can leave work skew; no load signal corrects it                    |
| Consistent hashing on a key    | Key → backend **placement**                            | The backend caches or owns per-key state                               | A backend is added or removed: some fraction of keys move. This is `sharding-and-partitioning`, not balancing |
| Session affinity (cookie / IP) | Client → backend stickiness                            | Locality is useful and loss/rebinding is allowed by the state contract | The backend dies, drains, or the affinity table rebuilds — see `stateless-service-design`                     |

### When random candidates reduce herding

A least-loaded policy with a fresh view can select the smallest measured load. Distributed
balancers may instead share a stale picture. If they choose deterministically from it,
multiple balancers identify the same replica as
idlest and send their next requests there, so the fleet can herd onto whichever replica most
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
- **Passive health check / outlier ejection** — the balancer observes request outcomes or
  upstream connection failures; the configured policy decides whether to remove a detected
  outlier temporarily. It costs no additional probe traffic, but needs counters/processing
  and detects only what traffic reveals.

Settings that decide the behaviour, by role:

| Setting                     | Role                                                                   | Getting it wrong                                                                                          |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Interval                    | How often the backend is probed                                        | Too short: probe load is real background traffic on every backend, forever                                |
| Unhealthy threshold         | Consecutive failures before removal                                    | 1 means a single blip removes a healthy backend                                                           |
| Healthy threshold           | Consecutive successes before return                                    | 1 means a flapping backend re-enters and fails again, repeatedly                                          |
| Timeout                     | How long a probe may take                                              | Below the check's own p99 the probe fails exactly under the load it exists to survive                     |
| Ejection duration / base    | How long an ejected backend stays out, usually growing per ejection    | Too long: capacity you still need is idle; too short: flapping                                            |
| **Max ejection percentage** | Cap on passive outlier ejection, with implementation-specific defaults | Too permissive can remove excess capacity; other health/membership mechanisms are not bounded by this cap |

**The fleet-ejection hazard.** A policy that assumes independent failures can mishandle a shared
dependency. When every
replica depends on the same database, the same cache or the same downstream, a blip fails all
of them simultaneously, the balancer can eject all of them — turning a partial degradation
into a total outage exactly like a liveness probe that checks a dependency
(`kubernetes-service-lifecycle`). Select controls by failure semantics:

1. Cap passive ejection, then test the complete eligible set: active health, readiness,
   locality and membership removal can still leave zero usable backends. The cap is not a
   healthy-capacity guarantee; inspect rounding/minimum-ejection behavior for small pools
   and the deployed implementation's default when the setting is absent.
2. Reserve overload headroom and couple ejection to admission control; otherwise ejecting one
   endpoint overloads the next.
3. Use **fail-open** panic behaviour only when degraded attempts are safer than rejection. For
   corruption, identity or incompatible-version signals, fail closed or use a known-good set.

Kubernetes readiness and balancer checks can be complementary: one reports endpoint lifecycle,
the other observes a specific network path or request class. Align semantics/timing and expose
why each excluded a host. Choose shared-downstream readiness from the service contract.
If correct degraded/fallback responses remain available, retaining readiness may preserve
useful service. If the required dependency is
necessary to serve correct traffic, deliberate fail-closed readiness can be appropriate.
Compare all-unready routing, retries/admission and recovery with application-level rejection;
a passive ejection cap cannot override readiness or guarantee a usable backend.

### When detection and removal disagree in Envoy

Inspect the observing proxy's effective cluster/runtime configuration, host health flags and
ejection/unejection events. Do not infer fleet-wide exclusion from one proxy's observation.
The following behavior is verified against Envoy 1.35.0; check the deployed version and any
control-plane overrides before applying it:

- **Detection is not enforcement.** `enforcing_consecutive_gateway_failure` defaults to 0%,
  while `enforcing_consecutive_5xx` defaults to 100%. Gateway errors can contribute to both
  detectors. Compare `ejections_detected_*`, `ejections_enforced_*`, `ejections_overflow`
  and current host state: reaching a threshold need not cause removal, and the cap can
  prevent it. Disabled or gradual enforcement may be intentional; do not automatically
  turn every detector up to 100%.
- **Statistical detectors need observations.** Success-rate and failure-percentage checks
  have minimum-host and per-host request-volume requirements over an interval. Below those
  gates, absence of detection does not establish health. Check actual eligible sample counts
  before tuning thresholds; a consecutive-failure detector may fit sparse traffic, with its
  own false-ejection and capacity trade-offs.
- **Active success can end passive ejection early.**
  `successful_active_health_check_uneject_host` defaults to `true`. With active health already
  healthy, one successful probe can clear passive ejection and reset consecutive-failure
  counters. If active health is marked failed, its healthy threshold also governs return.
  A shallow `/healthz` can therefore keep returning a host whose real requests still fail.
  Compare a probe that meaningfully verifies recovery with setting this option to `false`.
  The latter leaves passive recovery to its ejection timing and can delay useful capacity's
  return; neither choice overrides the other health, membership or panic rules above.

Correlate probe results, request outcomes and ejection/unejection timestamps. Increasing the
ejection duration alone will not fix an active check that keeps clearing the ejection.

## The drain sequence

Coordinate these phases against the real control/data planes. Some overlap; choose ordering
from dependencies (stop producers before draining their executor), not a universal list.

1. The pod is marked not-ready or deregistered; the balancer's data plane begins converging.
2. **Allow for measured propagation.** New flows/requests may still arrive because
   EndpointSlice, proxies, DNS/client discovery and external LBs converge independently. A
   `preStop` sleep is one coarse guard, not proof of removal.
3. The process stops accepting new work and finishes in-flight requests (Spring Boot:
   `server.shutdown=graceful`).
4. Non-HTTP work drains: consumers, schedulers, executors.
5. The process exits, inside `terminationGracePeriodSeconds`.

Propagation exceeding the drain allowance is one hypothesis for deploy-time 502s; correlate
arrivals, resets and shutdown timestamps. HTTP/2 GOAWAY tells the peer to stop opening streams
on that connection while eligible existing streams may finish. It does not migrate an existing stream; bounded
termination may require application-level resume or an explicit interrupted outcome.

## Choosing among the three placements

| Question                                  | L4                             | L7 proxy                                                | Client-side                                                     |
| ----------------------------------------- | ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| Balances per request/stream               | No — per flow                  | Usually, at configured L7 unit                          | Depends on resolver/policy                                      |
| Handles HTTP/2/gRPC multiplexing          | One backend per TCP connection | Can route new streams; one streaming RPC remains pinned | Can spread calls/channels                                       |
| Can retry, route by header, split traffic | No                             | Yes                                                     | Yes, if every client implements it                              |
| Additional application-proxy hop          | No                             | Maybe — depends on topology                             | No centralized hop                                              |
| Policy change without redeploying callers | implementation-dependent       | Usually via control/configuration plane                 | Possible with supported resolver/service config/control plane   |
| Works for third-party or polyglot callers | Yes                            | Yes                                                     | Requires every participating client to support discovery/policy |
| Per-request observability at the balancer | No                             | Yes                                                     | Only in the client's own metrics                                |

An in-pod proxy (the ambassador form) is client-side balancing with the policy moved out of
the application process — `ambassador-pattern` owns that shape.

## Verifying routing changes

Choose tests for the behavior changed or claimed, and reuse adequate existing evidence.
Configuration/source review can establish a supported option or identify a risk; it cannot
prove runtime work distribution or rollout continuity. A narrow explanation needs no new
rollout or fault injection. State the workload, endpoint eligibility, expected outcomes and
coverage limits before interpreting a test as success.

- **Skew test.** Under steady realistic load, report capacity-normalized work distribution,
  max/median and top-endpoint share. Avoid `max/min` when idle/zero endpoints make it infinite.
- **Scale-up test.** Add a replica under load and watch how long it takes to reach its share.
  Existing flows do not move; new connections may use the replica. If the workload creates
  no new eligible flows, the added capacity may receive no work during the test window.
- **Rollout test.** Exercise the relevant deployment transition using the actual workload
  model. For independent arrivals, keep an open schedule and reconcile offered versus
  started work, start delay and dropped starts; a closed loop suppresses arrivals during
  disruption and cannot establish that arrival-rate claim. For completion-paced users or
  workers, a closed population with representative concurrency and think times is valid.
  In either model, retain latency, unexpected HTTP outcomes, gRPC terminal statuses,
  timeouts, resets and incomplete work. An open configuration alone does not prove schedule
  fidelity; use `coordinated-omission` to assess missing arrivals and timing boundaries.
- **Ejection drill.** Specify the error class, detector, sample requirements and enforcement
  first. Fault-inject into one backend and compare detection with the expected removal or
  observation-only behavior; then inject into all backends and confirm the chosen cap,
  admission and fail-open/closed contract. Include a failing request path whose active probe
  still passes, followed by genuine recovery, to check early unejection. Assert survivor
  saturation and recovery hysteresis, not merely that traffic kept flowing.

## Primary references

- [Envoy load-balancing architecture](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/overview)
- [Envoy outlier detection](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier)
- [Envoy 1.35.0 outlier configuration](https://github.com/envoyproxy/envoy/blob/v1.35.0/api/envoy/config/cluster/v3/outlier_detection.proto) — enforcement defaults, statistical prerequisites and active-check unejection option.
- [Envoy 1.35.0 outlier implementation](https://github.com/envoyproxy/envoy/blob/v1.35.0/source/common/upstream/outlier_detection_impl.cc) — detected versus enforced counters and active-health recovery precedence.
- [Kubernetes Services networking](https://kubernetes.io/docs/concepts/services-networking/service/)
- [The Power of Two Random Choices](https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf)
- [k6 open and closed workload models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/)
