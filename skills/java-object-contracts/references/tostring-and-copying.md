# toString and copying without Cloneable

## toString is a diagnostic contract with a disclosure risk

`toString` is called by code you did not write: enabled log formatting, exception messages,
assertion failures, debugger renderers, `String.valueOf`, concatenation and collection
rendering. Parameterized logging may defer it when a level is disabled, but once formatting
occurs the object's disclosure/cost policy is in play.

**Include** what identifies the instance in an incident: the identity fields, the state that
decides behaviour, and the correlation-bearing fields (order id, tenant, request id). A
`toString` returning `com.acme.Order@6d06d69c` costs a debugging session; the default is
almost never good enough for a domain type.

**Exclude** secrets and personal data. This is the concrete failure with records:

```java
record Credentials(String username, String password) { }
LOG.info("authenticating {}", credentials);
// Credentials[username=alice, password=hunter2]  -> now in the log pipeline, the index,
//                                                   the backup, and any trace attribute
```

The generated `toString` includes every component, unconditionally. Any record carrying a
token, password, card number, national id, email or address needs an explicit override:

```java
record Credentials(String username, String password) {
    @Override public String toString() { return "Credentials[username=" + username + "]"; }
}
```

Prefer a dedicated secret type with a redacting `toString` so the policy cannot be forgotten at
each use site. A record with a `char[]` component is insufficient unless it defensively copies on
construction/access, defines content equality deliberately, and controls erasure; arrays remain
mutable and copies limit rather than guarantee memory clearing. structured-logging covers event
design; the rule here is that defense belongs at both the type and sink.

**Exclude** anything expensive or lazy. A `toString` that iterates a large collection, or
touches a lazily loaded association, turns a log statement into a query or an O(n) scan —
and a debugger's variable panel calls `toString` on everything in scope, so the cost lands
during exactly the session where you are trying to reason about a hang.

## Do not let anything parse it

Once a `toString` is parsed anywhere — a test asserting on the exact string, a script
scraping a log, another service reading a field — its format is a published API and cannot
change. Two rules keep that from happening by accident:

- If a textual representation is part of the contract, give it a named method with a
  documented grammar (`toIso8601()`, `format(Style)`), and state the grammar in the Javadoc.
  `Instant.toString` and `UUID.toString` are specified precisely because they _are_ contracts.
- If it is not part of the contract, say so ("the format is unspecified and may change") and
  write tests that assert on the fields you extracted, never on the whole string.

Records make the second rule easier to break: the generated format looks stable enough to
assert on, and then adding a component changes every such assertion. Assert on components.

## Copying: what to do instead of clone

`Cloneable` is a marker interface with no `clone` method; it changes what the protected
`Object.clone` does. That indirection produces a contract nobody can honour cleanly:

- `Object.clone` creates a **shallow** copy by field-by-field assignment. Every mutable
  referenced object is shared with the original — the standard source of "modifying the copy
  changed the original".
- `final` reference fields cannot be reassigned by ordinary Java clone code, so a shallow clone
  shares their referents. That is safe for deeply immutable referents and wrong when “copy” means
  independent mutable state; immutability and cloning are not structurally incompatible, but an
  immutable object normally needs no copy.
- A class that supports cloning constrains every subclass: `super.clone()` must be called, or
  the subclass silently produces an object of the wrong class. Constructors are not run, so
  invariants established in a constructor are not established in a clone.
- The `clone` contract itself is stated in terms of "no constructor is called" conventions
  rather than semantics, and `x.clone() != x`, `x.clone().getClass() == x.getClass()`,
  `x.clone().equals(x)` are described as "not absolute requirements".

The replacements, in the order to prefer them:

| Need                               | Use                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A copy of a value type             | make it immutable and share it — no copy needed (java-immutability)                                   |
| A modified variant of a value type | a wither: `order.withStatus(SHIPPED)` returning a new instance                                        |
| A copy of a mutable class          | a copy constructor `Foo(Foo other)` or a static factory `Foo.copyOf(other)`                           |
| A shallow collection snapshot      | `List.copyOf`/`Map.copyOf` (unmodifiable, reject nulls) or mutable `new ArrayList<>(other)`           |
| A copy of an array                 | `array.clone()` or `Arrays.copyOf` — the one place clone is idiomatic                                 |
| A deep copy of a graph             | an explicit copy method, or serialise/deserialise if the cost is acceptable and the format is trusted |

A copy constructor takes a parameter, so it can also convert (`ArrayList(Collection)`), it
can be overloaded, it runs the constructor's validation, and it works with `final` fields.

```java
public final class Route {
    private final List<Leg> legs;                 // deeply immutable component

    public Route(Route other) { this(other.legs); }             // copy constructor
    public Route(List<Leg> legs) { this.legs = List.copyOf(legs); }
    public Route withLeg(Leg leg) {                              // wither
        var next = new ArrayList<>(legs);
        next.add(leg);
        return new Route(next);
    }
}
```

Note that a "copy" of a genuinely immutable object is unnecessary work: if the type is deeply
immutable and safely published, sharing the reference is the copy. Reaching for a copy is a
signal that something in the graph is mutable — fix that instead, unless the mutability is
deliberate (a builder, an accumulator, a JPA entity).

## Deep copy across a serialisation boundary

“Serialize and deserialize to deep-copy” works only for graphs and semantics represented by the
format, and it is a poor default: it is usually much more expensive than explicit copying, may
lose concrete types/identity sharing, and Java serialization introduces the `readObject` attack
surface.
If a deep copy really is needed across a boundary, use the format the boundary already uses
(JSON, protobuf) and treat it as a conversion, not a clone; serialization-performance covers
the cost and java-serialization-hardening covers the trust boundary.

## Authoritative references

- [Object.clone contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html#clone()>)
- [Cloneable API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Cloneable.html)
- [Record toString contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Record.html)
- [List.copyOf contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
