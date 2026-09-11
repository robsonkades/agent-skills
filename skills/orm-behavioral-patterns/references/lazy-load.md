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

**Changing to `EAGER` alone does not fix a query budget.** It changes the default loading
obligation for entity-loading paths and can still use secondary selects. Scalar projections
do not require that graph; fetch graphs can change the requested fetch plan, subject to provider
behavior. Retain an intentional, bounded eager relationship when its callers need it and the
observed loading contract is adequate; otherwise prefer a local fetch plan.

Use conservative mapping defaults and explicit use-case fetch plans. Choose batch size from
actual traversal, child cardinality and database limits; no fetch strategy wins universally.
Counts above exclude pagination count queries and other eager associations.

## Pagination over collection fetch joins needs a verified plan

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

// 3. A projection, when its data and ownership contract fit the screen.
Page<OrderSummary> summaries = orders.findSummaries(pageable);
```

For two-step loading, handle empty IDs, preserve the original stable page order explicitly
(IN does not order results), and decide consistency under concurrent changes between queries.

Fetching **parallel** to-many associations can produce a cartesian product (4 lines × 3
payments = 12 rows per order). A nested chain, such as order → lines → adjustments, has a
different cardinality shape; two collection joins do not by themselves prove a sibling product.
Hibernate also rejects some multiple-bag fetch shapes. Inspect topology, collection semantics
and returned row volume; fetch one collection at a time or batch when the measured expansion
is excessive. A verified bounded join need not be split solely because it has two collections.

## LazyInitializationException

```text
org.hibernate.LazyInitializationException: could not initialize proxy - no Session
```

It means an initialization request could not use the required session. In Hibernate 6.6.56,
the proxy path distinguishes no session, a closed owning session and a disconnected owning
session. Detaching a proxy/collection can cause failure even while another transaction is
active. Trace the failing object's loaded state, owning context, detach/close/disconnect and
thread history; location is a clue, not proof that every transaction ended.

| Where                                       | What to inspect                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| JSON serialisation of a controller response | Serializer traversal, loaded state and context lifetime; fetch/map the required result before handoff                |
| A scheduled job or a message consumer       | That entity's context/state and the work's actual transaction; reload/fetch in the owning unit of work               |
| A test outside `@Transactional`             | Whether its loading and context/cache lifetime reproduce the real caller contract                                    |
| A `@Async` method receiving an entity       | Original wrapper/session/thread ownership and the receiving unit of work; pass IDs and reload when ownership changes |

**Choose a remedy for the actual ownership and data requirements:**

1. **Fetch what the caller needs inside the boundary** — an entity graph or a fetch join on
   the specific query.
2. **Map the needed initialized state to a DTO or projection in the boundary** when a stable
   payload or independently owned snapshot is required. Merely wrapping managed entities in
   a DTO does not remove their lazy behavior. This can reduce serialization coupling
   (`remote-facade-and-dto`).
3. **Adjust the loading/context boundary deliberately** if the use case owns the longer
   lifetime. Reload a detached input in the receiving unit of work where appropriate;
   increasing an unrelated transaction's lifetime does not reattach its old proxy.

**Open Session In View requires an explicit rendering contract.** It keeps the persistence
context open through rendering. Enabling it just to suppress an exception can hide a missing
fetch plan and:

- extends the persistence context, not necessarily the database transaction or one connection;
  lazy queries during rendering can incur connection churn and inconsistent snapshots
  (`architecture-and-performance`);
- permits N+1 during view rendering unless the query budget includes that phase;
- hides the design question of what the endpoint's data requirements actually are.

Inspect Spring Boot's applicable Servlet/JPA auto-configuration and effective
`spring.jpa.open-in-view` setting. If removing OSIV, first supply explicit fetch/DTO plans
and test rendering; do not treat switching the property alone as the completed fix. An
intentional existing OSIV design can remain when its query budget, transaction/consistency
expectations, connection lifecycle and serialization exposure are adequate and verified.

## Lazy loading across boundaries

- **Serialisation.** Traversing uninitialized state can query or fail; initialized or omitted
  state need not. Define an allowlisted output shape, loaded-state and no-unplanned-SQL
  contract, including cycles and sensitive fields. DTOs/projections often simplify it; a
  tested bounded entity representation is not intrinsically invalid.
- **Caching.** Do not share a live mutable managed graph as an independently owned cache
  value. A detached entity snapshot or DTO still needs loaded-state, mutation, freshness and
  invalidation contracts; a DTO containing entities can retain lazy dependencies
  (`caching-strategies`).
- **Sessions.** Define the same ownership/loading rules plus class-shape compatibility across deploys
  (`session-state-strategies`).
- **Threads and virtual threads.** Spring's ordinary transaction context is thread-bound;
  an entity can still retain a reference to its original session. That does not make
  cross-thread access safe: EntityManager/Session are not generally thread-safe. Pass IDs
  and load in the receiving unit of work; do not assume handoff always throws an exception.
- **Remote calls.** Define the wire data and compatibility contract explicitly. An unresolved
  lazy graph must not make remote correctness depend on the sender's persistence context
  (`distribution-boundaries`).

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

Primary provider contracts: [Hibernate 6.6.56 proxy initialization](https://github.com/hibernate/hibernate-orm/blob/6.6.56/hibernate-core/src/main/java/org/hibernate/proxy/AbstractLazyInitializer.java),
[fetch topology](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/querylanguage/From.adoc)
and [fetching guide](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/fetching/Fetching.adoc).
These explain the checked provider line; inspect the project's resolved versions and configuration.
