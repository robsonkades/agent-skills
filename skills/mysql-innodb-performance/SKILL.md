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

## Investigation contract

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

1. Capture effective variables from the running server and resolved Connector/J version. Especially
   after an upgrade, configuration files do not prove which defaults or deprecated settings apply.
2. Classify the dominant path:
   - access: rows examined, estimates, temporary materialization, sort, secondary-to-PK lookup;
   - concurrency: locking versus consistent read, record/gap/next-key range, deadlock, metadata lock;
   - write pipeline: redo generation, flush/checkpoint pressure, doublewrite, dirty-page age;
   - history: long read view, undo retention, purge lag;
   - capacity: buffer pool, per-connection memory, `Threads_running`, CPU/I/O, replication apply;
   - client: statement rewrite/cache, server prepare, fetch materialization, timeout/TLS behavior.
3. Use `performance_schema`, `sys`, `SHOW ENGINE INNODB STATUS`, actual plans, and server counters in
   the same interval. A configuration value without its workload signal is not a diagnosis.
4. Predict the specific counter or plan work an intervention will move. Change one scoped variable,
   query/index, transaction boundary, or driver behavior at a time.
5. Validate p99 and useful throughput together with rows examined, waits/deadlocks, redo/checkpoint,
   history length, memory, lag, and durability/error guardrails.

## Rules

- InnoDB stores the row in the primary-key B-tree and stores the primary key in every secondary leaf.
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

State engine/driver versions, evidence window, direct observations, mechanism and alternatives,
confidence, intervention and predicted counter, validation, durability/replication implications,
guardrails, and rollback.

## References

- [Storage, redo, and configuration](references/storage-redo-configuration.md) — read for primary-key
  layout, buffer pool, redo/checkpoints, flush/durability, memory, or upgrade defaults.
- [Concurrency, plans, and replication](references/concurrency-plans-replication.md) — read for gap
  locks, deadlocks, isolation, estimates, temporary work, metadata locks, or replica lag.
- [Connector/J and DDL](references/connector-j-and-ddl.md) — read when batching/preparation/fetch/TLS
  behavior, application-versus-console differences, or online schema change is involved.
