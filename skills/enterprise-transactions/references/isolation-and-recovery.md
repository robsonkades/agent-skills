# Isolation, Anomalies and Recovery

## The ladder, as observable behaviour

Isolation levels are defined by which anomalies they permit. State the anomaly you are
preventing; do not choose a level by name.

| Anomaly             | What a client observes                                                                    | Prevented from     |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| Dirty read          | Reads a value another transaction wrote and then rolled back                              | READ COMMITTED     |
| Non-repeatable read | Reads a row twice in one transaction, gets two values                                     | REPEATABLE READ    |
| Phantom read        | Runs the same range query twice, gets a new row the second time                           | SERIALIZABLE       |
| Lost update         | Two transactions read, both write; the second silently overwrites the first               | Not by level alone |
| Write skew          | Two transactions each read a set, each writes based on it, jointly violating an invariant | SERIALIZABLE       |

The last two are the ones that reach production, and the fourth is the important
subtlety: **no isolation level below SERIALIZABLE prevents a lost update across two
requests**, and no isolation level at all prevents one across two _user interactions_.
That is what optimistic locking is for (`offline-concurrency-control`).

## Engine differences that break portable assumptions

- **Naming does not imply behaviour.** MySQL's `REPEATABLE READ` uses consistent snapshots
  and does not exhibit classic phantoms in the way the standard permits; PostgreSQL's
  `REPEATABLE READ` is snapshot isolation and aborts on write conflicts; SQL Server's is
  lock-based and blocks instead.
- **Two implementations of SERIALIZABLE.** Lock-based (SQL Server without snapshot,
  DB2) blocks and can deadlock. Optimistic/serialisable-snapshot (PostgreSQL SSI) does not
  block but aborts transactions with a serialisation failure at commit. Code written for
  one behaves badly under the other: with SSI you **must** retry, and code that does not
  simply fails.
- **Readers and writers.** MVCC engines (PostgreSQL, Oracle, MySQL InnoDB, SQL Server with
  `READ_COMMITTED_SNAPSHOT`) do not block readers behind writers. SQL Server in its default
  lock-based `READ COMMITTED` does — which is why the same application blocks under load on
  one engine and not the other, with no code change.
- **Defaults differ**: `READ COMMITTED` in PostgreSQL, Oracle and SQL Server;
  `REPEATABLE READ` in MySQL InnoDB.

Consequence for portable code: pick the anomaly-specific mechanism (constraint, version
column, explicit row lock) rather than an isolation level whenever you can, because the
mechanism means the same thing everywhere.

## Choosing the mechanism instead of the level

| Problem                                 | Targeted mechanism                                                                       | Why not isolation                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Duplicate rows from concurrent inserts  | Unique constraint; catch the violation                                                   | No level makes check-then-insert safe; the constraint does       |
| Lost update within one transaction pair | `SELECT ... FOR UPDATE` on the row before deciding                                       | Costs blocking only on that path, not globally                   |
| Lost update across two requests         | `@Version` column, optimistic lock                                                       | Isolation cannot span requests at all                            |
| Counter increments                      | `UPDATE t SET n = n + 1` — atomic in the engine                                          | Read-modify-write in the application needs a lock; this does not |
| Reserve limited stock                   | Conditional update: `UPDATE ... SET qty = qty - :n WHERE qty >= :n`, check the row count | Reads no rows, holds one row lock briefly, races impossible      |
| Invariant over a set (write skew)       | Range lock, a materialised aggregate row to lock, or SERIALIZABLE + retry                | This is the one case where the level is often the honest answer  |

The conditional-update idiom is the single most useful of these and the most under-used:
it moves the decision into the statement, so there is no window between reading and acting.

## Retryable failures

Under snapshot-based SERIALIZABLE, and under any level when a deadlock is detected, the
engine aborts a transaction that was doing nothing wrong. That is normal operation, and the
application must retry.

```java
@Retryable(
    retryFor = { CannotAcquireLockException.class, ConcurrencyFailureException.class },
    maxAttempts = 3,
    backoff = @Backoff(delay = 50, multiplier = 2, random = true))
@Transactional
public void settle(InvoiceId id) { ... }
```

Three requirements that are easy to miss:

1. **The retry must be outside the transaction.** Retrying inside a rolled-back transaction
   does nothing. With annotations, that means the retry proxy must wrap the transaction
   proxy — verify the order rather than assuming it.
2. **The work must be re-runnable.** Everything the method did before failing was rolled
   back, but anything it did _outside_ the database was not (`idempotency`).
3. **Jitter is not optional.** Two transactions deadlocking and retrying in lockstep
   deadlock again (`retries-and-backoff`).

## Deadlocks

A deadlock is two transactions each holding a lock the other needs. The engine kills one;
the application sees a lock-acquisition failure. They are not a bug in the engine, and they
are usually not a tuning problem.

**Causes, in order of frequency:**

1. **Inconsistent lock ordering.** Use case A updates account 1 then 2; use case B updates
   2 then 1. Fix: order acquisitions by a stable key (primary key ascending) in every path
   that touches more than one row.
2. **Lock escalation and range locks.** A large update takes a table-level lock where you
   expected row locks; another transaction touching an unrelated row now waits.
3. **Index-driven locking.** Locks are taken on index entries; two transactions updating
   different rows can conflict on the same index range, especially with a monotonically
   increasing key (the last-page hotspot).
4. **Long transactions widening the window.** The most effective deadlock fix is often
   simply making transactions shorter.

**Diagnosis:** capture the engine's deadlock graph — `deadlock_timeout` and
`log_lock_waits` in PostgreSQL, the deadlock trace flag or Extended Events in SQL Server,
`SHOW ENGINE INNODB STATUS` in MySQL. Reason from the graph, not from the application log,
which shows only the victim.

## Distributed transactions

Two-phase commit across resource managers gives real atomicity, and it is occasionally the
right answer — a legacy XA-capable message broker plus one database is a defensible case.
The costs are concrete and rarely stated:

- **Locks held for the whole protocol**, including across the network to the coordinator.
- **In-doubt transactions** after a coordinator failure: rows locked, resolvable only by an
  operator or a recovery log.
- **Availability multiplies down.** The transaction succeeds only if every participant and
  the coordinator are up.
- **Most modern participants do not support it well.** HTTP APIs and Kafka do not, so the
  common "distributed transaction" is not one.

At service boundaries the practical answers are: a saga with explicit compensations for
each step, or an outbox with idempotent consumers and at-least-once delivery. Both replace
atomicity with a designed, visible intermediate state — which is the honest trade
(`distribution-boundaries`, `delivery-semantics`).
