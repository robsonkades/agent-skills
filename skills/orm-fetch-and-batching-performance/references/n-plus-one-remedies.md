# N+1 and its remedies

## Seeing it

For suspected N+1, count scoped statements and inspect their SQL/parameters and triggering
traversal. Reuse adequate evidence; reading individual lines alone does not establish the total.

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

For an affected fetch regression, pair the count assertion with nonempty fixture and expected
result checks: returning nothing can satisfy a query budget while breaking the operation.
`architecture-testing` covers making a relevant query budget a standing gate; a narrow
contract explanation does not require introducing one.

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

Both allow a use-case fetch plan without a global mapping change. Conservative lazy defaults
often help, but retain an intentional eager obligation when it meets the actual loading and
cost contract; graph semantics and provider capabilities still apply.

### The cartesian product

Join-fetching independent sibling to-many associations can return the product of their sizes:

```java
// 10 items x 5 shipments = 50 rows, each repeating the order
select o from Order o join fetch o.items join fetch o.shipments where o.id = :id
```

Hibernate de-duplicates root identity in supported shapes, so the defect may be invisible in the
result and visible only in rows transferred. Multiple bags are rejected in common Hibernate
versions; other collection combinations can still execute with a Cartesian product. Split
independent branches when the product exceeds the budget, using eligible batch/subselect
fetching or another query. Several to-one fetches or one nested chain such as
orders → lines → adjustments have a different shape: the latter follows each line's own
children, not every line crossed with all adjustments. Check total rows and supported mappings
even for that chain; keep an already adequate bounded plan.

### Paginating a fetch

With a fetched collection, one entity can occupy many rows, so a simple row `LIMIT` does not
express "50 orders" with complete collections. Common Hibernate 6.6 collection-fetch query
shapes read the matching result and page in memory, with this warning:

```
HHH90003004: firstResult/maxResults specified with collection fetch; applying in memory
```

That warning indicates root pagination is being applied after fetching the matching result.
For Hibernate 6.6 tests requiring SQL pagination,
`hibernate.query.fail_on_pagination_over_collection_fetch=true` can turn this fallback into an
error. Verify the actual provider/query behavior. A common alternative is two data queries:

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

The scalar DTO results are not managed, so modifying them does not flush changes and they do
not reuse managed identity or the entity second-level cache. A query-result cache, if used,
is a separate mechanism. Those trade-offs can suit a detached read model; an already adequate
entity representation does not require conversion merely because the operation is read-only.

## Choosing, briefly

- Selected detached values are needed → consider a **scalar projection** against the current
  representation's measured cost and cache/identity requirements.
- Managed associations are needed with acceptable row volume → consider **join fetch / entity
  graph**, including supported multiple to-one or nested shapes.
- Independent collection products are excessive → compare separate queries and eligible
  **batch fetching**; association count alone does not choose the mechanism.
- Most owners need one collection role → consider **subselect**, verifying its secondary owner
  set and cache/access behavior against batching or a join.
- One statement has excessive cost → `sql-query-performance`, even if amplification also exists.

Sources: [Jakarta Persistence 3.1 graph semantics](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1),
[Hibernate 6.6 fetching](https://docs.hibernate.org/orm/6.6/userguide/html_single/#fetching)
and [Statistics scope and counters](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/stat/Statistics.html).
The [6.6.33 fetch-join guidance](https://github.com/hibernate/hibernate-orm/blob/6.6.33/documentation/src/main/asciidoc/querylanguage/From.adoc)
distinguishes nested chains from parallel collections; this does not guarantee every mapping
or paged query is supported.
