# toString and copying without Cloneable

## toString is a diagnostic contract with a disclosure risk

`toString` is called by code you did not write: logging frameworks on every argument,
exception messages, assertion failures, debuggers, `String.valueOf`, string concatenation,
`Collection.toString` on any collection containing the object. That reach is what makes it
useful and what makes it dangerous.

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

Prefer a dedicated wrapper type for secrets (`record Secret(char[] value)` with a redacting
`toString`) so the redaction cannot be forgotten at each use site. structured-logging covers
what a log event should carry and how it should be structured; the rule here is that the
redaction belongs in the _type_, because you cannot audit every call site that might
interpolate it.

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
- `final` fields **cannot** be reassigned in a `clone` implementation, so a class that is
  correctly written with final fields cannot deep-copy them. Cloneable and immutability
  are structurally incompatible.
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
| A copy of a collection             | `List.copyOf`, `new ArrayList<>(other)`, `Map.copyOf`                                                 |
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

"Serialise and deserialise to deep-copy" works, and it is the wrong default for two reasons:
it is orders of magnitude more expensive than field copying, and with Java serialisation it
drags in the security surface of `readObject` on a graph the code did not intend to expose.
If a deep copy really is needed across a boundary, use the format the boundary already uses
(JSON, protobuf) and treat it as a conversion, not a clone; serialization-performance covers
the cost and java-serialization-hardening covers the trust boundary.
