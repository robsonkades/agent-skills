# Identity and Associations

## Identity Field: choosing the generator

| Strategy                        | Identity known before insert | Insert batching               | Notes                                                              |
| ------------------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `IDENTITY` / auto-increment     | no                           | constrained/provider-specific | Generated-key retrieval can prevent ordinary JDBC batching         |
| `SEQUENCE` with allocation size | yes                          | usually                       | Amortizes sequence access; tune allocation and crash gaps          |
| `TABLE`                         | yes                          | yes                           | A row lock per allocation; avoid under concurrency                 |
| Assigned UUID (v4)              | yes                          | yes                           | Random: index fragmentation and poor locality on large tables      |
| Assigned UUID (v7 / ULID)       | yes                          | yes                           | Time-ordered: keeps index locality, identity before insert         |
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

**Composite keys** are worth avoiding where a surrogate is possible: they complicate every
association, every repository method and every join. Where the domain genuinely has one,
choose `@EmbeddedId` or `@IdClass` with compatible field types and stable equality.
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

The silent no-op:

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

The moment anyone asks "when was this tag added?" or "who added it?" or "is it the primary
tag?", the link has attributes and must become an entity:

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

This conversion touches every query and every piece of code that treated the collection as a
set of tags. Choose the entity form for actual lifecycle, querying or attribute requirements; do not
predict that every link will eventually need it.

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

Test one scalar child edit, one removal, one addition, a reorder if meaningful, and a
detached/merged round trip. Inspect SQL and verify surviving identities and orphan cleanup
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

A mapping is not a constraint. Every invariant expressible in the schema should be there:

```sql
ALTER TABLE order_line ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE order_line ADD CONSTRAINT uq_order_product UNIQUE (order_id, product_id);
ALTER TABLE order_line ADD CONSTRAINT ck_quantity_positive CHECK (quantity > 0);
```

This DDL uses PostgreSQL syntax; inspect and migrate the actual database schema instead of
assuming annotation changes update deployed constraints. Include a foreign key for `order_id`;
`NOT NULL` alone does not establish referential integrity. A CHECK permits SQL UNKNOWN,
so mandatory `quantity` also needs `NOT NULL`.

Application-level checks are bypassed by imports, bulk statements, other services and
manual fixes. The database's are not, and the constraint's name is the contract your error
handling matches on.

These are partial JPA examples, with imports, ids and constructors omitted where unrelated.
Verify Java, Jakarta/Javax namespace and provider versions before reuse. Sources:
[Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
and [Hibernate 6.6 associations and identifiers](https://docs.hibernate.org/orm/6.6/userguide/html_single/).
