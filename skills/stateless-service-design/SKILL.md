---
name: stateless-service-design
description: >
  Making a service instance disposable so replicas are interchangeable: what stateless
  actually means — no correctness/routing dependency on one instance's volatile history; the in-process state
  inventory; and session state as a placement decision between sticky routing, an external
  store and a signed token. Use when replicas is raised above 1, when a @Scheduled job
  suddenly runs N times, when a local cache disagrees between instances, when an in-memory
  rate-limit counter or idempotency map is the source of truth, when HttpSession holds
  anything a user would miss, when a service writes to java.io.tmpdir, or when a rolling
  deploy loses sessions. Does not cover pod replacement and drain
  (kubernetes-service-lifecycle), reaching a replica (load-balancing-and-routing), cache
  design (caching-strategies), fleet-singleton work (leader-election), state split by key
  (sharding-and-partitioning), pool arithmetic (connection-pool-sizing), or what replicas
  may observe (consistency-models).
---

# Stateless Service Design

## Purpose

Decide which state may stay instance-local and what replacement requires. “Stateless” does not
mean empty memory; it means request correctness/routing does not depend on a particular
instance's volatile history. Classify state by authority, durability, consistency scope,
reconstruction source/time and loss consequence. A local derivable cache can stay; a replicated
stateful actor/broker can also be correct, but it needs explicit ownership and recovery rather
than interchangeable stateless routing.

The failure this prevents is a hidden instance-ownership assumption. One-replica tests can
miss cross-replica divergence, but concurrency, duplicate registration and restart loss can
already fail within one instance. Adding capacity can expose further failures — a duplicate
charge, a fleet limit enforced separately on each replica, or repeated job effects.

## Workflow

Use the steps relevant to the question and reuse adequate existing evidence. A narrow
explanation or sound stateful/session-loss contract need not trigger a complete inventory,
new authority, migration or full fault/deployment campaign. Keep unknown guarantees explicit.

1. **Apply loss, divergence and recovery tests.** If this JVM disappears, what correctness,
   accepted work, security decision, user journey or SLO changes? Can another instance rebuild
   from durable truth within RTO/RPO, and can copies diverge? Authoritative state may move to a
   shared store or become partitioned/replicated state with an explicit owner.
2. **Inventory the affected state before redesign.** Inspect singleton bean fields, `static` collections,
   `HttpSession` attributes, caches, scheduler and executor queues, local files and
   long-lived connections; identify derivation, lifetime and decision authority separately. The
   table and the grep shapes are in `references/state-inventory.md`.
3. **Place session state deliberately.** Sticky routing, an external session store and a
   signed token are three different failure and revocation profiles, not three flavours of
   one idea. See `references/session-placement.md`.
4. **Name the existing or proposed authority and guarantee**—database row, durable queue/outbox, replicated
   partition or client token. Product labels do not decide semantics: Redis can be a cache or
   configured data store; verify eviction, persistence, replication, consistency, backup and
   failover before assigning authority.
5. **Hunt singleton assumptions.** Inspect enabled schedule registrations, bean instances and
   startup hooks in each application context. Fleet-once work needs partitioning, a scheduler with documented coordination, or
   `leader-election`; TTL leases, session locks and durable job claims have different stale-
   owner/recovery semantics.
6. **Verify the claimed transition.** For cross-replica or replacement guarantees, route named steps deliberately to different instances
   (random balancing may miss the transition), overlap relevant requests and test replacement
   during the affected work/deployment phases. Reuse adequate evidence. A green run at
   `replicas: 1` does not establish cross-replica correctness. Fault injection belongs in an
   isolated or already authorized environment; successful cases cover only the paths exercised.
7. **Check relevant shared capacity when changing replication.** Replication can move the bottleneck to what
   the replicas share. `replicas × maximumPoolSize` is a number the database has an opinion
   about; that arithmetic is `connection-pool-sizing`.

## Decision block

```text
Make the instance stateless and scale by replication when:
- each request's required inputs are available to eligible instances, from the request,
  validated client state and/or shared authority, within the workload and trust contract
- where writes exist, eligible instances can satisfy the required ownership and ordering
  protocol without depending on one instance's volatile history
Keep the state in the process when:
- it is derivable and freshness, loss and rebuild costs fit the contract, including
  availability, upstream quotas and recovery load (a cache)
- its lifetime is one request (a transaction, a request-scoped bean, a ScopedValue binding)
Consider partitioning by key (sharding-and-partitioning) when:
- the per-key working set is too large or too hot to load per request, or the key needs
  single-writer ordering that shared storage would otherwise have to serialise
Prefer leader election (leader-election) instead when:
- the work must happen once per interval across the fleet rather than once per instance
  (election coordinates ownership; durable claims/idempotent effects are still needed where
  retries, failover or stale owners can repeat work)
```

## Rules

- Identify which copy owns the decision and can recover it. A field's size or lifetime does
  not establish authority; inspect loss, divergence and recovery together, including caches
  that temporarily influence security or correctness.
- Mutable `static` state on the request path needs a scope and authority check. Local metrics,
  protective limits and derivable caches can be valid; a local source of truth for a fleet-wide
  decision is unsafe. Inspect readers, writers, thread safety and divergence consequences.
- An uncoordinated in-process counter that gates a fleet-wide business decision enforces a
  separate budget per instance. Maximum aggregate allowance can approach N× under spread,
  though routing/skew changes observed behavior. Per-instance protective limits are valid when
  explicitly scoped (`rate-limiting-and-load-shedding`).
- Spring scheduling is local to enabled application contexts. Count bean instances and
  schedule declarations: Spring 6.2.12 processes repeated `@Scheduled` declarations independently,
  and multiple bean instances can each register callbacks. Replica count alone does not determine
  invocation or effect count; an outer scheduler/claim/lease or repeat-safe work changes the contract.
- An in-memory idempotency map can deduplicate only within its instance and retention window,
  with an atomic local claim when attempts overlap. Cross-replica/restart guarantees need a protocol covering
  the actual effects: natural idempotence, or an atomic claim and effect/recovery protocol such
  as a durable unique-key record where required; `idempotency`
  owns the mechanics, this skill owns noticing that the map was never shared.
- A local cache can diverge after update/invalidation for its refresh/eviction/restart horizon;
  no TTL makes staleness unbounded unless explicit invalidation or replacement succeeds, not
  mathematically permanent. Cache design is
  `caching-strategies`; the multi-replica consequence is here.
- Trace local paths to actual mounts. Container writable layers can be lost on container
  replacement; `emptyDir` survives container restarts but ends with the Pod; persistent volumes
  have separate retention and access rules. Durability alone does not make a file reachable
  from another replica. A staged upload referenced by a later request needs that contract.
- `HttpSession` is in-process state by default. Anything in it a user would notice losing —
  cart contents, a multi-step form, an authorisation decision — needs a loss/staleness policy;
  it may be authoritative or reconstructible from another authority. Spring
  Session changes the store without changing the servlet API: a placement change, not a
  rewrite. Shared placement does not make overlapping session read-modify-write operations
  atomic; verify conflict handling across eligible instances (`session-state-strategies`).
- **Sticky sessions give affinity, not a guarantee.** Affinity ends when the replica dies,
  when a rolling update drains it, when the client drops the cookie, or when the balancer's
  table is rebuilt. Each of those is user-visible if the state existed only there.
- A signed token moves claims to the client; signing provides integrity/authenticity, not
  confidentiality. Short expiry bounds token lifetime; revocation before expiry needs a
  verifier-enforced mechanism such as introspection, denylist/session version, or key/policy
  changes—each trades latency,
  blast radius and freshness. JWT is a format, not a session architecture.
- A WebSocket, SSE stream or long poll pins one user to one instance for the connection's
  lifetime. Pushing to that user from another replica needs a broker or a fan-out, and a
  replacing instance can terminate its streams. Clients need bounded reconnect and a
  cursor/replay or snapshot protocol when missed events affect correctness.
- Do not claim statelessness because a class has no fields. State hides in the framework
  too: session attributes, a `ThreadLocal` never cleared, a filter's cache, a library's
  static registry. Use the inventory and targeted failure evidence; code shape alone does not.

## Stateful is not a defect

Prefer explicit stateful ownership when locality, single-writer order or working-set cost
requires it. Then specify partition placement, replication/quorum, durable log/snapshot,
ownership epochs/fencing, failover/rebalance and backup/restore. Calling that service stateless
because an orchestrator can restart it erases its hardest contract.

## Security and shutdown

Inspect deployed Java, Spring/Session/Data Redis versions, storage mounts and routing before
changing placement. No upgrade is implied; ScopedValue is final in Java 25 and preview/incubator
in earlier supported releases. Missing recovery or durability evidence is unknown. Deliver the
supported conclusion, relevant authority/loss contract, checks performed and material gaps;
include an affected-state inventory when the requested audit or change needs one.

- Session/auth store failure must fail closed for protected actions. A separately authorized
  public/read-only degraded mode is possible; never reinterpret unknown authentication as
  authenticated.
- For replacement, stop admission and preserve the promised acceptance contract: finish or
  durably hand off/replay accepted queues/uploads before termination, with bounded drain and
  recovery. Explicit best-effort loss is a different contract. “No fields” does not prevent loss
  of in-flight accepted work.
- Bind token/session to issuer, audience, tenant and key version; protect against fixation,
  replay, key rotation overlap and cross-tenant cache keys.

## References

- [In-process state inventory](references/state-inventory.md) — common in-process state,
  authority/lifetime distinctions, potential failures, discovery shapes and placement options.
  Read when auditing a service before scaling it
  out, or when a bug appears on some replicas and not others.
- [Where session state lives](references/session-placement.md) — sticky routing, an external
  store and a signed token compared on replica-death behaviour, deploy behaviour, per-request
  latency and revocation, with the Spring Session and token shapes and a decision block.
  Read when the service holds a session, or when a deploy logs users out.
  For detailed per-item conversation placement, use `session-state-strategies`.
