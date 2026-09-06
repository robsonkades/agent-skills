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

Availability and instrumentation prerequisites depend on engine/version. Typical forms:

| Engine     | Estimated      | Executed, with actuals                      |
| ---------- | -------------- | ------------------------------------------- |
| PostgreSQL | `EXPLAIN`      | `EXPLAIN (ANALYZE, BUFFERS)`                |
| MySQL      | `EXPLAIN`      | `EXPLAIN ANALYZE`                           |
| SQL Server | estimated plan | actual plan / `SET STATISTICS PROFILE ON`   |
| Oracle     | `EXPLAIN PLAN` | `DBMS_XPLAN.DISPLAY_CURSOR(... 'ALLSTATS')` |

Collecting actuals requires execution; EXPLAIN ANALYZE itself runs the SQL, whereas reading an
existing cursor plan does not rerun it. Inspect side effects and use authorized execution with a
time/resource budget. Oracle cursor actuals require statistics collection and the correct cursor/child; other
engines also have version/statement restrictions. A smaller bound or added LIMIT changes the
optimizer problem and is not the original workload. Existing execution evidence or estimates with
explicit limitations can be the right next step; rollback cannot undo all external/sequence effects.

## 2. Estimated rows against actual rows

Estimates influence join order, algorithms and access paths, alongside legality and cost models.
An inaccurate estimate can explain a poor choice; it does not exclude another optimization problem.

Large divergence is a clue, not a universal tenfold threshold or proof of the bottleneck.
Read it bottom-up to locate an early divergence, checking loops, partial execution and downstream
effects before attributing every later choice to it.

Common causes, in the order they are worth checking:

1. **Stale statistics.** The distribution the optimiser is reasoning about is not the one on
   disk. Inspect freshness/sampling first; a scoped statistics refresh has load/plan effects
   and must be an authorized experiment.
2. **A predicate the optimiser cannot estimate** — a function result, a correlated subquery, a
   parameter whose value is unknown at plan time, or a comparison across columns of the same
   table. It falls back to a fixed guess.
3. **Correlated predicates.** `city = 'Porto Alegre' AND state = 'RS'` is estimated as if the two
   were independent; they are not, so the estimate is far too low. Multi-column statistics, where
   the engine offers them, are the direct answer.
4. **Plan reuse across parameter values with different selectivity.** The plan is correct for the
   value it was built for.

## 3. Which operation actually costs

Use documented exclusive timing where available. PostgreSQL 17 actual node rows/time are
per-loop averages; multiply by loops to estimate that node's total work, not request latency.
Inclusive parent/child timing overlaps, as can parallel workers: do not sum/subtract it blindly.
Rows produced can be tiny for an expensive aggregate/filter; inspect input rows, reads, spills,
rechecks and waits instead of ranking by output count. LIMIT/EXISTS can stop a node early.

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

| What it does                                 | Common names                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| Read every row of the table                  | seq scan, full table scan, table scan, clustered index scan         |
| Read a contiguous range of an index          | index scan, index range scan, index seek, ref/range                 |
| Read the index and answer entirely from it   | index-only scan, covering index, "using index"                      |
| Fetch table rows located by an index         | key lookup, table access by index rowid, rowid lookup               |
| Group candidate tuple locations by heap page | PostgreSQL bitmap heap scan; inspect lossy rechecks and heap blocks |

All paths can be correct. PostgreSQL bitmap access visits heap pages in physical order rather
than doing a random fetch for every candidate; an index-only plan may still perform heap fetches.

## What a plan cannot tell you

- **Whether the query should exist.** A perfectly planned query issued 400 times per request is
  an `orm-fetch-and-batching-performance` problem, not a plan problem.
- **How long it will take under concurrency.** Plans are per-statement; contention, locking and
  the connection pool are elsewhere.
- **Whether the data read came from memory or disk.** Ask the engine for buffer or I/O statistics
  explicitly, and state which state you measured in.
  A database buffer miss/read can still hit the OS cache; it does not prove physical device I/O.

Source: [PostgreSQL 17 EXPLAIN semantics](https://www.postgresql.org/docs/17/using-explain.html).
