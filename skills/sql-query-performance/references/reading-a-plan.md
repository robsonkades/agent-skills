# Reading an execution plan

Read in this order. Most wrong conclusions come from starting at step 3.

## 1. Is this the plan for the statement that runs?

Three ways the plan in your hand is for a different query than the one in production:

- **Literals substituted for parameters.** The optimiser can use a literal's actual value to
  estimate selectivity, and cannot do the same for a parameter it has not seen. The two plans can
  legitimately differ.
- **A different data volume or distribution.** Plan choice is a function of the statistics, so a
  plan taken against a development schema answers a different question.
- **An estimated plan rather than an executed one.** An estimated plan carries no actual row
  counts and no actual timings, which removes the single most informative comparison there is.

Every engine has both forms. The names differ; the distinction does not.

| Engine     | Estimated      | Executed, with actuals                      |
| ---------- | -------------- | ------------------------------------------- |
| PostgreSQL | `EXPLAIN`      | `EXPLAIN (ANALYZE, BUFFERS)`                |
| MySQL      | `EXPLAIN`      | `EXPLAIN ANALYZE`                           |
| SQL Server | estimated plan | actual plan / `SET STATISTICS PROFILE ON`   |
| Oracle     | `EXPLAIN PLAN` | `DBMS_XPLAN.DISPLAY_CURSOR(... 'ALLSTATS')` |

Use the executed form. If the statement is too slow to run, that is itself the reason to reach
for it on a smaller bound rather than to settle for estimates.

## 2. Estimated rows against actual rows

This is the comparison the rest of the plan hangs off. The optimiser chose every join order,
join algorithm and access path from its estimate. If the estimate is wrong the plan is
_reasonable given wrong input_, and tuning the plan shape treats the symptom.

Divergence of one order of magnitude or more, per operation, is the threshold worth reacting to.
Read it bottom-up: the first operation whose estimate is badly wrong is where the error enters,
and everything above it inherits the error.

Common causes, in the order they are worth checking:

1. **Stale statistics.** The distribution the optimiser is reasoning about is not the one on
   disk. Cheapest to test: refresh statistics for the table and re-plan.
2. **A predicate the optimiser cannot estimate** — a function result, a correlated subquery, a
   parameter whose value is unknown at plan time, or a comparison across columns of the same
   table. It falls back to a fixed guess.
3. **Correlated predicates.** `city = 'Porto Alegre' AND state = 'RS'` is estimated as if the two
   were independent; they are not, so the estimate is far too low. Multi-column statistics, where
   the engine offers them, are the direct answer.
4. **Plan reuse across parameter values with different selectivity.** The plan is correct for the
   value it was built for.

## 3. Which operation actually costs

Not the top of the tree, and not the widest box in a graphical plan. Sort operations by **actual
time excluding children**, or if the engine does not offer that, by actual rows produced.

Two shapes account for most of what people miss:

- **A per-row lookup back to the table.** An index gave the engine row identifiers; it now
  fetches each row separately. Cheap for 20 rows, ruinous for 200,000 — and it appears in the
  plan as a small operation repeated many times, so it looks minor unless you read the loop
  count.
- **A join whose inner side is re-executed per outer row.** Same arithmetic. The per-execution
  cost is trivial and the number of executions is not.

Always read the **number of executions or loops** alongside the per-execution cost. A plan
without it invites reading a 10,000× repeated operation as a cheap one.

## 4. The access path, named plainly

| What it does                                       | Common names                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Read every row of the table                        | seq scan, full table scan, table scan, clustered index scan             |
| Read a contiguous range of an index                | index scan, index range scan, index seek, ref/range                     |
| Read the index and answer entirely from it         | index-only scan, covering index, "using index"                          |
| Read the index, then fetch each row from the table | bitmap heap scan, key lookup, table access by index rowid, rowid lookup |

The fourth row is the one to notice. The first three are all potentially correct answers.

## What a plan cannot tell you

- **Whether the query should exist.** A perfectly planned query issued 400 times per request is
  an `orm-fetch-and-batching-performance` problem, not a plan problem.
- **How long it will take under concurrency.** Plans are per-statement; contention, locking and
  the connection pool are elsewhere.
- **Whether the data read came from memory or disk.** Ask the engine for buffer or I/O statistics
  explicitly, and state which state you measured in.
