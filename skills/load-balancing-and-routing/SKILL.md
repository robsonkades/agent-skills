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
decision is not "L4 or L7" as layers; it is capability: **an L7 balancer sees requests**, so
it can balance per request, retry, route on a header, split traffic by weight and rewrite. An
L4 balancer sees only connections, so every one of those is unavailable to it — it forwards
bytes and its unit of work is the connection.

The failure this prevents is the fleet that is balanced on paper and skewed in production. An
L4 balancer plus long-lived HTTP/2 or gRPC connections balances _connections_, and a client
that opens one connection and multiplexes ten thousand requests over it sends every one of
them to a single replica. Adding replicas does not help; the connection does not move. Nothing
is unhealthy, no error is logged, and the only visible symptom is that per-replica request
rate is uneven while connection counts are not.

## Workflow

1. **Ask what the balancer can see.** If it must retry, route on a header, split by weight or
   balance per request, it has to parse requests — that is an L7 proxy, and no L4 setting
   substitutes for it.
2. **Check the connection lifetime against the protocol.** HTTP/1.1 with keep-alive, HTTP/2
   and gRPC all hold connections open; only HTTP/2 and gRPC multiplex, which is what makes an
   L4 hop pin load. See `references/connection-lifetime-and-l4.md`.
3. **Measure skew before choosing an algorithm.** Compare per-pod request rate against per-pod
   connection count. Even connections with uneven requests is the multiplexing problem;
   uneven requests _and_ uneven cost is an algorithm problem.
4. **Pick the algorithm by the property it optimises.** Round-robin ignores request cost;
   least-request adapts to it; power-of-two-choices is the distributed approximation of
   least-loaded. See `references/routing-modes.md`.
5. **Make health checking say something the balancer does not already know.** Reconcile it
   with Kubernetes readiness rather than duplicating it, and bound outlier ejection so a
   shared-dependency blip cannot eject the fleet.
6. **Sequence the drain.** Deregistration must complete before the process stops accepting,
   which is why the pod's `preStop` sleep exists; the budget arithmetic is
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
  or per-request observability; accept one extra hop of latency and a component to operate
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

- State the balancer's unit of work. L4 balances **connections**; L7 balances **requests**.
  Every surprising skew in a modern fleet starts by conflating the two.
- Kubernetes `Service` / `ClusterIP` is L4 (kube-proxy, iptables or IPVS). It balances new
  connections. gRPC or HTTP/2 traffic through a ClusterIP therefore pins: the fix is an L7
  proxy in the path, or a headless Service plus client-side balancing — not a different
  `sessionAffinity` setting.
- The observable signature of the multiplexing problem: per-pod
  `rate(http_server_requests_seconds_count[5m])` (or the gRPC equivalent) varies by multiples
  across pods, while per-pod established-connection counts are within a few of each other. A
  newly scaled-up pod that stays near zero request rate is the same symptom.
- Forcing connection recycling is a real fix, and it belongs on the **server**: a maximum
  connection age with a grace period makes the server send GOAWAY, so the client reconnects
  and re-resolves. It costs a periodic reconnect and needs jitter, or every connection
  recycles at once.
- Round-robin distributes **requests**, not **work**. With heterogeneous request cost it
  produces even request counts and uneven latency; that is not a broken balancer, it is the
  wrong metric being equalised.
- Least-request (least-connections) is the better default for variable-cost work: it tracks
  outstanding work rather than arrivals, so a replica stuck on slow requests stops receiving
  new ones without any health check firing.
- Global least-loaded is worse than random-two in a distributed balancer, and the reason is
  staleness, not cost: every balancer sees the same slightly old view and sends the next
  request to the same "idlest" replica, so they herd onto it together. Two random choices
  plus a local comparison removes the shared signal that causes the herd.
- **A health check is a timeout-based guess, not a detection.** Aggressive thresholds turn a
  shared-dependency blip into a fleet-wide ejection: every replica fails at once, the balancer
  ejects them all, and there is no backend left. Cap ejection at a fraction of the upstream
  (a max-ejection-percentage) and treat "all hosts unhealthy" as a reason to route to them
  anyway rather than to serve nothing. Correlated failure is `failure-models`.
- Do not duplicate the readiness contract. If Kubernetes readiness already removes a pod from
  the endpoint list, a second independent balancer health check with different timing gives
  you two failure detectors that disagree — usually while the pod is starting or draining.
- Draining is a sequence: stop advertising the endpoint, let in-flight requests finish, then
  stop the process. Reversing it produces resets. The deregistration delay must exceed the
  balancer's own propagation time, which is what the pod's `preStop` sleep buys —
  `kubernetes-service-lifecycle` owns the budget.
- Session affinity is a routing mode here, not a session design. Affinity ends whenever the
  replica or the affinity table changes; whether that is acceptable is
  `stateless-service-design`.
- Balancing does not create capacity. When every replica is saturated, spreading the load
  evenly only spreads the failure evenly; the answer is `rate-limiting-and-load-shedding`.

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
