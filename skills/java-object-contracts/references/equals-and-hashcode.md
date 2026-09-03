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
- Derive `hashCode` from equality-relevant, stable state. Omitting an equality field is legal but
  may weaken distribution. Adding state that can differ between equal objects violates the
  contract; derived state is safe only when equal objects are guaranteed to derive the same value.
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

Use an immutable byte-sequence value type, or override both methods with `Arrays.equals`/
`Arrays.hashCode` _and_ copy the array in the compact constructor and accessor—`ByteBuffer` is
mutable and its equality depends on remaining elements/position, so it is not a drop-in value.
See
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

Entity equality has no provider-neutral one-line recipe. Three properties collide: generated ids
may be unavailable until insert, the same row can have different Java representatives across
contexts, and providers may use subclass or interface proxies. Decide from the actual lifecycle:

| Situation                                           | Defensible equality choice                                      | Main risk                                                             |
| --------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| instances never compared across persistence context | reference equality (`Object`)                                   | detached instances of the same row compare unequal                    |
| immutable, unique business key exists               | business-key equality                                           | key must never change; DB collation/equality must match Java          |
| application-assigned id exists at construction      | id equality                                                     | generation/collision policy and unsaved sentinel must be explicit     |
| provider/database-generated id                      | non-null id equality plus stable hash and proxy-aware type rule | transient objects, hash transitions and provider-specific proxy types |

For a generated id, `a == b` may short-circuit, but two distinct transient objects with null ids
must not compare equal. Once an id exists, equality may use it; `hashCode` must not change while an
object is held in a hash collection, so hashing directly on a late-assigned id is unsafe. A stable
class-level hash is one trade-off, but it deliberately creates collisions and its “class” must be
the same effective persistent type for proxy and implementation instances.

Type checks are not interchangeable:

- `getClass()` preserves strict type equality but sees a subclass proxy as another class.
- broad `instanceof` tolerates subclass proxies but can collapse distinct entity subtypes and can
  reintroduce symmetry problems in inheritance hierarchies.
- Hibernate/provider helpers can obtain an effective persistent class, but some operations may
  initialize a proxy or couple the domain model to the provider. Jakarta Persistence 3.2 exposes
  `PersistenceUnitUtil.getClass(Object)`; test its loading/error behaviour in your context.

Do not traverse lazy associations in equality, hashing or diagnostics. Whether direct field or
accessor access initializes/observes proxy state depends on access strategy and provider
enhancement, so verify generated SQL and proxy/unproxied symmetry rather than relying on folklore.
Test at least: two transient objects, same row in separate contexts, proxy versus initialized
entity in both call directions, detach/merge, id assignment, and membership before/after persist.

orm-structural-mapping and repository-pattern cover the surrounding design. Entity equality is an
identity/lifecycle question, not “compare all mapped columns.”

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
  contains it; compare proxy/unproxied and cross-context representations in both directions.

Do not use a reflective equals/hashCode helper (`EqualsBuilder.reflectionEquals`,
`HashCodeBuilder.reflectionHashCode`) in production code. It silently picks up every field
added later — including caches, back-references, and the lazy association that turns
`equals` into a query.

## Authoritative references

- [Object contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html)
- [Record contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Record.html)
- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2.html)
- [Hibernate ORM 7 User Guide: implementing equals/hashCode](https://docs.jboss.org/hibernate/orm/7.0/userguide/html_single/Hibernate_User_Guide.html#domain-model-pojo-equalshashcode)
