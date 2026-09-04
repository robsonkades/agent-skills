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
4. Predict the counter that should move, apply the narrowest reversible change, and validate with the
   same plan/workload plus bloat/WAL/memory/lag guardrails.

## Rules

- PostgreSQL updates create a new heap tuple and leave the old version for VACUUM. Long-lived xmin
  holders can prevent removal even when VACUUM reports success.
- Autovacuum is correctness-critical because of transaction-ID wraparound. Never disable it as a
  tuning fix; tune relation thresholds/cost/capacity from churn, table size, and completion evidence.
- HOT avoids touching indexes only when updated columns are not index-dependent and a new version fits
  on the same page. Choose `fillfactor` from row size/update cadence and validate the HOT ratio delta.
- Index-only scan is a runtime condition, not only an index definition. High `Heap Fetches` points to
  visibility-map/maintenance state.
- `work_mem` is per sort/hash operation, per worker/session, and hash can use a multiplier. Count plan
  nodes and concurrency before raising it globally.
- Read `EXPLAIN (ANALYZE, BUFFERS)` from the deepest estimate divergence and include loops, reads,
  batches, disk sort, heap fetches, and rows removed. A sequential scan alone is not a defect.
- Prepared planning has two layers: pgjdbc's named-statement threshold and PostgreSQL's custom-versus-
  generic decision. Warm-up on the same connection can change the plan without a deploy.
- PgBouncer transaction pooling does not preserve arbitrary session state. Named-protocol prepared
  statement support does not make `SET`, LISTEN, temp tables, session advisory locks, or every SQL
  PREPARE use safe.
- READ COMMITTED, REPEATABLE READ, and SERIALIZABLE are MVCC modes with different snapshot/conflict
  behavior. Serialization failure `40001` is an expected control path requiring safe bounded retry.
- A bigger `max_connections`, `work_mem`, WAL size, or cost-constant change is not a diagnosis. State
  the measured bottleneck, multiplication, expected effect, and failure guardrail.

## Output

Report versions and evidence window, observations, mechanism and alternatives, confidence reason,
relation/query/session scope, intervention and predicted signal, validation, guardrails, and rollback.

## References

- [MVCC, VACUUM, and indexes](references/mvcc-vacuum-indexes.md) — read for bloat, blocked cleanup,
  freeze/wraparound, HOT/fillfactor, visibility map, BRIN, or partial-index behavior.
- [Plans, memory, WAL, and concurrency](references/plans-memory-wal-concurrency.md) — read for plan
  evidence, work memory/spills, JIT, checkpoints/WAL, locks, isolation, or instance configuration.
- [pgjdbc and PgBouncer](references/pgjdbc-and-pgbouncer.md) — read when plans change after warm-up,
  fetch/batch does not behave as expected, or pool mode conflicts with session state.
