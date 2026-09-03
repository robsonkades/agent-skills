---
name: ambassador-pattern
description: >
  A sidecar that owns the outbound leg: the app connects to localhost and the ambassador
  decides where the call goes — service discovery, shard-aware routing, canary and A/B
  splits, mirrored traffic, TLS and the connection pool — so routing policy ships
  independently of the application release. Use when every service reimplements discovery,
  sharding or retry configuration in its own language, when changing a route means upgrading
  a client library across a fleet, when a canary needs a percentage or header split without
  an app release, when shadow traffic is being introduced, when the proxy's retries and the
  app's retries multiply, or when a mesh is already deployed and a hand-rolled proxy would
  put policy in two places. Does not cover pod-level container mechanics (sidecar-pattern),
  load-balancing algorithms (load-balancing-and-routing), the resilience policies themselves
  (retries-and-backoff, timeouts-and-deadlines, circuit-breakers), or the shard function
  (consistent-hashing, sharding-and-partitioning).
---

# Ambassador Pattern

## Purpose

An ambassador is a sidecar whose job is the **outbound** call. The app opens a connection to
`127.0.0.1` and stops there: discovery, shard selection, retry, TLS, pooling and traffic
splitting happen in the peer process. What you buy is that outbound policy becomes a
deployable artefact of its own — a canary weight or a shard map changes without recompiling,
re-releasing or even restarting anything that contains business logic. The pod mechanics that
make this possible are `sidecar-pattern`; do not re-derive them here.

The failure this prevents is policy living in two layers at once. The application retries
three times, the ambassador retries three times, and a dependency already at its limit
receives nine attempts per user request — the amplification is multiplicative and it arrives
exactly when the dependency can least absorb it. The second failure is quieter: the ambassador
is now on the critical path of every outbound call and is a single point of failure inside the
pod that no cluster-level dashboard is watching.

## Workflow

1. **Inventory what the application currently knows about its callees** — hostnames, shard
   maps, retry counts, timeouts, pool sizes, TLS material. That list is precisely what moves,
   and anything not on it does not move.
2. **Check whether a service mesh is already deployed.** If Envoy sidecars are already in the
   pod, a hand-rolled ambassador is a second data plane with overlapping policy; extend the
   mesh's configuration instead.
3. **Fix the localhost contract**: one listener per upstream, or one listener routed by the
   `Host`/`:authority` header. Write down which, because it decides whether the app's URLs
   change and whether the proxy must parse anything.
4. **Compose policy as one end-to-end budget.** Name the owner of each retry decision,
   propagate the caller deadline, cap total attempts and document any deliberate layered retry
   (for example, a transport reconnect below a business retry). Uncoordinated layers create the
   multiplication case above.
5. **Recompute the pool arithmetic.** The app's pool is now to loopback; the ambassador holds
   the pool to the real upstream, so the upstream's inbound connection count is
   `pods × ambassador pool`, not `pods × app pool`. The sizing itself is
   `connection-pool-sizing`.
6. **Make the routing decision observable.** Every response must be attributable to the route,
   shard or variant that served it — see `references/routing-and-experiments.md`.
7. **Test the ambassador's own failure modes** before shipping: stopped, slow, and returning
   errors. See `references/failure-and-policy-composition.md`.

## Decision block

```text
Use an ambassador when:
- three or more services, in languages you do not all own, need identical outbound policy;
- routing must change without an application release — canary weights, a shard map, a
  regional failover, a datastore migration;
- the upstream's client library is absent or unmaintained in one of your languages;
- the callee is being resharded and you want the call sites to stay unaware of the topology.
Avoid an ambassador when:
- one service, one language, and a maintained client library already does discovery, retry
  and pooling — you would add a hop and an in-pod single point of failure to avoid a
  dependency;
- the outbound call is on a single-digit-millisecond path and the proxy's added p99 is a
  measurable fraction of the budget;
- the routing decision depends on application state the proxy cannot see — per-tenant
  entitlements, a business-level idempotency key, anything inside an encrypted body.
Prefer a service mesh instead when:
- a compatible mesh is already installed, or centralized policy/discovery and fleet-wide
  operations outweigh the control-plane complexity and resource cost. Service count alone is
  not a sufficient threshold.
Prefer a client library instead when:
- the policy is genuinely application-specific and changes with the same release as the code
  that calls it. Externalising a policy nobody changes independently buys nothing.
```

## Rules

- **Retries need one end-to-end attempt budget.** Independent 3-attempt layers can multiply to
  nine requests. Prefer one owner; when layered retries are justified, constrain the combined
  budget, retry only safe failure classes, propagate attempt/deadline context and test the
  maximum amplification. The backoff theory itself is `retries-and-backoff`.
- A retry in the ambassador changes the delivery semantics of the call. A retried `POST` is
  **at-least-once**, not at-most-once, including for requests the server received and
  processed before the connection broke. Only idempotent operations, or operations carrying a
  deduplication key, may be configured as retryable.
- **A deadline must survive the hop.** The ambassador's upstream timeout has to be derived
  from the caller's remaining budget, not from a static number in its config, or the app times
  out while the proxy is still hopefully retrying. Propagation rules are
  `timeouts-and-deadlines`.
- Trace context must be **forwarded, not regenerated**. An ambassador that starts a new root
  span produces traces in which the application calls nothing and the proxy calls everything.
  Instrumentation cost is `opentelemetry-performance`.
- Shard-aware routing gives **per-shard ordering only** — never global ordering, and not even
  per-key ordering across a shard-map change, since two in-flight requests for the same key
  can land on the old and the new owner. The shard function is `consistent-hashing`.
- The shard key must be in the request line or a header. A proxy that has to parse a JSON body
  to route pays for it in latency and is coupled to your payload schema — which is a contract
  nobody versions.
- Mirrored (shadow) traffic must be **fire-and-forget**: response discarded, no retry, and the
  mirror target must be structurally unable to write production state — a separate datastore
  or credentials without write permission. Mirroring into a service that shares the primary's
  database is a duplicate-write generator, not a test.
- A percentage split is not necessarily per-user-stable. If the experiment requires stability,
  hash a trusted, privacy-reviewed subject key with an experiment salt; do not expose raw user
  identifiers in proxy logs/metrics, and define behavior for missing or forged keys.
- For independent hard dependencies, availabilities multiply: two 99.9% components yield about
  99.8%. Real failures may be correlated and fail-open/degraded behavior changes the model, so
  state assumptions and measure proxy-attributable unavailability rather than quoting the
  product as a universal result.
- State per route whether the ambassador **fails open or fails closed**. Failing closed turns
  an upstream's partial outage into a total one; failing open silently removes the policy you
  deployed it for. Both are defensible; neither is defensible by accident.
- Prefer validated, observable hot reload when routing changes frequently. A controlled rolling
  restart can be safer for rare changes; either path needs atomic config validation, version
  visibility, convergence monitoring and rollback.
- Never describe the app as "unaware of the network". It still sees latency, errors and its
  own deadline; what it no longer sees is topology. Claim that, and nothing wider.

## References

- [Routing and experiments](references/routing-and-experiments.md) — shard-aware routing and
  the resharding window, canary by percentage versus by header, shadow traffic and the
  write-safety rule, and exactly which queries prove a split is live. Read when configuring a
  route, a shard map or an experiment.
- [Failure and policy composition](references/failure-and-policy-composition.md) — the
  ambassador down, slow or lying; the one-layer table for retry, timeout, breaker and TLS;
  pool arithmetic after the pool moves; deadline and trace propagation in Java; and how to
  fault-inject the proxy in a test. Read before shipping, and during any incident where the
  app and the upstream disagree about what happened.
