# InnoDB concurrency, plans, and replication

## Locking model

Differentiate consistent reads from locking reads and DML. Identify the index and interval searched:
record, gap, and next-key locks follow access paths, not only returned rows. `SHOW ENGINE INNODB
STATUS` and Performance Schema lock/wait tables should be tied back to the query plan.

Deadlocks are expected conflict detection, not proof the detector failed. Inspect the complete cycle,
access order, rows/ranges locked, transaction size, and missing indexes. The chosen victim is often
the smaller online transaction; make retries bounded, jittered where collisions synchronize, and
safe by operation identity.

For an InnoDB deadlock victim, retry the whole transaction after rollback, not just its last
statement. A lock-wait timeout normally rolls back only the waiting statement unless
`innodb_rollback_on_timeout` changes that behavior. Explicitly end/roll back the application
transaction before a fresh whole-operation retry; inspect framework rollback-only state and avoid
repeating external effects blindly. Client timeout or connection loss can leave commit outcome
unknown and requires reconciliation, not automatic replay.

Long transactions also retain undo history even when they hold no blocking lock. Track read-view age,
history-list length, purge progress, and the application transaction boundary.

## Plans and optimizer evidence

Use `EXPLAIN ANALYZE` for actual rows/loops/time and `EXPLAIN` for non-executing inspection. Compare
estimates to actuals, rows examined to rows sent, key parts used, materialization, temp tables, and
sort. Internal optimizer cost is not elapsed time. Use optimizer trace only when the rejected-plan
reason is needed and ensure trace memory truncation did not hide evidence.

EXPLAIN ANALYZE actually executes supported statements. Inspect the exact statement, including
locking reads, functions and supported DML, and use an appropriately scoped environment and budget.
Do not assume wrapping it in a transaction makes every side effect reversible. Iterator timings
include child work and are averaged across loops; do not sum the plan's times as independent costs.

Histograms can improve estimates for non-indexed skewed columns; indexes and persistent statistics
provide different information. Refresh or add evidence for the specific estimate rather than running
global maintenance by habit.

## Replication and durability

Measure source commit path, binlog generation, replica receive/apply queues, and lag under the same
clock. Semi-synchronous acknowledgement changes the guarantee boundary; lower latency can indicate it
fell back. Large transactions and DDL may apply differently on replicas even when source throughput
looks healthy.

Semisync receipt acknowledges relay-log persistence on the required replica(s), not completed apply
or immediate read-after-write visibility there. Inspect wait-point, required acknowledgements,
timeout/fallback status and the intended failover target. A single lag gauge is insufficient to
prove a particular transaction is readable; use transaction/GTID progress where that is the claim.

Before changing durability or parallel apply, state RPO, failover semantics, ordering constraints,
and the metric that proves replicas caught up.

Sources: [InnoDB error handling](https://dev.mysql.com/doc/refman/8.4/en/innodb-error-handling.html),
[EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html), and
[semisynchronous replication](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html).
