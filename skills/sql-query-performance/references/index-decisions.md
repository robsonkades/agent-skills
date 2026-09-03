# Index decisions

An index buys one of three things. Decide which before proposing one, because they want
different indexes.

| Job           | What it needs                                             |
| ------------- | --------------------------------------------------------- |
| **Filtering** | Leading columns matching the equality predicates          |
| **Ordering**  | The sort columns, in order, after the equality columns    |
| **Covering**  | Every column the statement reads, filtering ones included |

## Selectivity decides whether filtering is worth it

Selectivity is the fraction of rows a predicate keeps. An index seek pays a random access per
matching row; a scan pays a sequential read of everything. Below some fraction the seek wins,
above it the scan does, and the crossover is a property of the engine, the storage and the row
width — not a number to memorise.

What follows from that:

- **A column with two distinct values** — a boolean, an `active` flag — is a poor filter on its
  own, because either value matches roughly half the table. It can still be useful as a
  _trailing_ column that makes an index covering, or in a partial/filtered index where only the
  rare value is indexed.
- **A column that is nearly unique** — an id, an email, an external reference — is the ideal
  filter.
- **Skew matters more than cardinality.** A `tenant_id` with 5,000 values is highly selective for
  4,999 tenants and useless for the one holding 80% of the rows. The plan chosen for one is wrong
  for the other. That is the usual mechanism behind "fast for most customers, slow for the big
  one".

Measure it rather than assuming: `count(*)` for the predicate over `count(*)` for the table.

## Composite indexes serve a leading prefix

An index on `(a, b, c)` can be used for predicates on `a`, on `a, b`, and on `a, b, c`. It cannot
be used to satisfy a predicate on `b` alone, or on `c` alone, the way an index on `(b)` could.

The ordering rule, in the order to apply it:

1. **Start with equality predicates that establish the useful leading prefix.** Their relative
   order may not matter for this one lookup, but can matter for other queries, ordering,
   statistics, compression, and vendor-specific access paths.
2. **Then the range used to bound the scan** (`>`, `<`, `BETWEEN`, `LIKE 'prefix%'`). Columns after
   it may still filter or cover even when they cannot further narrow that range in a given engine.
3. **Then the columns needed for ordering**, where direction and engine rules allow the sort to be avoided.
4. **Then any remaining columns needed only to cover**, which are never seeked on and only exist
   to avoid the lookup back to the table.

Getting 1 and 2 the wrong way round is the most common composite-index defect: an index on
`(created_at, tenant_id)` for a query filtering `tenant_id = ? AND created_at > ?` uses only the
range, where `(tenant_id, created_at)` uses both.

## Covering, and its cost

If every column the statement touches is in the index, the engine never visits the table. That
removes the per-row lookup, which is frequently the whole problem.

The costs are real:

- The index gets wider, so fewer entries fit per page and more pages are read for the same range.
- The index must be maintained when any covered column is written, not just the key columns.

So covering pays when the lookup is the dominant cost and the added columns are narrow and rarely
updated. It stops paying when someone adds columns "while we are here", and it never survives
`SELECT *`.

## When the answer is no index

- **The predicate is not selective and the query returns most of the table.** The scan is right.
  If the query is still too slow, the wrong thing is the query returning that many rows.
- **The table is small enough to sit in memory.** The optimiser will frequently ignore the index
  and be correct to.
- **The write cost exceeds the read benefit.** A high-write, low-read table with an index added
  for a report run twice a day.
- **An existing index already serves it as a prefix.** Adding `(a)` when `(a, b)` exists buys
  nothing for filtering on `a`; check the existing set before adding.
- **The real fix is elsewhere** — the statement is issued N times (`orm-fetch-and-batching-performance`),
  or the result should have been cached (`caching-strategies`).

## Removing one

Indexes accumulate and are rarely deleted, because deletion feels riskier than addition. It is
not free to keep them: every one is maintained on every write.

Before removing, establish that nothing uses it — most engines expose per-index usage counters —
and that it is not the one enforcing a uniqueness constraint. Then remove it in a change that can
be reverted on its own, and watch the plans for the statements that touched the table.
