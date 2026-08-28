---
name: enterprise-transactions
description: >
  Transaction boundaries as an architectural decision: where a transaction starts and ends,
  what isolation level actually buys, how propagation and rollback rules behave in practice,
  why a transaction must not span a network call or a user's thinking time, and what
  replaces atomicity once it must. Use when a use case writes twice and nobody can say
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
Controller / consumer / job          no transaction; may not decide the boundary
        │
Application service (use case)       ← the transaction starts and ends HERE
        │
Domain                               unaware of transactions
        │
Repository / mapper                  participates; must not demarcate
```

One use case, one transaction. The two anti-placements are equally common: on the
repository, giving one transaction per query so a use case's writes cannot roll back
together; and on the controller, so request parsing, serialisation and view rendering all
run inside the transaction and hold a connection while they do.

## Workflow

1. **State the unit of work in business terms.** "Reserve stock and record the order" is
   one; "record the order and email the customer" is not — the email is not transactional
   and pretending otherwise is where the bug will be.
2. **Place the boundary at the application service** and remove demarcation from every
   other layer.
3. **Push non-transactional work out.** Network calls, message publication, file writes,
   long computations and anything waiting on a human. Each of those inside a transaction
   holds a connection and locks for its full duration.
4. **Choose isolation deliberately, once**, and record why if it is not the default.
   Raising isolation to fix a specific race is legitimate; raising it globally because a
   race exists somewhere is how throughput disappears.
5. **Verify rollback actually happens** for the failures you care about — checked
   exceptions do not roll back a Spring transaction by default, and a self-invoked
   `@Transactional` method never started one.
6. **For anything crossing a process boundary**, design the non-atomic outcome explicitly:
   idempotent retry, an outbox, or a compensating action (`distribution-boundaries`).

## Decision rules

```text
Two or more writes to one database that must both happen or neither
        → one transaction, demarcated at the use case. Straightforward.

A write plus a message or an HTTP call to another system
        → NOT one transaction. Choose: outbox (write the intent in the
          same transaction, relay after commit), or make the remote call
          idempotent and retry, or compensate. Publishing inside the
          transaction is the dual-write bug.

A read-only query or a report
        → readOnly transaction, or none at all. readOnly is a hint that
          lets the ORM skip dirty checking and may route to a replica;
          it is not a guarantee that writes fail.

A long batch over many rows
        → many transactions, one per chunk, with restartability. One
          transaction over a million rows holds locks and undo for its
          whole duration and cannot be resumed.

A lock must survive a user's thinking time
        → no database transaction can do this. Optimistic or pessimistic
          offline lock (offline-concurrency-control).

A race that isolation could fix (lost update, phantom)
        → prefer a targeted mechanism: a unique constraint, a version
          column, SELECT ... FOR UPDATE on the one path. Global isolation
          escalation costs every other path.

Nested use cases where the inner must survive the outer's rollback
        → REQUIRES_NEW, deliberately, knowing it takes a second
          connection and can deadlock against the outer transaction.
```

## Rules

- **A transaction is not a concurrency design.** It gives atomicity and an isolation level;
  it does not stop two users overwriting each other across two requests, and it does not
  make an operation safe to retry (`offline-concurrency-control`, `idempotency`).
- Transaction duration is the resource. Every millisecond holds a connection from a pool
  that is smaller than the thread count and holds locks that serialise other work. Long
  transactions are the most common cause of "the database is slow" that is not the database
  (`architecture-and-performance`).
- Never hold a transaction across a network call. The remote system's timeout becomes your
  lock duration, and a remote hang converts into pool exhaustion in seconds.
- Rollback rules are a contract you must state. In Spring, unchecked exceptions and `Error`
  roll back; **checked exceptions do not**, unless declared with `rollbackFor`. A checked
  business exception thrown from a service commits the partial work by default.
- Self-invocation defeats proxy-based demarcation entirely: a `@Transactional` method
  called from another method on the same bean runs in the caller's context, which may be no
  transaction at all. Same for `private`, `final` and `static` methods.
- `readOnly = true` is not enforcement. It permits the ORM to skip dirty checking and may
  route the connection to a replica; some drivers ignore it. Treat it as an optimisation
  and a documentation of intent, never as a safety mechanism.
- Isolation levels are defined by the anomalies they prevent, not by intuition, and
  engines interpret them differently — notably, `REPEATABLE READ` means different things in
  different databases, and `SERIALIZABLE` is implemented by locking in some and by
  optimistic conflict detection with retry in others. Test the behaviour, do not assume it.
- A transaction is not a distributed transaction. Two-phase commit across services buys
  atomicity at the price of availability, an extra coordinator to operate, and locks held
  across a network — which is why the usual answer at a service boundary is a saga with
  compensations, or an outbox with idempotent consumers.
- `@Transactional` on a method whose body is one repository call adds nothing the
  repository does not already have; it is noise that trains readers to ignore the
  annotation where it matters.
- Exceptions thrown after a transaction has been marked rollback-only produce a confusing
  secondary failure (`UnexpectedRollbackException`). When catching an exception inside a
  transaction and continuing, verify the transaction has not already been poisoned by an
  inner boundary.

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
