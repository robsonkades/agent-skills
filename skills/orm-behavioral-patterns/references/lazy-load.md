# Lazy Load

## What actually happens

A lazy association is a proxy: a subclass instance (or a wrapper collection) holding the
identifier and a reference to the session. The first call to anything but the identifier
getter triggers a SELECT.

```java
Order order = em.find(Order.class, id);      // 1 query
order.getId();                                // no query — the proxy knows it
order.getCustomer().getName();                // ← query 2, here, invisibly
order.getLines().size();                      // ← query 3
```

Three consequences that produce most lazy-loading bugs: the query happens at a **getter**,
which no reviewer reads as I/O; it happens **only if the session is still open**; and in a
loop it happens **once per iteration**.

## The four fetch strategies

| Strategy                  | How                                          | Queries for 25 orders + lines | Failure shape                                              |
| ------------------------- | -------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| Lazy, traversed           | default mapping                              | 26                            | N+1                                                        |
| Eager mapping             | `fetch = EAGER`                              | 1 (joined) but always         | Every use case pays, including those that do not need it   |
| Fetch join / entity graph | `join fetch`, `@EntityGraph`                 | 1                             | Row multiplication with two collections; breaks pagination |
| Batch / subselect         | `@BatchSize(size = 25)`, `@Fetch(SUBSELECT)` | 2                             | Extra query; almost always the best default                |

**Do not set `EAGER` in the mapping to fix an N+1.** It is a global decision made for one
call site: every other query loading that entity now joins or issues extra selects,
including ones that never touch the association. `EAGER` on a `@ManyToOne` is occasionally
defensible; on a collection it is almost never right.

The best default in practice: **lazy in the mapping, `@BatchSize` on collections, and an
explicit fetch join or entity graph on the specific query that needs the graph.**

## Pagination and fetch joins do not mix

```java
@Query("select o from Order o join fetch o.lines")
Page<Order> findAllWithLines(Pageable pageable);   // ← Hibernate logs a warning and
                                                    //   paginates in memory
```

Applying `LIMIT` to a joined result would cut lines, not orders, so the ORM fetches the
whole result set and paginates in the application. On a large table this loads everything
into heap.

Correct shapes:

```java
// 1. Page the roots, then batch-load children (with @BatchSize this is 2 queries).
Page<Order> page = orders.findAll(pageable);
page.getContent().forEach(o -> o.getLines().size());

// 2. Two-step: page the ids, then fetch the graph for those ids.
List<Long> ids = orders.findIdsPage(pageable);
List<Order> loaded = orders.findWithLinesByIdIn(ids);

// 3. Best, when the screen does not need entities: a projection.
Page<OrderSummary> summaries = orders.findSummaries(pageable);
```

Also: `join fetch` on **two** collections produces a cartesian product (4 lines × 3
payments = 12 rows per order). Fetch one collection per query, or use batch fetching.

## LazyInitializationException

```text
org.hibernate.LazyInitializationException: could not initialize proxy - no Session
```

It means: something asked for data after the unit of work ended. Where it appears tells you
what was not planned.

| Where                                       | What is missing                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| JSON serialisation of a controller response | The entity is being used as the API payload; map to a DTO in the boundary     |
| A scheduled job or a message consumer       | The transaction ended before the work; wrap it or fetch eagerly for that path |
| A test outside `@Transactional`             | Same as production would be — the test is telling the truth                   |
| A `@Async` method receiving an entity       | Entities crossed a thread and a transaction; pass identifiers instead         |

**The three correct fixes**, in order of preference:

1. **Fetch what the caller needs inside the boundary** — an entity graph or a fetch join on
   the specific query.
2. **Map to a DTO or projection inside the transaction**, so nothing lazy escapes. This is
   the right answer for API responses and it also removes the serialisation coupling
   (`remote-facade-and-dto`).
3. **Extend the boundary deliberately** — a longer transactional method, not a global filter.

**The incorrect fix that is nevertheless the most popular:** Open Session In View, which
keeps the persistence context open until the response is written. It makes the exception go
away and:

- lengthens every transaction to the request's duration, holding a connection through
  serialisation (`architecture-and-performance`);
- converts a visible error into an N+1 that runs during view rendering, where no query
  budget is watching;
- hides the design question of what the endpoint's data requirements actually are.

Spring Boot enables it by default and logs a warning about it. Turn it off
(`spring.jpa.open-in-view=false`) and fix what breaks; each break is a genuine unplanned
fetch.

## Lazy loading across boundaries

- **Serialisation.** Jackson touching a lazy proxy either triggers a query or fails. Neither
  is acceptable in an API response. Do not serialise entities.
- **Caching.** A cached entity carries dead proxies. Cache DTOs (`caching-strategies`).
- **Sessions.** Same problem, plus a class-shape compatibility contract across deploys
  (`session-state-strategies`).
- **Threads and virtual threads.** The persistence context is bound to the thread and the
  transaction; handing an entity to another thread produces a proxy with no usable session.
  Pass identifiers and re-load.
- **Remote calls.** A DTO assembled inside the transaction is the boundary; the lazy graph
  must not be part of the wire contract (`distribution-boundaries`).

## Detecting N+1 before production

```java
@Test
void order_list_does_not_n_plus_one() {
    var stats = sessionFactory.getStatistics();
    stats.clear();
    orderQueries.listSummaries(PageRequest.of(0, 25));
    assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(2);
}
```

A query-count assertion on the endpoints that matter is the only reliable defence: an N+1
is functionally correct, so no behavioural test catches it, and it is invisible at the row
counts a development database holds.
