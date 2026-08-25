# Safe publication and the JMM

## What final fields actually guarantee

The JMM gives final fields initialisation safety (JLS 17.5): any thread that obtains a
reference to the object — even through a data race, with no synchronisation at all — sees
the final fields as the constructor left them, including the contents of what they point
to _as of construction_. This is why a properly deep-immutable object can be published by
plain field write, stuffed in a static, or handed between threads freely.

The guarantee has one condition: **`this` must not escape before the constructor
completes.** If it does, another thread can observe the object mid-construction and all
bets are off.

```java
final class Auditor {
    private final Registry registry;
    Auditor(Registry registry) {
        this.registry = registry;
        registry.register(this);   // 'this' escapes — a registry thread may see
    }                              // a half-constructed Auditor
}
```

Escape routes to detect in review:

- passing `this` to any method or constructor from inside the constructor (listener
  registration is the classic);
- starting a thread, scheduling a task, or submitting a lambda that captures `this`;
- calling an overridable method from the constructor — the subclass override runs before
  the subclass's fields are assigned;
- storing `this` into a static or a field of another object.

Fix: complete construction, then publish — a static factory that constructs and _then_
registers is the standard shape.

## Non-final fields get nothing

Initialisation safety covers final fields only. An object with any non-final field,
published without a happens-before edge (volatile write/read, synchronisation, a
concurrent collection, thread start/join), can be seen by another thread with that field
in its default state — `null`, `0` — or in a stale one. "It is only written once, in the
constructor" is not an exemption; the JMM does not count writes, it counts edges.

Practical consequence: making every field final is not style, it is the cheapest
concurrency guarantee in the language. A class that is deeply immutable and fully final
needs no further publication discipline at all.

## The racy single-check idiom — a non-final field that is still safe

`String.hashCode` caches its hash in a non-final, non-volatile field (current JDKs add
a `hashIsZero` flag so even a zero hash is cached — a second way to satisfy condition 3;
the race pattern is the same). Two threads may race; the idiom is safe only when **all**
of these hold:

1. The cached value is computed **deterministically from final fields** — every thread
   that computes it computes the same value, so it does not matter who wins.
2. The field is a primitive of **32 bits or fewer** (or a reference to a deeply immutable
   object). Non-volatile `long`/`double` reads may tear (JLS 17.7); a torn hash is a
   wrong hash.
3. The sentinel ("not yet computed", usually `0`) is handled by **recomputing**, never by
   failing. A value that genuinely hashes to the sentinel is recomputed on every call —
   correct, merely uncached.
4. The read happens **once into a local**: `int h = hash; if (h == 0) { … }`. Reading the
   field twice can observe two different values.

```java
private int hash;                       // deliberately non-final, non-volatile
@Override public int hashCode() {
    int h = hash;
    if (h == 0) { h = Arrays.hashCode(digest); hash = h; }
    return h;
}
```

Redundant computation under contention is the cost; it is a benign race, not a bug. In
review, a non-final field in an otherwise immutable class is a finding **unless** it
matches this idiom point for point — then it is a documented technique, not a smell.
Anything cached that is expensive enough to make redundant computation unacceptable, or
that is a mutable object, needs `volatile` plus double-checked locking or an eager final
field instead.
