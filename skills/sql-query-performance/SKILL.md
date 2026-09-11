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
  caching the result (caching-strategies), or index portfolio and DDL rollout
  (database-index-design).
---

# SQL Query Performance

## Purpose

Turn "the query is slow" into a supported explanation from plans and execution evidence,
and, when a change is justified, predict its effect before making it.

The failure this prevents is the reflex fix: adding an index because a scan appeared in the
plan. A scan is often the correct plan, an index on the wrong column costs writes and buys
nothing, and an operator name or output row count does not identify where time is spent.

## Workflow

Use the steps needed for the question and reuse adequate captures. A narrow semantic/plan
explanation or supported no-change review does not require a new execution, index or full
diagnostic campaign. Start with relevant known work/waits; inspect the engine/version, schema,
indexes, statistics, parameter types, isolation and driver
prepare mode. Engine-neutral concepts do not make syntax or runtime counters portable. Commands
such as EXPLAIN ANALYZE run the statement: use existing evidence or an authorized bounded environment first,
especially for writes, locking reads or functions with side effects. Rollback does not undo every
sequence/external effect. An estimated plan can support hypotheses when execution is unavailable.

1. **Get a plan for the statement that actually runs**, with the parameters that actually
   arrive, against data of production shape. A hand-substituted literal may have different
   parameter visibility or types; it can represent the relevant plan when actual specialization
   and context match. An empty test schema usually changes the optimiser problem.
2. **Compare estimated rows with actual rows where available and relevant.** A plan is the optimiser's
   prediction. Large divergence suggests checking statistics, correlation, parameter visibility
   and reuse, but accurate estimates do not guarantee a good plan. Respect per-loop and
   early-termination semantics before calling an estimate wrong.
3. **Find the operation that costs**, using timed work, executions, reads, spills and waits.
   Rows emitted are not rows examined or a substitute for elapsed cost.
4. **Classify the access path** on that operation: full scan, index range, or a lookup back to
   the table. Lookups may dominate, but bitmap/batched access and cache locality change their cost.
5. **Decide from the work and required result, not the operator name.** Ask what fraction of the table the
   predicate keeps, then account for ordering, covering, locality, row width and startup/limit
   behavior. No fixed 60%/40% boundary establishes the right plan.
6. **For a justified change, predict the effect, apply within authorization, then re-measure comparably.** A change that does not move
   the number it was chosen to move is reconsidered; index removal/rebuild requires its own
   dependency and rollout checks, not an automatic destructive rollback.

## Rules

- **A full scan is not a defect.** When a predicate retains enough rows, it can be cheaper to
  read everything sequentially rather than pay a random lookup per row. "Scan appears in the
  plan" is not a finding. Reading 4 M rows to return 12 identifies work to inspect, but does not
  prove a defect without a cheaper valid alternative or a breached workload contract.
- **The optimiser's cost is a model estimate, not measured elapsed time.** Compare costs within
  the applicable engine, cost settings and workload context; candidate plans are a common use.
  PostgreSQL 17 uses a configurable arbitrary scale, which can be calibrated to time units, but
  even then its cost omits work such as result transmission. Do not report it as observed latency
  or compare incompatible cost scales.
- **Estimated versus actual helps locate a planning hypothesis.** Validate the counter semantics
  and the downstream cost consequence rather than assuming every estimate error causes slowness.
- **Low cardinality does not imply low selectivity.** A rare boolean value can benefit from an
  index even when there are only two distinct values. An index may also earn its place
  by supplying ordering or by covering the query — decide which jobs the proposed index serves
  and their trade-offs; one index can serve several.
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
  rewrites. Return the supported conclusion and relevant evidence/limits. For a change, include
  its hypothesis, semantic checks and comparable before/after evidence; missing actuals or failed
  runs limit the claims that depend on them. Follow the engine's DDL mechanics and the project's
  application/backfill/rollback migration contract when schema changes are involved.

## References

- [Reading a plan](references/reading-a-plan.md) — a structure for reading a plan, estimated versus
  actual, the operator vocabulary and what the equivalent is called on each engine, and the
  limits of what a plan can answer. Read when a plan is in front of you.
- [Index decisions](references/index-decisions.md) — selectivity, composite column order,
  covering, the write cost, and when the correct answer is no index. Read before proposing,
  adding or removing one.
- [Query shapes that fight the optimiser](references/query-shapes.md) — non-sargable predicates,
  implicit conversion, pagination, and the semantics of rewrite, index or no-change decisions.
