# Reachability, reference types and Cleaner

## The levels, and when each is cleared

An object is _strongly reachable_ if some chain of strong references reaches it from a GC
root (a live thread's stack, a static field of a loaded class, a JNI reference). Weaker
levels apply only when no stronger path exists.

| Level   | Cleared when                                                                                                                                                                           | Practical meaning                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Strong  | never (until unreachable)                                                                                                                                                              | the default; ordinary fields and locals                              |
| Soft    | at the collector's discretion under memory pressure; **all** soft references are guaranteed cleared before an `OutOfMemoryError` is thrown                                             | "keep while there is room" — the collector, not you, sets the policy |
| Weak    | at the next collection that finds the object only weakly reachable                                                                                                                     | "keep only while someone else keeps it"                              |
| Phantom | never returns a referent — `get()` is always `null`; the reference is enqueued after the object is finalizable-and-finalized, and since Java 9 the referent is cleared at enqueue time | "tell me it is gone so I can release something else"                 |

HotSpot's soft-reference policy is time- and pressure-based: a softly reachable object
survives roughly `-XX:SoftRefLRUPolicyMSPerMB` milliseconds per megabyte of free heap since
its last access (default 1000). The consequences that matter:

- Soft references make the heap _look_ healthy while a cache silently consumes everything up
  to the ceiling, so GC does more work per cycle for the entire life of the process.
- Clearing happens under pressure, in bulk. A soft cache therefore loses a large fraction of
  its entries at the moment load is highest, and the resulting miss storm hits the very
  backend the cache existed to protect. This is the mechanism behind "the cache stopped
  helping exactly when we needed it".
- Sizing is not expressible. `Caffeine.newBuilder().maximumSize(50_000)` or
  `.expireAfterWrite(...)` states a bound the operator can reason about and the collector can
  plan around. Prefer it; caching-strategies covers the policy choice.

## WeakHashMap

Keys are weakly referenced; values are not. Entries vanish when the key becomes weakly
reachable, but only _lazily_ — the map clears stale entries during subsequent operations, so
a map nobody touches releases nothing.

Two rules make it usable:

1. **No value may reference its key**, directly or through any chain. That includes the
   common accident of an inner value class holding the key object, and the very common one of
   a value that is a lambda capturing the key. Wrap the value in a `WeakReference` to the key
   if it genuinely needs it.
2. **Keys must have an independent lifetime and identity semantics.** A `WeakHashMap` keyed
   by `String` is unpredictable: literals are interned and never collected, computed strings
   are not. Keyed by class objects, class loaders or session objects it is sound.

`ConcurrentHashMap` has no weak-key variant in the JDK; Guava's `MapMaker`/`CacheBuilder` and
Caffeine provide one. A `WeakHashMap` behind a lock is not a concurrent map — wrapping it in
`Collections.synchronizedMap` is correct only if every compound operation is also
synchronised.

## Cleaner

`java.lang.ref.Cleaner` (Java 9+) replaces finalization for the one legitimate case: an
object owning a native or OS resource that would otherwise leak silently when a caller
forgets to close it.

```java
public final class NativeIndex implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();

    // MUST be static: a non-static state class would hold NativeIndex.this
    private record Handle(long address) implements Runnable {
        @Override public void run() {
            if (address != 0) {
                Native.free(address);
                System.getLogger("NativeIndex").log(WARNING, "leaked index at 0x%x".formatted(address));
            }
        }
    }

    private final Handle handle;
    private final Cleaner.Cleanable cleanable;

    public NativeIndex(long address) {
        this.handle = new Handle(address);
        this.cleanable = CLEANER.register(this, handle);   // action must not capture `this`
    }

    @Override public void close() { cleanable.clean(); }    // the real release path; idempotent
}
```

Rules this encodes, each of which is a defect when broken:

- **The action cannot reference the registered object.** A lambda that reads any instance
  field of `NativeIndex` captures `this`, so the object is never phantom-reachable and the
  cleaner never runs. This is the single most common way a `Cleaner` silently does nothing.
- **`close()` stays the release path.** `Cleanable.clean()` runs the action at most once and
  deregisters it, so an explicit close and a later cleanup do not double-free.
- **Timing is not guaranteed.** Cleaning actions run on the cleaner's own daemon thread, in
  no particular order, possibly never — `System.exit` and process kill run nothing. Never
  place flush-my-data or release-a-lock work there.
- **The action should report.** The point of the safety net is to make the missing `close()`
  visible in logs and metrics, not to make it harmless.
- **A subclass cannot break it**, unlike `finalize()`, where a subclass that forgets to call
  `super.finalize()` disables the parent's cleanup entirely.

## finalize()

Deprecated for removal by JEP 421; already disable-able with `--finalization=disabled`, and
scheduled to be removed. Beyond the deprecation, the reasons not to write one have not
changed: unpredictable timing and thread, no ordering, an exception in a finalizer is
swallowed and leaves the object half-cleaned, finalizable objects need at least two
collection cycles to be reclaimed (which is itself a memory-pressure amplifier), and the
finalizer can resurrect the object. If existing code has one, the migration is `AutoCloseable`
plus, only where a silent leak would otherwise be invisible, a `Cleaner`.

## Choosing

```text
Needs release at a known point            -> AutoCloseable + try-with-resources   (java-resource-management)
Bounded memory for hot values             -> size/time-bounded cache (Caffeine)   (caching-strategies)
Canonicalising map, keys owned elsewhere  -> WeakHashMap, values never touch keys
Listener/callback registry                -> explicit deregistration; weak refs only as a backstop
Native/OS handle, leak must be visible    -> AutoCloseable + Cleaner safety net
Anything at all                           -> not finalize()
```
