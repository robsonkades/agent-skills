# If you must implement Serializable

## What you are signing up for

Adding `implements Serializable` to a class:

- **Publishes the private representation.** Field names, types and the class hierarchy become
  part of the compatibility contract. Renaming a private field is now a breaking change for any
  persisted or in-flight data.
- **Adds an extra constructor you did not write.** Deserialization creates the object without
  running a constructor, then populates fields from the stream. Every invariant a constructor
  enforces is bypassed unless `readObject` re-enforces it.
- **Increases the testing burden.** Round-trip and cross-version tests become part of the class's
  obligations, and they are the tests most likely to be missing.
- **Constrains subclasses**, which inherit the serializability and the obligations.

None of that is worth paying for convenience. Legitimate reasons: a framework requires it
(session replication, some caches, some remoting), or the type is a long-lived value published
in an API where clients already depend on the form.

## serialVersionUID

```java
private static final long serialVersionUID = 1L;
```

Declare it on every `Serializable` class. Without it, the JVM computes a value from the class's
structure — name, modifiers, interfaces, fields, methods — so adding a method or changing a
modifier changes the id and produces `InvalidClassException` on the next read of older data.
That failure appears during a rolling deploy or on a cache read, not in CI.

Keep the value stable while the serialized form stays compatible; change it deliberately only
when you intend to break compatibility with the old form.

## Choosing the serialized form

Use the **default form** when the physical layout genuinely is the logical content — a small
value object with primitive and immutable fields is the good case:

```java
public final class Name implements Serializable {
    private static final long serialVersionUID = 1L;
    private final String first;   // logical content, one-to-one with the fields
    private final String last;
}
```

Use a **custom form** when it is not. The classic example is a linked structure, where the
default form serialises the entire node graph — recursing once per node, so a long list
overflows the stack — and pins the implementation to a linked representation forever:

```java
public final class StringList implements Serializable {
    private static final long serialVersionUID = 1L;
    private transient int size;               // transient: not part of the logical content
    private transient Entry head;             // transient: the representation, not the content

    private void writeObject(ObjectOutputStream s) throws IOException {
        s.defaultWriteObject();               // always call, even with no non-transient fields
        s.writeInt(size);
        for (Entry e = head; e != null; e = e.next) s.writeObject(e.data);
    }

    private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {
        s.defaultReadObject();                // always call
        int n = s.readInt();
        if (n < 0 || n > MAX_ENTRIES) throw new InvalidObjectException("bad size: " + n);
        for (int i = 0; i < n; i++) add((String) s.readObject());
    }
}
```

Rules encoded there: mark representation-only fields `transient`; call
`defaultWriteObject`/`defaultReadObject` first, so a later non-transient field can be added
compatibly; write the logical content explicitly; and validate anything read from the stream
before using it, including sizes used to allocate.

## readObject is hostile-input territory

Two attacks against a class whose `readObject` is careless:

**1. Invariant bypass.** A stream can be hand-crafted with field values no constructor would
accept — a negative balance, an end date before the start date, a null in a `@NonNull` field.
`readObject` must repeat the constructor's validation.

**2. Stolen internal references.** A stream can be extended with extra bytes that add a
reference to an object inside the deserialized graph. The attacker then holds a live reference
to a "private" mutable component and can mutate it after deserialization.

```java
private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {
    s.defaultReadObject();
    // 1. Defensively copy every mutable component BEFORE validating
    start = new Date(start.getTime());
    end   = new Date(end.getTime());
    // 2. Validate the copies — validating the originals proves nothing about what we keep
    if (start.compareTo(end) > 0) throw new InvalidObjectException("start after end");
}
```

The order is the whole point: copy first, then validate the copy. A `final` field cannot be
reassigned this way, which is one more reason the serialization proxy below is preferable for
anything with real invariants.

Also: `readObject` must not invoke any overridable method of the class — the override would run
against a partially deserialized object, the same hazard as calling one from a constructor
(java-object-construction).

## The serialization proxy pattern

The best available answer for a class with invariants, mutable components, or a representation
you want to keep free to change:

```java
public final class Period implements Serializable {
    private static final long serialVersionUID = 1L;
    private final Date start;
    private final Date end;

    public Period(Date start, Date end) { ... }        // validates, copies

    private static final class SerializationProxy implements Serializable {
        private static final long serialVersionUID = 1L;
        private final Date start;                       // the *logical* state
        private final Date end;

        SerializationProxy(Period p) { this.start = p.start; this.end = p.end; }

        // Deserialization ends here, going through the real constructor:
        private Object readResolve() { return new Period(start, end); }
    }

    private Object writeReplace() { return new SerializationProxy(this); }

    // A stream that names Period directly is an attack; refuse it.
    private void readObject(ObjectInputStream s) throws InvalidObjectException {
        throw new InvalidObjectException("proxy required");
    }
}
```

What it buys: deserialization runs the ordinary constructor, so validation and defensive copies
apply; fields can be `final`; the class's internal representation can change while the proxy's
form stays stable; and the "hand-crafted stream" attacks are closed by the `readObject` that
always throws.

Its limits: it does not work for classes that clients may extend, nor for object graphs with
cycles through the proxied class (the `readResolve` would see a not-yet-constructed object),
and it costs an extra object per serialization.

## Records remove most of this

A record's deserialization is defined to go through its **canonical constructor**: the stream
supplies component values, and the constructor — including a compact constructor's validation
and defensive copies — runs normally. Consequences:

- No `readObject` hazard: invariants cannot be bypassed.
- No serialization proxy needed for the invariant problem.
- Records cannot customise `readObject`/`writeObject`, by design; the serialized form is the
  component list.
- Changing the component list changes the form — additive changes deserialise missing
  components as defaults, and removals/renames break compatibility, so the same versioning
  discipline applies.

For a serializable value type on a modern JDK, a record is the default answer, and
java-immutability covers making the components genuinely immutable.

## Related hooks

- **`writeReplace`** substitutes another object at write time (the proxy pattern; also how
  enums and some singletons work).
- **`readResolve`** substitutes the deserialized object with another at read time — required
  for a `Serializable` singleton (with every field `transient`, or an attacker can steal a
  reference before the substitution).
- **`Externalizable`** hands you full control and full responsibility, including a public no-arg
  constructor that anything can call. It is rarely justified; a custom `writeObject`/`readObject`
  covers the same needs with fewer holes.
- **`ObjectStreamField` / `serialPersistentFields`** declares the serialized fields explicitly,
  decoupling them from the actual fields. Useful when the form must survive a refactor.

## Compatibility testing

Serialization bugs surface across time, not within a single build. The tests that catch them:

- **Golden files.** Commit a serialized artefact from each released version and assert the
  current code deserialises each one into the expected value. This is the only test that catches
  an accidental `serialVersionUID` change or a field rename.
- **Round trip with mutation.** Deserialize, mutate what the stream could have aliased, and
  assert the object is unaffected — the defensive-copy test.
- **Hostile stream.** Feed a stream with an invalid value and assert `InvalidObjectException`,
  not a corrupt object.
- **Forward compatibility**, when a rolling deploy needs it: the previous release must be able
  to read what the new one writes, or the deploy needs a flush/drain step in its runbook.
