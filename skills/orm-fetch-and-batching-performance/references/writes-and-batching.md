# Writes, batching and the persistence context

## Why batching silently does nothing

Inspect batching eligibility as well as configuration. These are Spring Boot property names;
direct Hibernate configuration uses the `hibernate.*` keys without the Spring prefix.

```properties
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
```

**The second half is the id generation strategy.** With `GenerationType.IDENTITY` the database
assigns the id on insert. Hibernate 6.6 disables JDBC insert batching for those entities;
exact insert timing can depend on persistence/transaction context. This does not disable
batching of their later updates/deletes or inserts for other eligible entity types.

What batches:

```java
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_seq")
@SequenceGenerator(name = "order_seq", sequenceName = "order_seq", allocationSize = 50)
private Long id;
```

This mapping fragment assumes sequence support and a compatible database sequence. With
Hibernate's pooled/pooled-lo optimizers, allocation size describes the identifier pool and
must agree with the sequence increment; other optimizers have different contracts. Inspect
the effective generator, DDL and other writers before changing either side. Mismatch may fail
validation or risk overlapping ranges; sequence gaps alone do not demonstrate a defect.
Identifier pooling and JDBC batch size are independent. Assigned IDs/UUIDs also permit batching;
even unpooled sequences can batch inserts while paying extra identifier round trips.

`order_inserts` and `order_updates` matter because a batch is per statement shape: interleaved
inserts into two tables can fragment batches. Ordering has a cost and does not overcome
incompatible SQL shapes, generated-value retrieval, cascades or driver limitations.

**Verify the correct layer.** For 1,000 rows, observe JDBC `addBatch`/`executeBatch`, batch
sizes, generated-ID queries and database/driver round trips using suitable instrumentation.
SQL log lines and logical DML/entity-insert counts may still be 1,000 with working batching;
prepared-statement counts are not batch counts either. Check driver rewrite behavior separately.

### Versioned batches must preserve conflict detection

For entities with `@Version`, inspect the target driver's per-statement batch update counts.
Hibernate uses those counts for optimistic-lock checks. A driver returning incorrect counts,
or only `Statement.SUCCESS_NO_INFO`, does not provide the same evidence as an exact zero/one
row count. In Hibernate 6.6.33, the batch row-count checker accepts `SUCCESS_NO_INFO` without
verifying the expected count; a successful call therefore does not prove a stale update
would be detected.

Check the effective `hibernate.jdbc.batch_versioned_data` setting rather than assuming a
universal default; Hibernate 6.6 defaults can depend on the dialect. Keep versioned batching
when the driver and conflict test support it. If batch counts cannot support the required
check, evaluate disabling batching for versioned DML with that setting set to `false`, or a
driver/configuration correction. Do not remove `@Version` or globally disable unrelated
batching merely to make the job succeed.

Use two independent contexts loading the same version: commit a change in one, then flush
the stale change from the other through the actual batched path. Assert a conflict, rollback
of the losing transaction and preservation of the winner's data. Pair this with a successful
nonconflicting batch and observed batch executions; a test that never enters batching does
not validate batch counts. Repeat for affected driver rewrite/configuration changes.

## Flush cost scales with the context

Large contexts can increase flush traversal and snapshot/collection costs. Enhancement,
read-only entities and immutable mappings change the work, so profile rather than assuming
every flush compares every field. Use a context owned by the batch job: `clear()` detaches
all its entities, including unrelated work if the context was shared.

```java
// Partial transaction body: active transaction, job-owned EntityManager, bounded input.
int i = 0;
for (var row : rows) {
    em.persist(toEntity(row));
    if (++i % 50 == 0) {   // choose the flush window; need not equal JDBC batch size
        em.flush();
        em.clear();        // the half people omit
    }
}
em.flush();                // include the final partial window; flush is not commit
em.clear();
```

`flush()` synchronizes pending work, executing eligible JDBC batches; `clear()` detaches the
managed state so the context stops growing.
Omitting `clear()` can retain the growing managed graph. Clearing does not release objects
still held by `rows` or application buffers, commit the transaction, or release its locks.
Bound the input too; for chunk commits, define restart/idempotency and partial-success semantics.
After a persistence failure, roll back and discard the failed context instead of continuing
the loop. The transaction owner commits/rolls back and closes its resources outside this snippet.

For jobs whose entity lifecycle is unnecessary, compare set-based `INSERT … SELECT` or a
database-native load with ORM batching. These can avoid a per-row managed graph; verify the
required constraints, callbacks, transaction and restart contract before changing the path.

## Bulk operations bypass the context

The following is a partial operation inside an active transaction. Prefer a fresh context;
otherwise flush pending changes that must survive before executing it, and clear/refresh stale
state afterward without discarding unrelated unsent changes.

```java
em.createQuery("update Order o set o.status = :s where o.createdAt < :cut")
  .setParameter("s", ARCHIVED).setParameter("cut", cutoff).executeUpdate();
```

One bulk operation, possibly multiple SQL statements for an inheritance/table strategy — and
**managed entities can retain old values**, because bulk DML does not synchronize their state.
Second-level/query-cache behavior differs: Hibernate HQL/JPQL bulk operations arrange cache
cleanup for affected spaces; native or external writes need their own synchronization policy.
Do not assume either universal invalidation or no invalidation.

The rules that follow:

- Prefer a fresh context for bulk DML. If pending managed changes must be preserved, explicitly
  flush them before the bulk operation, then clear/refresh affected state afterward. Do not
  clear away unsent changes; AUTO flush depends on query spaces and flush mode.
- Managed modifications of affected rows can follow bulk work when ordering and reconciliation
  are deliberate: preserve required pending writes first, refresh/reload affected state, then
  make later changes against that state. Otherwise a later flush can overwrite bulk results
  from stale managed values. A fresh context is often simpler; mixing is not categorically
  forbidden, and concurrency/version requirements still apply.
- Bulk operations do not cascade and do not fire entity lifecycle callbacks. Anything your
  `@PreUpdate` did, they do not do.
- Bulk JPQL does not automatically perform per-entity optimistic version checks. Add the
  required version predicate/update and check affected counts when concurrency requires it;
  database constraints/triggers still apply.

## Reads that should not be entities

Read-only paths may benefit from scalar projections when managed identity/behavior is not
needed. Entities are not automatically waste: required data, cache hits, domain behavior and
read-only/enhanced tracking change the trade-off.

Compare a projection using [N+1 and its remedies](n-plus-one-remedies.md) when selected detached
values fit the contract. For entities loaded for a read that will not modify them, a read-only
marker lets Hibernate skip taking the dirty-checking snapshot:

```java
em.createQuery("select o from Order o where …", Order.class)
  .setHint(org.hibernate.jpa.HibernateHints.HINT_READ_ONLY, true)
  .getResultList();
```

This is Hibernate-specific and not database enforcement of read-only access. Already managed
instances, collection changes and cascades require separate checks; keep transactional write
rules intact rather than treating this hint as protection against every mutation.

## What to measure, and what the numbers mean

| Number                                       | Where it comes from                         | What a bad value means                                      |
| -------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Selects/prepares per isolated read operation | Scoped instrumentation / factory statistics | Repeated fetching or other work; inspect SQL and population |
| JDBC batch executions and occupancy          | JDBC instrumentation / session metrics      | Fragmentation, eligibility or flush-window issue            |
| Flush count per transaction                  | `getFlushCount()`                           | Queries interleaved with writes forcing flushes             |
| Entities loaded per request                  | `getEntityLoadCount()`                      | Compare loaded graph with required state/cache reuse        |
| Time in a single statement                   | the database, not the ORM                   | Plan, waits or transfer — `sql-query-performance`           |

For a slow individual statement, hand off SQL, bindings, rows and database timing to
`sql-query-performance`; distinguish a bad plan from lock waits, I/O and result transfer.

Sources: [Hibernate 6.6 batching](https://docs.hibernate.org/orm/6.6/userguide/html_single/#batch),
[identifier optimizers](https://docs.hibernate.org/orm/6.6/userguide/html_single/#identifiers-optimizers),
[6.6.33 bulk cache cleanup](https://github.com/hibernate/hibernate-orm/blob/6.6.33/hibernate-core/src/main/java/org/hibernate/action/internal/BulkOperationCleanupAction.java)
and [Jakarta Persistence 3.1 bulk update/delete and context contracts](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1).
For versioned batches, see the [6.6.33 batching contract](https://github.com/hibernate/hibernate-orm/blob/6.6.33/documentation/src/main/asciidoc/userguide/chapters/batch/Batching.adoc),
[batch-setting defaults](https://github.com/hibernate/hibernate-orm/blob/6.6.33/hibernate-core/src/main/java/org/hibernate/cfg/BatchSettings.java)
and [row-count checking](https://github.com/hibernate/hibernate-orm/blob/6.6.33/hibernate-core/src/main/java/org/hibernate/jdbc/Expectations.java).
