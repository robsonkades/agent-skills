# N+1 and its remedies

## Seeing it

Do not read the SQL log by eye for this. Count.

```properties
# Hibernate statistics — the number, per session
spring.jpa.properties.hibernate.generate_statistics=true

# the statements themselves, when you need to see which ones
spring.jpa.properties.hibernate.format_sql=true
logging.level.org.hibernate.SQL=DEBUG
```

`generate_statistics` logs a summary per session, including statements prepared and executed. In
a test, assert on it rather than reading it:

```java
var stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
stats.clear();
service.renderOrderPage(tenantId, PageRequest.of(0, 50));
assertThat(stats.getPrepareStatementCount()).isEqualTo(2);
```

That assertion is the regression test. `architecture-testing` covers making it a standing gate;
what matters here is that the number is asserted at all, because N+1 reappears the next time
someone touches a mapping.

**Statistics collection has a cost.** It is a diagnostic and test setting, not a production one.

## The two shapes

**Association N+1.** One query returns N roots; reading `order.getCustomer()` on each issues one
select per root. The log shows N near-identical statements differing in one parameter.

**Collection N+1.** One query returns N roots; reading `order.getItems()` on each issues one
select per collection. Same signature, and more expensive, because each of the N returns many
rows.

Both are caused by the same thing: the association is lazy and something traverses it per row.
Neither is caused by `LAZY` being wrong.

## The four mechanisms

| Mechanism                     | Statements  | Multiplies rows?         | Pageable in SQL?        | Use when                                                     |
| ----------------------------- | ----------- | ------------------------ | ----------------------- | ------------------------------------------------------------ |
| `JOIN FETCH` / entity graph   | 1           | **yes**, for collections | **no**, for collections | One association, and you need the managed entities           |
| Batch fetching (`@BatchSize`) | N/batch + 1 | no                       | yes                     | Several associations, or a collection you cannot join        |
| Subselect fetching            | 2           | no                       | yes                     | A collection needed for _all_ roots of the original query    |
| DTO projection                | 1           | no (you shape it)        | yes                     | A read that is not written back — the default for read paths |

### JOIN FETCH and entity graphs are the same mechanism

`select o from Order o join fetch o.customer where …` and an `@EntityGraph` naming `customer`
produce the same shape. The graph form is the one to prefer when the same query is reused with
different fetch requirements, because it keeps the fetch decision out of the query string.

Both are per-query. That is the whole point: the mapping stays `LAZY` and each query states what
it needs.

### The cartesian product

Join-fetching two collections in one query returns the product of their sizes:

```java
// 10 items x 5 shipments = 50 rows, each repeating the order
select o from Order o join fetch o.items join fetch o.shipments where o.id = :id
```

Hibernate returns one `Order` — it de-duplicates by identity — so the defect is invisible in the
result and visible only in the row count on the wire. Newer Hibernate versions reject the second
collection outright rather than silently doing this; older ones do not. **One collection per
query.** For the second, use batch or subselect fetching, or a second query.

### Paginating a fetch

With a fetched collection, one entity is many rows, so `LIMIT` cannot express "50 orders".
Hibernate falls back to reading the whole result and paging in memory, and warns:

```
HHH90003004: firstResult/maxResults specified with collection fetch; applying in memory
```

That warning means the query read every matching row. The fix is two queries:

```java
// 1. page the ids in SQL — no fetch, so LIMIT is meaningful
List<Long> ids = em.createQuery("select o.id from Order o where o.tenant = :t order by o.createdAt desc", Long.class)
    .setParameter("t", tenant).setFirstResult(offset).setMaxResults(50).getResultList();

// 2. fetch exactly those, unpaged
List<Order> page = em.createQuery("select distinct o from Order o join fetch o.items where o.id in :ids", Order.class)
    .setParameter("ids", ids).getResultList();
```

Two statements, both bounded. Note that the second returns rows in an unspecified order — re-sort
by the id list if order matters.

### Batch fetching

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=32
```

or `@BatchSize(size = 32)` on the association or the entity. When the first lazy association is
resolved, Hibernate resolves up to 32 pending ones in a single `in (…)` query.

It converts 500 statements into 17. That is a large win and it is **not** one statement — size the
expectation accordingly. Prefer it over join fetch when more than one association is needed, or
when a join would multiply.

### DTO projections

```java
record OrderRow(Long id, String customerName, BigDecimal total) {}

select new com.example.OrderRow(o.id, o.customer.name, o.total) from Order o where …
```

One statement, only the columns named, and nothing enters the persistence context — so no dirty
checking, no flush cost, and no `LazyInitializationException` downstream because there is no
proxy to initialise.

What you give up: the objects are not managed, so they cannot be modified and flushed, and they
do not participate in the first- or second-level cache. For a read path that is a feature.

## Choosing, briefly

- Read-only screen or API response → **projection**, unless you need entity behaviour.
- One association, entities needed → **join fetch / entity graph**.
- Two or more associations, or a collection that would multiply → **batch fetching**.
- The collection is needed for every root of the query anyway → **subselect**.
- Still slow with the right count → the statement itself, `sql-query-performance`.
