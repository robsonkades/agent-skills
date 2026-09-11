---
name: database-index-design
description: >
  Designing and governing an index portfolio across SQL Server, MySQL/InnoDB, and PostgreSQL:
  deriving composite keys from a workload, equality/range/order trade-offs, covering and partial
  indexes, write amplification, redundant-index consolidation, engine-specific semantics, and
  safe production creation or removal. Use when changing schema indexes for several queries or
  reviewing a table's index set. Not the diagnosis of one slow statement, which belongs to
  sql-query-performance.
---

# Database Index Design

## Purpose

Choose an index set that supports the measured workload at justified write, storage, locking,
maintenance, and rollout cost. Retain an adequate portfolio; fewer indexes can still cost more
if consolidation widens keys or loses useful access paths. This skill owns the portfolio and DDL decision;
`sql-query-performance` owns reading one statement's executed plan.

## Required inputs

```text
engine, exact version/edition, table shape, row count, and growth:
representative query workload with frequency and tail parameter distributions:
equality, range, join, ordering, projection, and uniqueness requirements per query:
current indexes, constraints, usage window, write/update rate, and replica roles:
executed plans and actual work for the target statements:
DDL availability, lock, log/WAL, disk, rollback, and maintenance constraints:
```

Inspect existing schema/migrations, captured plans and usage windows before asking for new
evidence. If the workload or engine is unknown, do not emit DDL; identify the missing decision
input. Estimated plans can support candidates when actuals are unavailable, with runtime benefit
explicitly unverified.

This skill has no Java language minimum: its compatibility boundary is the database and
migration tooling. In Java projects inspect resolved JDBC/ORM versions, generated SQL and
parameter types, plus migration transaction settings. The references use PostgreSQL 18 and
MySQL 8.4 for version-sensitive examples; SQL Server features require the actual version and
edition. Do not upgrade the application or database to match a proposed index feature.

## Workflow

Commands such as `EXPLAIN ANALYZE` run the statement and can perform writes and
function side effects. Reuse suitable captures or use an authorized environment with execution,
lock-wait and cleanup bounds. Rollback does not restore every sequence or external effect.

1. Normalize each target query into equality predicates, all range predicates,
   ordering, joins, projection-only columns, and non-sargable expressions.
2. Derive candidate keys from contiguous navigation: equality prefix, then the chosen range or
   ordering. For non-sargable predicates compare a semantics-preserving rewrite with an
   expression/computed-column index; preserve collation, null, time-zone and parameter semantics.
3. Evaluate the candidates against the workload, not one query. Prefer extending or consolidating
   an existing prefix when that preserves important orderings and does not create harmful width.
4. Decide which columns belong in the key and which only cover the result. Account for the engine's
   physical representation and visibility rules.
5. Quantify benefit and cost: rows/pages avoided times execution frequency versus bytes, write
   maintenance, cache footprint, logging, lock reach, and operational DDL cost.
6. Validate with the application's parameterized statement and executed plan. Confirm which key
   parts positioned the scan and which remained residual.
7. Plan the engine's explicit online/concurrent algorithm where supported; execute only within the
   authorized deployment scope. Observe boundary locks and log/disk headroom, then re-measure reads
   and writes. Removal needs an observation window
   longer than the business cycle and must include every replica role.

## Core rules

- Start B-tree design from a contiguous equality prefix and first non-equality range. This is
  a useful single-interval model, not a universal limit: multiple searches, skip scans and
  index combinations can exploit other predicates. Confirm actual engine/version behavior.
- “Most selective first” is not a general rule for equality columns. Their order is chosen from
  workload prefix reuse, ordering, statistics/compression, skip-scan behavior, and engine evidence.
- A seek operator is not proof of a good index. Inspect positioned predicates versus residual work:
  `SeekPredicates`/`Predicate`, `used_key_parts`/rows examined, or `Index Cond`/`Filter`.
- Range and ordering on different columns compete. Choose from result limit, tail selectivity, sort
  cost, and workload frequency; one index cannot promise both universally.
- Covering trades lookups for wider entries and maintenance on relevant writes. Which updates
  maintain an index depends on the engine, indexed columns/predicate and update optimizations.
  `INCLUDE` keeps a column out of key ordering; it does not make the bytes or maintenance free.
  MySQL has no `INCLUDE` equivalent.
- Every index proposal includes the cost of writes and storage. On PostgreSQL, indexing an updated
  column can also prevent HOT updates and make non-summarizing indexes participate in that update.
  PostgreSQL 18 exempts summarizing indexes such as BRIN from that eligibility restriction;
  HOT also requires room on the original heap page.
- An unused-index counter is insufficient for removal. Check collection resets, complete business
  cycles, constraints/FK support, statistics effects, and usage on primary and replicas.
- An index can bound locks as well as reads. In InnoDB, a locking scan without a usable index can
  lock every examined record or range.
- Do not use B-tree for arbitrary substring search. Full-text indexes answer token search; PostgreSQL
  `pg_trgm` can support substring search. JSON and spatial predicates need their own access methods.
- Treat index DDL as a production change: “online,” `INPLACE`, `INSTANT`, and `CONCURRENTLY` have
  different lock, failure, cleanup, edition, and rollback semantics.

## Evidence and output

State the portfolio decision: retain, add, modify, or remove, with its evidence and trade-offs.
A no-change review is complete when the workload/constraint roles are supported and any material
observation gap is explicit. Distinguish planned DDL and predicted benefit from executed changes
and measured results; scale the detail to the decision.

For each accepted candidate report:

```text
queries/workload served:
key and included columns, with the role of each:
engine-specific DDL and prerequisite/version:
predicted positioned prefix and residual work:
benefit evidence and tail parameter used:
write/storage/lock/maintenance cost:
deployment, validation, rollback, and removal criteria:
confidence and missing evidence:
```

## References

- [Composite index derivation](references/composite-index-derivation.md) — read when choosing key
  order, resolving range versus ordering, or estimating amplification.
- [Engine differences](references/engine-differences.md) — read before emitting DDL or asserting
  coverage, partial-index, uniqueness, FK, or specialized-index semantics.
- [Portfolio lifecycle](references/portfolio-lifecycle.md) — read when consolidating, deploying, or
  removing indexes in production.
- [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/18/sql-explain.html) and
  [sequence effects](https://www.postgresql.org/docs/18/functions-sequence.html) — execution and
  rollback boundaries when collecting actual plans.
