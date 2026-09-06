# Lazy Load

## What actually happens

A lazy association may use a proxy, collection wrapper or bytecode enhancement. Access to
uninitialized state can initialize it; exact triggers depend on mapping, provider, cache
and enhancement. The following illustrates cold, uninitialized associations without batching:

```java
Order order = em.find(Order.class, id);      // 1 query
order.getId();                                // no query — the proxy knows it
order.getCustomer().getName();                // ← query 2, here, invisibly
order.getLines().size();                      // ← query 3
```

The query can happen at a **getter**, can fail without a usable session, and can grow with
loop size. Initialized associations, shared targets, caches and batching change query counts.

## The four fetch strategies

| Strategy                  | How                                          | Queries for 25 orders + lines          | Failure shape                                                       |
| ------------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Lazy, traversed           | default mapping                              | 26                                     | N+1                                                                 |
| Eager mapping             | `fetch = EAGER`                              | Join or secondary selects              | EAGER requires availability, not a particular SQL shape             |
| Fetch join / entity graph | `join fetch`, `@EntityGraph`                 | Join often 1; graph provider-dependent | Collection row multiplication and pagination risks                  |
| Batch / subselect         | `@BatchSize(size = 25)`, `@Fetch(SUBSELECT)` | Often 2 for this cold fixture          | Loading unneeded children, parameter limits and context eligibility |

**Do not set `EAGER` in the mapping to fix an N+1.** It is a global decision made for one
call site: every other query loading that entity now joins or issues extra selects,
including ones that never touch the association. `EAGER` on a `@ManyToOne` is occasionally
defensible; on a collection it is almost never right.

Use conservative mapping defaults and explicit use-case fetch plans. Choose batch size from
actual traversal, child cardinality and database limits; no fetch strategy wins universally.
Counts above exclude pagination count queries and other eager associations.

## Pagination and fetch joins do not mix

```java
@Query("select o from Order o join fetch o.lines")
Page<Order> findAllWithLines(Pageable pageable);   // partial: collection-fetch pagination risk
```

Applying `LIMIT` to a joined result would cut lines, not orders, so the ORM fetches the
whole result set and paginates in the application in affected Hibernate configurations.
It may instead fail when `hibernate.query.fail_on_pagination_over_collection_fetch=true`;
Spring Data count-query derivation can also fail. Inspect generated SQL and configuration.
To-one fetch joins do not inherently have this collection-multiplication problem.

Correct shapes:

```java
// 1. Page roots, then batch-load children; include a possible Page count query in the budget.
Page<Order> page = orders.findAll(pageable);
page.getContent().forEach(o -> o.getLines().size());

// 2. Two-step: page the ids, then fetch the graph for those ids.
List<Long> ids = orders.findIdsPage(pageable);
List<Order> loaded = orders.findWithLinesByIdIn(ids);

// 3. Best, when the screen does not need entities: a projection.
Page<OrderSummary> summaries = orders.findSummaries(pageable);
```

For two-step loading, handle empty IDs, preserve the original stable page order explicitly
(IN does not order results), and decide consistency under concurrent changes between queries.

Also: `join fetch` on **two** collections produces a cartesian product (4 lines × 3
payments = 12 rows per order) or fails for multiple bags in Hibernate. Fetch one collection
per query, or use batch fetching.

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
keeps the persistence context open through rendering. It can hide the missing fetch plan and:

- extends the persistence context, not necessarily the database transaction or one connection;
  lazy queries during rendering can incur connection churn and inconsistent snapshots
  (`architecture-and-performance`);
- permits N+1 during view rendering unless the query budget includes that phase;
- hides the design question of what the endpoint's data requirements actually are.

Inspect Spring Boot's applicable Servlet/JPA auto-configuration and effective
`spring.jpa.open-in-view` setting. If removing OSIV, first supply explicit fetch/DTO plans
and test rendering; do not treat switching the property alone as the completed fix.

## Lazy loading across boundaries

- **Serialisation.** Jackson touching a lazy proxy either triggers a query or fails. Neither
  is acceptable in an API response. Do not serialise entities.
- **Caching.** A cached entity carries dead proxies. Cache DTOs (`caching-strategies`).
- **Sessions.** Same problem, plus a class-shape compatibility contract across deploys
  (`session-state-strategies`).
- **Threads and virtual threads.** Spring's ordinary transaction context is thread-bound;
  an entity can still retain a reference to its original session. That does not make
  cross-thread access safe: EntityManager/Session are not generally thread-safe. Pass IDs
  and load in the receiving unit of work; do not assume handoff always throws an exception.
- **Remote calls.** A DTO assembled inside the transaction is the boundary; the lazy graph
  must not be part of the wire contract (`distribution-boundaries`).

## Detecting N+1 before production

```java
@Test
void order_list_does_not_n_plus_one() {
    var stats = sessionFactory.getStatistics();
    assertThat(stats.isStatisticsEnabled()).isTrue();
    stats.clear();
    orderQueries.listSummaries(PageRequest.of(0, 25));
    assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(2);
}
```

Enable statistics for this isolated test; SessionFactory counters are shared, so concurrent
tests can contaminate them. Seed enough distinct roots/children, clear the persistence context
and control second-level/query caches before measuring. Exercise the actual traversal or
serialization and assert returned data too: zero queries from an empty fixture is not success.
Derive the budget (including count queries) from that fixture and compare multiple page sizes
to expose query growth. Query-count tests complement SQL inspection and load tests.
