---
name: sql-query-performance
description: >
  Making one SQL statement fast, from its execution plan rather than a guess: reading estimated
  against actual rows, finding the operation that actually costs, whether a scan is wrong at
  all, index selectivity and composite column order, covering indexes, and the predicates that
  quietly disable an index. Use when a query is slow and the plan has not been read, when "add
  an index" is the proposed fix, when a predicate wraps the column in a function or compares
  mismatched types, when OFFSET pagination degrades on later pages, when a query is fast for one
  parameter and slow for another, when a plan changed with no deploy, or when an index is
  proposed on a low-cardinality column.  Engine-neutral: concept and measurement, not one vendor.
  Not the ORM issuing the statements (orm-fetch-and-batching-performance), pool
  sizing (connection-pool-sizing), the request-path budget (architecture-and-performance),
  caching the result (caching-strategies), or schema change safety
  (schema-evolution-and-compatibility).
---

# SQL Query Performance

## Purpose

Turn "the query is slow" into a named cause read off an execution plan, and a change whose
effect is predicted before it is made.

The failure this prevents is the reflex fix: adding an index because a scan appeared in the
plan. A scan is often the correct plan, an index on the wrong column costs writes and buys
nothing, and the operation the eye lands on is usually not the one spending the time.

## Workflow

Identify the engine/version, schema, indexes, statistics, parameter types, isolation and driver
prepare mode. Engine-neutral concepts do not make syntax or runtime counters portable. Commands
such as EXPLAIN ANALYZE run the statement: use existing evidence or an authorized bounded environment first,
especially for writes, locking reads or functions with side effects. Rollback does not undo every
sequence/external effect. An estimated plan can support hypotheses when execution is unavailable.

1. **Get a plan for the statement that actually runs**, with the parameters that actually
   arrive, against data of production shape. A plan for a hand-substituted literal is a
   different query; a plan against an empty test schema is a different optimiser problem.
2. **Read estimated rows against actual rows before anything else.** A plan is the optimiser's
   prediction. Large divergence suggests checking statistics, correlation, parameter visibility
   and reuse, but accurate estimates do not guarantee a good plan. Respect per-loop and
   early-termination semantics before calling an estimate wrong.
3. **Find the operation that costs**, using timed work, executions, reads, spills and waits.
   Rows emitted are not rows examined or a substitute for elapsed cost.
4. **Classify the access path** on that operation: full scan, index range, or a lookup back to
   the table. Lookups may dominate, but bitmap/batched access and cache locality change their cost.
5. **Decide from selectivity, not from the operator name.** Ask what fraction of the table the
   predicate keeps, then account for ordering, covering, locality, row width and startup/limit
   behavior. No fixed 60%/40% boundary establishes the right plan.
6. **Predict the effect, then apply, then re-measure the same way.** A change that does not move
   the number it was chosen to move is reconsidered; index removal/rebuild requires its own
   dependency and rollout checks, not an automatic destructive rollback.

## Rules

- **A full scan is not a defect.** When a predicate retains enough rows, it can be cheaper to
  read everything sequentially rather than pay a random lookup per row. "Scan appears in the
  plan" is not a finding; "a scan reads 4 M rows to return 12" is.
- **The optimiser's cost is a unitless internal currency, not milliseconds.** It is comparable
  between candidate plans for the same statement and between nothing else. Never quote it as a
  measure of how slow a query is.
- **Estimated versus actual helps locate a planning hypothesis.** Validate the counter semantics
  and the downstream cost consequence rather than assuming every estimate error causes slowness.
- **Low cardinality does not imply low selectivity.** A rare boolean value can benefit from an
  index even when there are only two distinct values. An index may also earn its place
  by supplying ordering or by covering the query — decide which of the three jobs you are
  buying, because they are not the same index.
- **In a composite index the column order is a contract with a particular engine and workload.**
  Leading equality columns commonly narrow the seek before a range; later columns may still filter,
  cover, or satisfy ordering, and some engines support skip scans. Equality-column order is often
  interchangeable for one query but not for other queries, compression, statistics, or ordering.
  Verify the executed plan instead of applying a universal mnemonic.
- **A function or cast on the indexed expression can make a predicate non-sargable.** Expression or
  functional indexes may restore an access path. With mismatched parameter types, which operand is
  converted follows the database's type-precedence and coercion rules; inspect the plan rather than
  assuming the column is always converted.
- **`SELECT *` can defeat covering** and increases transferred/materialized data when it adds
  columns. A covering or clustered index may already contain all columns; visibility checks
  can still require table access in some engines.
- **Large `OFFSET n` usually performs work proportional to skipped rows**, even when an index avoids
  a sort. Keyset pagination avoids rescanning prior offsets with a suitable access path, but
  residual filters, invisible rows and joins can require more work than page size. It changes
  navigation and concurrent-update semantics. Deep pagination is a query and
  product-contract decision, not merely an index decision.
- **Indexes add storage and relevant write maintenance**, depending on changed columns,
  predicates and engine optimizations. An index proposal
  without the write cost is half a proposal.
- **Parameter sensitivity has several causes.** Compare actual plans, volumes and waits; skew,
  plan reuse, cache state, locks or a missing useful access path can produce the same symptom.
- **Measure with the cache state you actually have.** A second run reading from the buffer pool
  answers a different question than the first. State which one you measured.
- Preserve null handling, duplicates, ordering, pagination and authorization predicates in
  rewrites. Return evidence, hypothesis, expected change, semantic checks and before/after metrics;
  missing actuals or failed runs remain explicit gaps.

## References

- [Reading a plan](references/reading-a-plan.md) — the order to read a plan in, estimated versus
  actual, the operator vocabulary and what the equivalent is called on each engine, and the
  three questions a plan can answer. Read when a plan is in front of you.
- [Index decisions](references/index-decisions.md) — selectivity, composite column order,
  covering, the write cost, and when the correct answer is no index. Read before proposing,
  adding or removing one.
- [Query shapes that fight the optimiser](references/query-shapes.md) — non-sargable predicates,
  implicit conversion, pagination, and the shapes whose fix is a rewrite rather than an index.
