# Composite index derivation

## Translate a query into index roles

For each query, list columns in five independent roles:

1. equality predicates and equality joins;
2. range predicates (`>`, `<`, `BETWEEN`, prefix `LIKE`);
3. requested ordering and limit;
4. projection-only columns;
5. expressions or conversions that prevent direct navigation.

The starting candidate is `(equality-prefix..., chosen-range-or-order...)`, with projection-only
columns included outside the key where the engine supports it. This is a candidate, not a mnemonic:
validate it against the whole workload and the executed plan.

## Why the first range changes everything

After the first range, following key columns generally no longer narrow one contiguous interval.
They may still be checked inside the index or cover the query, but they do not provide the same
navigation. If a date range precedes `tenant_id`, the engine can scan every tenant in the date
interval and apply tenant as a residual predicate.

That is the baseline scan shape, not a rule that later columns are useless. PostgreSQL 18
B-tree skip scans may reposition repeatedly using later constraints, even after a range;
profitability depends on prefix cardinality and cost. An `Index Cond` can also check entries
without proportionally shortening the traversed range. Use actual buffers/rows and searches
where exposed; do not classify navigation solely from a plan label.

Estimate the amplification from a missed predicate as roughly:

```text
entries scanned / entries required ≈ 1 / P(missed predicate | scanned interval)
```

This estimate assumes the chosen interval is scanned in full and the missed predicate is the
remaining filter; LIMIT early exit, correlations and skip scans change it. A global frequency
is only a substitute when independence is supported. For example, 1% globally but 50% inside
the date interval predicts about 2× amplification for that interval, not 100×. Use measured
tail parameters and avoid division by zero when no rows qualify.

## Equality-column order

For equality predicates all supplied together, selectivity alone usually does not change the final
interval. Order from:

- which leading prefixes other frequent queries can reuse;
- whether the index must supply an ordering;
- engine-specific skip scan, compression/deduplication, and statistics behavior;
- tenant isolation or lock-range behavior demonstrated by the plan;
- stable uniqueness requirements.

Do not claim the least- or most-cardinal column always belongs first.

## Range versus ordering

When filtering a range on one column and ordering by another:

- an index led by the range can reduce entries examined but may require a sort;
- an index led by ordering can stop early under a small `LIMIT`, but may examine many rejected rows;
- without a tight limit, compare range selectivity against sort, lookup and traversal costs;
- a tight limit favors order when target rows occur early, but skew and residual filters can
  remove that advantage. Neither key order guarantees the cheapest plan.

Test the most selective and least favorable parameters, not only the median.

Check scan direction before adding a second ordering index. In PostgreSQL 18, a B-tree on
`(a ASC, b ASC)` can supply `(a DESC, b DESC)` by scanning backward; it does not supply the
general mixed order `(a ASC, b DESC)` without additional sorting or a suitable mixed-direction
index. Reversal also changes null placement. Compare the complete ordering, collation and plan.
Columns fixed to one equality value can be omitted from the required sort order; an `IN` list
with multiple possible matches or a range spanning multiple values does not establish that.
Validate the corresponding engine/version's scan
capabilities and costs rather than treating every direction change as a new index requirement.

## Coverage

Coverage is valuable when it avoids many random lookups, not merely because a column can be added.
Estimate leaf bytes times row count and write frequency against lookups avoided times query
frequency. Keep explicit projections: `SELECT *` makes coverage fragile and silently loses it after
a schema addition.

## Source

- [PostgreSQL 18 multicolumn B-tree navigation and skip scan](https://www.postgresql.org/docs/18/indexes-multicolumn.html)
- [PostgreSQL 18 index scan direction and ordering](https://www.postgresql.org/docs/18/indexes-ordering.html)
