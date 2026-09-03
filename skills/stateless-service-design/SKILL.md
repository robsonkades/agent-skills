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

The failure this prevents is the bug that cannot appear in any environment you have.
`replicas: 1` passes every test, because with one replica the process _is_ the shared store.
The counter, the idempotency map, the scheduled job and the local cache stay correct until
capacity is added, and then they are wrong quietly — a duplicate charge, a limit enforced at
N times its value, a job that emails everyone twice.

## Workflow

1. **Apply loss, divergence and recovery tests.** If this JVM disappears, what correctness,
   accepted work, security decision, user journey or SLO changes? Can another instance rebuild
   from durable truth within RTO/RPO, and can copies diverge? Authoritative state may move to a
   shared store or become partitioned/replicated state with an explicit owner.
2. **Inventory before you redesign.** Enumerate singleton bean fields, `static` collections,
   `HttpSession` attributes, caches, scheduler and executor queues, local files and
   long-lived connections; classify each as derivable, per-request or authoritative. The
   table and the grep shapes are in `references/state-inventory.md`.
3. **Place session state deliberately.** Sticky routing, an external session store and a
   signed token are three different failure and revocation profiles, not three flavours of
   one idea. See `references/session-placement.md`.
4. **Name the new authority and guarantee**—database row, durable queue/outbox, replicated
   partition or client token. Product labels do not decide semantics: Redis can be a cache or
   configured data store; verify eviction, persistence, replication, consistency, backup and
   failover before assigning authority.
5. **Hunt singleton assumptions.** Plain application-context schedulers/startup hooks run per
   replica. Fleet-once work needs partitioning, a scheduler with documented coordination, or
   `leader-election`; TTL leases, session locks and durable job claims have different stale-
   owner/recovery semantics.
6. **Prove it at multiple replicas.** Route named steps deliberately to different instances
   (random balancing may miss the transition), overlap concurrent requests, then kill/restart
   one during work and deployment. A green run at
   `replicas: 1` is evidence of nothing.
7. **Check the next ceiling before celebrating.** Replication moves the bottleneck to what
   the replicas share. `replicas × maximumPoolSize` is a number the database has an opinion
   about; that arithmetic is `connection-pool-sizing`.

## Decision block

```text
Make the instance stateless and scale by replication when:
- every request's inputs are in the request plus a shared store, and the per-request
  working set is small enough to fetch inside the latency budget
- any instance may handle any key on the write path, with no ordering requirement the
  storage engine does not already provide
Keep the state in the process when:
- it is derivable from an authoritative source and its loss costs only latency (a cache)
- its lifetime is one request (a transaction, a request-scoped bean, a ScopedValue binding)
Prefer partitioning by key (sharding-and-partitioning) instead when:
- the per-key working set is too large or too hot to load per request, or the key needs
  single-writer ordering that shared storage would otherwise have to serialise
Prefer leader election (leader-election) instead when:
- the work must happen once per interval across the fleet rather than once per instance
```

## Rules

- A field is authoritative if its loss changes an outcome, not because it is large or
  long-lived. Classify by consequence of loss; that is the only test that survives contact
  with a cache.
- Mutable `static` state written on the request path is a fleet-wide correctness bug at the
  second replica. Grep for `static.*Map<`, `static.*List<`, and `AtomicLong`/`AtomicInteger`
  fields on singleton beans, then ask what reads them.
- An uncoordinated in-process counter that gates a fleet-wide business decision enforces a
  separate budget per instance. Maximum aggregate allowance can approach N× under spread,
  though routing/skew changes observed behavior. Per-instance protective limits are valid when
  explicitly scoped (`rate-limiting-and-load-shedding`).
- Plain Spring `@Scheduled` runs once per application context. With one context per replica it
  runs N times unless an outer scheduler/claim/lease or idempotent work changes semantics.
- An in-memory idempotency map deduplicates only the requests that land on the same
  instance. Idempotency needs durable storage with a uniqueness constraint; `idempotency`
  owns the mechanics, this skill owns noticing that the map was never shared.
- A local cache can diverge after update/invalidation for its refresh/eviction/restart horizon;
  no TTL makes staleness unbounded unless explicit invalidation or replacement succeeds, not
  mathematically permanent. Cache design is
  `caching-strategies`; the multi-replica consequence is here.
- Writes to local disk (`Files.write` to a relative path, `java.io.tmpdir`, an upload staged
  under `/tmp` and referenced by a later request) survive exactly as long as the pod. The
  follow-up request that lands on another replica produces a 404 that no code path explains.
- `HttpSession` is in-process state by default. Anything in it a user would notice losing —
  cart contents, a multi-step form, an authorisation decision — is authoritative. Spring
  Session changes the store without changing the servlet API: a placement change, not a
  rewrite.
- **Sticky sessions give affinity, not a guarantee.** Affinity ends when the replica dies,
  when a rolling update drains it, when the client drops the cookie, or when the balancer's
  table is rebuilt. Each of those is user-visible if the state existed only there.
- A signed token moves claims to the client; signing provides integrity/authenticity, not
  confidentiality. Early revocation can use short access-token lifetime, introspection,
  denylist/session version, key rotation or audience-specific policy—each trades latency,
  blast radius and freshness. JWT is a format, not a session architecture.
- A WebSocket, SSE stream or long poll pins one user to one instance for the connection's
  lifetime. Pushing to that user from another replica needs a broker or a fan-out, and a
  rolling update terminates every stream, so the client must reconnect and resynchronise.
- Do not claim statelessness because a class has no fields. State hides in the framework
  too: session attributes, a `ThreadLocal` never cleared, a filter's cache, a library's
  static registry. The inventory proves it; the code shape does not.

## Stateful is not a defect

Prefer explicit stateful ownership when locality, single-writer order or working-set cost
requires it. Then specify partition placement, replication/quorum, durable log/snapshot,
ownership epochs/fencing, failover/rebalance and backup/restore. Calling that service stateless
because an orchestrator can restart it erases its hardest contract.

## Security and shutdown

- Session/auth store failure must fail closed for protected actions. A separately authorized
  public/read-only degraded mode is possible; never reinterpret unknown authentication as
  authenticated.
- Stop admission, durably hand off accepted queues/uploads, drain connections and only then
  terminate. “No fields” does not prevent loss of in-flight accepted work.
- Bind token/session to issuer, audience, tenant and key version; protect against fixation,
  replay, key rotation overlap and cross-tenant cache keys.

## References

- [In-process state inventory](references/state-inventory.md) — every kind of in-process
  state with its classification, the failure it produces at `replicas > 1`, the grep or code
  shape that finds it, and where it moves. Read when auditing a service before scaling it
  out, or when a bug appears on some replicas and not others.
- [Where session state lives](references/session-placement.md) — sticky routing, an external
  store and a signed token compared on replica-death behaviour, deploy behaviour, per-request
  latency and revocation, with the Spring Session and token shapes and a decision block.
  Read when the service holds a session, or when a deploy logs users out.
