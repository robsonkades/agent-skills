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

**Equality before persistence.** With a generated key, `id` is null until insert, so an
`equals`/`hashCode` based on it changes after persist — putting the entity in a `HashSet`
before saving and looking it up afterwards fails. Either use an assigned identifier
generated in the constructor:

```java
@Id private UUID id = UuidCreator.getTimeOrderedEpoch();   // or another v7 generator
```

or write `equals`/`hashCode` that are stable regardless (a business key, or a `hashCode`
returning a constant for the class with `equals` comparing the id, which is correct but
degrades hash performance in large sets).

**Composite keys** are worth avoiding where a surrogate is possible: they complicate every
association, every repository method and every join. Where the domain genuinely has one,
`@EmbeddedId` with a record is the cleanest form.

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
    private final List<OrderLine> lines = new ArrayList<>();   // ← inverse: a view
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
    lines.remove(line);
    line.detachFromOrder();     // with orphanRemoval, the delete follows
}
```

No public setter for the collection, no public setter for `order` on the line. This is the
same discipline that keeps the aggregate's invariants enforceable
(`domain-logic-organization`).

**`@OneToOne` deserves a separate warning:** a lazy one-to-one on the _inverse_ side cannot
be proxied — the ORM must query to know whether the row exists, so it is eager whatever the
mapping says. Map one-to-one associations from the owning side, or use a shared primary key.

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
set of tags. Because most link tables acquire an attribute eventually, **start with the
entity form whenever there is any hint of one** — the extra class is far cheaper than the
migration.

Two further `@ManyToMany` cautions: use a `Set` rather than a `List` (a `List` causes
delete-all-then-reinsert of the join rows on any change), and never cascade `REMOVE` across
it — deleting a post would delete the tags.

## Collections and the delete-then-insert trap

```java
@OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
private List<OrderLine> lines = new ArrayList<>();
```

With a `List` and no `@OrderColumn`, changing one element can produce
`DELETE FROM order_line WHERE order_id = ?` followed by an insert of every line. Causes and
fixes:

| Cause                                                      | Fix                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `List` where order does not matter                         | Use a `Set` with a stable `equals`                             |
| `Set` whose elements use the default identity `equals`     | Give the child a business key or an assigned UUID              |
| Replacing the collection instance (`this.lines = newList`) | Mutate in place: `lines.clear(); lines.addAll(...)`            |
| `@ElementCollection` of a mutable type                     | Expected behaviour: element collections are replaced wholesale |

Read the statement log after any collection mapping change; this defect is invisible
otherwise (`orm-behavioral-patterns`).

## Query cost by association shape

| Shape                               | Cost of loading the parent and the association                             |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `@ManyToOne` lazy, not accessed     | 1 query                                                                    |
| `@ManyToOne` lazy, accessed per row | 1 + N (fix with `@BatchSize` on the target class)                          |
| `@ManyToOne` eager                  | provider may join or issue secondary selects; always requested by contract |
| `@OneToMany` lazy, accessed per row | 1 + N (fix with `@BatchSize` on the collection)                            |
| `@OneToMany` with fetch join        | 1 query, rows multiplied by collection size                                |
| Two `@OneToMany` fetch joined       | cartesian product — usually a mistake                                      |
| `@ManyToMany` fetch joined          | as above, plus the join table                                              |

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

Application-level checks are bypassed by imports, bulk statements, other services and
manual fixes. The database's are not, and the constraint's name is the contract your error
handling matches on.
