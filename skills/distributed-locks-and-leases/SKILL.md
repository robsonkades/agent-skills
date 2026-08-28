---
name: distributed-locks-and-leases
description: >
  Mutual exclusion across processes, and why the naive version does not: a lock with a TTL
  is a lease, and a lease alone does not exclude — the holder can stall past expiry and keep
  writing while a second holder is admitted, with no error anywhere. Covers the fencing
  token as the only correct fix and the resource's duty to enforce it, Redis locking with an
  owner token, Redlock's contested status, database row and advisory locks, and the
  alternatives that beat a lock. Use when SET NX appears with a TTL, when a lock is released
  with a bare DEL, when watchdog renewal is treated as safety, when two workers processed
  one record with no exception, or when a lock is proposed to make a non-idempotent write
  safe. Not how a lock service is built (consensus-and-quorums), one long-lived owner of a
  role (leader-election), surviving duplicates instead (idempotency), in-process locking
  (java-memory-model), one-database boundaries (enterprise-transactions), or locks across
  user think time (offline-concurrency-control).
---

# Distributed Locks And Leases

## Purpose

A `ReentrantLock` is a **mutex**: exclusion inside one process, enforced by the JVM and made
visible by the memory model — a different subject at a different scale, owned by
`java-memory-model`. A **distributed lock** has no shared memory, no reliable failure detector,
and an owner that can stop existing without telling anyone; every implementation is therefore a
**lease**, a grant with an expiry so a dead holder cannot block the system forever. **Leader
election** is the same lease held over a _role_ rather than a critical section
(`leader-election`); **ownership** by partition removes the question, giving each key one process
by assignment (`sharding-and-partitioning`); **consensus** is how a correct lock service decides
who holds the grant (`consensus-and-quorums`). Only the last is agreement — the rest are grants,
and a grant does not stop anybody from writing.

The failure this prevents is the two-writer sequence with no exception in it. Process A takes a
30 s lease and stalls — a stop-the-world pause, CPU starvation from a noisy neighbour, a slow
disk, a live VM migration. The lease expires; process B acquires it legitimately and starts
work; A resumes, still inside its `try` block, still holding a lock object whose `isLocked()`
says true, and completes its write. Two writers, every log line green. **Mutual exclusion is
not achieved across a pause without a fencing token the protected resource checks.**

## Workflow

1. **Ask whether you need a lock at all.** A conditional write (`UPDATE … WHERE version = ?`),
   a unique constraint, a partitioned owner or an idempotent operation removes the coordination
   rather than paying for it on every call. Exhaust `references/lock-decision.md` first.
2. **Name the protected resource and ask whether it can reject a stale writer.** Fencing is a
   property of the _resource_: a table with a fence column can enforce it, a third-party HTTP API
   generally cannot. This decides everything below — `references/fencing-tokens.md`.
3. **If it cannot be fenced, change the requirement**: make the operation idempotent
   (`idempotency`), make concurrent writers converge, or accept the lock as an _efficiency_
   measure whose violation must be survivable.
4. **Choose the implementation from the failure mode you can tolerate**, not from what is already
   deployed: lease-expiry locks (Redis, etcd, ZooKeeper) and connection-scoped locks (a
   transaction, an advisory lock) fail in opposite directions.
5. **Write acquire and release with an owner token.** The lock value is a unique token; release
   compares it and deletes only on a match, atomically. A bare `DEL` releases whoever holds it
   now — a lock-stealing bug that appears only after the first expiry.
6. **Size the lease from measurement**: above the p99.9 of the protected section plus the worst
   observed stop-the-world pause (`pause-attribution`), below the delay you accept after a crash.
7. **Test with a stalled holder, not two threads.** `kill -STOP` the holder past the TTL, let a
   second process acquire, resume the first, and assert the _resource_ rejected its write.

## Decision block

```text
Use a distributed lock when:
- the work is not idempotent, cannot be made idempotent, and a duplicate is expensive
- the protected resource can check a fencing token, or a duplicate is merely wasteful rather
  than incorrect (an efficiency lock)
- contention is low: taken by a background job or on a small fraction of requests
Avoid a distributed lock when:
- it would be taken on the request path at request rate — that is a required dependency plus a
  round trip on every call (failure-models)
- the critical section makes a remote call whose timeout is not strictly shorter than the lease
  (timeouts-and-deadlines)
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

- State the guarantee precisely: a lock service can ensure **at most one client holds the lease
  at a time**. It cannot ensure at most one client is _writing_, because a holder that loses the
  lease is not notified and may already be mid-operation. Never write that a distributed lock
  guarantees mutual exclusion.
- **The fencing token is the only fix, and it has three parts**: the service issues a
  monotonically increasing number per grant; the holder sends it with every write; the resource
  stores the highest token seen and **rejects a write carrying a lower one**. Two of the three
  buy nothing — a token passed but never checked is documentation.
- Lease expiry compares timestamps produced on different machines: NTP steps, suspended VMs and
  skew inside tolerance all move the expiry relative to the holder's belief. Measure elapsed time
  with `System.nanoTime()`, never `currentTimeMillis()`, and treat clock disagreement as margin.
- **A renewal watchdog does not make a lease safe.** The pause that made the holder late stops
  its watchdog too, and a partition that stops renewal is precisely when another holder is
  admitted. Renewal improves the common case and changes nothing about the bad one.
- `SET key <token> NX PX <ttl>` on one Redis instance is a lease, with every caveat above plus
  one: replication is asynchronous, so a failover can lose the key and admit a second holder at
  once. Release must be a compare-and-delete (a Lua script checking the token before `DEL`).
- **Redlock is genuinely contested, and the disagreement is about assumptions.** Kleppmann
  objects that it depends on bounded clock drift and bounded process pauses, which a JVM on
  shared infrastructure does not provide, and that correctness-critical use needs fencing the
  algorithm does not supply. Antirez replies that it relies on _elapsed-time_ measurement rather
  than absolute clock agreement, that clock steps are an operational concern, and that the fencing
  objection applies to every lock service equally. The criterion is not who is right: **ask what
  breaks if the assumption fails.** "Duplicate work" makes it affordable; "corrupted data" means
  no lock algorithm helps and the resource must fence.
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

- [Fencing tokens](references/fencing-tokens.md) — the two-writer sequence with timestamps, the
  token as the fix, what the resource must do to enforce it, which resources can and cannot be
  fenced, and the fallbacks when they cannot. Read when a lock protects a non-repeatable write.
- [Do you need a lock, and which one](references/lock-decision.md) — the alternatives with the
  condition selecting each, then Redis, Redlock, etcd/ZooKeeper leases, database row locks and
  advisory locks compared on failure mode, clock dependence, fencing support and operational
  cost. Read before introducing a lock, or when replacing one that failed.
