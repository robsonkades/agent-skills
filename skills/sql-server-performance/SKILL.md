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
then retain adequate behavior or choose a justified engine-specific change whose effect can be
measured. Wait names, plan
operators, and configuration values are evidence only in their time and workload context.

## Investigation contract

Use the relevant parts of this inventory for the question. Reuse adequate supplied evidence;
an API explanation, aggregate calculation or sound existing setup need not trigger a full engine
capture, actual-plan execution or tuning change.

```text
exact SQL Server version, edition/service tier, compatibility level, and topology:
incident window versus sqlserver_start_time, deployment/config/data changes:
query hash/plan hash, application parameters and SET options, Query Store history:
session/request waits, blockers, deadlock graph, transaction age, isolation/RCSI:
estimated/actual rows, executions, reads, spills, memory grant, DOP, conversions:
CPU/schedulers, file latency/growth, log, tempdb, memory, version store, replica lag:
mssql-jdbc version/properties, pool role, transaction/timeout and batch behavior:
```

The engine baseline is SQL Server 2022+; inspect the deployed build, database compatibility,
Java runtime and resolved driver artifact before version-sensitive advice. This does not authorize
upgrades. Missing relevant plans, Query Store history or DMVs leave the affected mechanism
unresolved; state what the available evidence still establishes.
Use existing authorization for bounded captures; actual-plan collection can execute the statement,
including its writes. DDL, configuration changes and production workload replay need their own
authorized scope. Redact literals/parameters and plans that expose sensitive data.

## Workflow

Use the applicable steps for the diagnostic question and available evidence.

1. Bound the symptom to a query, session, database, replica, or instance and align its interval with
   workload and configuration changes. Use interval deltas with restart/reset history; cumulative
   wait stats since startup or an explicit clear do not isolate the incident.
2. Classify the dominant mechanism:
   - data: blocking, deadlock, lock escalation, row versioning, transaction scope;
   - plan: estimates, parameter distribution, plan reuse/SET options, conversion, grant/spill;
   - resource: CPU/scheduler, worker exhaustion, I/O, log, tempdb, memory, replica redo.
3. Use live per-session/request evidence during the incident and Query Store for history. Treat
   instance-wide waits as a lead, not a root cause.
4. For a plan-quality claim, inspect representative application plans and parameters, using actual
   rows/executions when that distinction matters. Find the estimate divergence, repeated inner
   work, waits/spills, grant or seek-affecting conversion; a warning alone is not the diagnosis.
5. When a change is justified and authorized, test the smallest reversible intervention supported
   by the mechanism. Query/plan, application, database and instance controls have different costs;
   a query hint is not automatically the safest first change. Retaining adequate behavior is valid.
   Global changes require instance-wide evidence.
6. Reuse representative validation or run an authorized comparison for the affected work, latency,
   waits, concurrency and resource/replica guardrails. A plan change alone is not success;
   distinguish an observed improvement from a proposed intervention or remaining evidence gap.

## Rules

- Wait stats answer where time accumulated, not why. Prefer session-scoped waits in an incident and
  correlate accumulated waits with uptime, workload, and signal-wait ratio.
- Read deadlocks from the `system_health` `xml_deadlock_report` resource graph. The victim is an
  outcome, not necessarily the faulty participant.
- RCSI provides statement-level versions; SNAPSHOT provides transaction-level consistency and can
  raise update conflicts. Version storage is in `tempdb` without ADR, or the database's persistent
  version store with ADR. Inspect generation, retention and cleanup rather than only the longest reader.
- Parameter sniffing is useful plan specialization. Diagnose skew and ask how many plans the query
  needs before applying recompilation, forcing, hints, or Parameter Sensitive Plan optimization.
- `RESOURCE_SEMAPHORE` means a query waits for a memory grant. A bad cardinality estimate can inflate
  a few grants enough to throttle the instance. Distinguish oversized grants from legitimate
  concurrent demand or a restrictive resource limit before choosing query, admission or capacity changes.
- `CXCONSUMER` and `CXPACKET` are not instructions to set global `MAXDOP 1`. Separate useful
  parallelism, skew, threshold for entering parallel plans, scheduler pressure, and worker pressure.
- A different plan in SSMS can be a different cache key because SET options differ from JDBC. Do not
  “fix” the application by copying `ARITHABORT` without explaining the underlying plan choice.
- Verify mssql-jdbc conversion behavior. Unicode parameters against `VARCHAR` can convert the column
  and affect access paths, depending on collation, types and plan. Inspect predicates and actual
  work; neither the parameter type nor the presence/absence of a conversion warning proves a scan.
- Index rebuild, statistics update, and page-density/fragmentation repair are different operations.
  Prove which side effect improved the workload before scheduling maintenance.
- State version, edition, and compatibility prerequisites. Developer edition can make an online DDL
  test pass when production Standard cannot run it.

## Output

Report the answer or retained/proposed decision with the evidence and uncertainty needed to assess
it. For a change, include its scope, predicted signal, relevant validation, guardrails and rollback;
do not invent an intervention or a full campaign for an adequate narrow result. Include exact
scope—query, database, or instance—for every setting.

## References

- [Storage, indexes, and statistics](references/storage-indexes-statistics.md) — read for clustered
  key/layout, density/splits, compression, columnstore, statistics, files, or maintenance.
- [Concurrency, plans, and instance resources](references/concurrency-plans-instance.md) — read for
  blocking/deadlocks, RCSI, parameter plans, grants, parallelism, tempdb, memory, or waits.
- [JDBC and operational changes](references/jdbc-and-operations.md) — read when application and SSMS
  differ, the driver changes SQL/parameters/batch, or DDL/failover/replicas are involved.
