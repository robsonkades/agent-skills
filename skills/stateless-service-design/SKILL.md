---
name: stateless-service-design
description: >
  Making a service instance disposable so replicas are interchangeable: what stateless
  actually means — no state whose loss changes a correct outcome; the in-process state
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

Decide which state may stay inside the process. "Stateless" does not mean the instance holds
nothing in memory — every service holds connections, caches and per-request working sets. It
means the instance holds **no state whose loss changes a correct outcome**. A cache is fine:
losing it costs latency. An in-memory session is not: losing it logs a user out. An in-memory
rate-limit counter is not: it is already wrong the moment a second replica exists, before
anything is lost at all.

The failure this prevents is the bug that cannot appear in any environment you have.
`replicas: 1` passes every test, because with one replica the process _is_ the shared store.
The counter, the idempotency map, the scheduled job and the local cache stay correct until
capacity is added, and then they are wrong quietly — a duplicate charge, a limit enforced at
N times its value, a job that emails everyone twice.

## Workflow

1. **Apply the disposability test to every field.** For each piece of in-process state ask:
   if this JVM is SIGKILLed now and never returns, does any outcome become incorrect? "Yes"
   means authoritative and it must leave the process. "It gets slower" means it may stay.
2. **Inventory before you redesign.** Enumerate singleton bean fields, `static` collections,
   `HttpSession` attributes, caches, scheduler and executor queues, local files and
   long-lived connections; classify each as derivable, per-request or authoritative. The
   table and the grep shapes are in `references/state-inventory.md`.
3. **Place session state deliberately.** Sticky routing, an external session store and a
   signed token are three different failure and revocation profiles, not three flavours of
   one idea. See `references/session-placement.md`.
4. **Move each authoritative item out and name its new owner** — a database row, Redis, the
   client's token, the message itself. "Moved to the cache" is not an answer: a cache may be
   evicted at any time, so authoritative data in a cache is still data you can lose.
5. **Hunt the singleton assumptions.** `@Scheduled`, an `ApplicationRunner` doing one-time
   work, a warm-up, a poller, a file sweeper: each runs once per **replica**, not once per
   deploy. Whichever must run once per fleet needs `leader-election` or a distributed lease,
   and the lease needs a TTL, or a SIGKILLed pod holds it until someone clears it by hand.
6. **Prove it at two replicas.** Run the functional suite against two instances behind a
   balancer with affinity **off**, then kill one instance mid-suite. A green run at
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
- An in-process counter that gates a **business decision** — a rate limit, a quota, a
  sequence number, a "first N wins" — enforces its rule per instance. With N replicas the
  effective limit is N times the configured one, and nothing logs an error.
- `@Scheduled` without a distributed lease runs on every replica. Two replicas is two
  concurrent runs over the same rows.
- An in-memory idempotency map deduplicates only the requests that land on the same
  instance. Idempotency needs durable storage with a uniqueness constraint; `idempotency`
  owns the mechanics, this skill owns noticing that the map was never shared.
- A local `Caffeine` or `ConcurrentHashMap` cache diverges per replica: after an
  invalidation, some replicas serve the new value and some the old, for as long as the TTL
  allows — and with **no TTL** that divergence is permanent. Cache design is
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
- A signed token (JWT) does not remove state; it moves it to the client and turns the problem
  into revocation and size. A bearer token is valid until it expires — revoking earlier means
  checking a shared denylist, which is exactly the hop the token was chosen to avoid. Pick it
  for the revocation trade, never as a latency optimisation.
- A WebSocket, SSE stream or long poll pins one user to one instance for the connection's
  lifetime. Pushing to that user from another replica needs a broker or a fan-out, and a
  rolling update terminates every stream, so the client must reconnect and resynchronise.
- Do not claim statelessness because a class has no fields. State hides in the framework
  too: session attributes, a `ThreadLocal` never cleared, a filter's cache, a library's
  static registry. The inventory proves it; the code shape does not.

## References

- [In-process state inventory](references/state-inventory.md) — every kind of in-process
  state with its classification, the failure it produces at `replicas > 1`, the grep or code
  shape that finds it, and where it moves. Read when auditing a service before scaling it
  out, or when a bug appears on some replicas and not others.
- [Where session state lives](references/session-placement.md) — sticky routing, an external
  store and a signed token compared on replica-death behaviour, deploy behaviour, per-request
  latency and revocation, with the Spring Session and token shapes and a decision block.
  Read when the service holds a session, or when a deploy logs users out.
