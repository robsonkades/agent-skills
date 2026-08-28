# What Each Pattern Costs

The cost of an architectural pattern is knowable before it is written. This is the
arithmetic.

## Fetching and the N+1

| Shape                                              | Queries for a page of 25 orders with 4 lines each |
| -------------------------------------------------- | ------------------------------------------------- |
| Lazy association traversed per row                 | 1 + 25 = 26                                       |
| Lazy association plus a lazy customer per row      | 1 + 25 + 25 = 51                                  |
| `join fetch` / entity graph                        | 1 (with row multiplication: 100 rows returned)    |
| Batch fetching (`@BatchSize(25)`)                  | 1 + 1 = 2                                         |
| Subselect fetching                                 | 1 + 1 = 2                                         |
| Projection selecting exactly the displayed columns | 1                                                 |

Three things this table makes clear. Batch and subselect fetching are usually the best
default for collections — they keep the query count constant without the cartesian product
that `join fetch` on two collections produces. `join fetch` on **two** collections
multiplies rows (4 lines × 3 payments = 12 rows per order) and is the standard cause of a
"fix" that made things slower. And a projection wins whenever the screen does not need the
entities at all, which is most screens.

**Pagination plus `join fetch` on a collection is a trap**: the ORM cannot apply the limit
in SQL without breaking the result, so it fetches everything and paginates in memory,
usually with a warning nobody reads. Paginate the roots, then batch-fetch the children.

## Identity map and persistence context

An identity map turns repeated loads of the same row into one query — free within a
transaction, and easy to mistake for a general cache. The costs:

- **Growth.** A batch loading 100 000 entities in one persistence context holds them all;
  dirty checking then scans every one on every flush, making flush cost quadratic in
  practice. `clear()` between chunks, or use a stateless session.
- **Flush before query.** The ORM flushes pending changes before a query that might touch
  them, so a write inside a loop that also queries produces a flush per iteration.
- **Not a cache across transactions.** The first-level map dies with the transaction; a
  second-level cache is a separate decision with invalidation and staleness costs
  (`caching-strategies`).

## Inheritance mapping

| Strategy                   | Read one subtype          | Polymorphic read      | Write     | Schema cost                        |
| -------------------------- | ------------------------- | --------------------- | --------- | ---------------------------------- |
| Single table               | 1 query, no join          | 1 query               | 1 insert  | Nullable columns for every subtype |
| Class table (joined)       | 1 query, N joins by depth | 1 query, all joins    | N inserts | Normalised, constrained            |
| Concrete table (per class) | 1 query, no join          | UNION over all tables | 1 insert  | Duplicated columns, no shared FK   |

Single table is fastest to read and weakest on constraints; joined is the reverse. The
decision is usually settled by whether the subtypes' required columns can be enforced by
the database — which single table cannot do without triggers or check constraints
(`inheritance-mapping-strategies`).

## Aggregate size

An aggregate costs its boundary on every write, because the invariant is checked over
loaded state.

```text
Order with ≤ 50 lines             4 queries, ~20 ms      fine
Order with unbounded history      grows with tenure      passes tests, fails for your
                                                          largest customer
Warehouse containing all stock    one lock for all       serialises every movement
```

Rule of thumb worth applying literally: an aggregate must load in a fixed number of queries
with a bounded number of rows. When an invariant appears to need an unbounded collection,
it is nearly always expressible as a maintained derived value on the root — a running
total, a count, a last-event timestamp (`domain-logic-organization`).

## Mapping layers

Each mapping layer costs allocation and CPU, not round trips. Concretely, on a 25-row page
with 20 fields per row, one mapping pass is a few thousand small allocations — negligible.
Four passes (row → entity → domain → DTO → JSON) is still small per request and becomes
visible only at high throughput, mostly as allocation rate and GC pressure
(`allocation-profiling`).

The honest conclusion: **do not remove a mapping layer for performance without a
measurement.** Remove it because it has no purpose (`enterprise-architecture-smells`). The
exception is bulk paths — an export of a million rows through four mapping layers is a real
cost, and there the answer is to bypass the layers with a streaming projection rather than
to redesign them.

## Remote calls

| Shape                                         | Cost                                              |
| --------------------------------------------- | ------------------------------------------------- |
| One coarse call per use case                  | 1 round trip                                      |
| Fine-grained calls ported from a local design | one per property access — the remote N+1          |
| Fan-out of N independent calls, sequential    | sum of latencies                                  |
| Fan-out of N independent calls, parallel      | max, but the p99 of a max over N grows with N     |
| Local replica updated by events               | 0 on the read path; storage and staleness instead |

The remote N+1 is the same defect as the database one and is harder to see, because each
call looks reasonable in isolation. Budget remote calls per request exactly as you budget
queries (`distribution-boundaries`).

## Locking

| Choice                                    | Throughput cost                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Optimistic version on an aggregate        | none until a conflict; conflicts cost a retry or a user round trip      |
| Coarse-grained lock on a hot aggregate    | writers serialise; throughput is 1 / (transaction duration)             |
| `SELECT ... FOR UPDATE` inside a short tx | brief serialisation of one row; usually fine                            |
| Pessimistic lock held across requests     | correct only as a lock record, never as a held transaction              |
| Bulk update over a large table            | lock escalation; blocks unrelated work; also defeats optimistic locking |

The arithmetic for a serialised hot row is worth stating: at a 20 ms transaction, one row
supports about 50 writes/second, whatever the hardware. If the requirement exceeds that,
the aggregate boundary is the problem, not the lock (`offline-concurrency-control`).

## Transactions and connections

`connections = arrival_rate × transaction_duration`. Any pattern that lengthens the
transaction multiplies the connection requirement:

- Open Session In View: transaction ≈ request duration, including serialisation.
- Remote call inside the boundary: transaction ≥ the remote p99.
- Lazy loads during rendering: transaction extends into the view layer.
- Per-item transactions in a batch: correct, and each is short.

## Reads through the write model

The single most common architectural performance defect after N+1: a list screen or report
loading aggregates to display a handful of columns.

```text
Report of 500 orders through the domain model
    500 aggregate loads × 4 queries        = 2 000 queries
    500 × 60 objects hydrated              = 30 000 objects, most discarded

Same report as a projection
    1 query, 500 rows, 6 columns
```

The fix is not to make the aggregate cheaper; it is to stop using it for reads. Reads and
writes may legitimately use different models, and this is where that principle pays
(`query-objects-and-specifications`, `layering-and-boundaries`).
