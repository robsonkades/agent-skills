---
name: database-performance
description: >
  Evidence-first triage and routing for database performance questions across SQL Server,
  MySQL/InnoDB, PostgreSQL, JDBC pools, ORM behavior, index portfolios, and bulk loading. Use
  when the symptom spans layers, the owning mechanism is unclear, or a database choice or
  migration needs structured comparison. This is a router; it does not replace the specialist
  skills that own a confirmed engine or mechanism.
---

# Database Performance

## Purpose

Turn “the database is slow” into a bounded symptom, a short set of competing mechanisms, and a
handoff to the skill that owns the decision. Database incidents cross layers: one endpoint can
combine an ORM statement explosion, pool waiting, a stale plan, lock contention, and engine
maintenance debt.

Leave this skill once the owner is known.

## Triage contract

Record before routing:

```text
business symptom, SLO impact, and exact time window:
engine, exact version/edition/service tier, topology, and recent changes:
operation/query/job and representative parameters/data distribution:
offered/completed rate, concurrency, errors/timeouts, and transaction p50/p99:
application statement count, pool acquire/usage/pending, and connection count:
database CPU, I/O, waits/locks, active sessions, log/WAL/redo, and replica lag:
plan identity plus estimated/actual rows, loops, reads/buffers, spills, and cache state:
affected cohort and comparable healthy control:
evidence gaps, collection risk, rollback window, and success measure:
```

Do not infer an engine mechanism from an application symptom. Align clocks and workload before
correlating layers.

## Route by established question

| Question or mechanism                                                                | Owner                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------- |
| One SQL statement, its executed plan, estimates, or query shape                      | `sql-query-performance`                   |
| Index portfolio, composite key order, covering, specialized index, or safe index DDL | `database-index-design`                   |
| SQL Server waits, RCSI, tempdb, plan cache, storage, statistics, or JDBC behavior    | `sql-server-performance`                  |
| InnoDB redo/undo, gap locks, buffer pool, replication, DDL, or Connector/J behavior  | `mysql-innodb-performance`                |
| PostgreSQL MVCC, VACUUM, bloat, WAL, memory, plans, PgBouncer, or pgjdbc behavior    | `postgresql-performance`                  |
| Pool capacity, connection hold time, HikariCP timeout/lifetime, or idle transaction  | `connection-pool-sizing`                  |
| N+1, fetch strategy, persistence context, ORM batching, or generated identifiers     | `orm-fetch-and-batching-performance`      |
| JDBC batch versus native load, staging, partial failure, resume, or upsert load      | `database-bulk-loading`                   |
| Greenfield engine decision or cross-engine migration                                 | `database-engine-selection-and-migration` |
| Isolation and transaction boundary semantics in enterprise code                      | `enterprise-transactions`                 |
| Cross-service atomicity or compensation                                              | `distributed-transactions-and-sagas`      |
| Schema rollout compatibility independent of engine choice                            | `schema-evolution-and-compatibility`      |

## Separating questions

- If pool acquire time is high, ask whether usage time also rose. High acquire with stable usage
  suggests admission/capacity; high usage routes to the transaction or statement holding the
  connection.
- If statement count scales with rows, route to the ORM before reading individual plans. Fast SQL
  repeated 500 times is not a query-plan defect.
- If one statement dominates, capture the executed plan with real parameters and production-shaped
  data before proposing an index.
- If the plan is stable but elapsed time moves, compare locks, waits, I/O/cache state, log pressure,
  and replica topology in the same interval.
- If maintenance “succeeded,” verify its observable effect. VACUUM can remove nothing, an online DDL
  can wait on a metadata lock, and an index rebuild can appear to help only because it refreshed
  statistics.
- If the request is “which database is best,” route to requirements, vetoes, and workload proof;
  product ranking is not an engineering decision.

## Evidence discipline

For any recommendation that changes production state, separate:

```text
Evidence: command/metric/plan and its window/provenance
Observation: direct reading of that evidence
Inference: mechanism that best explains it, plus alternatives
Intervention: smallest reversible change and predicted signal
Validation: same workload/evidence, guardrails, and rollback trigger
Confidence: HIGH/MEDIUM/LOW with reason
```

When evidence is unavailable, state the gap and what would discriminate the hypotheses. Never turn
a vendor default, a folklore threshold, or a lab result into a production prescription.

## Definition of done

- The symptom, workload, engine/version, cohort, and time window are explicit.
- Application, pool, statement, engine, and host signals are not mixed without aligned evidence.
- At least one plausible alternative survives until a discriminating signal is checked.
- The confirmed question is handed to one primary owner, with adjacent skills only when needed.
- The recommendation predicts a measurable effect and has guardrail and rollback criteria.
