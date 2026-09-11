---
name: mysql-innodb-performance
description: >
  Diagnosing and tuning MySQL 8.4+ InnoDB from engine evidence: clustered primary-key storage,
  buffer pool and redo/checkpoint pressure, undo/purge history, next-key/gap locks and deadlocks,
  optimizer statistics and plans, online DDL, replication durability/lag, and Connector/J prepared
  statements, batching, fetch, and TLS properties. Use when the symptom or change depends on
  InnoDB or MySQL behavior. Not generic query-plan, ORM, or pool sizing guidance.
---

# MySQL InnoDB Performance

## Purpose

Distinguish access-path, concurrency, redo/flush, purge, memory, replication, and driver mechanisms
before changing InnoDB configuration. Defaults and folk ratios are hypotheses tied to a version and
deployment shape, not portable sizing rules.

MySQL 8.4 is the server reference, not a promise that later releases or compatible forks behave
identically. Inspect the application's Java toolchain and resolved Connector/J artifact separately;
no Java upgrade or driver replacement is implied. The references are diagnostic guidance, not a
tested SQL/JDBC program. Missing instrumentation must remain an evidence gap, not a zero counter.

## Investigation contract

Select the evidence needed for the actual question; reuse adequate supplied artifacts. A narrow
plan, API, or configuration explanation need not collect every category or make a change. Runtime
diagnoses still need relevant workload evidence; unavailable measurements remain unknown.

```text
exact server/distribution/version, topology, durability and replication mode:
effective variables and persisted configuration, including upgrade history:
workload/query/digest, parameters, rows examined/sent, actual plan, and data skew:
transactions, locking reads, blockers, deadlock report, isolation, history-list length:
buffer-pool hit/dirty/flush state, redo generation/checkpoint age, file/device latency:
Threads_running, connections/churn, per-connection memory, CPU and container limit:
replica apply/lag and binlog/group-commit evidence:
Connector/J version and effective prepared/batch/fetch/TLS/time-zone properties:
```

## Workflow

1. Establish the relevant server/driver versions and effective settings from available evidence.
   Capture running-server variables when a runtime claim depends on them. Especially after an
   upgrade, configuration files alone do not prove which defaults or deprecated settings apply.
2. Classify the dominant path:
   - access: rows examined, estimates, temporary materialization, sort, secondary-to-PK lookup;
   - concurrency: locking versus consistent read, record/gap/next-key range, deadlock, metadata lock;
   - write pipeline: redo generation, flush/checkpoint pressure, doublewrite, dirty-page age;
   - history: long read view, undo retention, purge lag;
   - capacity: buffer pool, per-connection memory, `Threads_running`, CPU/I/O, replication apply;
   - client: statement rewrite/cache, server prepare, fetch materialization, timeout/TLS behavior.
3. For a runtime diagnosis, select relevant `performance_schema`, `sys`, `SHOW ENGINE INNODB STATUS`,
   plan and counter evidence from a comparable interval. A configuration value without its workload
   signal is not a diagnosis; a version-matched contract can support an API explanation.
4. If an intervention is justified, predict the counter or plan work it should move. Change one
   scoped variable, query/index, transaction boundary, or driver behavior at a time. A supported
   keep-current conclusion is valid.
5. Validate the affected claim. For a performance change, compare p99 and useful throughput with
   the relevant engine/client signals and durability/error guardrails. For an unchanged narrow
   review, adequate existing evidence can close the task; report unexecuted checks explicitly.

## Rules

- InnoDB clusters rows by the primary key, or its documented fallback when none is declared;
  ordinary secondary B-tree records carry the clustered-key locator.
  Account for key width and insertion order across the entire index portfolio.
- Redo, undo, binlog, and doublewrite solve different problems. Do not call all of them “the log” or
  trade their durability settings as if they were interchangeable.
- Redo capacity absorbs bursts and changes checkpoint/recovery behavior; it does not create storage
  throughput. Size from measured peak redo generation and acceptable recovery time.
- Buffer pool sizing starts from the actual memory/container budget after global and per-connection
  consumers. “80% of RAM” is not a rule, and MySQL cannot be assumed to protect a cgroup automatically.
- Plain `SELECT` is normally a consistent read. Blocking investigations must identify the locking
  read/DML, searched index interval, and isolation semantics. A missing index can widen the locked
  range to nearly the table.
- Gap/next-key locks protect intervals, so an insert can wait on a value that does not yet exist.
  Switching to READ COMMITTED changes but does not eliminate every gap-lock use and may change
  deadlock behavior and replication prerequisites.
- `max_connections` is admission, not capacity. Use `Threads_running`, queue/wait, CPU, memory, and
  transaction service time to establish safe concurrency.
- `executeBatch()` alone does not prove one round-trip. Verify `rewriteBatchedStatements`, prepared
  statement cache settings, server statement counts, update counts, and batch-size shapes.
- Declare an intended DDL algorithm and lock behavior. INSTANT has operation/version limits, and any
  algorithm can wait behind a metadata lock.
- A sudden latency improvement under unchanged load can mean a durability or replication guarantee
  stopped being paid. Check status and configuration before celebrating it.

## Output

State the supported conclusion, relevant versions/evidence and material limits. For a runtime
diagnosis, separate observations from the proposed mechanism and name the next discriminating
check if needed. For a change, include its predicted effect, checks actually run, affected
durability/replication contract, guardrails and reversal or forward-repair plan. Keep an adequate
no-change review or API explanation concise.

## References

- [Storage, redo, and configuration](references/storage-redo-configuration.md) — read for primary-key
  layout, buffer pool, redo/checkpoints, flush/durability, memory, or upgrade defaults.
- [Concurrency, plans, and replication](references/concurrency-plans-replication.md) — read for gap
  locks, deadlocks, isolation, estimates, temporary work, metadata locks, or replica lag.
- [Connector/J and DDL](references/connector-j-and-ddl.md) — read when batching/preparation/fetch/TLS
  behavior, application-versus-console differences, or online schema change is involved.
