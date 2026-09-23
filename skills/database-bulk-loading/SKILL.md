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
success means meeting the actual load window and correctness contract. A safety review can
retain an adequate mechanism without increasing throughput.

## Inputs required

```text
engine, server/driver versions, topology, durability and replication mode:
source format/location/trust, rows and bytes, row width, and error distribution:
target constraints, triggers, indexes, generated keys, and online traffic:
required atomicity, duplicate/upsert semantics, rejection policy, and restart point:
current mechanism, batch size, transaction size, throughput, CPU/I/O/log/network, and heap:
window/SLO, staging/disk/log headroom, privileges, and rollback constraints:
```

Reuse existing configuration, tests and measurements; ask only unresolved questions that change
the mechanism, atomicity or recovery contract. Continue independent inspection while those are
resolved. Collect the inputs relevant to the decision rather than requiring a new full study.

For JVM implementation changes, inspect compiler release/toolchains, runtime images, resolved
JDBC driver and ORM versions, connection properties and transaction-manager ownership. This skill
imposes no Java baseline; preserve the project's target and dependencies. When missing timing or
failure evidence could change the choice, propose a bounded pilot and keep those conclusions conditional.

## Workflow

1. For a performance question, measure rows/s and bytes/s by phase. Attribute time to client
   materialization, network round-trips, statement processing, per-row engine work, log/WAL flush,
   indexes/constraints, or replication. A single total duration cannot select a mechanism.
2. Choose the mechanism level deliberately: individual statements, JDBC batch, driver statement
   rewrite, native bulk API, or server-side set operation from an existing source or staging table.
   Preserve the current path when it meets the contract; compare only materially relevant alternatives.
3. Define transaction and error semantics before tuning. `executeBatch()` is not atomic; verify
   an explicit transaction encompasses all intended writes on transactional storage, including
   native API participation. DDL, sequences and external trigger effects can escape rollback.
   Capture update counts, SQL state/vendor code, warnings, rejected rows, and what
   remains committable after an error.
4. Use staging when it provides needed validation, deduplication, transformation, index suspension,
   or online isolation that the direct path cannot supply adequately. Include load, validation,
   promotion and cleanup costs; staging alone does not make publication atomic to readers.
5. When changing sizing, find the batch-size knee under representative data. Network benefit
   approaches saturation while memory, lock duration, retry granularity, statement size, and
   replication lag keep growing.
6. Pilot parallelism only with a bottleneck hypothesis, spare capacity and independently owned
   key ranges/partitions. It may overlap client waits or use idle server resources; it cannot
   remove a saturated shared log or lock bottleneck. Stop when CPU/I/O/log, lock waits, replica lag,
   or online latency reaches its guardrail.
7. Commit the destination checkpoint with the data wherever they share a transaction resource.
   Acknowledge an external source only after destination commit, with idempotent replay across
   that gap. Reconcile unknown commit outcomes before retrying; see the recovery reference.
8. Finish by checking accepted/rejected/warning counts, constraints, samples or checksums, target
   invariants, statistics, replica convergence, and online SLOs.

## Rules

- Separate three costs: round-trips, work per statement, and work per row. Batching, rewrite and
  native APIs can reduce communication and statement overhead; verify what the driver actually does.
  Reducing rows written through filtering/deduplication can also reduce engine work, but must
  preserve source ordering, duplicate, trigger and audit semantics. Measure these costs separately.
- If a batch of B rows uses one round-trip instead of B, its round-trip component falls by
  `1 - 1/B`. This is not total elapsed-time improvement: row work, commits and driver behavior
  remain. Measure the knee and vary JDBC batch size separately from transaction/chunk size.
- Never infer batch from an API name or ORM log. Verify server statement/round-trip counts and the
  driver's effective properties.
- Native APIs have different correctness defaults. PostgreSQL `COPY` validates constraints and
  fires triggers; SQL Server Bulk Copy skips some checks/triggers unless enabled; MySQL `LOAD DATA`
  can convert bad input into warnings. Make these choices explicit. Restoring checks after a load
  does not establish that previously unchecked rows are valid; include validation before publication.
- A durability relaxation needs named data-loss semantics, authority, a timed restoration step, and
  a crash test. A faster import is not evidence that correctness remained intact.
- Dropping indexes on a hot final table can turn the load into an outage and alter constraints.
  Staging is the default location for aggressive optimization.
- Upsert syntax is not portable: conflict target, row-locking behavior, triggers, no-op updates, and
  races differ. Test concurrent writers; skip unchanged rows only when required trigger, version
  and audit effects are preserved.
- Do not materialize the entire source in the JVM. Stream with bounded buffers and account for
  driver buffering; a fetch/input API that accepts a size does not prove bounded memory.
- Verify optimizer statistics after the load, refresh where needed, and validate the first online
  plans. Stale statistics can defer the incident until traffic resumes.
- “No exception” is not data quality. Treat warnings and rejected rows as first-class outcomes.

## Output

Return the decision or load plan proportionate to the request, using applicable fields below.
For implementation work, distinguish changes and checks actually completed from proposed work.

```text
chosen or retained mechanism and the material alternatives considered:
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
