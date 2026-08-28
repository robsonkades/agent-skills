# Query shapes that fight the optimiser

Cases where the fix is the statement, not an index.

## A function or cast on the column side

An index stores the column's value. A predicate that transforms the column before comparing asks
a question the index cannot answer, so the engine falls back to evaluating the expression per
row.

```sql
-- not usable by an index on created_at
WHERE date(created_at) = '2026-08-28'
-- usable
WHERE created_at >= '2026-08-28' AND created_at < '2026-08-29'

-- not usable by an index on email
WHERE lower(email) = ?
-- usable: index the expression, or store the normalised value
```

Two legitimate answers when the transformation is genuinely part of the predicate: an
**expression index** on `lower(email)` where the engine supports one, or storing the normalised
value in its own indexed column. Both are deliberate; neither is "add an index on email".

## Implicit conversion

The subtler form of the same defect, and harder to see because nothing in the SQL looks
transformed. When a column and a parameter have different types, one side is converted — and the
rules usually convert the column.

```sql
-- account_number is VARCHAR, the parameter binds as a number
WHERE account_number = 4815162342     -- converts the column, per row
```

It appears in a plan as a scan on a table you were certain had a suitable index. Check the bound
parameter's type against the column type; in JDBC that means checking what `setObject` /
`setLong` / `setString` actually sent, not what the entity field looks like.

## Pagination that degrades with depth

`LIMIT m OFFSET n` produces and discards `n` rows before returning `m`. Page 1 is instant; page
5,000 reads everything before it. The cost is linear in the page number and no index removes it,
because the work is inherent to the offset.

**Keyset (seek) pagination** carries the last row's ordering key forward:

```sql
-- page 1
SELECT ... FROM orders WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 50;
-- next page, with the last row's (created_at, id)
SELECT ... FROM orders
WHERE tenant_id = ? AND (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC LIMIT 50;
```

Flat in page number, and it uses the composite index directly. What it gives up: jumping to an
arbitrary page number, and a stable total count. Both are usually product decisions rather than
requirements — and the total count is frequently the more expensive half of the original query
anyway.

If a page number is genuinely required, the honest options are an approximate count, a capped
count (`count` with a bound), or keeping the offset form and accepting the cost with a maximum
depth enforced.

## `OR` across different columns

`WHERE a = ? OR b = ?` cannot use a single composite index for both sides, so the engine either
scans or, where supported, evaluates each side separately and merges the results. When the merge
is not chosen and the scan is too slow, an explicit `UNION` of two single-column-indexed queries
is the rewrite — with `UNION ALL` plus a de-duplication only when the sides genuinely overlap.

## Leading wildcards

`LIKE '%term%'` cannot use a B-tree index, because the index is ordered by prefix. `LIKE
'term%'` can. If the requirement really is substring or word search, the answer is a full-text
index or a search engine, not a B-tree — and that is a design decision, not a tuning one.

## `SELECT *` on a wide table

Three separate costs, all of which people attribute elsewhere: the covering index stops covering,
more bytes cross the network per row, and the ORM materialises columns nobody reads. It is also
the reason a query gets slower after someone adds a column, with no change to the query.

## `NOT IN` with a nullable subquery

`x NOT IN (SELECT y FROM t)` evaluates to unknown — and therefore returns nothing — if any `y` is
null. This is a correctness trap first and a performance one second; `NOT EXISTS` is both correct
under nulls and usually planned better.

## Counting to decide

Before rewriting, get the two numbers that decide whether the shape is the problem at all:

```sql
SELECT count(*) FROM t;                    -- the table
SELECT count(*) FROM t WHERE <predicate>;  -- what the predicate keeps
```

Their ratio is the selectivity that `index-decisions.md` turns into a decision. A rewrite chosen
without it is a guess with more syntax.
