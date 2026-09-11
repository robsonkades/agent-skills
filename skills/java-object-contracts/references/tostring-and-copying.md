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
    @Override public String toString() { return "Credentials[redacted]"; }
}
```

Prefer a dedicated secret type with a redacting `toString` so the policy cannot be forgotten at
each use site. A record with a `char[]` component alone does not establish secret handling:
choose identity/content equality, access ownership and erasure policy deliberately. Arrays remain
mutable and extra copies limit rather than guarantee memory clearing. structured-logging covers event
design; the rule here is that defense belongs at both the type and sink.

Verify with hostile username/password values (including line breaks) that neither appears
in the representation. Do not assume a username is safe diagnostic metadata merely because
it is not the password. These record snippets require Java 16+.

**Exclude** anything expensive or lazy. A `toString` that iterates a large collection, or
touches a lazily loaded association, turns a log statement into a query or an O(n) scan —
and a debugger's variable panel calls `toString` on everything in scope, so the cost lands
during exactly the session where you are trying to reason about a hang.

## Do not let anything parse it

Parsing `toString` creates a format dependency; inspect whether it is a supported public contract
or an incidental internal use before changing it. A diagnostic test alone does not publish an API.
Two rules keep accidental coupling bounded:

- If a textual representation is part of the contract, give it a named method with a
  documented grammar (`toIso8601()`, `format(Style)`), and state the grammar in the Javadoc.
  `Instant.toString` and `UUID.toString` are specified contracts; preserve or explicitly migrate
  any such existing API rather than renaming it unconditionally.
- If it is not part of the contract, say so ("the format is unspecified and may change") and
  assert only intended diagnostic properties, such as redaction or bounded content. Exact-string
  tests are appropriate when the format itself is deliberately promised.

Records make the second rule easier to break: the generated format looks stable enough to
assert on, and then adding a component changes every such assertion. Assert on components.

## Copying: what to do instead of clone

`Cloneable` is a marker interface with no `clone` method; it changes what the protected
`Object.clone` does. Preserve a correct existing contract when consumers require it; audit these
limitations before introducing or replacing one:

- `Object.clone` creates a **shallow** copy by field-by-field assignment. Every mutable
  referenced object is shared with the original — the standard source of "modifying the copy
  changed the original".
- `final` reference fields cannot be reassigned by ordinary Java clone code, so a shallow clone
  shares their referents. That is safe for deeply immutable referents and wrong when “copy” means
  independent mutable state; immutability and cloning are not structurally incompatible, but an
  immutable object normally needs no copy.
- `super.clone()` conventionally preserves the runtime subtype. A replacement constructor or
  factory must separately honor any subtype contract. Object cloning does not rerun constructors;
  copied valid state may preserve invariants, but independent resources/lifecycle need review.
- The `clone` contract itself is stated in terms of "no constructor is called" conventions
  rather than semantics, and `x.clone() != x`, `x.clone().getClass() == x.getClass()`,
  `x.clone().equals(x)` are described as "not absolute requirements".

The replacements, in the order to prefer them:

| Need                               | Use                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A copy of a value type             | share an immutable value when identity/lifecycle permit it (java-immutability)                        |
| A modified variant of a value type | a wither: `order.withStatus(SHIPPED)` returning a new instance                                        |
| A copy of a mutable class          | a copy constructor `Foo(Foo other)` or a static factory `Foo.copyOf(other)`                           |
| A shallow collection snapshot      | `List.copyOf`/`Map.copyOf` (unmodifiable, reject nulls) or mutable `new ArrayList<>(other)`           |
| A copy of an array                 | `array.clone()` or `Arrays.copyOf` — the one place clone is idiomatic                                 |
| A deep copy of a graph             | an explicit copy method, or serialise/deserialise if the cost is acceptable and the format is trusted |

A copy constructor takes a parameter, so it can also convert (`ArrayList(Collection)`), it
can be overloaded, it runs the constructor's validation, and it works with `final` fields.
The partial Java 16+ example below assumes deeply immutable `Leg` elements. `List.copyOf`
copies only the container; it does not make mutable elements immutable.

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

Sharing a deeply immutable, safely published value is adequate when consumers do not require a
fresh identity or independent lifecycle. A copy request alone does not prove accidental mutation.
Retain a suitable existing copy API; gof-prototype owns graph, subtype and resource-copy policies.

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
