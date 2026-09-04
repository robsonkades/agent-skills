---
name: database-bulk-loading
description: >
  Designing and diagnosing high-volume database ingestion from the JVM across PostgreSQL,
  MySQL, and SQL Server: JDBC batching and statement rewrite, native COPY/LOAD DATA/Bulk Copy,
  staging, transaction and partial-error semantics, idempotent restart, upsert races, logging,
  parallelism, and post-load validation. Use when a backfill, import, migration, or batch window
  is too slow or unsafe. Not routine ORM fetch/write tuning, which belongs to
  orm-fetch-and-batching-performance.
---

# Database Bulk Loading

## Purpose

Choose the least costly ingestion mechanism that still preserves the required validation,
atomicity, recoverability, and online workload. “More threads” and “larger batch” are not goals;
the job is done when useful rows per second rise without violating correctness or guardrails.

## Inputs required

```text
engine, server/driver versions, topology, durability and replication mode:
source format/location/trust, rows and bytes, row width, and error distribution:
target constraints, triggers, indexes, generated keys, and online traffic:
required atomicity, duplicate/upsert semantics, rejection policy, and restart point:
current mechanism, batch size, transaction size, throughput, CPU/I/O/log/network, and heap:
window/SLO, staging/disk/log headroom, privileges, and rollback constraints:
```

## Workflow

1. Measure rows/s and bytes/s by phase. Attribute time to client materialization, network
   round-trips, statement processing, per-row engine work, log/WAL flush, indexes/constraints, or
   replication. A single total duration cannot select a mechanism.
2. Choose the mechanism level deliberately: individual statements, JDBC batch, driver statement
   rewrite, native bulk API, or server-side set operation from staging.
3. Define transaction and error semantics before tuning. `executeBatch()` is not atomic; the
   transaction is. Capture update counts, SQL state/vendor code, warnings, rejected rows, and what
   remains committable after an error.
4. Prefer staging when validation, deduplication, transformation, index suspension, or online
   isolation matters. Load into a table with intentionally minimal structures, validate, then move
   with set-based SQL.
5. Find the batch-size knee under representative data. Network benefit approaches saturation while
   memory, lock duration, retry granularity, statement size, and replication lag keep growing.
6. Parallelize only after identifying a round-trip/client bottleneck and partitioning work by a
   stable key range. Stop when engine CPU/I/O/log, lock waits, replica lag, or online latency reaches
   its guardrail.
7. Make progress and data change one transaction: a committed chunk records its checkpoint in the
   same commit. Re-run and interruption tests must prove idempotency.
8. Finish by checking accepted/rejected/warning counts, constraints, samples or checksums, target
   invariants, statistics, replica convergence, and online SLOs.

## Rules

- Separate three costs: round-trips, work per statement, and work per row. JDBC batching attacks the
  first; rewrite/native APIs attack the first two; only server-side choices reduce index,
  constraint, trigger, logging, and data-work cost.
- Batch benefit roughly follows `1 - 1/B`: moving from 1 to 50 removes most per-round-trip overhead;
  moving from 50 to 500 buys much less while increasing blast radius. Measure the knee.
- Never infer batch from an API name or ORM log. Verify server statement/round-trip counts and the
  driver's effective properties.
- Native APIs have different correctness defaults. PostgreSQL `COPY` validates constraints and
  fires triggers; SQL Server Bulk Copy skips some checks/triggers unless enabled; MySQL `LOAD DATA`
  can convert bad input into warnings. Make these choices explicit.
- A durability relaxation needs named data-loss semantics, authority, a timed restoration step, and
  a crash test. A faster import is not evidence that correctness remained intact.
- Dropping indexes on a hot final table can turn the load into an outage and alter constraints.
  Staging is the default location for aggressive optimization.
- Upsert syntax is not portable: conflict target, row-locking behavior, triggers, no-op updates, and
  races differ. Test concurrent writers and avoid rewriting unchanged rows.
- Do not materialize the entire source in the JVM. Stream with bounded buffers and account for
  driver buffering; a fetch/input API that accepts a size does not prove bounded memory.
- Update optimizer statistics after the load and validate the first online plans. Completion before
  statistics refresh can defer the incident until traffic resumes.
- “No exception” is not data quality. Treat warnings and rejected rows as first-class outcomes.

## Output

Produce a load plan with:

```text
chosen mechanism and why the next simpler/faster level was rejected:
transaction, partial-error, warning, retry, and idempotency semantics:
staging/final-table design and index/constraint/trigger handling:
batch/chunk/parallelism values as hypotheses with guardrails:
progress checkpoint and interruption recovery:
pre/post measurements and data-quality assertions:
operational rollback and configuration restoration:
confidence and untested failure modes:
```

## References

- [Mechanisms by engine](references/engine-mechanisms.md) — read before selecting or configuring a
  native API, driver rewrite, or minimal-logging path.
- [Failure, restart, and validation](references/recovery-and-validation.md) — read when partial
  input failure, upsert, restart, cutover, or data-quality guarantees matter.
