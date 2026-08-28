# Unit of Work and Identity Map

## Entity states, and the transitions that lose data

```text
        new X()                persist()                 commit / flush
transient ──────────────► managed ──────────────────────────► (row written)
                             │  ▲
             detach / close  │  │ merge()  (SELECT, then copy into a NEW instance)
                             ▼  │
                          detached ── modifications here are silently discarded
                             │
                          remove() ──► removed ──► deleted at flush
```

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
    Order managed = orders.save(detached);   // merge: SELECT, then copy
    detached.setTrackingCode(code);          // ← still the detached one. Lost.
    managed.setTrackingCode(code);           // ← this is the one that persists
}
```

Rule that avoids both: **do not carry entities across transaction boundaries.** Pass
identifiers and re-read, or pass a command object. Merge is for genuinely detached
long-lived objects, and its return value is the only usable reference afterwards.

## Dirty checking and flush

At flush, the unit of work compares every managed entity against the snapshot taken when it
was loaded, and generates the statements. Three consequences:

**1. Modification is persistence.** No `save()` is needed, and none prevents the write:

```java
@Transactional
public void applyDiscount(OrderId id) {
    Order order = orders.byId(id).orElseThrow();
    order.applyDiscount(TEN_PERCENT);      // written at commit; no save() anywhere
}
```

**2. Cost is proportional to context size, per flush.** N entities and M flushes is O(N×M)
comparisons. A batch that loads 100 000 entities and flushes per item is quadratic, which is
why it is fast for 100 rows in a test and never finishes for a real file.

```java
// Chunked: bounded context, bounded flush cost.
for (int i = 0; i < rows.size(); i++) {
    em.persist(toEntity(rows.get(i)));
    if (i % 500 == 0) { em.flush(); em.clear(); }   // clear() is the important half
}
```

Also set `hibernate.jdbc.batch_size`, and note that `IDENTITY` identifier generation
disables JDBC batching for inserts — a sequence with an allocation size is required for
batching to actually happen.

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

`FlushModeType.COMMIT` avoids it and costs correctness: the query then reads pre-modification
state. Restructure the loop instead.

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

Within one unit of work, one row is one instance:

```java
Order a = orders.byId(id).orElseThrow();
Order b = orders.byId(id).orElseThrow();     // no SQL; same object
assert a == b;                                // guaranteed
a.cancel(clock);
assert b.isCancelled();                       // b is a, so of course
```

This makes repeated loads free and makes aliasing correct rather than dangerous. Two
practical consequences:

- **A "refresh from the database" needs `em.refresh(entity)`.** Re-querying returns the
  cached instance, so a second read cannot show you another transaction's committed change.
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
    int updated = subscriptions.expireAll(date);
    em.clear();                        // loaded entities are now stale — discard them
    return updated;
}
```

And if the table is under optimistic locking, write the version increment into the
statement (`set s.version = s.version + 1`), or accept that concurrent editors will not be
detected for those rows (`offline-concurrency-control`).

## Reading a persistence problem from the statement log

Enable statement logging with a request identifier and read the shape:

| Shape in the log                                 | Cause                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| One SELECT, then N similar SELECTs               | N+1 lazy load (`lazy-load.md`)                                                                     |
| SELECT before every INSERT                       | `merge` on a transient entity, or an assigned identifier                                           |
| UPDATE of columns the code never touched         | Dirty checking on a mutable field — a date, a collection reordered, a lazily initialised default   |
| Repeated identical SELECT within one transaction | Not possible via the identity map — means separate contexts, i.e. `REQUIRES_NEW` or no transaction |
| Flush in the middle of a loop                    | Query-triggered flush                                                                              |
| Statements after the response was written        | Open Session In View                                                                               |

Hibernate's `Statistics` gives the same information numerically and is what a query-budget
test should assert on (`architecture-and-performance`).
