# Safe publication and the JMM

## What final fields actually guarantee

The JMM gives final fields special initialization safety (JLS 17.5): when another thread obtains a
properly constructed reference, it sees final fields initialized and receives specified visibility
for the reachable state frozen through them. This is stronger than ordinary racy fields, but does
not make a racy publication protocol good engineering: a reader can still observe a stale/null
holder reference, and later mutable state needs its own happens-before edges. Class initialization,
volatile handoff, locks, thread start/join and concurrent collections provide explicit publication.

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

- passing `this` to code that may retain/publish/call back during construction (listener
  registration is the classic); a private non-publishing helper is not itself an escape;
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

Practical consequence: final fields materially simplify safe immutable state, but they do not
publish the containing reference or make external collaborators/thread-confined resources safe.
Use a normal happens-before handoff so visibility, ownership and lifecycle are reviewable.

## The racy single-check idiom — a non-final field that is still safe

`String.hashCode` caches its hash in a non-final, non-volatile field (current JDKs add
a `hashIsZero` flag so even a zero hash is cached — a second way to satisfy condition 3;
the race pattern is the same). Two threads may race; the idiom is safe only when **all**
of these hold:

1. The cached value is computed **deterministically from final fields** — every thread
   that computes it computes the same value, so it does not matter who wins.
2. Each racy read/write is atomic and every observable candidate is semantically valid. Java
   permits non-volatile `long`/`double` accesses to be non-atomic (JLS 17.7); references are
   atomic, but their targets still need safe construction/immutability.
3. The sentinel ("not yet computed", usually `0`) is handled by **recomputing**, never by
   failing. A value that genuinely hashes to the sentinel is recomputed on every call —
   correct, merely uncached.
4. Code tolerates stale/repeated computation and does not require cross-field atomicity. Reading
   once into a local makes reasoning explicit; multiple racy reads may observe different legal
   states and must not be combined into an impossible invariant.

```java
private int hash;                       // deliberately non-final, non-volatile
@Override public int hashCode() {
    int h = hash;
    if (h == 0) { h = Arrays.hashCode(digest); hash = h; }
    return h;
}
```

Here `digest` must itself be defensively copied and never mutated; otherwise equal/hash behaviour
can change regardless of the cache race.

Redundant computation under contention is the cost; it is a benign race, not a bug. In
review, a non-final field in an otherwise immutable class is a finding **unless** it
matches this idiom point for point — then it is a documented technique, not a smell.
Anything cached that is expensive enough to make redundant computation unacceptable, or
that is a mutable object, needs `volatile` plus double-checked locking or an eager final
field instead.

## Authoritative references

- [JLS §17.4–17.5: Memory Model and final fields](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5)
- [JLS §17.7: Non-atomic treatment of double and long](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.7)
- [Java concurrency package memory-consistency effects](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html#MemoryVisibility)
