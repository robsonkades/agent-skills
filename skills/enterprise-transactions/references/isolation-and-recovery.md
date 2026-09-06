# Isolation, Anomalies and Recovery

## The ladder, as observable behaviour

Isolation levels are defined by which anomalies they permit. State the anomaly you are
preventing; do not choose a level by name.

| Anomaly             | What a client observes                                                                    | Prevented from     |
| ------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| Dirty read          | Reads another transaction's uncommitted write, whether it later commits or rolls back     | READ COMMITTED     |
| Non-repeatable read | Reads a row twice in one transaction, gets two values                                     | REPEATABLE READ    |
| Phantom read        | Runs the same range query twice, gets a new row the second time                           | SERIALIZABLE       |
| Lost update         | Two transactions read, both write; the second silently overwrites the first               | Not by level alone |
| Write skew          | Two transactions each read a set, each writes based on it, jointly violating an invariant | SERIALIZABLE       |

These are minimum standard-level distinctions; engines may prevent additional anomalies.
For a read-modify-write within one transaction, conflict detection or locking can prevent
lost updates below SERIALIZABLE. For a stale value read in a completed transaction and
written in a later transaction, even SERIALIZABLE does not validate the earlier observation:
use a version or another explicit precondition (`offline-concurrency-control`). HTTP request
count alone does not define the relevant transaction boundaries.

## Engine differences that break portable assumptions

- **Naming does not imply behaviour.** PostgreSQL REPEATABLE READ uses a transaction
  snapshot, prevents phantoms and can abort concurrent updates, but permits write skew.
  Do not transfer these guarantees to another engine based on the isolation name.
- **Serializable implementation matters.** PostgreSQL SSI tracks dependencies without
  blocking through its predicate locks, but ordinary write/row locks can still wait or
  deadlock. Serialization failures can occur during a statement or at commit.
- **MVCC is not "no blocking".** Ordinary snapshot reads differ from locking reads and
  DDL interactions. Inspect statement types, engine/version and actual wait evidence.
- **Inspect effective defaults**, including session settings and datasource configuration;
  do not infer isolation or snapshot options from an engine family alone.

Consequence for portable code: pick the anomaly-specific mechanism (constraint, version
column, explicit row lock) when it enforces the invariant economically. These mechanisms
also have engine-specific lock, null, indexing and error semantics; verify those semantics.

## Choosing the mechanism instead of the level

| Problem                                   | Targeted mechanism                                                                             | Why not isolation                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Duplicate rows from concurrent inserts    | Unique constraint matching the business key; handle conflict                                   | Directly protects every write path; SERIALIZABLE can also prevent an unsafe interleaving by aborting |
| Lost update within one transaction pair   | `SELECT ... FOR UPDATE` on the row before deciding                                             | Costs blocking only on that path, not globally                                                       |
| Stale update across separate transactions | `@Version` or explicit version predicate, check affected rows                                  | Later isolation does not validate an earlier completed read                                          |
| Counter increments                        | `UPDATE t SET n = n + 1 WHERE id = :id`                                                        | Removes the application read/write gap; the engine still locks or detects conflicts                  |
| Reserve limited stock                     | `UPDATE stock SET qty = qty - :n WHERE id = :id AND qty >= :n`, check exactly one affected row | With positive n and a unique id, protects this row's stock invariant; may block or abort             |
| Invariant over a set (write skew)         | Range lock, a materialised aggregate row to lock, or SERIALIZABLE + retry                      | This is the one case where the level is often the honest answer                                      |

The conditional-update idiom is the single most useful of these and the most under-used:
it moves the decision into the statement, so there is no window between reading and acting.

## Retryable failures

Serialization conflicts and deadlocks can be retryable, but retry the whole aborted
transaction with fresh reads only when the business operation remains valid. Classify the
actual engine error and rollback scope. PostgreSQL recommends retrying SQLSTATE `40001`
and considering `40P01`; constraint violations are not all transient.

```text
Pseudocode, independent of retry-library version:
within an overall deadline and bounded attempt count:
    start a fresh transaction
    reread inputs, decide, write, attempt commit
    on a classified retryable conflict:
        finish rollback and release resources
        if budget remains, wait with bounded jitter and retry
    on unknown commit outcome or nonretryable failure:
        reconcile or propagate; do not blindly repeat
```

Three requirements that are easy to miss:

1. **The retry must be outside the transaction.** Retrying inside a rolled-back transaction
   does nothing. With annotations, that means the retry proxy must wrap the transaction
   proxy — verify the order rather than assuming it.
2. **The work must be re-runnable.** Verify rollback of transactional changes. Remote effects,
   independent transactions and engine-specific nontransactional operations (such as sequence
   allocation) are not necessarily undone (`idempotency`).
3. **Bound retries and add jitter under contention.** Synchronized retries can collide
   again; backoff does not repair inconsistent lock ordering. Define exhausted-budget
   behaviour (`retries-and-backoff`).

## Deadlocks

A deadlock is a cycle of waits, potentially involving more than two transactions. The engine
selects a victim; inspect its error and rollback scope rather than assuming every lock wait
is a deadlock.

**Candidate causes to verify in the wait graph:**

1. **Inconsistent lock ordering.** Use case A updates account 1 then 2; use case B updates
   2 then 1. Fix: order acquisitions by a stable key (primary key ascending) in every path
   that touches more than one row.
2. **Lock escalation and range locks.** A large update takes a table-level lock where you
   expected row locks; another transaction touching an unrelated row now waits.
3. **Index-driven locking.** Index/range locks can connect otherwise distinct writes.
   Page-latch contention from an append hotspot is a different mechanism; do not diagnose
   it as a transaction deadlock without the wait cycle.
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
- **Failure coupling.** Required participants and the coordinator affect progress and
  recovery; do not multiply availabilities without an explicit independence model.
- **Participation must be explicit.** Ordinary HTTP calls and Kafka transactions do not
  automatically join a database XA transaction. Verify every resource's protocol support.

At service boundaries consider saga compensation/forward recovery, or an outbox with
idempotent consumers and durable at-least-once retry. Both replace
atomicity with a designed, visible intermediate state — which is the honest trade
(`distribution-boundaries`, `delivery-semantics`).

## Sources and validation

- [PostgreSQL 18 isolation](https://www.postgresql.org/docs/18/transaction-iso.html): concrete engine example, not a cross-database contract.
- [PostgreSQL 18 serialization-failure handling](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html): error classification and complete-transaction retries.

For the target database, use two independent connections and barriers to force the disputed
interleaving. Assert final committed state and conflict outcomes, including commit-time errors.
Run a stale-read case across separate transactions as well as overlapping transactions;
an in-memory database or a sequential happy-path test does not establish production isolation.
