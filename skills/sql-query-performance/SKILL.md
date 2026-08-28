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

1. **Get a plan for the statement that actually runs**, with the parameters that actually
   arrive, against data of production shape. A plan for a hand-substituted literal is a
   different query; a plan against an empty test schema is a different optimiser problem.
2. **Read estimated rows against actual rows before anything else.** A plan is the optimiser's
   prediction. If prediction and reality diverge by orders of magnitude, the plan shape is a
   consequence and not the cause — the cause is stale statistics, a predicate the optimiser
   cannot estimate, or one parameter's plan being reused for another.
3. **Find the operation that costs**, by actual time or actual rows, not by position in the
   tree and not by the optimiser's own cost number.
4. **Classify the access path** on that operation: full scan, index range, or a lookup back to
   the table per row. The third is the one that quietly dominates.
5. **Decide from selectivity, not from the operator name.** Ask what fraction of the table the
   predicate keeps. A scan reading 60% of the rows is right; a per-row lookup returning 40% of
   the table is not.
6. **Predict the effect, then apply, then re-measure the same way.** A change that does not move
   the number it was chosen to move gets reverted, including an index.

## Rules

- **A full scan is not a defect.** Below a selectivity threshold the optimiser is correct to
  read everything sequentially rather than pay a random lookup per row. "Scan appears in the
  plan" is not a finding; "a scan reads 4 M rows to return 12" is.
- **The optimiser's cost is a unitless internal currency, not milliseconds.** It is comparable
  between candidate plans for the same statement and between nothing else. Never quote it as a
  measure of how slow a query is.
- **Estimated versus actual is the first signal, and it is the one people skip.** Everything the
  optimiser did downstream of a bad estimate follows from that estimate.
- **An index on a low-cardinality column rarely helps a predicate.** It may still earn its place
  by supplying ordering or by covering the query — decide which of the three jobs you are
  buying, because they are not the same index.
- **In a composite index the column order is the contract.** It serves a leading prefix of its
  columns: equality predicates first, then at most one range, then the ordering column. A
  composite index is not a set.
- **A function or a cast on the column side usually disables the index.** So does an implicit
  conversion caused by comparing a column to a parameter of a different type — the conversion is
  applied to the column, and the index is on the column's untransformed value.
- **`SELECT *` defeats covering.** An index that could have answered the query alone now needs a
  lookup per row for the columns nobody asked for.
- **`OFFSET n` degrades linearly in n**, because the rows before the offset are still produced
  and discarded. Keyset pagination — carry the last key forward and use a range predicate — is
  flat in page number. Deep pagination is the case where the shape must change, not the index.
- **Every index is paid for on every write** to its table, and in space. An index proposal
  without the write cost is half a proposal.
- **The same statement can have two plans.** Fast for one parameter and slow for another means
  the plan was chosen for a value with different selectivity than the one being run. That is a
  plan-stability problem, not a missing index.
- **Measure with the cache state you actually have.** A second run reading from the buffer pool
  answers a different question than the first. State which one you measured.

## References

- [Reading a plan](references/reading-a-plan.md) — the order to read a plan in, estimated versus
  actual, the operator vocabulary and what the equivalent is called on each engine, and the
  three questions a plan can answer. Read when a plan is in front of you.
- [Index decisions](references/index-decisions.md) — selectivity, composite column order,
  covering, the write cost, and when the correct answer is no index. Read before proposing,
  adding or removing one.
- [Query shapes that fight the optimiser](references/query-shapes.md) — non-sargable predicates,
  implicit conversion, pagination, and the shapes whose fix is a rewrite rather than an index.
