# Engine trade-offs

Use this as a question set, not a scorecard with default weights.

| Dimension             | SQL Server                                                         | MySQL/InnoDB                                                                        | PostgreSQL                                        | Evidence question                                                    |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Default concurrency   | READ COMMITTED locking or RCSI by database/service setting         | MVCC consistent reads; RR locking reads may use next-key locks                      | MVCC READ COMMITTED; SSI at SERIALIZABLE          | Which critical interleavings block, abort, or succeed?               |
| Version maintenance   | traditional `tempdb` version store or ADR persistent version store | undo/history purge                                                                  | dead tuples, VACUUM, freeze                       | Can on-call see and repair the inevitable debt?                      |
| Physical organization | rowstore heap or clustered-index leaf data                         | clustered PK or selected/generated clustering key; key carried in secondary indexes | heap separate from indexes                        | What does key width/order cost for this schema?                      |
| Connection model      | SQLOS workers/sessions                                             | thread per connection in Community                                                  | process per connection                            | What is the fleet-wide safe connection budget?                       |
| Specialized access    | rowstore, filtered/computed, columnstore                           | B-tree, functional, full-text; no INCLUDE                                           | B-tree, GIN/GiST/SP-GiST/BRIN, partial/expression | Does the workload require a structure without a measured substitute? |
| Online change         | operation and edition dependent                                    | INSTANT/INPLACE/COPY by operation                                                   | concurrent index build; lock rules per DDL        | Can the largest change meet the availability budget?                 |
| Native ingest         | Bulk Copy                                                          | LOAD DATA                                                                           | COPY                                              | Are security, reject, trigger, and restart semantics acceptable?     |
| Ecosystem cost        | T-SQL, Query Store, AG, Microsoft licensing/tooling                | binlog/replication and broad managed availability                                   | extensions, rich types, open ecosystem            | Does the concrete benefit pay for lock-in and skills required?       |

## Proof gates

1. Semantic: deterministic concurrent tests for domain invariants.
2. Load shape: real volume/skew/correlation and tail parameters.
3. Operational: maintenance debt, growth, backup/restore, failover, and lag.
4. JVM: exact driver, ORM, pooler, batch/fetch, timeouts, and memory.
5. Change: large migration under traffic with lock/log/disk observation.
6. Economic/human: licensed edition, service limits, support, observability, and staffing.

Record raw scripts, datasets, versions, topology, hardware/service tier, percentiles, and work
counters. A result without reproducible conditions does not support a durable choice.

SQL Server defaults depend on deployment: Azure SQL Database enables RCSI by default, unlike
the SQL Server default. Inspect the database setting rather than inferring it from the product
name. ADR, available in SQL Server 2019+, stores row versions in the database's persistent
version store; do not budget only `tempdb` when ADR is enabled. These are examples of why the
table is an inventory prompt, not an edition-independent specification.

Sources: [Microsoft isolation-level documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql?view=sql-server-ver17)
and [ADR architecture](https://learn.microsoft.com/en-us/sql/relational-databases/accelerated-database-recovery-concepts?view=sql-server-ver17);
MySQL 8.4 [clustered/secondary indexes](https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html)
and [InnoDB locking](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking.html).

## Compare the acknowledgment contract before throughput

Record commit/log-flush settings, storage guarantees and replica acknowledgment policy for each
candidate. Distinguish a database process crash from host/storage loss and promotion of a lagging
replica: a local durable commit alone does not prove the failover RPO. Define which failures the
contract covers and whether success may precede persistence. Compare throughput only among
configurations meeting that contract; keep weaker guarantees as explicitly conditional alternatives.

For example, PostgreSQL 18 asynchronous commit can lose recently acknowledged transactions after
a crash while preserving database consistency. It differs from disabling `fsync`, which can risk
database corruption after a system crash. SQL Server delayed durability also acknowledges before
log flush. MySQL 8.4 InnoDB durability depends on `innodb_flush_log_at_trx_commit` and, when binary
logging is used, `sync_binlog`; a nominal periodic flush interval is not a guaranteed maximum loss
window. Inspect the actual deployment rather than equating the engines' settings by name.
Sources: [PostgreSQL asynchronous commit](https://www.postgresql.org/docs/18/wal-async-commit.html),
[SQL Server delayed durability](https://learn.microsoft.com/en-us/sql/relational-databases/logs/control-transaction-durability?view=sql-server-ver17)
and [MySQL 8.4 log-flush behavior](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html#sysvar_innodb_flush_log_at_trx_commit).

In an isolated rehearsal, record acknowledged operation IDs outside the database under test,
inject the specified crash/failover, and compare recovered effects and recovery time with the
RPO/RTO contract. Keep timeout/unknown outcomes separate and reconcile them before retries.
A graceful restart is not a power-loss test, and one successful injection covers only the tested
failure and storage setup. Reuse credible existing evidence; do not claim such a test ran merely
because a configuration matches documentation.

**Decision pair (documented, not executed):** the same replayable ingestion workload reports
higher throughput with acknowledgment before log flush. With zero accepted-write loss required
under the specified crash, reject that configuration as evidence of a suitable winner. If the
contract instead explicitly permits bounded recent loss and defines replay, assess the risk
window, recovery and external effects before allowing it as a trade-off. Do not silently relax
the first contract or categorically reject the second. Missing durability settings or an undefined
failure scope require a focused evidence request, not a product ranking.
