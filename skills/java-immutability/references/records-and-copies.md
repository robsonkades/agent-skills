# Records and defensive copies

## What a record gives you — and what it does not

A record gives you: a final class, final components, a canonical constructor, `name()`
accessors, and `equals`/`hashCode`/`toString` over the components. It does **not** give you
deep immutability, validation, or defensive copies. Those are yours, and the compact
constructor is where they go:

```java
public record Order(String id, List<OrderLine> lines, Instant placedAt) {
    public Order {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(placedAt, "placedAt");
        lines = List.copyOf(lines);   // unmodifiable shallow snapshot; rejects nulls
    }
}
```

The compact constructor reassigns the parameter; implicit component assignments happen after its
body. `List.copyOf` produces an unmodifiable shallow snapshot and may reuse a trusted
unmodifiable list. It rejects nulls, but it does not copy `OrderLine` elements—those must be
deeply immutable for `Order` to be. Treat reuse as an allowed implementation optimization, not a
fixed identity/performance guarantee.

`Collections.unmodifiableList` is not a substitute: it is a **view**. The caller who still
holds the backing list mutates your "immutable" state through it. Views are for exposing a
live collection read-only, not for storing state.

## Array components break value semantics twice

```java
public record Signature(byte[] bytes) {}   // broken
```

- Shallow: the caller who passed the array can still flip its bytes.
- `equals`/`hashCode` are generated over the components with `Objects.equals` semantics,
  and arrays compare by identity — two `Signature`s over equal bytes are not equal, and
  their hash codes will almost certainly differ. Sets, maps and deduplication silently
  misbehave.

Fix by copying both ways and overriding both methods:

```java
public record Signature(byte[] bytes) {
    public Signature { bytes = bytes.clone(); }
    public byte[] bytes() { return bytes.clone(); }
    @Override public boolean equals(Object o) {
        return o instanceof Signature(byte[] other) && Arrays.equals(bytes, other);
    }
    @Override public int hashCode() { return Arrays.hashCode(bytes); }
}
```

Prefer `List<Byte>`? No — prefer asking whether the component should be an array at all;
for genuine binary payloads the pattern above is the price.

## Withers

Java has no wither syntax. Evolving one component means a hand-written method calling the
canonical constructor, which re-runs validation and copying:

```java
public Order withLines(List<OrderLine> newLines) {
    return new Order(id, newLines, placedAt);
}
```

Write withers only for components that actually evolve. A record with ten components and
ten withers nobody calls is speculative surface area.

## Worked example: a leaking reservation

**Before** — final fields, believed immutable, cached as a map key:

```java
public final class Reservation {
    private final String id;
    private final List<String> seatIds;
    public Reservation(String id, List<String> seatIds) {
        this.id = id;
        this.seatIds = seatIds;          // aliases the caller's list
    }
    public List<String> seatIds() { return seatIds; }   // leaks it
}
```

**Analysis.** Two routes in, one out: the constructor aliases the caller's list, and the
accessor hands the internal reference to every caller. Any of them calling
`reservation.seatIds().add("14C")` mutates shared state; if `seatIds` ever joins
`equals`/`hashCode`, the object also corrupts any `HashSet`/`HashMap` it sits in, because
its hash changes after insertion.

**After:**

```java
public record Reservation(String id, List<String> seatIds) {
    public Reservation {
        Objects.requireNonNull(id, "id");
        seatIds = List.copyOf(seatIds);
    }
}
```

**Trade-offs.** Up to one shallow O(n) copy per construction; the implementation may reuse a
trusted unmodifiable input (see the costs reference before predicting cost).
Callers that relied on mutating the returned list now get
`UnsupportedOperationException` — that is the bug surfacing, but it surfaces at runtime,
so run the tests. `List.copyOf` also rejects null elements the old code tolerated.

**Verification.** A test that mutates the constructor argument after construction and
asserts the reservation unchanged; a test asserting the accessor's result rejects `add`;
the existing suite green.

## False positives — mutation that is not a violation

- **A mutable builder feeding an immutable product.** The builder is confined to one
  thread and dies at `build()`; only the product escapes. Mutability with a scope and an
  end is not shared mutable state.
- **A local accumulator.** `ArrayList` filled in a loop then `List.copyOf`-ed (or
  `Stream.toList()`) on return is the idiomatic construction pattern, not a smell.
- **A cached derived field.** A non-final field caching a value computed from final state
  can be safe — see the racy single-check idiom in the safe-publication reference for the
  exact conditions. Do not "fix" it to final-plus-eager without reading them.
- **An intentionally mutable component with a documented lifecycle** (e.g. a JPA entity's
  collection). That class is not a value object; making it one is a different decision,
  covered in the costs reference.

## Serialization and framework boundaries

Records preserve component shape, not deep immutability. JSON/JPA/message mappers can create new
mutable element graphs, and deserialization may choose constructors/access paths differently by
framework/version. Test that the configured binder invokes validation/copying and that round trips
preserve canonical form. Java serialization of records invokes the canonical constructor, but that
does not make mutable components safe or stabilize a wire schema.

## Authoritative references

- [JLS §8.10.4: Record Members](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10.4)
- [Record serialization](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/serial-arch.html#serialization-of-records)
- [List.copyOf contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
