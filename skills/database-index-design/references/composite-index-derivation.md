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

Estimate the amplification from a missed predicate as roughly:

```text
entries scanned / entries required ≈ 1 / frequency(missed predicate value)
```

Use the tail parameter distribution, not an average. The same wrong order can be a 9× issue for a
large tenant and a 10,000× issue for a rare tenant.

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

- an index led by the range minimizes qualifying work but may require a sort;
- an index led by ordering can stop early under a small `LIMIT`, but may examine many rejected rows;
- without a tight limit, serving the range often wins;
- with a tight limit, serving order can win only if target rows occur early enough.

Test the most selective and least favorable parameters, not only the median.

## Coverage

Coverage is valuable when it avoids many random lookups, not merely because a column can be added.
Estimate leaf bytes times row count and write frequency against lookups avoided times query
frequency. Keep explicit projections: `SELECT *` makes coverage fragile and silently loses it after
a schema addition.
