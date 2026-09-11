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

Stop once an established question has an owner and a bounded next check. Evidence that the
existing behavior meets the goal can instead justify no change, with conditions for reopening.

## Triage contract

Start with the symptom, time window and known environment; collect only the signals needed to
choose the next owner. The packet below is a menu, not a prerequisite to handoff. For greenfield
selection, route from requirements and workload evidence without inventing existing engine metrics.

Reuse the request, repository, incident packet and prior checks before asking for context. Ask only
unresolved questions that change routing, collection or recovery; continue independent work within
existing authority. Carry those checks and their limits into the handoff so the specialist does
not repeat intake. During an incident, collection must fit the recovery deadline and must not delay
already authorized mitigation merely to complete the packet.

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
correlating layers. Identify metric boundaries: pool usage is connection checkout-to-return,
not SQL execution, and cumulative engine counters need interval deltas with resets accounted for.
When JVM instrumentation or configuration is involved, inspect compiler/runtime, resolved driver,
pool and ORM versions and transaction ownership; this router imposes no Java baseline or upgrade.

## Route by established question

Select by the question, not the vendor name alone: one statement's plan goes to the query owner;
engine/driver-specific behavior goes to that engine's owner. Root-cause proof can follow handoff.

| Question or mechanism                                                                  | Owner                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------- |
| One SQL statement, its executed plan, estimates, or query shape                        | `sql-query-performance`                   |
| Index portfolio, composite key order, covering, specialized index, or safe index DDL   | `database-index-design`                   |
| SQL Server waits, RCSI, tempdb, plan cache, storage, statistics, DDL, or JDBC behavior | `sql-server-performance`                  |
| InnoDB redo/undo, gap locks, buffer pool, replication, DDL, or Connector/J behavior    | `mysql-innodb-performance`                |
| PostgreSQL MVCC, VACUUM, bloat, WAL, memory, plans, DDL, PgBouncer, or pgjdbc behavior | `postgresql-performance`                  |
| Pool capacity, connection hold time, HikariCP timeout/lifetime, or idle transaction    | `connection-pool-sizing`                  |
| N+1, fetch strategy, persistence context, ORM batching, or generated identifiers       | `orm-fetch-and-batching-performance`      |
| JDBC batch versus native load, staging, partial failure, resume, or upsert load        | `database-bulk-loading`                   |
| Greenfield engine decision or cross-engine migration                                   | `database-engine-selection-and-migration` |
| Isolation and transaction boundary semantics in enterprise code                        | `enterprise-transactions`                 |
| Cross-service atomicity or compensation                                                | `distributed-transactions-and-sagas`      |

For relational schema rollout, the engine owner covers DDL locks, rewrites and failure behavior.
Compatibility across deployed/rollback application versions, backfill and cutover also needs the
project's migration conventions and tests; no listed owner establishes that whole contract alone.

## Separating questions

- If pool acquire time is high, compare arrival rate, active/idle/pending connections, connection
  creation failures and hold-time distribution. Stable completed-borrow usage does not exclude
  long active borrows or leaks that have not returned. Route pool admission to `connection-pool-sizing`
  and follow evidence of long holds into the owning transaction/statement; do not enlarge the pool
  from acquire latency alone.
- If statement count scales with rows, attribute repeated calls to ORM loading, handwritten loops,
  retries or intended per-row work. Route confirmed ORM amplification to
  `orm-fetch-and-batching-performance`; route repeated ingestion to `database-bulk-loading`.
  Reduce avoidable call amplification before optimizing every plan, while keeping per-call cost
  as a possible coexisting problem.
- If one statement dominates, seek its observed plan and representative parameters/data before
  proposing an index. An estimated plan is not an executed plan. Prefer existing traces or plan
  history; `EXPLAIN ANALYZE` executes the statement and adds instrumentation overhead. Replays need
  bounded duration/load and assessed side effects; rollback does not remove incurred load or every
  possible external/nontransactional effect. If safe runtime evidence is unavailable, hand off the
  estimate with that limitation instead of forcing a production replay.
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
Support and limits: why the conclusion is justified and what remains untested
```

When evidence is unavailable, state the gap and what would discriminate the hypotheses. Never turn
a vendor default, a folklore threshold, or a lab result into a production prescription.

## Definition of done

- Relevant symptom/workload, engine/version, cohort and time window are explicit or marked
  unknown/not applicable; missing fields do not block an otherwise clear handoff.
- Application, pool, statement, engine, and host signals are not mixed without aligned evidence.
- Materially plausible alternatives are retained until existing or new evidence distinguishes them;
  do not invent a rival for an already-established question.
- The established question is handed to one primary owner, with adjacent skills only when needed,
  or the evidence supports no change with reopening conditions.
- The handoff includes the established question, prior evidence/checks and their limits, any material
  unresolved hypotheses and next discriminating check; routing to an owner is not proof of the root cause.
- Any proposed intervention predicts a measurable effect and has guardrail and rollback criteria.
  A routing-only answer can stop at the owner and the evidence it needs.

## Sources for collection boundaries

- [PostgreSQL 18 EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html) — ANALYZE executes the statement, adds overhead and excludes client network transfer costs.
- [MySQL 8.4 EXPLAIN](https://dev.mysql.com/doc/refman/8.4/en/explain.html) — distinguish estimates from actual execution analysis for the deployed version.
- [HikariCP configuration](https://github.com/brettwooldridge/HikariCP) — acquisition timeout, pool limits and connection lifecycle; verify the installed version.
