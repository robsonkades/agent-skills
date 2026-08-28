# Writes, batching and the persistence context

## Why batching silently does nothing

Two settings must both be right. Configuring only the first is the common case, and it produces
no error and no batching.

```properties
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
```

**The second half is the id generation strategy.** With `GenerationType.IDENTITY` the database
assigns the id on insert, and Hibernate needs the id to put the entity in the persistence
context — so it executes each insert immediately to read the generated key back. There is
nothing left to batch. The setting is honoured and does nothing.

What batches:

```java
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_seq")
@SequenceGenerator(name = "order_seq", sequenceName = "order_seq", allocationSize = 50)
private Long id;
```

The allocation size is how many ids the application takes per round trip to the sequence. It must
match the sequence's own increment in the database, or ids collide or are wasted — this is a
two-sided contract, and the schema half of it belongs in a migration.

`order_inserts` and `order_updates` matter because a batch is per statement shape: interleaved
inserts into two tables produce batches of one until they are sorted.

**Verify rather than assume.** Turn on statistics, write 1,000 rows, and read the executed
statement count. If it is 1,000, batching is off whatever the properties say.

## Flush cost scales with the context

Dirty checking visits every managed entity at flush. A loop that loads and modifies 100,000
entities in one persistence context pays that repeatedly, and the cost grows as the loop runs —
the classic profile where the first 1,000 rows are fast and the last 1,000 are not.

```java
int i = 0;
for (var row : rows) {
    em.persist(toEntity(row));
    if (++i % 50 == 0) {   // match the batch size
        em.flush();
        em.clear();        // the half people omit
    }
}
```

`flush()` sends the batch; `clear()` detaches what was sent so the context stops growing.
Omitting `clear()` keeps the flush cost climbing and eventually exhausts the heap — a
`heap-dump-analysis` case whose dominator tree is the persistence context.

For genuinely large jobs, consider not using the ORM for the write at all. A bulk `INSERT … SELECT`
or a `COPY`-style load is one statement and no object graph.

## Bulk operations bypass the context

```java
em.createQuery("update Order o set o.status = :s where o.createdAt < :cut")
  .setParameter("s", ARCHIVED).setParameter("cut", cutoff).executeUpdate();
```

One statement, no entities loaded — and **the entities already in the persistence context still
hold the old values**, because the update went straight to the database. The same applies to the
second-level cache, which the statement does not invalidate for the affected rows.

The rules that follow:

- Run bulk operations before loading the affected entities, or `em.clear()` afterwards.
- Do not mix a bulk update with entity modifications of the same rows in one transaction.
- Bulk operations do not cascade and do not fire entity lifecycle callbacks. Anything your
  `@PreUpdate` did, they do not do.

## Reads that should not be entities

Every entity loaded for a read is: columns you did not need, a persistence-context entry, a
dirty-check at flush, and a candidate for `LazyInitializationException` later. For a read path
that never writes, all four are waste.

Prefer a projection (`n-plus-one-remedies.md`). Where an entity really is needed for a read that
will not be modified, a read-only marker lets Hibernate skip taking the dirty-checking snapshot:

```java
em.createQuery("select o from Order o where …", Order.class)
  .setHint(org.hibernate.jpa.HibernateHints.HINT_READ_ONLY, true)
  .getResultList();
```

## What to measure, and what the numbers mean

| Number                              | Where it comes from       | What a bad value means                          |
| ----------------------------------- | ------------------------- | ----------------------------------------------- |
| Statements executed per request     | Hibernate statistics      | N+1, or missing batching                        |
| Statements executed per row written | same, divided by rows     | Batching is off — check id generation           |
| Flush count per transaction         | `getFlushCount()`         | Queries interleaved with writes forcing flushes |
| Entities loaded per request         | `getEntityLoadCount()`    | Loading entities for a read-only path           |
| Time in a single statement          | the database, not the ORM | A plan problem — `sql-query-performance`        |

The last row is the handoff. The ORM's job is the count and the shape; once those are right and
one statement is still slow, the ORM has nothing further to say about it.
