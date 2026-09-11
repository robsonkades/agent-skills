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

Protect a business edit whose original read and eventual write span separate database
transactions. Two people may edit the same order over ten minutes; isolation of each short
transaction does not carry the earlier editor's precondition into the later save. Preserve
that original version or an enforced ownership protocol. Transaction duration is a design
choice, with resource and recovery costs, not a fixed number of milliseconds.

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
The stale snapshot crosses the transaction boundary in application time. The four patterns
below organize common responses; the authoritative write still has to enforce the chosen
precondition and invariant.

## The four patterns

```text
Optimistic offline lock    detect the conflict at write time by comparing a
                           version. No lock across think time. Conflict is a business
                           outcome to present, not an error to swallow.

Pessimistic offline lock   prevent the conflict by recording ownership before
                           the edit begins. Needs an owner, an acquisition
                           time and abandonment recovery, because owners crash.

Coarse-grained lock        one version or lock for a whole aggregate, so
                           related changes share one concurrency boundary;
                           independent edits may conflict spuriously.

Implicit lock              the mechanism is applied by the framework or a
                           base class rather than by each developer, so it
                           is harder to omit — at the cost of being
                           invisible when it fires.
```

## Workflow

Scope the work to explanation, diagnosis, protocol selection or implementation. Reuse matching
code and integration evidence; retain an adequate design and a supported no-change result.
Do not require a new abstraction, workload measurement or database campaign for a narrow review.

1. **Locate the original read and authoritative write.** If stale application state crosses
   their transaction boundary, preserve its edit precondition. If each operation's relevant
   read and write are inside its transaction, investigate interference between those
   transactions with `enterprise-transactions`; counting writes alone does not identify the problem.
2. **When choosing a protocol, assess conflict frequency and cost** on the actual data. Two users editing the
   same order or jobs touching the same summary row have workload-dependent overlap.
   Combine observed conflict frequency with the cost of discarded work and waiting.
3. **Choose the coordination boundary from the invariant**, not from the table layout.
   A shared root version is one option; an existing atomic constraint or conditional operation
   may already enforce the invariant without versioning every related row together.
4. **Design the conflict experience before the mechanism.** What does the user see, and
   what can they do about it? A pattern that produces an unusable error is not implemented.
5. **Ensure every affected write path participates.** A mapped superclass, repository base
   or framework feature can reduce omissions; explicit conditional SQL is also valid.
   Audit bulk/native and external paths and make conflict handling observable.
6. **Verify the property at issue.** A sequential stale-client replay can test the original
   version contract. A flush race needs independent real transactions synchronized after
   both loads; competing writes with the same required version must not both commit.
   Use the relevant recipes in the reference and distinguish existing evidence from new tests.

## Decision rules

```text
Conflicts are rare; users can redo the work; edits are short
        → consider optimistic version checks; include client-version propagation,
          atomic writes and useful conflict recovery in the implementation cost.

Conflicts are frequent, or the work lost on conflict is expensive
(a long form, a document, a manual reconciliation)
        → consider pessimistic checkout to expose contention before editing;
          compare its waiting/recovery cost with validated merge or collaboration.

Conflicts are frequent AND the work is cheap to redo
        → consider optimistic merge or retry when intent remains valid on fresh state.

Several people must work on different parts of one consistent whole
        → enforce the shared invariant at the authoritative write. A coarse root
          version/lock is one option; preserve a narrower protocol only when it
          enforces that invariant across all participating writers.

An unattended process (batch, integration) competes with users
        → include it in the chosen version/ownership protocol; retry only
          valid intent in fresh transactions. Checkout needs abandonment recovery.

The mechanism can be forgotten on a new write path
        → centralize participation where useful, and test the affected bypass
          paths. A mapped base class alone does not prove all writers participate.
```

## Rules

- Optimistic offline locking allows concurrent editing, then detects conflicts and rejects
  stale writes. A conflict must reach the user or the calling system as a meaningful
  outcome ("this order changed while you were editing; here is what changed"), never as a
  500 and never as a silent overwrite.
- **Do not blindly retry an optimistic conflict.** A retry that re-reads and re-applies the
  user's _intent_ may be correct after domain revalidation and effect deduplication. A retry that re-applies the user's _stale data_ is a lost
  update with extra steps; `@Retryable` does not make the intent safe.
- Version-based SQL must check the expected version in the `WHERE` clause and the update's
  affected-row count must be tested. Normal versioned entity writes get this from the ORM; hand-written SQL and bulk
  updates need explicit participation. Incrementing the version invalidates old snapshots,
  but does not replace a predicate protecting the bulk operation's own expected state (`orm-behavioral-patterns`).
- Pessimistic offline locks need ownership and abandonment recovery. A lease uses acquisition time,
  expiry and safe renewal; a durable checkout may instead require explicit release plus an audited
  administrative recovery procedure. Expiry is valuable but unsafe if work can outlive it without
  fencing, because two owners may then act concurrently.
- Prefer an application-managed checkout over a database transaction held across human
  thinking time. A held transaction can retain locks, connections and snapshot resources;
  evaluate a deliberate long transaction's bounds, recovery and capacity with
  `enterprise-transactions` instead of treating it as a cost-free offline lock.
- Lock granularity follows the invariant. Versioning rows independently reduces conflicts but can
  permit combinations that violate an aggregate-wide invariant. A shared root version can
  protect it when every related write participates atomically, but can create false conflicts
  between independent edits. Other authoritative protocols must enforce the same invariant
  (`domain-logic-organization`).
- Coarse granularity trades throughput for correctness, and the trade is real: one version
  on a hot aggregate makes its writers compete. If that hurts, measure contention and
  reconsider boundaries only where the required invariant remains enforceable.
- **Complete writer participation is the safety property.** Implicit locking can reduce
  omissions, but does not replace verification of explicit/bulk/external paths. Its cost is diagnosability:
  when a conflict fires, the reason is in a superclass or an interceptor and not in the
  code being read. Pay that cost back with logging that names the entity, the version
  expected and the version found when known; a later read observes a later state.
- Optimistic locking and idempotency solve different problems and are frequently confused.
  Versioning stops a _stale_ write; an idempotency key stops a _duplicate_ write. After the first
  successful update increments the version, a duplicate carrying the old version normally fails
  optimistic locking rather than returning the original result
  (`idempotency`).
- Test transaction races with controlled concurrency on the actual provider/database.
  Mocks cannot prove database conflict handling; a sequential replay tests a different,
  useful property: whether an already-stale client request is rejected.

Before proposing a change, inspect the Java toolchain, ORM/provider, database dialect and
isolation level, client version contract and affected write paths. Return the justified
change or no-change, concurrency boundary, conflict/recovery behavior, evidence and checks
run versus pending, proportionate to the request. Missing provider/database evidence limits
claims that depend on it; it does not invalidate an independently supported explanation.

## References

- [Optimistic and pessimistic offline locks](references/optimistic-and-pessimistic.md) —
  partial Java/JPA examples, version-check SQL, conflict presentation and merge,
  conditional retry, a lease protocol with ownership validation, and reproducible
  integration-test recipes. Read when implementing or
  reviewing either mechanism.
- [Granularity, implicit locks and their failure modes](references/lock-granularity-and-implicit-locks.md)
  — choosing what to version together, root-version bumping for child changes, contention
  and deadlock arising from lock ordering across aggregates, making locking implicit
  without making it invisible, bulk-write bypasses and cache-related stale reads.
  Read when conflicts are frequent, spurious, or absent when they should not be.
