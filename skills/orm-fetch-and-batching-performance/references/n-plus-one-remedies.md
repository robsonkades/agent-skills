# N+1 and its remedies

## Seeing it

Do not read the SQL log by eye for this. Count.

```properties
# Hibernate statistics — SessionFactory aggregate; diagnostic/test use
spring.jpa.properties.hibernate.generate_statistics=true

# the statements themselves, when you need to see which ones
spring.jpa.properties.hibernate.format_sql=true
logging.level.org.hibernate.SQL=DEBUG
```

Session metrics/logging can summarize an individual session, but the `Statistics` API below
aggregates the entire SessionFactory. Use an isolated test factory/no concurrent work, clear or
baseline it after setup, and specify cold versus warm first/second-level/query caches. This
partial Spring Data/AssertJ test assumes a fixture whose complete render path should prepare
two statements; two is not a universal page budget:

```java
var stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
stats.clear();
service.renderOrderPage(tenantId, PageRequest.of(0, 50));
assertThat(stats.getPrepareStatementCount()).isEqualTo(2);
```

That assertion is the regression test. `architecture-testing` covers making it a standing gate;
what matters here is that the number is asserted at all, because N+1 reappears the next time
someone touches a mapping.

**Statistics collection has a cost.** Do not enable it globally without evaluating that cost.

For production investigations, use existing scoped instrumentation or measure the overhead of
temporarily enabled statistics. Do not reset shared factory counters to measure one request.
Prepared statements, logical executions, JDBC batches and network round trips are different
quantities; `getQueryExecutionCount()` also omits some entity/collection loading activity.

## The two shapes

**Association N+1.** One query returns N roots; reading `order.getCustomer()` on each issues one
select per distinct uncached target when its non-id state is accessed. A proxy getter alone
need not initialize it. The log shows repeated statements differing in parameters.

**Collection N+1.** One query returns N roots; reading `order.getItems()` on each issues one
select per uninitialized collection when consumed, unless batching/cache changes the pattern.
Its cost depends on the number of returned children.

Lazy traversal is one trigger; eager secondary selects can also produce N+1. Identify the
actual fetching path rather than assuming that changing LAZY to EAGER removes it.

## Comparing mechanisms

| Mechanism                     | Statements                                           | Multiplies rows?                     | Pageable in SQL?                  | Use when                                          |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------ | --------------------------------- | ------------------------------------------------- |
| `JOIN FETCH`                  | Often 1; other eager state may add selects           | **yes**, for collections             | Verify collection paging          | Bounded association, managed entities needed      |
| Entity graph                  | Provider/fetch-plan dependent                        | Depends on SQL strategy              | Verify actual SQL                 | Attribute fetch plan without hardcoding joins     |
| Batch fetching (`@BatchSize`) | Ideally 1 + ceil(N/batch) per role                   | Avoids cross-collection join product | Root query can page               | Eligible pending associations in the same context |
| Subselect fetching            | Often root + one secondary query per collection role | Avoids cross-collection join product | Verify secondary owner set        | Most owners need the same collection role         |
| Scalar DTO projection         | Often 1                                              | Joins can multiply rows              | Verify desired root/row semantics | Read model needing selected values                |

### JOIN FETCH and entity graphs express related, not identical, fetch plans

`select o from Order o join fetch o.customer where …` requests a join in the query. An entity graph
selects attributes to fetch, while the provider retains latitude over the SQL strategy and
`fetchgraph` versus `loadgraph` changes how unspecified attributes are treated. Inspect generated
SQL instead of assuming that a graph is a textual join-fetch equivalent. Graphs are useful when the
same query needs named fetch plans without embedding them in JPQL.

Both are per-query. That is the whole point: the mapping stays `LAZY` and each query states what
it needs.

### The cartesian product

Join-fetching two to-many associations in one query can return the product of their sizes:

```java
// 10 items x 5 shipments = 50 rows, each repeating the order
select o from Order o join fetch o.items join fetch o.shipments where o.id = :id
```

Hibernate de-duplicates root identity in supported shapes, so the defect may be invisible in the
result and visible only in rows transferred. Multiple bags are rejected in common Hibernate
versions; other collection combinations can still execute with a Cartesian product. **Default to
one collection per query**, then relax only with bounded cardinalities and measured SQL. For the
second, use batch or subselect fetching, or a second query.

### Paginating a fetch

With a fetched collection, one entity is many rows, so `LIMIT` cannot express "50 orders".
Hibernate falls back to reading the whole result and paging in memory, and warns:

```
HHH90003004: firstResult/maxResults specified with collection fetch; applying in memory
```

That warning indicates root pagination is being applied after fetching the matching result.
For Hibernate 6.6 tests, `hibernate.query.fail_on_pagination_over_collection_fetch=true` can
turn this fallback into an error. A common alternative is two data queries:

```java
// Partial method returning List<Order>; run within the intended read transaction.
// 1. stable root-id page; id breaks ties in createdAt
List<Long> ids = em.createQuery("select o.id from Order o where o.tenant = :t order by o.createdAt desc, o.id desc", Long.class)
    .setParameter("t", tenant).setFirstResult(offset).setMaxResults(50).getResultList();

if (ids.isEmpty()) return List.of();
// 2. keep roots with no items; preserve tenant scope; fetch without pagination
List<Order> page = em.createQuery("select distinct o from Order o left join fetch o.items where o.tenant = :t and o.id in :ids", Order.class)
    .setParameter("t", tenant).setParameter("ids", ids).getResultList();
```

The ID set is bounded; child rows are not bounded by the page size. Re-sort the second result by
ID-list position. A count query adds another statement. Between the two queries, rows/children
may change even within a transaction at READ COMMITTED: choose snapshot/isolation semantics or
document tolerance for missing/changed rows. Check parameter limits and chunk fetches if needed.

### Batch fetching

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=32
```

or `@BatchSize(size = 32)` on the target entity type or collection mapping. When an eligible lazy association is
resolved, Hibernate resolves up to 32 pending ones in a single `in (…)` query.

For 500 uncached eligible targets in one context, an idealized count is one root query plus
16 batches = 17 selects, versus 501. Cache state, access order, lock mode, role and dialect
limits can change this. Subselect fetching can also initialize owners beyond the visible page;
measure its secondary SQL and loaded collection count rather than assuming page-only work.

### DTO projections

```java
record OrderRow(Long id, String customerName, BigDecimal total) {}

select new com.example.OrderRow(o.id, o.customer.name, o.total) from Order o where …
```

This scalar constructor projection does not create managed entities or lazy proxies in the DTO.
Joins can still multiply/filter rows and query execution may AUTO-flush existing pending writes.
Selecting an entity as a constructor argument changes that boundary; keep scalar-only payloads
when the intended result is detached data.

What you give up: the objects are not managed, so they cannot be modified and flushed, and they
do not participate in the first- or second-level cache. For a read path that is a feature.

## Choosing, briefly

- Read-only screen or API response → **projection**, unless you need entity behaviour.
- One association, entities needed → **join fetch / entity graph**.
- Two or more associations, or a collection that would multiply → **batch fetching**.
- The collection is needed for every root of the query anyway → **subselect**.
- Still slow with the right count → the statement itself, `sql-query-performance`.

Sources: [Jakarta Persistence graph semantics](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2),
[Hibernate 6.6 fetching](https://docs.hibernate.org/orm/6.6/userguide/html_single/#fetching)
and [Statistics scope and counters](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/stat/Statistics.html).
