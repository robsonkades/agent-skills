# Engine trade-offs

Use this as a question set, not a scorecard with default weights.

| Dimension             | SQL Server                                          | MySQL/InnoDB                                               | PostgreSQL                                        | Evidence question                                                    |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Default concurrency   | locking READ COMMITTED; RCSI explicit               | MVCC consistent reads; RR locking reads use next-key locks | MVCC READ COMMITTED; SSI at SERIALIZABLE          | Which critical interleavings block, abort, or succeed?               |
| Version maintenance   | version store in `tempdb` under row versioning      | undo/history purge                                         | dead tuples, VACUUM, freeze                       | Can on-call see and repair the inevitable debt?                      |
| Physical organization | clustered index is table                            | PK is clustered; PK copied into secondary leaves           | heap separate from indexes                        | What does key width/order cost for this schema?                      |
| Connection model      | SQLOS workers/sessions                              | thread per connection in Community                         | process per connection                            | What is the fleet-wide safe connection budget?                       |
| Specialized access    | rowstore, filtered/computed, columnstore            | B-tree, functional, full-text; no INCLUDE                  | B-tree, GIN/GiST/SP-GiST/BRIN, partial/expression | Does the workload require a structure without a measured substitute? |
| Online change         | operation and edition dependent                     | INSTANT/INPLACE/COPY by operation                          | concurrent index build; lock rules per DDL        | Can the largest change meet the availability budget?                 |
| Native ingest         | Bulk Copy                                           | LOAD DATA                                                  | COPY                                              | Are security, reject, trigger, and restart semantics acceptable?     |
| Ecosystem cost        | T-SQL, Query Store, AG, Microsoft licensing/tooling | binlog/replication and broad managed availability          | extensions, rich types, open ecosystem            | Does the concrete benefit pay for lock-in and skills required?       |

## Proof gates

1. Semantic: deterministic concurrent tests for domain invariants.
2. Load shape: real volume/skew/correlation and tail parameters.
3. Operational: maintenance debt, growth, backup/restore, failover, and lag.
4. JVM: exact driver, ORM, pooler, batch/fetch, timeouts, and memory.
5. Change: large migration under traffic with lock/log/disk observation.
6. Economic/human: licensed edition, service limits, support, observability, and staffing.

Record raw scripts, datasets, versions, topology, hardware/service tier, percentiles, and work
counters. A result without reproducible conditions does not support a durable choice.
