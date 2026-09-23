---
name: postgresql-performance
description: >
  Diagnosing and tuning PostgreSQL 17/18 from engine evidence: MVCC tuple versions, VACUUM/freeze
  and bloat, HOT updates and visibility maps, plans and cardinality, work memory/spills, WAL and
  checkpoints, locks/SSI, connection processes and PgBouncer session semantics, plus pgjdbc
  prepared-plan, batch, and fetch behavior. Use when the symptom or change depends on PostgreSQL
  internals. Not generic query-plan, ORM, or HikariCP sizing guidance.
---

# PostgreSQL Performance

## Purpose

Trace PostgreSQL symptoms to tuple visibility/maintenance, plan work, concurrency, memory, WAL/I/O,
connections, or driver/pooler behavior. VACUUM, indexes, cost constants, and memory settings must be
chosen from table- and workload-level evidence, not universal ratios.

## Investigation contract

```text
exact PostgreSQL, pgjdbc, and PgBouncer versions/configuration; topology and failover role:
query id/text, application parameters, prepared/generic plan state, and plan with actuals/buffers:
table/index size, churn, dead tuples, HOT ratio, vacuum/analyze history, reloptions, XID age:
oldest transaction/xmin, replication slots, prepared transactions, standby feedback:
locks/waits, isolation, serialization/deadlock errors, transaction and statement age:
connections/process memory, work_mem nodes/spills, CPU, I/O, WAL/checkpoint and replica lag:
pool mode and session features; pgjdbc prepare, batch, fetch, timeout and autocommit behavior:
```

## Workflow

Start with available evidence; unavailable counters/plans remain explicit gaps, not a reason
to guess or require every contract field. Use the steps needed for the requested claim and
reuse adequate captures/settings. A narrow plan/source explanation or supported no-change
conclusion does not require a new intervention or workload campaign. No single Java release
is declared here; inspect the project's compiler/runtime and resolved driver before changing
Java code or configuration. PostgreSQL 17/18 guidance does not authorize a stack upgrade.
`EXPLAIN ANALYZE` executes the statement, including
writes and invoked functions. Inspect side effects and use an isolated representative copy or
an explicitly authorized bounded production measurement; transaction rollback does not undo
sequence advancement or all external effects. Plain EXPLAIN is the first alternative when
execution is unsuitable. Diagnosis alone does not authorize session termination, slot removal
or blocking rewrites.

1. Bound the symptom to statement, relation, database, instance, or replica and align the workload,
   plan, VACUUM/checkpoint, transaction, and deployment intervals.
2. Classify the dominant mechanism:
   - maintenance/visibility: dead tuples, blocked xmin, vacuum/analyze/freeze, visibility map, HOT;
   - plan: first estimate divergence, loops, buffers, rows filtered, heap fetches, spill, JIT;
   - concurrency: row/table/advisory locks, DDL, deadlock, snapshot age, SSI abort;
   - memory/I/O: per-node memory multiplication, temp I/O, cache misses, async I/O, checkpoint/WAL;
   - connection/session: backend count, pool mode, session state, named prepared plans;
   - client: pgjdbc generic/custom transition, rewrite batching, cursor prerequisites, timeouts.
3. Capture evidence at relation/query/session granularity before changing globals. A cluster average can
   hide one table whose scale-factor threshold or one transaction whose xmin controls the outcome.
   Check observer transaction/cache behavior, reset intervals, collection settings and monitoring
   privileges before interpreting flat counters or missing fields.
4. For a justified intervention, predict the signal that should move, apply the narrowest authorized
   change, and validate with the relevant plan/workload and affected bloat/WAL/memory/lag guardrails.
   Preserve an adequate design; state which target effects remain unmeasured.

## Rules

- PostgreSQL updates create a new heap tuple. Old versions can be removed by pruning, including
  HOT cleanup during ordinary access, as well as VACUUM when visibility permits. Long-lived xmin
  holders can prevent removal even when VACUUM reports success; pruning does not replace vacuum/freeze.
- Regular vacuum/freeze maintenance is correctness-critical. Do not disable autovacuum merely to hide
  load; tune relation thresholds/cost/capacity from churn and completion evidence. An intentional
  manual or temporary policy needs an owner, adequate maintenance/age checks and failure recovery;
  anti-wraparound autovacuum can still run when ordinary autovacuum is disabled.
- HOT avoids new ordinary index entries when updated columns are not referenced by non-summarizing
  indexes and the new version fits on the same page. Summarizing indexes such as BRIN are an
  exception and may still need summary maintenance. Choose `fillfactor` from row size/update cadence
  and validate the HOT ratio delta.
- Index-only scan is a runtime condition, not only an index definition. High `Heap Fetches` points to
  visibility-map/maintenance state.
- `work_mem` budgets depend on concurrently live operations, private participant state and shared
  Parallel Hash state; hash can use a multiplier. Do not multiply an already combined shared allowance
  by workers again or treat the calculation as process RSS. Inspect the plan and concurrency first.
- Read `EXPLAIN (ANALYZE, BUFFERS)` from the deepest estimate divergence and include loops, reads,
  batches, disk sort, heap fetches, and rows removed. A sequential scan alone is not a defect.
- Prepared planning has two layers: pgjdbc's named-statement threshold and PostgreSQL's custom-versus-
  generic decision. Warm-up can change the plan without a deploy; through a pooler, reuse of one JDBC
  connection does not establish the same backend or server plan history.
- PgBouncer transaction pooling does not preserve arbitrary session state. Named-protocol prepared
  statement support does not make `SET`, LISTEN, temp tables, session advisory locks, or every SQL
  PREPARE use safe.
- READ COMMITTED, REPEATABLE READ, and SERIALIZABLE are MVCC modes with different snapshot/conflict
  behavior. Serialization failure `40001` requires retrying the whole transaction, including
  decisions that produced its SQL, under a safe bounded policy; external effects need separate protection.
- A bigger `max_connections`, `work_mem`, WAL size, or cost-constant change is not a diagnosis. State
  the measured bottleneck, multiplication, expected effect, and failure guardrail.

## Output

Return the supported observation/mechanism, relevant versions/scope and evidence limits, with the
smallest justified correction or no-change result. For a proposed change, add its expected signal,
applicable validation/guardrails and recovery plan; do not invent measured benefit.

Route engine-neutral statement work to `sql-query-performance` and pool hold-time/fleet budgeting
to `connection-pool-sizing`; index design and bulk-ingestion choices can use `database-index-design`
and `database-bulk-loading` when those are the actual decisions.

## References

- [MVCC, VACUUM, and indexes](references/mvcc-vacuum-indexes.md) — read for bloat, blocked cleanup,
  freeze/wraparound, HOT/fillfactor, visibility map, BRIN, or partial-index behavior.
- [Plans, memory, WAL, and concurrency](references/plans-memory-wal-concurrency.md) — read for plan
  evidence, statistics sampling, work memory/spills, JIT, checkpoints/WAL, locks, isolation, or instance
  configuration.
- [pgjdbc and PgBouncer](references/pgjdbc-and-pgbouncer.md) — read when plans change after warm-up,
  fetch/batch does not behave as expected, pool mode conflicts with session state, or timeout recovery
  depends on whether the server canceled a statement or terminated the session.
