# Unit of Work and Identity Map

## Entity states, and the transitions that lose data

```text
        new X()                persist()                 commit / flush
transient ──────────────► managed ──────────────────────────► (row written)
                             │  ▲
             detach / close  │  │ merge()  (copy into managed target; SELECT may occur)
                             ▼  │
                          detached ── modifications here are silently discarded
managed ── remove() ──► removed ──► deleted at flush
```

`remove` requires a managed instance; passing a detached instance is not that transition.
Flush sends changes without committing them. Examples assume a transaction-scoped context
that ends at the shown transaction boundary.

The single most common data-loss bug in enterprise Java:

```java
// Transaction 1
Order order = orders.findById(id).orElseThrow();     // managed
// transaction ends → order is now detached

// Later, outside any transaction
order.setStatus(SHIPPED);                            // no tracking, no error, no write
```

And its sibling, which looks like a fix and is not:

```java
@Transactional
public void ship(Order detached) {
    Order managed = orders.save(detached);   // existing-entity merge: copy, possible SELECT
    detached.setTrackingCode(code);          // ← still the detached one. Lost.
    managed.setTrackingCode(code);           // ← this is the one that persists
}
```

Rule that avoids both: **do not carry entities across transaction boundaries.** Pass
identifiers and re-read, or pass a command object. Merge is for genuinely detached
long-lived objects, and its return value is the only usable reference afterwards.

## Dirty checking and flush

Snapshot dirty checking compares eligible managed state at flush. Enhancement, immutable or
read-only entities and collection tracking change the work; inspect configuration rather
than assuming every entity is always compared. Three consequences:

**1. Modification is persistence.** No `save()` is needed, and none prevents the write:

```java
@Transactional
public void applyDiscount(OrderId id) {
    Order order = orders.byId(id).orElseThrow();
    order.applyDiscount(TEN_PERCENT);      // written at commit; no save() anywhere
}
```

**2. Context growth can amplify flush cost.** A simplified scan of N eligible entities at M
flushes costs O(N×M); a growing context scanned after each addition can accumulate quadratic
work. Measure actual dirty checking, cascades, SQL and allocation before attributing a slow job.

```java
// Chunked: bounded context, bounded flush cost.
for (int i = 0; i < rows.size(); i++) {
    em.persist(toEntity(rows.get(i)));
    if ((i + 1) % 500 == 0) { em.flush(); em.clear(); }
}
em.flush(); em.clear(); // final partial chunk; requires the enclosing transaction
```

This chunk owns its persistence context; `clear()` detaches unrelated managed entities too.
Do not use this loop in a shared unit of work without accounting for those references.

Also set `hibernate.jdbc.batch_size`, and note that `IDENTITY` identifier generation
disables Hibernate JDBC batching for those entity inserts. Sequences with suitable allocation are one
alternative; assigned IDs can also batch. Flush/clear bounds the context, not transaction
locks, log volume or the already-materialized `rows` list. StatelessSession changes lifecycle
and cascade semantics; verify its target-version contract before substituting it.

**3. Flush happens more often than you think.** Commit; an explicit `flush()`; and before a
query whose result could be affected by pending changes. That last one turns a
write-then-query loop into a flush per iteration.

```java
for (var line : lines) {
    em.persist(line);
    var total = em.createQuery("select sum(l.amount) from Line l ...")  // ← flush, per row
        .getSingleResult();
}
```

With `FlushModeType.COMMIT`, the effect of pending changes on query results is unspecified
by JPA; do not promise either fresh or stale results. AUTO behavior and native-query
synchronization also depend on provider/API mode. Restructure the loop or flush deliberately.

## Statement ordering

The unit of work orders statements by entity type and operation, not by the order your code
ran. This breaks a specific, plausible pattern:

```java
tagRepository.delete(existingTag);       // same (post_id, name) key
tagRepository.save(new Tag(postId, name));
// flush order: INSERT before DELETE → unique constraint violation
```

Fix with an explicit `flush()` between the two, or by updating rather than
delete-then-insert.

## Identity map

Within one persistence context, one managed entity identity is one instance. For an
existing row and ordinary unlocked identity lookup:

```java
Order a = em.find(Order.class, id);
Order b = em.find(Order.class, id);           // managed identity lookup; normally no new SQL
assert a == b;                                // guaranteed
a.cancel(clock);
assert b.isCancelled();                       // b is a, so of course
```

This preserves managed identity, not a general query-result cache. JPQL/repository queries
may execute SQL repeatedly and still resolve to the same managed object. Two
practical consequences:

- **A "refresh from the database" needs `em.refresh(entity)`.** Re-querying returns the
  managed instance rather than refreshing its state. Refresh discards local changes and
  remains subject to database isolation; it need not see a newer committed row in the same snapshot.
- **`equals`/`hashCode` must be stable across the transition from transient to managed.** A
  generated identifier is null before persist; an `equals` based on it puts the entity in a
  `HashSet` under one hash and then changes it. Use a business key where one exists, or
  compare on an assigned UUID generated in the constructor.

## Bulk operations against both patterns

```java
@Modifying
@Query("update Subscription s set s.status = 'EXPIRED' where s.renewsOn < :date")
int expireAll(@Param("date") LocalDate date);
```

What this does **not** do: update managed instances; run `@PreUpdate` callbacks; increment
`@Version`; respect optimistic locking. What it does do: change rows in one statement, which
is exactly right for the job.

Using it safely:

```java
@Transactional
public int expireAll(LocalDate date) {
    em.flush();                        // preserve pending changes before bulk SQL/clear
    int updated = subscriptions.expireAll(date);
    em.clear();                        // loaded entities are now stale — discard them
    return updated;
}
```

For versioned rows, an explicit increment (`set s.version = s.version + 1`) invalidates
older managed copies. It does not validate the bulk writer's own expected version: add
the relevant predicate and check affected-row counts if that precondition is required
(`offline-concurrency-control`). Native SQL/triggers or provider-specific versioned bulk
extensions may implement other rules; inspect them.

## Reading a persistence problem from the statement log

Enable statement logging with a request identifier and read the shape:

| Shape in the log                                         | Cause                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| One SELECT, then N similar SELECTs                       | N+1 lazy load (`lazy-load.md`)                                                                                         |
| SELECT before every INSERT                               | Inspect merge/newness detection, ID generation and application existence checks                                        |
| UPDATE of columns the code never touched                 | An update may include unchanged columns by default; compare bound values, dirty state and dynamic-update configuration |
| Repeated identical SELECT within one transaction         | Queries can execute repeatedly in one context; inspect query versus identity lookup before blaming context boundaries  |
| Flush in the middle of a loop                            | Query-triggered flush                                                                                                  |
| Statements during rendering or after response completion | Investigate lazy rendering, asynchronous work and transaction ownership; timing alone does not prove OSIV              |

Hibernate's `Statistics` supplies aggregate counters, not SQL text, parameter values or
causal ownership. Use it with isolated query-budget tests and statement inspection
(`architecture-and-performance`).

Primary contracts: [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
(context lifecycle, merge, query flush mode and bulk updates) and
[Hibernate 6.6 guide](https://docs.hibernate.org/orm/6.6/userguide/html_single/)
(flush ordering, dirty checking and batching). Apply provider-specific details only to the
matching runtime; these sources do not authorize a baseline upgrade.
