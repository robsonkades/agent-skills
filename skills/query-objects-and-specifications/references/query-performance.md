# Query Performance and Result Shape

## Result shape decides more than the mechanism

For a list screen of 25 orders showing 6 columns:

| Shape                                 | Queries | Objects hydrated         | Notes                                                 |
| ------------------------------------- | ------- | ------------------------ | ----------------------------------------------------- |
| Entities, lazy associations traversed | 26+     | 25 aggregates            | N+1; the default outcome of "just use the repository" |
| Entities with a fetch join            | 1       | 25 aggregates + children | Row multiplication; still hydrates everything         |
| Interface or record projection        | 1       | 25 flat records          | What the screen actually needs                        |

```java
// A record projection: one query, exactly the columns, no persistence context growth.
public record OrderSummary(Long id, String status, Instant placedAt,
                           BigDecimal total, String customerName) { }

@Query("""
    select new com.acme.orders.OrderSummary(o.id, o.status, o.placedAt,
                                            o.total.amount, c.name)
      from Order o join o.customer c
     where o.status = :status
    """)
Page<OrderSummary> summaries(@Param("status") OrderStatus status, Pageable page);
```

Projections also keep the persistence context small, which keeps flush cheap
(`orm-behavioral-patterns`), and they cannot trigger a lazy load during serialisation,
which removes an entire class of production failure.

**When entities are still right:** the write path, where the aggregate's behaviour and its
invariants are needed. That is the distinction — entities for changing things, projections
for showing things (`repository-pattern`).

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

For paginated screens, note that `Page` issues a second count query on every request. Where
the total is not displayed, `Slice` avoids it entirely (it fetches `size + 1` rows to know
whether a next page exists) — a free saving on a hot list endpoint.

## Pagination at depth

`OFFSET n` makes the database read and discard `n` rows. At page 1 it is free; at offset
500 000 it reads half a million rows per request.

```sql
-- Offset pagination: cost grows with the page number.
SELECT ... FROM customer_order ORDER BY placed_at DESC OFFSET 500000 ROWS FETCH NEXT 25 ROWS ONLY;

-- Keyset pagination: constant cost, given an index on (placed_at, id).
SELECT ... FROM customer_order
 WHERE (placed_at, id) < (:lastPlacedAt, :lastId)
 ORDER BY placed_at DESC, id DESC
 FETCH NEXT 25 ROWS ONLY;
```

Keyset pagination requires a stable, unique sort key — hence the `id` tiebreaker — and it
gives up random page access. For infinite scroll, exports and APIs it is strictly better;
for a page-number UI over a small table, offset is fine. Decide by the table's size and the
depth users actually reach.

## What composition does to plans

A dynamically composed query produces different SQL per filter combination, with three
consequences worth knowing:

- **Plan cache pressure.** Many distinct statement shapes means many plans. Bound the
  combinations where possible.
- **Parameter sniffing.** One plan cached for a selective parameter can be reused for an
  unselective one, and vice versa; a query that is fast for one customer and slow for
  another is the signature.
- **Index coverage varies by combination.** An index on `(status, placed_at)` serves the
  status+date filter and not the customer+total filter. Enumerate the combinations users
  actually use and index for those, rather than adding an index per column.

A dominant combination deserves its own named statement, tuned and indexed, with the general
composed query serving the rest.

## Fetching and the aggregate

The most expensive query in a well-written domain model is often the one that did not need
the model at all:

```text
Report over 500 orders through the aggregate:  500 × 4 queries = 2 000
Same report as a projection:                   1
```

There is no fetch strategy that fixes this. The fix is not to use the write model for the
read (`architecture-and-performance`).

## Streaming large results

```java
@Query("select o from Order o where o.placedAt < :before")
Stream<Order> streamOlderThan(@Param("before") Instant before);

@Transactional(readOnly = true)
public void archive(Instant before) {
    try (Stream<Order> stream = orders.streamOlderThan(before)) {
        var counter = new AtomicInteger();
        stream.forEach(order -> {
            archive(order);
            if (counter.incrementAndGet() % 500 == 0) { em.flush(); em.clear(); }
        });
    }
}
```

Three requirements, all easy to miss: the stream must be closed (it holds a cursor and a
connection); it must run inside a transaction; and the persistence context must be cleared
periodically or the identity map holds every row streamed, defeating the point. For pure
export, a projection stream or plain JDBC with a fetch size is simpler and lighter.

## The query budget test

```java
@Test
void search_screen_is_one_query() {
    var before = statementCount();
    searchQuery.run(new OrderSearch(Optional.of(OPEN), empty(), empty(), empty(), empty()),
                    PageRequest.of(0, 25));
    assertThat(statementCount() - before).isEqualTo(1);
}

@Test
void composed_specification_does_not_duplicate_rows() {
    var spec = OrderSpecs.overdue(clock).and(OrderSpecs.premiumCustomer());
    assertThat(orders.count(spec)).isEqualTo(expectedDistinctOrders);   // catches double joins
}
```

The second test is the one that catches the specific defect composition introduces. A
duplicated join is functionally invisible when the caller only reads the first page, and it
corrupts every count and every aggregation (`architecture-testing`).
