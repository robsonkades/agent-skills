# Reconstitution and aggregate concurrency

Read when editing mappings, root/child persistence or revision handling. These rules
apply to mapped independent domain objects; ORM implementation details remain with
the target's persistence specialist.

## Restore one coherent aggregate

List every field that affects identity, equality, transitions, audit or invariants.
Round-trip business IDs, optional technical IDs, persisted revision, timestamps,
status, nullable lifecycle facts, value objects and child identities/order where
order has business meaning. Define any accepted storage normalization, such as
timestamp precision or decimal scale, before calling unequal values harmless.

The reference category mapper restores timestamps through `Category.with(...)`.
This abbreviated Java 17-compatible method assumes existing fields and domain APIs:

```java
public Category toAggregate() {
    return Category.with(
            CategoryID.from(this.id),
            this.name,
            this.description,
            this.active,
            this.createdAt,
            this.updatedAt,
            this.deletedAt
    );
}
```

Where a project uses `AuditInfo`, restore its persisted values rather than
`AuditInfo.now()`. Where optimistic concurrency exists, additionally preserve the
loaded revision through the reconstitution API; the unversioned category shape
above does not establish concurrency safety.

Reconstitution must not call creation factories or business transition methods to
reach the saved state. Loading an inactive category must not emit a new deactivation
event. Restore an empty buffer of newly raised events; historic facts belong in
their actual audit/event storage. Do not silently discard an original aggregate's
pending events when `save` returns another instance: define how the application
captures and persists them in its transaction.

Validate structural integrity of stored values, but do not automatically replay all
current creation rules against legitimate historic states. If a changed invariant
cannot accept old rows, design an explicit migration or compatibility rule. Corrupt
data must not be repaired by substituting the current time, default status or a new
identity during ordinary reads.

Never map a partially loaded root as if it were complete and then replace all its
children on save. Separate projection representations from writable aggregates.
Map required lazy state while the persistence context is valid. When loading root
and children in separate queries, use a verified snapshot/locking protocol or a
root-version consistency check with bounded retry; the check works only if every
relevant writer changes that root version. Fetching every associated aggregate is
not required: references across aggregate boundaries can remain typed identities.

For a version check, load root state with its revision, then required children,
then reread the revision from storage. Accept only a matching revision under the
verified database protocol; all these reads must share that protocol rather than
mix cached state with fresh rows. Calling `find` again in the same persistence
context can return the already-managed root, so comparing its version twice is
not a database check; see the [JPA `EntityManager.find` contract](https://docs.oracle.com/javaee/7/api/javax/persistence/EntityManager.html#find-java.lang.Class-java.lang.Object-).
Prove the revision query actually executes and that relevant entity/collection/query
caches cannot supply stale components. On mismatch, retry the entire load from
fresh persistence state within a bound. Refreshing only the revision would attach
a new token to old facts. A verified consistent snapshot is an alternative to this
check; it does not require every read to observe the latest committed revision.

## One concurrency protocol for the invariant

Consider an order allowing at most ten lines. At revision 7 it has nine lines.
Two transactions load it and add different lines. Independent child inserts can
both succeed while each local rule passed. The required outcome is one accepted
change and one conflict, or serialization followed by a business rejection.

For optimistic persistence, carry revision 7 as the expected revision and atomically
condition the root write on it; commit all child changes in that same transaction.
Every mutation path, including imports and bulk jobs, must participate. Protect
updates/removals of existing children as well as adding relationships. Child row
versions alone cannot protect the root's cross-child count.

With JPA, `@Version` applies to mapped entity state; inverse relationships and a
child's own field changes do not imply a root version increment. An adapter may use
an appropriate root write or `OPTIMISTIC_FORCE_INCREMENT` so all invariant-changing
paths contend on the root. Prove the actual mapping/provider behavior. A stale
version can fail at merge, flush or commit and marks the transaction for rollback.
These mechanism constraints are documented in
[Jakarta Persistence 3.2, sections 3.5.1–3.5.4](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).
Use version-matched documentation for the target, including older `javax` stacks.

Choose one owner for the storage revision. Do not both increment it with a domain
`nextVersion()` operation and let JPA own the same field. A business revision may be
a different concept from an ORM concurrency token. Preserve the token observed at
load; substituting a freshly queried token at save hides a stale decision.

After a conflict, rollback and reload in a fresh transaction before reconsidering
the command. A bounded retry is suitable only when rerunning the business decision
and any associated effects is valid. Do not blindly replay a user decision or an
external side effect. If choosing pessimistic coordination instead, prove every
writer obeys its root lock protocol and test contention/deadlock outcomes.

## Uniqueness and durability

For a tenant-specific natural key, derive one normalization rule shared by the
value object, write mapping and uniqueness mechanism. Enforce the business scope
atomically, for example a unique constraint on `(tenant_id, normalized_code)`.
An initial `exists` check improves feedback but cannot close a concurrent insert
race. Define null, case, soft-delete and key-reuse behavior from business rules and
the actual database. PostgreSQL 18 supports combined-column unique constraints,
but its documented default treatment of nulls must not be assumed across engines;
see [PostgreSQL unique constraints](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).

A gateway save participates in the use case's transaction; its return alone is not
a durable receipt. Flush synchronizes pending changes but still permits rollback.
Keep the transaction boundary outside the independent domain and verify it wraps
the real entry, including jobs/messages where applicable. A durable success response
must follow successful commit. Persist aggregate state and required outbox facts in
the same transaction; do not publish externally on the assumption that flush will
commit. For a commit-time failure, translate at the outer boundary and preserve the
possibility of an unknown outcome after connection loss.
