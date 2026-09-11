# Records and defensive copies

Java blocks are partial snippets targeting Java 17: imports from `java.util`/`java.time`,
the deeply immutable `OrderLine` type, and enclosing class for the wither are omitted.
Same-named before/after declarations are alternatives, not one compilation unit.

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

`Collections.unmodifiableList(input)` is a view: anyone holding mutable `input` can change
the observed state. `Collections.unmodifiableList(new ArrayList<>(input))` instead wraps
a private copy and can be a valid shallow snapshot (including when null elements or an older
Java target must be supported). Neither form makes elements immutable.

## Array components break value semantics twice

```java
public record Signature(byte[] bytes) {}   // broken
```

- Shallow: the caller who passed the array can still flip its bytes.
- `equals`/`hashCode` are generated over the components with `Objects.equals` semantics,
  and arrays compare by identity — two `Signature`s over equal bytes are not equal, and
  their hash codes need not agree. This violates an expected content-value contract; hash
  collisions themselves are legal and do not imply broken collections.

For this content-value contract, copy both ways and align equality, hashing and diagnostic text:

```java
public record Signature(byte[] bytes) {
    public Signature { bytes = bytes.clone(); }
    public byte[] bytes() { return bytes.clone(); }
    @Override public boolean equals(Object o) {
        return o instanceof Signature other && Arrays.equals(bytes, other.bytes);
    }
    @Override public int hashCode() { return Arrays.hashCode(bytes); }
    @Override public String toString() { return "Signature[bytes=<redacted>]"; }
}
```

The Record contract also requires equal records to produce equal strings, with a narrow exception
for equal component values whose own strings differ. Default array-identity text does not describe
this custom content equality; the bounded redacted form avoids exposing the bytes. This does not
turn diagnostic text into a stable serialization format.

Copying alone while retaining generated equality is insufficient: the record contract requires
`r.equals(new R(r.component1(), ...))`. Cloned arrays have different identities. Intentional
array identity is a different contract, not inherently broken equality, but does not promise
immutable contents. Preserve that contract or explicitly change the API. For binary content,
compare the array pattern with a suitable immutable byte value; boxing into `List<Byte>` is not
automatically the right representation.

## Withers

Java has no built-in wither syntax. One option is a method calling the canonical constructor,
which re-runs validation and copying:

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

**After:** keep the class's existing identity equality; changing it to a record would also
introduce value equality, generated text/accessors and different serialization/binder behavior.

```java
public final class Reservation {
    private final String id;
    private final List<String> seatIds;
    public Reservation(String id, List<String> seatIds) {
        this.id = id;
        this.seatIds = List.copyOf(seatIds);
    }
    public List<String> seatIds() { return seatIds; }
}
```

**Trade-offs.** Up to one shallow O(n) copy per construction; the implementation may reuse a
trusted unmodifiable input (see the costs reference before predicting cost).
Callers that relied on mutating the returned list now get
`UnsupportedOperationException`; that is an intentional API restriction, not automatically
a caller bug. `List.copyOf` also rejects a null list and null elements the old code tolerated.
Confirm these changes with callers; use a privately copied wrapper if null elements must remain
valid. Test that separate instances retain identity equality in this focused repair.

**Verification.** A test that mutates the constructor argument after construction and
asserts the reservation unchanged; a test asserting the accessor's result rejects `add`;
the existing suite green.

## False positives — mutation that is not a violation

- **A mutable builder feeding an immutable product.** A confined builder may be reused when
  every product isolates its state. If building transfers mutable storage instead, prevent
  later builder mutation of that storage; `build()` alone does not end an alias's lifetime.
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

- [Collections.unmodifiableList](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Collections.html#unmodifiableList(java.util.List)>)
- [Record equality and reconstruction contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html)
- [JLS §8.10.4: Record Constructors](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10.4)
- [Record serialization](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/serial-arch.html#serialization-of-records)
- [List.copyOf contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
