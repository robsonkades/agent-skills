---
name: load-balancing-and-routing
description: >
  Getting a request to a replica that can serve it: L4 versus L7 by capability rather than
  layer number, why an L4 balancer in front of long-lived HTTP/2 or gRPC connections
  balances connections instead of requests and pins a client to one replica, the balancing
  algorithms and what each optimises, power-of-two-choices, health checking and outlier
  ejection with the fleet-ejection hazard, and connection draining. Use when per-pod request
  rate is skewed while connection counts look even, when one replica is hot after a
  scale-up, when gRPC or HTTP/2 crosses a ClusterIP Service, when a dependency blip ejects
  the whole upstream, or when choosing between an ingress proxy, a mesh and client-side
  balancing. Does not cover why a replica is interchangeable (stateless-service-design), the
  in-pod proxy form (ambassador-pattern), what to do when every replica is busy
  (rate-limiting-and-load-shedding), readiness and drain mechanics
  (kubernetes-service-lifecycle), or routing a key to its owner (sharding-and-partitioning).
---

# Load Balancing And Routing

## Purpose

Choose how a request reaches a replica, and know what that choice can and cannot express. The
decision is not merely "L4 or L7" as layer numbers; it is capability. An L7 intermediary can
parse application messages and may route HTTP requests/RPC streams, apply policy and expose
application telemetry. An L4 data plane generally selects by transport flow/connection and
cannot safely infer HTTP semantics. Capability still depends on protocol and configuration: a
long-lived streaming RPC remains one routed stream even through an L7 proxy, and retries are
legal only under the operation's deadline/idempotency contract.

The failure this prevents is the fleet that is balanced on paper and skewed in production. An
L4 balancer plus long-lived HTTP/2 or gRPC connections balances _connections_, and a client
that opens one connection and multiplexes ten thousand requests over it sends every one of
them to a single replica. Adding replicas does not help; the connection does not move. Nothing
is unhealthy, no error is logged, and the only visible symptom is that per-replica request
rate is uneven while connection counts are not.

## Workflow

1. **Name the routing unit and information available.** TCP flow, HTTP request, RPC stream,
   session, tenant or key lead to different behavior. Header/path routing and semantic retries
   require application parsing; ownership routing may require a key-aware client or directory.
2. **Check the connection lifetime against the protocol.** HTTP/1.1 with keep-alive, HTTP/2
   and gRPC all hold connections open; only HTTP/2 and gRPC multiplex, which is what makes an
   L4 hop pin load. See `references/connection-lifetime-and-l4.md`.
3. **Measure offered work, admitted work and cost before choosing an algorithm.** Normalize
   per-endpoint requests, active streams, bytes, CPU/service time, queueing and capacity.
   Connection counts alone do not mean equal load because connections carry different work.
4. **Pick the algorithm by the property it optimises.** Round-robin ignores request cost;
   least-request adapts to it; power-of-two-choices is the distributed approximation of
   least-loaded. See `references/routing-modes.md`.
5. **Design active readiness and passive outlier detection as complementary signals.** State
   thresholds, recovery, locality and correlated-failure behavior. Cap ejection/admission so
   removing hosts cannot overload the survivors; choose fail-open versus fail-closed by the
   safety contract, not as a universal panic rule.
6. **Sequence the drain.** Mark terminating/not-ready, allow routing state to converge, stop
   admitting new application work while keeping transports alive for in-flight work, send
   GOAWAY where applicable, and bound completion. `preStop` sleep is one coarse mechanism;
   endpoint/LB draining behavior must be verified. Budget arithmetic is
   `kubernetes-service-lifecycle`.
7. **Verify with a rollout, not a review.** Run an open-loop client through a deploy and a
   scale-up, and assert both the non-2xx count and the per-replica request-rate spread.

## Decision block

```text
Use an L4 balancer when:
- the protocol is not HTTP (raw TCP, a database proxy), or connections are short-lived and
  numerous enough that connection balancing approximates request balancing
- per-request routing, retries and traffic splitting are genuinely not required
Avoid an L4 balancer when:
- traffic is HTTP/2 or gRPC over long-lived connections — it will balance connections and
  pin request load to whichever replicas the clients happen to hold
Use an L7 proxy when:
- you need per-request balancing, header- or path-based routing, weighted rollout, retries,
  or per-request observability; account for whether it adds a hop, TLS boundary, CPU and
  another failure/queueing domain
Prefer client-side balancing when:
- callers are few, internal, and share a language or mesh runtime; the extra hop's latency
  matters; and you can distribute discovery and policy to every client
Avoid client-side balancing when:
- clients are third-party or polyglot, or a policy change would require redeploying every
  caller — the policy is then as hard to change as the clients
Prefer routing by key (sharding-and-partitioning) instead when:
- a request must reach the one replica that owns its key. That is placement, not balancing,
  and a least-request policy actively breaks it
```

## Rules

- State the balancer's unit of work. L4 usually balances transport flows; L7 can balance
  requests or streams. Verify actual connection pooling and upstream routing rather than
  inferring it from a product label.
- Kubernetes `Service` / `ClusterIP` exposes an L4 virtual service whose implementation may be
  kube-proxy (iptables/IPVS/nftables), Windows networking or eBPF. It selects new
  connections. gRPC or HTTP/2 traffic through a ClusterIP therefore pins: the fix is an L7
  proxy in the path, or a headless Service plus client-side balancing — not a different
  `sessionAffinity` setting.
- The observable signature of the multiplexing problem: per-pod
  `rate(http_server_requests_seconds_count[5m])` (or the gRPC equivalent) varies by multiples
  across pods, while per-pod established-connection counts are within a few of each other. A
  newly scaled-up pod that stays near zero request rate is the same symptom.
- Connection recycling can bound stale placement from the server, client library or proxy.
  Graceful HTTP/2 GOAWAY plus jitter avoids synchronized reconnects, but recycling is a coarse
  mitigation and can increase handshake/TLS/connection pressure. Ensure clients re-resolve
  and retry only safe streams.
- Round-robin distributes **requests**, not **work**. With heterogeneous request cost it
  produces even request counts and uneven latency; that is not a broken balancer, it is the
  wrong metric being equalised.
- Least-request and least-connections are not synonyms under multiplexing. Least-request can
  react to outstanding request count; that count still misses heterogeneous cost and can bias
  toward a freshly started/cold endpoint. Select weighted least-request, EWMA latency,
  power-of-two choices or round-robin from measured workload and locality constraints.
- Global least-loaded is worse than random-two in a distributed balancer, and the reason is
  staleness, not cost: every balancer sees the same slightly old view and sends the next
  request to the same "idlest" replica, so they herd onto it together. Two random choices
  plus a local comparison removes the shared signal that causes the herd.
- **A health check is a timeout-based observation, not ground truth.** Aggressive thresholds turn a
  shared-dependency blip into a fleet-wide ejection: every replica fails at once, the balancer
  ejects them all, and there is no backend left. Cap ejection at a fraction of the upstream
  (a max-ejection-percentage) and reserve enough capacity. A fail-open panic mode may preserve
  degraded availability, while authentication/corruption hazards may require fail-closed.
  Correlated failure is `failure-models`.
- Coordinate readiness and balancer checks, but do not assume they are duplicates. Readiness
  expresses endpoint lifecycle/local ability; passive ejection sees path- and request-specific
  failures. Document precedence and recovery so disagreement is diagnosable.
- Draining is a sequence with overlapping control/data planes: stop advertising, wait for
  bounded propagation, reject/redirect new work, finish or terminate in-flight work, then
  close. A fixed `preStop` sleep may cover propagation but does not prove it; measure new
  arrivals and active streams and configure LB-specific deregistration behavior —
  `kubernetes-service-lifecycle` owns the budget.
- Session affinity is a routing mode here, not a session design. Affinity ends whenever the
  replica or the affinity table changes; whether that is acceptable is
  `stateless-service-design`.
- Balancing does not create capacity. When every replica is saturated, spreading the load
  evenly only spreads the failure evenly; the answer is `rate-limiting-and-load-shedding`.

## Routing invariants and security

- Preserve end-to-end client identity and trusted forwarding headers through explicit proxy
  trust configuration; never authorize from an untrusted `X-Forwarded-For`.
- Keep tenant/session/key affinity scoped and bounded. A large tenant can remain hot even when
  request counts are balanced; isolate or shard it rather than hiding skew with stickiness.
- Retry only before response commitment and only for operations whose ambiguity/idempotency
  rules allow it. Enforce one end-to-end attempt budget to avoid multiplicative proxy/client
  retries.
- During weighted rollout, measure request and **work** share, success, latency and state/schema
  compatibility. Connection/stream lifetime can make configured weights differ from observed
  traffic for a long time.

## References

- [Connection lifetime and why L4 pins load](references/connection-lifetime-and-l4.md) — how
  HTTP/2 and gRPC multiplexing defeats connection balancing, the metric comparison that
  proves it, and the four fixes with their costs including the Java client and server
  settings that matter. Read when request rate is skewed across replicas, when a scaled-up
  pod stays idle, or before putting gRPC behind an L4 hop.
- [Routing modes](references/routing-modes.md) — the algorithms compared by the property each
  optimises, health-check and outlier-ejection settings with the fleet-ejection hazard, the
  drain sequence, and a decision table across L4, L7 and client-side. Read when configuring a
  balancer or a mesh, or when a dependency blip ejected more hosts than it should have.
