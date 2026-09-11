# Query shapes that fight the optimiser

Shapes to inspect when the current path is inadequate. A semantics-preserving rewrite, a suitable
expression/index path or keeping an already adequate query can each be the supported answer.

## A function or cast on the column side

A plain index may not support seeking on a transformed expression. Optimizer rewrites,
expression indexes and engine-specific conversions are exceptions; inspect the access condition.

```sql
-- may prevent a range seek on a plain created_at index
WHERE date(created_at) = '2026-08-28'
-- range candidate; bind typed boundaries with the same time-zone/date meaning
WHERE created_at >= '2026-08-28' AND created_at < '2026-08-29'

-- may need an expression index rather than a plain email index
WHERE lower(email) = ?
-- usable: index the expression, or store the normalised value
```

Two legitimate answers when the transformation is genuinely part of the predicate: an
**expression index** on `lower(email)` where the engine supports one, or storing the normalised
value in its own indexed column. Both are deliberate; neither is "add an index on email".
Preserve collation/normalization and null semantics. For timestamps with time zones, derive both
local-day boundaries in the intended zone; a DST day need not be 24 hours. Do not replace date
extraction with arbitrary UTC midnights or add 24 elapsed hours without proving equivalence.

## Implicit conversion

The subtler form of the same defect, and harder to see because nothing in the SQL looks
transformed. When a column and a parameter have different types, one side may be converted. Which
side follows the engine's type-precedence, collation, and coercion rules; a column-side conversion
can prevent use of the stored index expression, but inspect supported transformations/access paths
before diagnosing a defect.

```sql
-- account_number is VARCHAR, the parameter binds as a number
WHERE account_number = 4815162342     -- conversion direction or type error is engine-specific
```

A resulting scan is one possible symptom, not proof of conversion. Check the bound
parameter's type against the column type; in JDBC that means checking what `setObject` /
`setLong` / `setString` actually sent, not what the entity field looks like.

## Pagination that degrades with depth

`LIMIT m OFFSET n` logically skips `n` rows before returning `m`. The work usually grows with offset
depth; an index can avoid sorting or table lookups but does not give SQL permission to return rows
without locating/skipping the preceding logical positions.

**Keyset (seek) pagination** carries the last row's ordering key forward. Partial PostgreSQL-style
SQL below assumes non-null `created_at`/`id`, a unique pair within tenant, and the same filters
and sort directions on every page. Bind cursor values with their original types:

```sql
-- page 1
SELECT ... FROM orders WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 50;
-- next page, with the last row's (created_at, id)
SELECT ... FROM orders
WHERE tenant_id = ? AND (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC LIMIT 50;
```

A suitable executed index path can avoid rescanning prior offsets; residual filters, visibility checks or joins
can still examine more than a page. Nullable/mixed-direction sorts need explicit cursor predicates;
row-value comparisons and LIMIT syntax are not portable to every engine. What it gives
up: jumping to an arbitrary page number and snapshot-like navigation under concurrent inserts or
updates unless the application carries an appropriate consistency boundary. A stable total count
is separate. These are product decisions rather than requirements — and the total count is
frequently the more expensive half of the original query anyway.

If arbitrary page jumps are required, a cheaper total count alone does not implement them.
Consider bounded OFFSET, cached/materialized page anchors or a snapshot result set, preserving the
navigation contract. Approximate/capped totals separately change what the UI can claim.

## `OR` across different columns

`WHERE a = ? OR b = ?` may scan, combine indexes or use other engine-specific paths. A union rewrite
is a candidate only after measurement and a multiplicity proof: `UNION` removes duplicates of
projected values even when they came from different rows; `UNION ALL` duplicates rows matching
both branches. One disjoint form is branch `p` UNION ALL branch `q AND p IS NOT TRUE`, with identical
projection, base relation and filters. Preserve SQL null logic, ordering/LIMIT and volatile
expression behavior; do not use `NOT p` as a substitute when p can be unknown.

## Leading wildcards

`LIKE '%term%'` generally lacks a selective B-tree prefix range, although a covering index scan
may still help. A prefix pattern can seek only with suitable collation/operator rules. Consider
engine-specific trigram/substring indexes or search tooling where needed. Full-text token/stemming
semantics are not equivalent to arbitrary substring matching; preserve the search contract.

## `SELECT *` on a wide table

Three possible costs: a previously covering index stops covering,
more bytes cross the network per row, and the ORM materialises columns nobody reads. These can
explain a slowdown after adding a column, but the schema change alone does not establish that cause.

## `NOT IN` with a nullable subquery

If the subquery contains null, `NOT IN` cannot be true for a nonmatching x; a matching x yields
false. A correlated `NOT EXISTS` may instead keep that row, and can keep an outer null that
`NOT IN` rejects against a nonempty set. Neither spelling is universally the intended contract or
faster. Define null policy and test matching/nonmatching/null x with empty, null and duplicate
subquery rows before rewriting. Use an anti-join only when its semantics match the requirement.
For an empty subquery, `NOT IN` is true even for an outer null; do not silently lose that case.

## Counting to decide

When precise selectivity is needed and affordable, these two counts can characterize it:

```sql
SELECT count(*) FROM t;                    -- the table
SELECT count(*) FROM t WHERE <predicate>;  -- what the predicate keeps
```

Use a consistent population/snapshot, handle an empty table and bound diagnostic cost. Statistics,
sampling and existing actuals may suffice; the ratio alone does not select a plan or prove a rewrite.

Sources: [PostgreSQL 17 null/subquery semantics](https://www.postgresql.org/docs/17/functions-subquery.html),
[PostgreSQL 17 EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).
