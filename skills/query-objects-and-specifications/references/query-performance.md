# Query Performance and Result Shape

## Result shape decides more than the mechanism

For a list screen of 25 orders, lazy entity traversal can cause N+1 selects; fetch joins
may reduce round trips but multiply rows. A flat scalar DTO can avoid managed-entity
hydration, while interface/nested/open projections can have different query and loading
behavior. Measure the selected projection rather than equating "projection" with one query.

```java
// Partial JPQL scalar DTO projection; Page may also execute a count query.
public record OrderSummary(Long id, OrderStatus status, Instant placedAt,
                           BigDecimal total, String customerName) { }

@Query("""
    select new com.acme.orders.OrderSummary(o.id, o.status, o.placedAt,
                                            o.total.amount, c.name)
      from Order o join o.customer c
     where o.status = :status
    """)
Page<OrderSummary> summaries(@Param("status") OrderStatus status, Pageable page);
```

Here `o.status` is an `OrderStatus`, so the constructor component must match; a raw SQL
string result needs an explicit conversion or a separate DTO contract. This snippet omits
application authorization for focus; real data and count queries must apply the trusted
scope described in the composition reference.

A DTO made only of scalar/immutable values cannot lazy-load an entity during serialization.
Nested projections or DTOs containing entity references do not provide that guarantee.
Avoiding entity hydration can reduce context overhead; it does not establish total query cost.

**When entities are still right:** the write path, where the aggregate's behaviour and its
invariants are needed. Entities can also be appropriate for bounded read use cases that need
their behavior; projection versus entity is a workload and lifecycle decision (`repository-pattern`).

## Counting and existence

```java
// Wrong: loads every row to count it.
long overdue = orders.findByStatus(OVERDUE).size();

// Wrong: loads a row to prove one exists.
boolean any = orders.findByCustomerId(id).isEmpty() == false;

// Right.
long overdue = orders.countByStatus(OVERDUE);
boolean any = orders.existsByCustomerId(id);
```

`Page` generally needs a count, but Spring Data can skip it when the total is inferable.
`Slice` commonly requests `size + 1` to detect continuation without total counting. Verify
the executor and result shape; content/count must preserve identical filters and scope.
Even matching predicates may see different database states without a suitable snapshot.

## Pagination at depth

Deep OFFSET often requires producing and skipping many qualifying rows; first-page work
is not free either. Actual work depends on the plan, filters, indexes and visibility.

```sql
-- Offset pagination: cost grows with the page number.
SELECT ... FROM customer_order ORDER BY placed_at DESC, id DESC OFFSET 500000 ROWS FETCH NEXT 25 ROWS ONLY;

-- PostgreSQL-style row comparison; efficient seek depends on the full plan/filter/index.
SELECT ... FROM customer_order
 WHERE (placed_at, id) < (:lastPlacedAt, :lastId)
 ORDER BY placed_at DESC, id DESC
 FETCH NEXT 25 ROWS ONLY;
```

Keyset pagination requires a stable, unique sort key — hence the `id` tiebreaker — and it
gives up direct arbitrary-page jumps. This example assumes non-null keys and matching
comparison/order directions. Mutable sort keys or concurrent inserts can still change the
traversal: define snapshot or live-view semantics and keep filter/scope fixed in the cursor.
Do not promise constant cost from one index declaration; verify rows examined and plans.
Choose from required navigation, consistency and actual depth.

## What composition does to plans

A dynamically composed query produces different SQL per filter combination, with three
consequences worth knowing:

- **Plan cache pressure.** Many distinct statement shapes means many plans. Bound the
  combinations where possible.
- **Parameter sniffing.** One plan cached for a selective parameter can be reused for an
  unselective one, and vice versa; a query that is fast for one customer and slow for
  another is a clue, not a diagnosis; cardinality, data skew or different work may explain it.
- **Index coverage varies by combination.** An index on `(status, placed_at)` serves the
  status+date filter and not the customer+total filter. Enumerate the combinations users
  actually use and index for those, rather than adding an index per column.

A dominant combination deserves its own named statement, tuned and indexed, with the general
composed query serving the rest.

## Fetching and the aggregate

A report that lazily traverses several relationships may execute hundreds of statements.
A projection, batching or a suitable fetch plan can change that count; there is no universal
"500 aggregates = 2,000 queries" law. Compare returned bytes, row multiplication, hydration,
latency and correctness rather than forcing every read around the domain model
(`architecture-and-performance`).

## Streaming large results

For a read-only export, prefer scalar projection streaming or bounded keyset chunks where
they fit the database/driver. A Java `Stream` return type or positive fetch size alone does
not prove server-side streaming or bounded driver buffering. Check transaction/autocommit,
cursor/fetch behavior, buffering and cancellation on the actual stack.

Close the stream with try-with-resources and complete consumption inside the intended
transaction/session. Entity streams can retain managed instances; bounded processing or
careful context clearing may be needed. Do not flush pending changes in a transaction marked
read-only and assume they persist: provider flush-mode/read-only optimizations can prevent
dirty tracking, and database read-only transactions can reject writes.

For archiving that writes, design explicit write transactions or bounded chunks instead.
Do not mutate the cursor's filtering/sort columns without a traversal plan; define retries,
progress checkpoints and external-effect idempotency. Test failure cleanup and connection
release, not just the happy-path row count.

## The query budget test

Use integration cases with controlled fixtures, cleared context/cache policy and a scoped
statement counter; background queries must not pollute it. These are recipes, not executed
tests:

- Seed one order with two matching child rows and another with separately matching children.
  Assert the requested same-child versus any-child semantics, unique root results and total
  count. Two to-one joins need not change counts, so inspect emitted SQL as well.
- Test absent filters, empty sort, both directions, equal sort values, both date boundaries
  (including a zone transition), mixed currencies and empty authorization scope.
- Seed another tenant and an unauthorized customer that match a user OR clause. Assert no
  data, count, existence or export path leaks them; user NOT must not negate mandatory scope.
- For paging, assert deterministic order and page traversal on a fixed fixture. Distinguish
  a List content-query budget from Page content-plus-count and Slice continuation behavior.
- For streaming/chunks, abort during processing and verify resources are released and restart
  behavior meets the operation's contract.

Keep query-count expectations tied to the chosen API, cache state and provider. Counts alone
do not expose an incorrect predicate or guarantee an efficient query plan.

Sources: [Spring Data projections](https://docs.spring.io/spring-data/jpa/reference/repositories/projections.html),
[Spring Data query methods](https://docs.spring.io/spring-data/commons/reference/repositories/query-methods-details.html)
and [PostgreSQL 17 LIMIT/OFFSET](https://www.postgresql.org/docs/17/queries-limit.html).
