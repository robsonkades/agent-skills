---
name: sql-server-performance
description: >
  Diagnosing and tuning SQL Server 2022+ from engine evidence: waits, blocking/deadlocks, RCSI and
  version store, cardinality and parameter-sensitive plans, memory grants and parallelism,
  clustered/columnstore storage, statistics and index maintenance, tempdb/files/memory, readable
  replicas, and mssql-jdbc behavior. Use when the symptom or proposed change depends on SQL Server
  internals. Not generic single-query tuning, ORM behavior, or HikariCP sizing.
---

# SQL Server Performance

## Purpose

Identify whether SQL Server is waiting on data concurrency, plan quality, or a physical resource,
then make the smallest engine-specific change whose effect can be measured. Wait names, plan
operators, and configuration values are evidence only in their time and workload context.

## Investigation contract

```text
exact SQL Server version, edition/service tier, compatibility level, and topology:
incident window versus sqlserver_start_time, deployment/config/data changes:
query hash/plan hash, application parameters and SET options, Query Store history:
session/request waits, blockers, deadlock graph, transaction age, isolation/RCSI:
estimated/actual rows, executions, reads, spills, memory grant, DOP, conversions:
CPU/schedulers, file latency/growth, log, tempdb, memory, version store, replica lag:
mssql-jdbc version/properties, pool role, transaction/timeout and batch behavior:
```

## Workflow

1. Bound the symptom to a query, session, database, replica, or instance and align its interval with
   workload and configuration changes. Cumulative wait stats without the server start time do not
   describe the incident.
2. Classify the dominant mechanism:
   - data: blocking, deadlock, lock escalation, row versioning, transaction scope;
   - plan: estimates, parameter distribution, plan reuse/SET options, conversion, grant/spill;
   - resource: CPU/scheduler, worker exhaustion, I/O, log, tempdb, memory, replica redo.
3. Use live per-session/request evidence during the incident and Query Store for history. Treat
   instance-wide waits as a lead, not a root cause.
4. Read the application's actual plan and parameters. Find the first bad estimate, repeated inner
   work, waits/spills, memory grant, and `PlanAffectingConvert` before changing indexes or hints.
5. Test one reversible intervention at the narrowest scope: statement/query hint or plan control,
   database option, then instance configuration. Global changes require instance-wide evidence.
6. Re-run the same workload and compare work, p99, waits, blocking, grant/spill, log/I/O, and replica
   guardrails. A plan change without outcome improvement is not success.

## Rules

- Wait stats answer where time accumulated, not why. Prefer session-scoped waits in an incident and
  correlate accumulated waits with uptime, workload, and signal-wait ratio.
- Read deadlocks from the `system_health` `xml_deadlock_report` resource graph. The victim is an
  outcome, not necessarily the faulty participant.
- RCSI provides statement-level versions; SNAPSHOT provides transaction-level consistency and can
  raise update conflicts. Both move cost to row versions and `tempdb`; measure the longest reader.
- Parameter sniffing is useful plan specialization. Diagnose skew and ask how many plans the query
  needs before applying recompilation, forcing, hints, or Parameter Sensitive Plan optimization.
- `RESOURCE_SEMAPHORE` means a query waits for a memory grant. A bad cardinality estimate can inflate
  a few grants enough to throttle the instance; adding memory treats the consequence.
- `CXCONSUMER` and `CXPACKET` are not instructions to set global `MAXDOP 1`. Separate useful
  parallelism, skew, threshold for entering parallel plans, scheduler pressure, and worker pressure.
- A different plan in SSMS can be a different cache key because SET options differ from JDBC. Do not
  “fix” the application by copying `ARITHABORT` without explaining the underlying plan choice.
- Verify mssql-jdbc conversion behavior. Unicode parameters against `VARCHAR` can convert the column
  and prevent a seek; look for a seek-affecting conversion in the executed plan.
- Index rebuild, statistics update, and page-density/fragmentation repair are different operations.
  Prove which side effect improved the workload before scheduling maintenance.
- State version, edition, and compatibility prerequisites. Developer edition can make an online DDL
  test pass when production Standard cannot run it.

## Output

Report evidence, direct observations, competing mechanism, confidence reason, intervention,
predicted signal, validation result, guardrails, and rollback. Include exact scope—query, database,
or instance—for every setting.

## References

- [Storage, indexes, and statistics](references/storage-indexes-statistics.md) — read for clustered
  key/layout, density/splits, compression, columnstore, statistics, files, or maintenance.
- [Concurrency, plans, and instance resources](references/concurrency-plans-instance.md) — read for
  blocking/deadlocks, RCSI, parameter plans, grants, parallelism, tempdb, memory, or waits.
- [JDBC and operational changes](references/jdbc-and-operations.md) — read when application and SSMS
  differ, the driver changes SQL/parameters/batch, or DDL/failover/replicas are involved.
