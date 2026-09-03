---
name: distributed-locks-and-leases
description: >
  Cross-process exclusion through leases, session/transaction locks and fencing: stale
  holders, owner-safe release, Redis/Redlock assumptions, database advisory locks, resource
  claims and lock-free alternatives. Use when reviewing SET NX/TTL, watchdog renewal,
  duplicate workers or a lock around a non-repeatable effect. Consensus implementation,
  leader election, local JVM locking and user-session concurrency are separate skills.
---

# Distributed Locks And Leases

## Purpose

A `ReentrantLock` is a **mutex**: exclusion inside one process, enforced by the JVM and made
visible by the memory model — a different subject at a different scale, owned by
`java-memory-model`. A **distributed lock** has no shared memory, no reliable failure detector,
and an owner that can stop existing without telling anyone. TTL locks are **leases**;
database locks may instead be tied to a transaction or session whose termination the server
observes. These have different liveness and stale-client failure modes. **Leader
election** grants a longer-lived role and may use terms, sessions or leases
(`leader-election`); **ownership** by partition serializes work per key but still needs a safe
rebalance (`sharding-and-partitioning`); **consensus** is how a fault-tolerant lock service decides
who holds the grant (`consensus-and-quorums`). Only the last is agreement; a grant alone
cannot stop an uncooperative or stale client from writing to a different resource.

The failure this prevents is the two-writer sequence with no exception in it. Process A takes a
30 s lease and stalls — a stop-the-world pause, CPU starvation from a noisy neighbour, a slow
disk, a live VM migration. The lease expires; process B acquires it legitimately and starts
work; A resumes, still inside its `try` block, still holding a lock object whose `isLocked()`
says true, and completes its write. Two writers, every log line green. Preventing the stale
effect requires enforcement at the protected resource: a fencing claim, conditional write,
transaction-scoped lock in that same resource, or a repeat-safe invariant.

## Workflow

1. **Ask whether you need a lock at all.** A conditional write (`UPDATE … WHERE version = ?`),
   a unique constraint, a partitioned owner or an idempotent operation moves coordination into
   the resource or removes the need for exclusive execution. Exhaust
   `references/lock-decision.md` first.
2. **Name the protected resource and ask whether it can reject a stale writer.** Fencing is a
   property of the _resource_: a table with a fence column can enforce it, a third-party HTTP API
   generally cannot. This decides everything below — `references/fencing-tokens.md`.
3. **If it cannot be fenced, change the requirement**: make the operation idempotent
   (`idempotency`), make concurrent writers converge, or accept the lock as an _efficiency_
   measure whose violation must be survivable.
4. **Choose the implementation from the failure mode you can tolerate**, not from what is already
   deployed: TTL leases (Redis), quorum/session-backed locks (etcd/ZooKeeper), and
   connection/transaction-scoped database locks have different expiry and availability modes.
5. **Write acquire and release with an owner token.** The lock value is a unique token; release
   compares it and deletes only on a match, atomically. A bare `DEL` releases whoever holds it
   now — a lock-stealing bug that appears only after the first expiry.
6. **Size the lease as a liveness trade-off, not a proof.** Use measured duration and pause
   distributions plus headroom; choose the crash-recovery delay you can tolerate. No observed
   percentile bounds future pauses, so correctness must survive expiry.
7. **Test with a stalled holder, not two threads.** `kill -STOP` the holder past the TTL, let a
   second process acquire, resume the first, and assert the _resource_ rejected its write.

## Decision block

```text
Use a distributed lock when:
- one serialized owner materially simplifies the operation and contention is acceptably low
- the protected resource can enforce current ownership/fencing, or a duplicate is merely wasteful rather
  than incorrect (an efficiency lock)
- contention is low: taken by a background job or on a small fraction of requests
Avoid a distributed lock when:
- its added dependency, queueing and round trip violate the request SLO or availability model
- the critical section contains an unbounded or irreversible remote effect that cannot enforce
  ownership or idempotency (`timeouts-and-deadlines`)
- it is meant to make a non-idempotent write safe on a resource that cannot fence: it lowers
  the probability of a duplicate and does not remove it
Prefer instead when:
- a single-row conditional update or a unique constraint expresses the invariant — the database
  already serialises it, with no extra dependency and no TTL to guess
- the contended thing is a key and work can be routed by it (sharding-and-partitioning), so one
  owner per key needs no lock
- the goal is bounding concurrency rather than excluding it — a semaphore or permit budget
  (concurrency-limiting-and-bulkheads) is a different primitive
```

## Rules

- State the guarantee per implementation and fault model. A linearizable lock service may
  grant at most one current owner; a single Redis instance with asynchronous failover has a
  different guarantee. Neither by itself prevents a stale former owner from writing elsewhere.
- **A fencing protocol has four parts**: issue a monotonically increasing token, carry it,
  advance/claim that token at the resource before doing work, then condition every effect on
  that token still being current. Without the claim step, an old token can be accepted before
  the new holder's first write. See `references/fencing-tokens.md`.
- Clock assumptions are algorithm-specific. Server-decided lease expiry does not literally
  compare client and server timestamps, while Redlock reasons about elapsed acquisition time
  and bounded drift. Use a monotonic source for local elapsed duration, but it cannot prove
  another process still recognizes the lease.
- **A renewal watchdog does not make a lease safe.** The pause that made the holder late stops
  its watchdog too, and a partition that stops renewal is precisely when another holder is
  admitted. Renewal improves the common case and changes nothing about the bad one.
- `SET key <token> NX PX <ttl>` on one Redis instance is a lease. With asynchronous replica
  promotion, a failover may lose an unreplicated key and admit a second holder. Release must be
  owner-conditional: Redis 8.4 offers `DELEX ... IFEQ`; older versions use an atomic script.
- **Redlock is genuinely contested, and the disagreement is about assumptions.** Kleppmann
  objects that it depends on bounded clock drift and bounded process pauses, which a JVM on
  shared infrastructure does not provide, and that correctness-critical use needs fencing the
  algorithm does not supply. Antirez replies that it relies on _elapsed-time_ measurement rather
  than absolute clock agreement, that clock steps are an operational concern, and that the fencing
  objection applies to every lock service equally. The criterion is not who is right: **ask what
  breaks if the assumption fails.** "Duplicate work" makes it affordable; "corrupted data" means
  the protected invariant needs enforcement independent of lease timing.
- A database row lock (`SELECT … FOR UPDATE`) fails more honestly: held by a transaction and
  released by commit, rollback or connection loss, so there is no TTL to guess. The prices are an
  open transaction plus a pooled connection held for the whole critical section
  (`connection-pool-sizing`), and the lock's availability is the database's.
- A **session-scoped** advisory lock (`pg_advisory_lock`, `sp_getapplock` with a session owner)
  taken on a pooled connection leaks: the connection returns to the pool still holding it and
  the next borrower inherits it. Use the transaction-scoped form (`pg_advisory_xact_lock`).
- Lock the narrowest key that expresses the invariant (`order:{id}`, not `orders`), assume no
  reentrancy, and decide what happens when the lock store is unreachable — fail closed or fail
  open. "Log and continue" is fail-open chosen by accident.

## References

- [Redis distributed-lock pattern and assumptions](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)
- [etcd concurrency lock API](https://etcd.io/docs/v3.5/dev-guide/api_concurrency_reference_v3/)
- [ZooKeeper lock recipe](https://zookeeper.apache.org/doc/r3.7.2/recipes.html)
- [PostgreSQL explicit and advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html)

- [Fencing tokens](references/fencing-tokens.md) — the two-writer sequence with timestamps, the
  token as the fix, what the resource must do to enforce it, which resources can and cannot be
  fenced, and the fallbacks when they cannot. Read when a lock protects a non-repeatable write.
- [Do you need a lock, and which one](references/lock-decision.md) — the alternatives with the
  condition selecting each, then Redis, Redlock, etcd/ZooKeeper leases, database row locks and
  advisory locks compared on failure mode, clock dependence, fencing support and operational
  cost. Read before introducing a lock, or when replacing one that failed.
