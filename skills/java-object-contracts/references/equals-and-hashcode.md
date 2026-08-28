# equals and hashCode

## The contract, as five checkable properties

For non-null `x`, `y`, `z`:

| Property     | Statement                                                            | How it usually breaks                                                              |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Reflexive    | `x.equals(x)`                                                        | comparing a field with `!=` on `NaN`; an entity whose id is null on both sides     |
| Symmetric    | `x.equals(y)` iff `y.equals(x)`                                      | a subclass or a "compatible type" clause that accepts a type not accepting it back |
| Transitive   | `x.equals(y)` and `y.equals(z)` implies `x.equals(z)`                | a subclass adding a component and comparing "the parts we share"                   |
| Consistent   | repeated calls return the same result while nothing relevant changes | equals reading a mutable field, the clock, or a lazily loaded association          |
| Null-hostile | `x.equals(null)` is `false`, never an exception                      | casting before the null check                                                      |

And the linked obligation: **equal objects must have equal hash codes**. Unequal objects
_may_ share one — that is a collision, not a defect.

Both contracts are enforced by nothing at compile time and by everything at runtime. The
"consistent" property is the one people discover last: an `equals` that reads a mutable
field is consistent only until someone mutates it, which in a hash-based collection means
the entry is stranded in the wrong bucket.

## The canonical implementation

```java
public final class AccountNumber {
    private final String iban;
    private final Country country;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;                       // cheap identity short-circuit
        if (!(o instanceof AccountNumber other)) return false;   // handles null and type in one test
        return iban.equals(other.iban) && country == other.country;
    }

    @Override
    public int hashCode() {
        return Objects.hash(iban, country);               // same fields, same order, nothing else
    }
}
```

Details that matter:

- `instanceof` with a pattern variable replaces the null check, the type check and the cast.
  An explicit `o == null` line before it is dead code.
- The field list in `hashCode` must be the field list in `equals`. A field in `equals` but not
  in `hashCode` is legal but weakens distribution; a field in `hashCode` but not in `equals`
  is a contract violation.
- `Objects.hash(...)` boxes its arguments into a varargs array. That is irrelevant almost
  everywhere and measurable in a hot loop or a hash-heavy key; there, write
  `31 * (31 * iban.hashCode() + country.hashCode())` or cache the result. Do not do it on
  speculation — allocation-profiling is how you find out whether it matters.
- Order comparisons cheapest-first and most-discriminating-first when fields differ in cost:
  an `int` before a `String`, a locally held field before one that dereferences.

## Records write both, correctly, with two edges

A record's generated `equals` compares every component — primitives by value, references by
`Objects.equals`, and `float`/`double` as by `Float.compare`/`Double.compare`. Two
consequences that differ from hand-written `==` comparisons:

```java
record Measurement(double value) { }
new Measurement(Double.NaN).equals(new Measurement(Double.NaN));   // true  (== would be false)
new Measurement(0.0).equals(new Measurement(-0.0));                // false (== would be true)
```

The genuine trap is an array component:

```java
record Payload(byte[] bytes) { }                 // equals compares array identity
new Payload(new byte[]{1}).equals(new Payload(new byte[]{1}));   // false
```

Use `List<Byte>`, a `ByteBuffer`, or override both methods with `Arrays.equals`/
`Arrays.hashCode` _and_ copy the array in the compact constructor and the accessor — see
java-immutability. An unaddressed array component in a record used as a map key is a defect,
not a nuance.

## Inheritance: the part with no free answer

There is no way to add a value-carrying component in a subclass and keep symmetry and
transitivity with the superclass. The two defensible positions:

1. **`instanceof` plus a `final` class** (or a class whose subclasses add no state). Symmetry
   and transitivity hold because no subclass can disagree. This is the default and the reason
   records are `final`.
2. **`getClass()` equality.** Symmetric and transitive, at the cost of Liskov substitutability:
   an instance of a subclass is never equal to an instance of the superclass, even when the
   subclass adds nothing. This is the right choice for entity types under a proxying ORM only
   if you disable proxies — otherwise it breaks (below).

The trap is the third option that looks like a compromise: `instanceof` in a non-final class,
with the subclass overriding `equals` to also compare its own field. Then
`sub.equals(base)` is `false` while `base.equals(sub)` is `true`, and a `HashSet` containing
both behaves differently depending on insertion order. When a subtype genuinely needs extra
value state, use composition — hold the base value as a component — rather than extending;
java-composition-over-inheritance covers the wider decision.

## Entities, ORMs and proxies

Three properties collide for a persistent entity: the id is assigned by the database on
flush; Hibernate hands out lazy proxies that are generated subclasses; and the same row may
be represented by different instances across sessions.

```java
@Entity
public class Order {
    @Id private final UUID id = UUID.randomUUID();   // assigned at construction, not by the DB

    @Override public boolean equals(Object o) {
        // instanceof, not getClass(): a lazy proxy's class is a generated subclass
        return o instanceof Order other && id.equals(other.getId());
    }

    @Override public int hashCode() { return id.hashCode(); }

    public UUID getId() { return id; }   // call the getter, not the field: a proxy's field is null
}
```

- **Application-assigned id** (UUID at construction) is the only option that is stable from
  construction through persistence, so `HashSet` membership survives the flush. A database
  sequence id does not: `hashCode` changes when the id is filled in.
- **When the id must come from the database**, use a business/natural key for `equals` if one
  exists; otherwise return a **constant** `hashCode` (e.g. `getClass().hashCode()`) and compare
  by id with a null-safe check. A constant hash degrades a large `HashSet` to a linear scan —
  acceptable for the handful of entities in one session, not for a collection of thousands.
- **Access the other object through its getter**, never through its field: for a proxy, fields
  are unpopulated until initialisation and reading `other.id` directly yields `null`.
- **`getClass()` comparison breaks with proxies.** `order.getClass()` is
  `Order$HibernateProxy$xyz`, never equal to `Order.class`. If a codebase must use
  `getClass()`, it has to route through `Hibernate.getClass(o)`.

orm-structural-mapping and repository-pattern cover the surrounding design; the rule here is
that entity equality is an identity question, never a "compare all the columns" question.

## What hash values are, and are not, stable across

| Source                                            | Stable within one JVM run | Stable across runs / JVMs             | Safe to persist or shard on                |
| ------------------------------------------------- | ------------------------- | ------------------------------------- | ------------------------------------------ |
| `Object.hashCode` (identity)                      | yes                       | **no**                                | no                                         |
| `enum.hashCode` (identity-based)                  | yes                       | **no**                                | no                                         |
| `String.hashCode`                                 | yes                       | yes — the algorithm is specified      | only for reproducibility, not distribution |
| A record's generated `hashCode`                   | yes                       | **no** — the algorithm is unspecified | no                                         |
| `Objects.hash(...)` over fields                   | yes                       | depends entirely on the components    | no                                         |
| `MessageDigest` (SHA-256) of a canonical encoding | yes                       | yes                                   | yes                                        |

The failure this table prevents: a "partition = `key.hashCode() % partitions`" that works
until an enum or a record with an enum component enters the key, at which point two replicas
compute different partitions for the same key and ordering guarantees evaporate. Cross-process
routing needs an explicit, specified hash — see consistent-hashing and
message-ordering-and-partitioning. Deduplication keys need the same discipline; idempotency
covers the storage side.

## Testing these by property

One hand-written assertion per method proves almost nothing. What is worth writing:

- **Reflexive/symmetric/transitive/consistent over generated instances.** A property-based
  test (jqwik, or a hand-rolled loop over a small set of instances including "equal but not
  identical" pairs) catches the subclass and float cases that examples miss.
- **The hash obligation:** for every pair where `a.equals(b)`, assert
  `a.hashCode() == b.hashCode()`.
- **Round-trip through a collection:** `set.add(a); assertTrue(set.contains(b))` for equal
  instances, and — the one that catches mutable keys — mutate a field after insertion and
  assert the test _fails_, documenting why the field is excluded.
- **For entities:** add to a `HashSet` before persist, flush, and assert the set still
  contains it.

Do not use a reflective equals/hashCode helper (`EqualsBuilder.reflectionEquals`,
`HashCodeBuilder.reflectionHashCode`) in production code. It silently picks up every field
added later — including caches, back-references, and the lazy association that turns
`equals` into a query.
