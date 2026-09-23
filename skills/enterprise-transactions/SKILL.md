---
name: enterprise-transactions
description: >
  Transaction boundaries as an architectural decision: where a transaction starts and ends,
  what isolation level actually buys, how propagation and rollback rules behave in practice,
  the costs of spanning a network call or a user's thinking time, and how to handle
  effects outside its atomic scope. Use when a use case writes twice and nobody can say
  whether it is atomic, when @Transactional sits on a repository or a controller, when a
  transaction stays open across an HTTP call or a message publish, when a rollback did not
  happen because the exception was checked or the call was self-invoked, when isolation is
  being raised to fix a race, when a read-only flag is added without knowing what it does,
  when a long-running batch holds locks, or when a transaction is expected to cover two
  services. Does not cover locks held across user think time (offline-concurrency-control),
  what a client may observe across replicas (consistency-models), repeat-safety of an
  operation (idempotency), or database-specific lock behaviour.
---

# Enterprise Transactions

## Purpose

Put the transaction boundary where the business's unit of work is, and be explicit about
what happens at every edge that boundary cannot cross. Most production transaction bugs are
not exotic: the boundary is in the wrong layer, it silently did not start, it covers work
that should have been outside it, or it is expected to cover work no transaction can reach.

## Where the boundary belongs

```text
Controller / consumer / job          usually outside; may own a boundary for a
                                     message/job unit when it is the use-case entry
        │
Application service (use case)       common boundary for business atomicity
        │
Domain                               unaware of transactions
        │
Repository / mapper                  usually participates; may own a local operation
```

Keep the business atomic unit within one transaction. Repository-local transactions alone
do not combine several calls atomically. A controller boundary may include unnecessary
work, but interception normally covers the method call, not automatically all request
parsing or later response rendering. Inspect the actual call and resource lifecycle.

Inspect the target JDK, Spring/provider versions, transaction manager, datasource routing,
database engine/isolation and proxy mode before applying examples. This skill's Java snippets
are partial imperative examples, not a complete application; they do not describe reactive
transaction-context propagation. Do not upgrade the project to match an example.

## Workflow

1. **Separate the business outcome from its atomic changes.** Reuse the use-case contract,
   invariants, current boundaries and failure evidence. "Record the order and email the customer"
   can be one business workflow, but an ordinary database transaction cannot roll back the email.
   Ask only unresolved questions that change atomicity, acceptable intermediate states or recovery;
   inspect enlistment and rollback behavior while those questions are resolved.
2. **Prefer the application service for business atomicity**, while allowing repository-local
   read/write operations and listener/job entrypoints to demarcate when they are the actual unit.
3. **Minimize work holding transactional resources.** Prefer moving non-enlisted network calls,
   message publication, file writes, long computations and human waits outside the boundary, with
   durable recovery for the resulting gaps. Preserve an adequate existing transaction; verified
   XA participation or required validation under a lock needs its own scope/cost assessment.
4. **Choose isolation deliberately, once**, and record why if it is not the default.
   Raising isolation to fix a specific race is legitimate; raising it globally because a
   race exists somewhere can add blocking or conflict retries to unrelated paths.
   Compare those costs under the target workload before making a global change.
5. **Verify rollback actually happens** for the failures you care about. By default Spring's
   transaction interceptor rolls back on `RuntimeException`/`Error`, not checked exceptions.
   Self-invocation in proxy mode does not apply the inner method's transaction attributes; it may
   still execute inside the caller's existing transaction.
6. **Identify every enlisted resource and external effect.** A local transaction does not
   cover an ordinary remote API. Choose durable recovery or a supported distributed
   transaction from the actual contract (`distribution-boundaries`).

Return the atomic unit, actual transaction entry/exit and participating resources, the
failure or race being addressed, and the check proving the intended commit/rollback outcome.
When runtime evidence is missing, name the integration test needed instead of claiming
that an annotation proves atomicity.

## Decision rules

```text
Two or more writes to one database that must both happen or neither
        → one transaction, demarcated at the use case. Verify that both operations
          actually enlist; the same database URL or an active transaction flag is not proof.

A write plus a message or an HTTP call to another system
        → not atomic under an ordinary local transaction. Choose: outbox (write the intent in the
          same transaction, relay after commit), or make the remote call
          idempotent and retry, or compensate. Publishing inside the
          transaction does not enlist the remote effect. Explicit XA participation differs.

A read-only query or a report
        → choose snapshot/consistency needs first. readOnly is a provider-dependent
          hint, not portable write enforcement or automatic replica routing.

A long batch over many rows
        → chunk with durable checkpoints when partial progress is acceptable.
          If all-or-nothing visibility is required, retain a feasible bounded
          transaction or consider staged data with an atomic publication switch
          honored by readers. Row count alone does not authorize weaker atomicity.

A lock must survive a user's thinking time
        → do not keep a database transaction open across human delay.
          Use an offline concurrency protocol (offline-concurrency-control).

A race that isolation could fix (lost update, phantom)
        → choose a mechanism that covers the invariant: a unique constraint,
          a version column, or verified row/range locking. Row locks alone
          need not protect missing rows or a changing set. Compare with
          SERIALIZABLE plus retry on the affected use case before changing defaults.

Nested use cases where the inner must survive the outer's rollback
        → REQUIRES_NEW, deliberately. Inner JDBC work can require another
          connection while outer resources remain held, and can wait on
          locks held by the suspended outer transaction.
```

## Rules

- **A transaction is not a concurrency design.** It gives atomicity and an isolation level;
  it does not automatically validate a stale observation from an earlier transaction, and it does not
  make an operation safe to retry (`offline-concurrency-control`, `idempotency`).
- Measure transaction duration alongside acquired connections, locks and retained versions.
  Long transactions can exhaust pools or delay other work; establish the mechanism from
  pool/lock/transaction evidence before diagnosing "the database is slow"
  (`architecture-and-performance`).
- Avoid holding a database transaction across a network call because timeout and retry behavior
  extend lock/connection occupancy. Where correctness requires validation under a lock and no
  non-atomic redesign is acceptable, bound the call, model pool/lock capacity and test failure;
  document the deliberate coupling.
- Rollback rules are a contract you must inspect. Spring's ordinary default rolls back on
  unchecked exceptions and `Error`, not checked exceptions. Explicit rules and configured
  defaults can override this; Spring 6.2+ supports an all-exceptions default. A checked
  exception can leave work committed if no rollback rule or rollback-only state prevents it.
- Self-invocation bypasses interception in Spring's default proxy mode: the callee inherits whatever
  transaction context the caller already has, but its own propagation/isolation/rollback attributes
  are not applied. Method visibility/finality constraints depend on JDK versus class proxies and
  Spring version; `static` methods are not instance-proxied. AspectJ mode differs.
- `readOnly = true` is not portable enforcement. Spring/provider integrations may adjust flush mode
  and pass a JDBC read-only hint; replica routing requires separate routing configuration. Some
  configurations enforce database read-only transactions. If relying on that enforcement, test
  attempted writes and its resource/transaction scope; the annotation alone does not prove it.
- Isolation levels are defined by the anomalies they prevent, not by intuition, and
  engines interpret them differently — notably, `REPEATABLE READ` means different things in
  different databases, and `SERIALIZABLE` is implemented by locking in some and by
  optimistic conflict detection with retry in others. Test the behaviour, do not assume it.
- A local transaction is not a distributed transaction. XA/two-phase commit can coordinate enlisted
  resources but adds coordinator/recovery coupling and can block during failures. Sagas/outboxes
  trade immediate atomicity for explicit intermediate states and idempotent recovery; select from
  actual resource support and consistency requirements.
- `@Transactional` around one repository call can still document application semantics, configure
  isolation/read-only/timeout, or remain stable as orchestration grows. Remove it only when its
  behavior is truly identical to the repository boundary and the convention is clear.
- If an inner participating boundary marks the shared transaction rollback-only, catching
  its exception does not restore commitability. The outer commit attempt can raise
  `UnexpectedRollbackException`; verify persisted state from outside that transaction.

## References

- [Boundaries and propagation](references/boundaries-and-propagation.md) — the propagation
  modes with what each actually does to connections and rollback, self-invocation and the
  other silent no-ops, batch chunking, the outbox at a network edge, and how to verify at
  runtime which transaction a piece of code ran in. Read when demarcating, or when a
  rollback did not happen.
- [Isolation, anomalies and recovery](references/isolation-and-recovery.md) — the anomaly
  ladder stated as what a client can observe, what each level costs in blocking or in retry,
  engine differences that break portable assumptions, deadlock and serialisation-failure
  handling, and choosing between isolation and a targeted mechanism. Read when a race is
  being fixed or an isolation level is being changed.
