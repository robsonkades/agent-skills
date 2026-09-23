# Identity and Associations

## Identity Field: choosing the generator

| Strategy                        | Identity known before insert | Insert batching               | Notes                                                              |
| ------------------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `IDENTITY` / auto-increment     | no                           | constrained/provider-specific | Generated-key retrieval can prevent ordinary JDBC batching         |
| `SEQUENCE` with allocation size | yes                          | usually                       | Amortizes sequence access; tune allocation and crash gaps          |
| `TABLE`                         | yes                          | yes                           | A row lock per allocation; avoid under concurrency                 |
| Assigned UUID (v4)              | yes                          | yes                           | Random placement can cost index locality; inspect actual layout    |
| Assigned UUID (v7 / ULID)       | yes                          | yes                           | Time-ordered: can improve locality, identity before insert         |
| Natural key                     | yes                          | yes                           | Only if genuinely immutable; migrations when it is not are painful |

The batching column indicates compatibility with batching, not that batching is enabled.
Inspect provider settings, driver and statements. A sequence-generated id normally becomes
available during persist, before the INSERT; it is not automatically available in the constructor.
Align sequence increment and provider optimizer/allocation configuration in the migration.
Time-ordered identifiers can improve locality but do not guarantee global event order or
remove index hot spots. `UuidCreator` below is an external library, not a JDK API; verify an
existing dependency rather than adding one implicitly.

Two consequences that decide most cases:

**Batching.** Historically Hibernate executes `IDENTITY` inserts immediately to obtain each key,
preventing its ordinary JDBC entity-insert batching. Database `RETURNING`, driver APIs, bulk
operations and newer provider versions can change the available path. Do not derive a round-trip
count from row count alone; inspect statements and wire/database metrics. Where supported, a pooled
sequence can amortize key allocation; tune `allocationSize` from concurrency and batching needs:

```java
@Id
@GeneratedValue(strategy = SEQUENCE, generator = "order_seq")
@SequenceGenerator(name = "order_seq", sequenceName = "order_seq", allocationSize = 50)
private Long id;
```

**Equality before persistence.** With a generated key, `id` is initially null and is assigned
at a strategy-dependent point during persistence. An id-based hash therefore changes — putting the entity in a `HashSet`
before saving and looking it up afterwards fails. Either use an assigned identifier
generated in the constructor:

```java
@Id private UUID id = UuidCreator.getTimeOrderedEpoch();   // or another v7 generator
```

or write `equals`/`hashCode` that are stable regardless (a business key, or a `hashCode`
returning a stable value with `equals` comparing non-null ids). Distinct transient entities
with null ids must not compare equal; handle proxy/entity type compatibility consistently.
A constant hash can degrade large sets. Assigned ids also require correct repository
new-entity detection: a non-null id does not universally mean the row already exists.

**Composite keys** can fit stable domain identity or an existing schema. Compare key width,
referencing mappings and change propagation with a surrogate plus a uniqueness constraint;
the mere availability of a surrogate is not a reason to migrate an adequate key.
Choose `@EmbeddedId` or `@IdClass` with compatible field types and stable equality.
Jakarta Persistence 3.2 permits record key classes; do not infer that an older provider's
record embeddable support also supports record identifiers. Use the project's supported
key-class form and test derived identity (`@MapsId`) explicitly.

## Foreign Key Mapping: the owning side

```java
@Entity
public class OrderLine {
    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;                    // ← OWNER: this side has the column
}

@Entity
public class Order {
    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();   // ← inverse: a view
}
```

An inconsistent inverse-side update (which can still cascade persistence):

```java
order.getLines().add(new OrderLine(product, 2));   // owner's order field is null
orders.save(order);
// → either a not-null violation, or a row with order_id = NULL. Nothing "saved wrong";
//   the inverse side is simply not what is persisted.
```

The fix is to make the inconsistent state unreachable:

```java
public void addLine(ProductId product, int quantity, Money unitPrice) {
    requireDraft();
    var line = new OrderLine(this, product, quantity, unitPrice);   // sets the owner
    lines.add(line);
}

public void removeLine(OrderLine line) {
    requireDraft();
    // Accept the actual managed member, not a detached equal-by-id copy.
    for (var iterator = lines.iterator(); iterator.hasNext();) {
        var member = iterator.next();
        if (member == line) {
            iterator.remove();
            member.detachFromOrder();
            return;
        }
    }
}
```

Both operations enforce this example's draft-only mutation contract before changing the graph.
No public setter for the collection, no public setter for `order` on the line. This is the
same discipline that keeps the aggregate's invariants enforceable
(`domain-logic-organization`).

**Inverse `@OneToOne`:** optional-child existence may require a secondary query with
ordinary proxies. Hibernate 6.6 documents lazy state initialization enhancement as a way
to defer this load. Inspect enhancement, provider and optionality, then test with and without
a child. Owning-side or unidirectional shared-key mappings can avoid inverse traversal;
a shared key alone does not guarantee every inverse mapping becomes lazy.

## Association Table Mapping, and when it stops being one

```java
// Fine while the link genuinely carries nothing.
@ManyToMany
@JoinTable(name = "post_tag",
    joinColumns = @JoinColumn(name = "post_id"),
    inverseJoinColumns = @JoinColumn(name = "tag_id"))
private Set<Tag> tags = new HashSet<>();
```

If a link needs its own persistent identity, entity queries or mutation lifecycle, model an
association entity. Attributes such as when/by whom a tag was added can then live on it:

```java
@Entity
@Table(name = "post_tag")
public class PostTag {
    @EmbeddedId private PostTagId id;
    @MapsId("postId") @ManyToOne(fetch = LAZY) private Post post;
    @MapsId("tagId")  @ManyToOne(fetch = LAZY) private Tag tag;
    private Instant addedAt;
    private String addedBy;
}
```

Here `(postId, tagId)` identifies the link itself. Assign both parent references before
persisting; setting scalar fields in `PostTagId` alone does not establish those relationships.
Its attribute names and types must match the `@MapsId` names and referenced identifier types.
The mapped identifier components derive from the associations; direct mutation of those
components is not a request to update the foreign keys. See the
[`@MapsId` contract](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/mapsid).

Once persistent, do not change the primary key, whether natural, generated, assigned or derived.
Changing this link's post or tag would change its identity. Jakarta Persistence defines primary-key
mutation after persistence as undefined behavior; neither an exception nor a successful re-key is
a portable expectation, and `merge` does not make it supported.

If different endpoints mean a different link, remove the old link and create a new one within the
intended transaction, preserving required audit information, constraints and shared parent rows.
If link identity must survive reassignment, consider a stable independent id with ordinary mutable
foreign keys and the required uniqueness constraint. An existing mapping with that shape can
update the foreign key without changing its primary key, subject to domain and lifecycle rules.
Do not redesign a suitable existing key merely to use a surrogate. For either path, inspect SQL
and verify keys, endpoints, surviving parents and uniqueness after flush, clear and reload.

Attributes alone do not require entity identity. An owner-bound `@ElementCollection` of
embeddables can contain link values, including an owning `@ManyToOne` to the tag through a
foreign key in the collection table. JPA restricts such elements to owning to-one entity
relationships and forbids nested element collections. Compare its supported queries and
collection DML with the association entity; it is not an automatic targeted-update shortcut.
A database-default audit column that the ORM never reads or writes can also remain unmapped
if database ownership satisfies the contract.

Changing representation affects mappings and callers that expose or query that representation;
an encapsulated public API may remain unchanged. Determine actual schema/data migration needs
from deployed columns, constraints and writers. Do not predict that every link will need an entity.

For unique unordered links, a `Set` with stable equality can support targeted link deletes;
bag/list behavior depends on mapping and provider. Do not discard required ordering to
reduce statements. Do not cascade `REMOVE` to shared tags: deleting a post must not delete
entities still referenced elsewhere. Enforce unique link pairs in the database.

## Collections and the delete-then-insert trap

```java
@OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
private List<OrderLine> lines = new ArrayList<>();
```

This inverse entity collection does not imply delete-all/reinsert just because it is a
`List`. Hibernate can delete a removed child's row by its identifier. By contrast,
unidirectional link-table bags or some value collections may recreate association rows.
Distinguish child rows, join rows and order-column updates in the statement log.

- Retain managed collection wrappers and apply an identity-based diff: change existing
  children, add new ones and remove only absent ones through association helpers.
- Blind `clear(); addAll(...)` can create orphan deletes or needless churn. Replacing the
  wrapper can also break orphan tracking; neither is a universal repair.
- A `Set` requires equality stable while elements are stored. Java reference equality is
  not intrinsically a delete-all trigger, but may fail to recognize the same database entity
  represented by a different instance.
- `@OrderColumn` provides persisted positions and can cause many index updates on removal.
  `@ElementCollection` update strategy depends on collection semantics and row identification;
  it is not invariably wholesale replacement.

For a collection-write change, test the affected scalar edit, removal, addition or reorder;
include a detached/merged round trip if that is an actual entry path. Inspect SQL and verify
surviving identities, required ordering/duplicates and orphan cleanup
after flush, clear and reload (`orm-behavioral-patterns`).

## Query cost by association shape

A lazy to-one or collection traversed for each result can cause N+1 selects, depending on
cache state, distinct targets and fetch configuration. EAGER requires loading but does not
promise a join. Batch fetching can reduce secondary round trips; it does not guarantee one
query. A collection fetch join multiplies rows, and joining two collections can multiply
their cardinalities or be rejected for multiple bags. Route detailed tuning to
`orm-fetch-and-batching-performance`.

No general fetch strategy wins. Batch fetching amortizes lazy traversal; fetch joins reduce round
trips but multiply rows and complicate pagination; projections avoid entity graphs for reads.
Choose explicitly per use case and validate query count, bytes and plan
(`architecture-and-performance`).

## Constraints belong in the schema

A mapping annotation does not prove a deployed constraint exists. Enforce invariants the
database must preserve across writers, after checking existing data and rollout compatibility.
For a domain requiring one product per order and positive mandatory quantities, for example:

```sql
ALTER TABLE order_line ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE order_line ADD CONSTRAINT uq_order_product UNIQUE (order_id, product_id);
ALTER TABLE order_line ADD CONSTRAINT ck_quantity_positive CHECK (quantity > 0);
```

This DDL uses PostgreSQL syntax; inspect and migrate the actual database schema instead of
assuming annotation changes update deployed constraints. Include a foreign key for `order_id`;
`NOT NULL` alone does not establish referential integrity. A CHECK permits SQL UNKNOWN,
so mandatory `quantity` also needs `NOT NULL`.

Imports, bulk statements, other services and manual fixes can bypass application checks;
enabled database constraints enforce their defined rules on those writes. Domain rules outside
that contract still need application enforcement. Preserve any constraint names used by error
handling, and account for permissions or migration procedures that can alter enforcement.

These are partial JPA examples, with imports, ids and constructors omitted where unrelated.
Verify Java, Jakarta/Javax namespace and provider versions before reuse. Sources:
[Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
and Hibernate 6.6.56 source documentation for
[associations](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/domain/associations.adoc),
[identifiers](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/domain/identifiers.adoc)
and [collections](https://github.com/hibernate/hibernate-orm/blob/6.6.56/documentation/src/main/asciidoc/userguide/chapters/domain/collections.adoc).
