# Unit of Work and Identity Map

## Entity states, and the transitions that lose data

```text
        new X()                persist()                 commit / flush
transient ──────────────► managed ──────────────────────────► (row written)
                             │  ▲
             detach / close  │  │ merge()  (copy into managed target; SELECT may occur)
                             ▼  │
                          detached ── modifications are not automatically synchronized
managed ── remove() ──► removed ──► deleted at flush
```

JPA `remove` makes a managed instance removed; a detached argument is rejected (possibly
at commit). A new or already removed instance is ignored as an entity-state transition;
configured REMOVE cascades from a new instance still apply. A nonthrowing call alone does
not establish that the argument was managed.
Flush sends changes without committing them. Examples assume a transaction-scoped context
that ends at the shown transaction boundary.

A common tracking mismatch:

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

For independently owned operations, pass identifiers/commands and load in the receiving unit
of work. Deliberate detached editing or an extended/application-managed context spanning
transactions can also be valid; define ownership, loaded state and conflict handling.
`merge` copies into a managed target rather than reattaching the argument. Use that returned
target for subsequent tracked writes; the detached object remains usable as detached data.

## Failed flush and rollback

A constraint violation at flush or an optimistic write conflict is a failed unit of work,
not an instruction to `clear()` and keep writing. Hibernate 6.6 requires rollback and
discarding the failed session because its internal state may no longer match the database.
Clearing tracked entities neither repairs that state nor resets a rollback-only transaction.
For application-owned sessions, perform rollback and close through the owning cleanup path.
For Spring/container-managed contexts, let the transaction/lifecycle owner complete recovery;
do not manually close an injected shared EntityManager. If retry is appropriate, retry the
operation in a fresh owned unit, reload current state and reapply its intended change.
Conflict policy and external-effect retry safety belong to `enterprise-transactions` and
`offline-concurrency-control`.

Rollback does not rewind the Java objects. Under JPA, affected entities become detached
after rollback of a transaction-scoped or joined extended context, retaining their state
at rollback. Generated IDs and versions may be inconsistent with persisted state, so a
non-null ID is not proof of insertion and blindly merging a failed-attempt graph is not a
reliable retry. Verify the database through a fresh context after rollback has completed.

Distinguish write failure from an expected query outcome. JPA `NoResultException` does not
itself mark the transaction rollback-only; catching a no-result branch is not equivalent
to catching a failed flush. An exception escaping a Spring transactional interceptor can
still trigger its rollback rules. Inspect the actual exception and transaction status.

Useful isolated checks: mutate and flush a seeded row, roll back, then compare the still
mutated Java object with a fresh-context read of the unchanged row. Separately, contrast
a caught no-result query followed by a valid commit with a unique-constraint flush failure
that requires rollback and a new context. These cases test lifecycle behavior; they do not
prove that every failed business operation is safe to retry.

## Dirty checking and flush

Snapshot dirty checking compares eligible managed state at flush. Enhancement, immutable or
read-only entities and collection tracking change the work; inspect configuration rather
than assuming every entity is always compared. Three consequences:

**1. Writable managed changes can write without `save()`.** Omitting that call does not prevent synchronization:

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

If JDBC write batching is part of the objective, inspect its eligibility and configure
`hibernate.jdbc.batch_size` as appropriate. Hibernate 6.6 `IDENTITY` identifier generation
disables batching for those entity inserts. Sequences with suitable allocation are one
alternative; assigned IDs can also batch. Flush/clear bounds the context, not transaction
locks, log volume or the already-materialized `rows` list. StatelessSession changes lifecycle
and cascade semantics; verify its target-version contract before substituting it.

**3. A query can cause synchronization.** In a joined transaction under Hibernate AUTO,
an overlapping query can flush pending changes; the illustrated write/query loop can
therefore flush every iteration. Inspect effective mode and query spaces.

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

Hibernate 6.6's action queue groups operations rather than preserving source-call order;
JPA does not prescribe that ordering. This can break a specific, plausible pattern:

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
- **Keep hash/equality behavior compatible with its actual collection and identity contract.**
  A hash derived naively from a generated identifier can change after persist, breaking
  `HashSet` lookup. An immutable business key or an appropriately assigned identifier is
  one option when row/value identity is required; reference equality may already be correct
  when separately loaded instances are intentionally distinct.

## Bulk operations against both patterns

```java
@Modifying
@Query("update Subscription s set s.status = 'EXPIRED' where s.renewsOn < :date")
int expireAll(@Param("date") LocalDate date);
```

What this does **not** do: update managed instances; run `@PreUpdate` callbacks; increment
`@Version`; respect optimistic locking. It performs set-shaped work; one JPQL statement can require
multiple SQL statements for some mappings. Use it when that operation fits the contract.

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

When SQL evidence is needed, correlate statements with the operation and transaction;
reuse existing evidence or collect a bounded trace. Shapes suggest investigations, not unique causes:

| Shape in the log                                         | Candidate mechanism / check                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| One SELECT, then N similar SELECTs                       | N+1 from lazy traversal, eager secondary selects or explicit per-row queries; inspect access and mappings (`lazy-load.md`) |
| SELECT before every INSERT                               | Inspect merge/newness detection, ID generation and application existence checks                                            |
| UPDATE of columns the code never touched                 | An update may include unchanged columns by default; compare bound values, dirty state and dynamic-update configuration     |
| Repeated identical SELECT within one transaction         | Queries can execute repeatedly in one context; inspect query versus identity lookup before blaming context boundaries      |
| Flush in the middle of a loop                            | Query-triggered or explicit flush, lifecycle/framework behavior; correlate the trigger and effective mode                  |
| Statements during rendering or after response completion | Investigate lazy rendering, asynchronous work and transaction ownership; timing alone does not prove OSIV                  |

Hibernate's `Statistics` supplies aggregate counters, not SQL text, parameter values or
causal ownership. Use it with isolated query-budget tests and statement inspection
(`architecture-and-performance`).

Primary contracts: [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
(context lifecycle, removal, rollback, merge, query exceptions/flush mode and bulk updates),
[Hibernate 6.6 Session](https://docs.hibernate.org/orm/6.6/javadocs/org/hibernate/Session.html)
(failed-session disposal), and
[Hibernate 6.6.56 flush guide](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/flushing/Flushing.adoc)
(flush ordering), [persistence-context guide](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/pc/PersistenceContext.adoc)
and [batching guide](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/batch/Batching.adoc).
Apply provider-specific details only to the
matching runtime; these sources do not authorize a baseline upgrade.
