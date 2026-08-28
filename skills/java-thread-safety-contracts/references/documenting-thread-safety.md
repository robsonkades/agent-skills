# Documenting the contract

## The five levels

| Level                         | Promise                                                             | Caller must                             | Typical example                                      |
| ----------------------------- | ------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| **Immutable**                 | State never changes after construction                              | nothing                                 | `String`, `Instant`, a well-built record             |
| **Thread-safe**               | Any sequence of calls from any threads leaves the object consistent | nothing                                 | `ConcurrentHashMap`, `AtomicLong`                    |
| **Conditionally thread-safe** | Individual calls are safe; some sequences are not                   | lock externally for the named sequences | `Collections.synchronizedMap` + iteration            |
| **Not thread-safe**           | Nothing; concurrent use corrupts it                                 | provide exclusion, or confine           | `ArrayList`, `HashMap`, `SimpleDateFormat`           |
| **Thread-confined**           | Belongs to one thread/request for its lifetime                      | not share it at all                     | a request-scoped builder, a JDBC `Connection` borrow |

"Thread-hostile" is worth a mention as a sixth: a class that breaks even with external
locking, because it mutates shared global state (`System.setProperty`, `Locale.setDefault`,
`TimeZone.setDefault`). These are not fixable by callers; the only remedy is not to call them
outside startup.

## What to write

Put it in the class Javadoc, in one or two sentences that say the level, what is guarded, and —
for conditionally thread-safe classes — exactly which sequences need external locking and on
what.

```java
/**
 * A bounded, in-memory registry of active sessions.
 *
 * <p><strong>Thread-safe.</strong> All state is guarded by a private lock; every public
 * method may be called from any thread in any order. Iteration in {@link #snapshot()}
 * returns an immutable copy, so callers hold no lock and observe a point-in-time view.
 */
public final class SessionRegistry {
    private final Object lock = new Object();

    @GuardedBy("lock")
    private final Map<SessionId, Session> sessions = new HashMap<>();
    ...
}
```

```java
/**
 * <p><strong>Not thread-safe.</strong> Instances are confined to the request that creates
 * them. Sharing one between threads, including across an executor submission, corrupts the
 * accumulated totals.
 */
public final class InvoiceAccumulator { ... }
```

```java
/**
 * <p><strong>Conditionally thread-safe.</strong> Single operations are atomic. Compound
 * sequences — {@code contains} followed by {@code add}, or any iteration — must be performed
 * while holding the monitor of the object returned by {@link #lock()}.
 */
```

The distinguishing feature of a good statement is that a caller can act on it without reading
the implementation. "This class is synchronised where necessary" fails that test; so does
silence.

## Where the annotation helps

`@GuardedBy("lock")` on a field (from JCIP, or the equivalent in JSR-305/Error Prone
distributions) states which lock protects it. The language does not enforce it, but:

- it makes review mechanical — every access to the field must be inside a block holding that
  lock;
- Error Prone and some IDE inspections do check it, turning a convention into a build failure;
- it survives refactoring better than a comment, because it names the lock as an identifier.

For a class whose fields are guarded by different locks, the annotation is the only readable
way to say so.

## Documenting what you do _not_ promise

Two statements are worth making explicitly because callers assume the opposite:

- **Iteration.** A synchronised wrapper (`Collections.synchronizedList/Map`) makes each method
  atomic and iteration not atomic: iterating without holding the wrapper's own monitor throws
  `ConcurrentModificationException` or silently sees a torn view. Say what to lock on, or
  return an immutable snapshot instead and remove the requirement.
- **Callbacks.** If your class invokes a caller-supplied listener, say **which thread** it runs
  on and **whether any lock is held** (it should be none). A listener contract that does not
  state this leads callers to do work that deadlocks you.

```java
/**
 * Listeners are invoked on the caller's thread after the registry lock has been released.
 * A listener that throws does not prevent other listeners from running; the exception is
 * logged and swallowed.
 */
```

## Publication is part of the contract

A class can be perfectly synchronised internally and still be broken by how it is shared:

- **Static fields and singletons** are reachable from every thread from the moment they are
  assigned; a mutable object there is shared whether the design intended it or not
  (java-object-construction).
- **A field written after construction and read without synchronisation** may be seen as null
  or stale. Final fields plus no `this` escape give initialisation safety; anything else needs
  a happens-before edge (java-memory-model, java-immutability).
- **Framework-managed singletons** (a `@Service`, a `@Bean`, a servlet, a handler) are shared
  by construction. Any mutable field there is shared mutable state with request-level
  concurrency, which is the most common source of "works locally, corrupts under load".

## Reviewing a class against its own claim

- [ ] The Javadoc states one of the five levels, in those words.
- [ ] Every mutable field is either guarded (and annotated) or provably confined.
- [ ] The lock is private and not otherwise reachable.
- [ ] No public method leaks a reference to internal mutable state (that would let callers
      mutate outside the lock).
- [ ] No method returns an iterator or a live view of guarded state; snapshots are copies.
- [ ] Callback and listener contracts state the thread and the lock state.
- [ ] For a "thread-safe" claim, compound operations that callers will obviously want
      (check-then-act, iterate-and-modify) are provided as atomic methods — otherwise the
      honest claim is "conditionally thread-safe".
- [ ] The claim is exercised by a test that runs the documented usage concurrently
      (concurrency-testing).
