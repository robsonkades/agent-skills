---
name: offline-concurrency-control
description: >
  Protecting data from concurrent edits that span more than one transaction: optimistic
  offline lock, pessimistic offline lock, coarse-grained locking at the aggregate, and
  implicit locking applied by the framework. Use when two users overwrite each other's
  edits, when a version column is being added or removed, when OptimisticLockException
  reaches the user as a stack trace, when a bulk update silently bypasses versioning, when a
  lock is held across thinking time by a database transaction, when a lock table has no
  expiry, or when retry is proposed as the answer to a conflict. Does not cover boundaries
  and isolation within one transaction (enterprise-transactions), in-process thread locking
  (java-memory-model), or repeat-safety of a request (idempotency).
---

# Offline Concurrency Control

## Purpose

Handle the concurrency that database transactions cannot reach. A transaction protects a
unit of work measured in milliseconds; the business problem is two people editing the same
order over ten minutes. No isolation level addresses that, and reaching for one is the most
common wrong turn in this area.

The second failure this prevents is treating a conflict as an infrastructure error: an
`OptimisticLockException` surfacing as a 500 with a stack trace, or being silently retried
so that the later write wins after all — which reintroduces exactly the lost update the
version column was added to stop.

## The problem, precisely

```text
t0  User A reads order v7            t0  User B reads order v7
t1  ... thinks for 4 minutes         t1  edits quantity, saves → v8
t2  edits address, saves → writes over v8 with data derived from v7
```

Nothing here is a database anomaly: both writes are perfectly serialisable transactions.
The loss happens between them, in application time. The four patterns below are the
available answers.

## The four patterns

```text
Optimistic offline lock    detect the conflict at write time by comparing a
                           version. No lock held. Conflict is a business
                           outcome to present, not an error to swallow.

Pessimistic offline lock   prevent the conflict by recording ownership before
                           the edit begins. Needs an owner, an acquisition
                           time and an expiry, because owners crash.

Coarse-grained lock        one version or one lock for a whole aggregate, so
                           related data cannot be updated inconsistently and
                           parts do not conflict with each other spuriously.

Implicit lock              the mechanism is applied by the framework or a
                           base class rather than by each developer, so it
                           cannot be forgotten — at the cost of being
                           invisible when it fires.
```

## Workflow

1. **Establish that the conflict spans transactions.** If both writes are in one
   transaction, this is an isolation or row-locking question
   (`enterprise-transactions`), not an offline one.
2. **Measure or estimate the conflict rate** on the actual data. Two users editing the
   same order in the same minute is rare; two nightly jobs touching the same summary row is
   certain. The rate decides optimistic versus pessimistic more than anything else does.
3. **Choose the lock granularity from the invariant**, not from the table layout: whatever
   must stay consistent together should be versioned together.
4. **Design the conflict experience before the mechanism.** What does the user see, and
   what can they do about it? A pattern that produces an unusable error is not implemented.
5. **Make the mechanism implicit** once chosen — a mapped superclass, a repository base, a
   framework feature — so a new code path cannot omit it, and make it observable so it can
   still be diagnosed.
6. **Verify with a concurrent test**, not by reasoning. Two threads, real transactions,
   asserting that exactly one wins.

## Decision rules

```text
Conflicts are rare; users can redo the work; edits are short
        → optimistic. Default choice; costs one column and one branch.

Conflicts are frequent, or the work lost on conflict is expensive
(a long form, a document, a manual reconciliation)
        → pessimistic. The user is told up front the record is busy,
          instead of after the effort is spent.

Conflicts are frequent AND the work is cheap to redo
        → optimistic with a merge or a retry that re-reads. Do not lock.

Several people must work on different parts of one consistent whole
        → coarse-grained lock on the aggregate. Accept that they will
          block each other; that is the invariant asking for it.

An unattended process (batch, integration) competes with users
        → optimistic for the process too, plus a bounded retry. Never a
          pessimistic lock without an expiry — batches crash.

The mechanism can be forgotten on a new write path
        → make it implicit, and add a test that fails when a versioned
          type is written by a path that bypasses it.
```

## Rules

- Optimistic locking **detects**, it does not prevent. Its value is entirely in what
  happens next: a conflict must reach the user or the calling system as a meaningful
  outcome ("this order changed while you were editing; here is what changed"), never as a
  500 and never as a silent overwrite.
- **Do not blindly retry an optimistic conflict.** A retry that re-reads and re-applies the
  user's _intent_ is correct. A retry that re-applies the user's _stale data_ is a lost
  update with extra steps, and it is the most common misuse of `@Retryable` in this area.
- A version column must be checked in the `WHERE` clause of the update and the update's
  affected-row count must be tested. An ORM does this for you; hand-written SQL and bulk
  updates do not, and a bulk `UPDATE` that does not touch the version silently defeats
  every optimistic lock on those rows (`orm-behavioral-patterns`).
- Pessimistic offline locks need four things or they will strand data: an owner, an
  acquisition timestamp, an expiry, and an administrative override. The expiry is not
  optional — the owning session will crash, and without expiry the record is locked
  forever.
- Do not implement a pessimistic offline lock with a database transaction held open across
  requests. It holds a pooled connection for a human's thinking time, and it will exhaust
  the pool long before it will protect data.
- Lock granularity follows the invariant. Versioning each row of an aggregate separately
  produces conflicts between edits that were never in conflict, and permits inconsistent
  combinations that the aggregate exists to prevent (`domain-logic-organization`).
- Coarse granularity trades throughput for correctness, and the trade is real: one version
  on a hot aggregate serialises all its writers. If that hurts, the aggregate is probably
  too big — resize it rather than weakening the lock.
- **Implicit locking is a safety property, not a convenience.** Its cost is diagnosability:
  when a conflict fires, the reason is in a superclass or an interceptor and not in the
  code being read. Pay that cost back with logging that names the entity, the version
  expected and the version found.
- Optimistic locking and idempotency solve different problems and are frequently confused.
  Versioning stops a _stale_ write; an idempotency key stops a _duplicate_ write. A retried
  request carrying the same version will pass the version check
  (`idempotency`).
- Test concurrency with concurrency. A unit test with a mocked repository cannot observe a
  lost update; two threads against a real database can.

## References

- [Optimistic and pessimistic offline locks](references/optimistic-and-pessimistic.md) —
  both patterns implemented in Java and JPA, the version-check SQL, conflict presentation
  and merge, safe versus unsafe retry, the lock table with owner and expiry, lock renewal,
  and a concurrent test that actually proves the behaviour. Read when implementing or
  reviewing either mechanism.
- [Granularity, implicit locks and their failure modes](references/lock-granularity-and-implicit-locks.md)
  — choosing what to version together, root-version bumping for child changes, contention
  and deadlock arising from lock ordering across aggregates, making locking implicit
  without making it invisible, and the ways bulk operations and caches quietly defeat it.
  Read when conflicts are frequent, spurious, or absent when they should not be.
