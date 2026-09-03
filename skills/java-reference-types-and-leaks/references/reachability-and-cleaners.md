# Reachability, reference types and Cleaner

## The levels, and when each is cleared

An object is _strongly reachable_ if some chain of strong references reaches it from a GC
root (a live thread's stack, a static field of a loaded class, a JNI reference). Weaker
levels apply only when no stronger path exists.

| Level   | Cleared when                                                                                                                                                                        | Practical meaning                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Strong  | never (until unreachable)                                                                                                                                                           | the default; ordinary fields and locals                                           |
| Soft    | at the collector's discretion under memory pressure; **all** soft references are guaranteed cleared before an `OutOfMemoryError` is thrown                                          | "keep while there is room" — the collector, not you, sets the policy              |
| Weak    | when the collector determines weak reachability; related weak references are cleared atomically as specified, and enqueueing may follow later                                       | “keep only while a stronger owner keeps it”; timing is not a next-GC API contract |
| Phantom | `get()` always returns `null`; after the object is phantom reachable, the collector atomically clears the relevant phantom references, which are enqueued at the same time or later | post-mortem notification/safety-net coordination, with no referent access         |

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

Keys are weakly referenced; values are not. The key referent can be collected when weakly
reachable, but removal of the stale entry/value is lazy and occurs during subsequent map
operations. Thus an idle map can retain values and entry overhead even though cleared keys
appear as if entries disappeared asynchronously.

Two rules make it usable:

1. **No value may reference its key**, directly or through any chain. That includes the
   common accident of an inner value class holding the key object, and the very common one of
   a value that is a lambda capturing the key. Wrap the value in a `WeakReference` to the key
   if it genuinely needs it.
2. **Keys must have an independent lifetime and stable equality semantics.** `WeakHashMap`
   uses `equals`/`hashCode`, not identity. A `String` key's lifetime depends on its actual
   strong roots: literals are commonly retained while their defining class remains loaded,
   while modern HotSpot can unlink otherwise-unreachable interned strings. Class, loader or
   session keys are suitable only when that reachability contract is intentional.

`ConcurrentHashMap` has no weak-key variant in the JDK; Guava's `MapMaker`/`CacheBuilder` and
Caffeine provide one. A `WeakHashMap` behind a lock is not a concurrent map — wrapping it in
`Collections.synchronizedMap` is correct only if every compound operation is also
synchronised.

## Cleaner

`java.lang.ref.Cleaner` (Java 9+) supports a fallback action after phantom reachability. It
is appropriate only when nondeterministic best-effort cleanup/reporting is useful; it never
replaces deterministic ownership of a native/OS resource.

```java
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public final class NativeIndex implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();

    // MUST be static: a non-static state class would hold NativeIndex.this
    private static final class State implements Runnable {
        private final AtomicLong address;
        private final AtomicBoolean explicitClose = new AtomicBoolean();

        State(long address) { this.address = new AtomicLong(address); }

        @Override public void run() {
            long p = address.getAndSet(0);
            if (p != 0) {
                Native.free(p);
                if (!explicitClose.get()) {
                    System.getLogger("NativeIndex").log(WARNING, "leaked index at 0x%x".formatted(p));
                }
            }
        }
    }

    private final State state;
    private final Cleaner.Cleanable cleanable;

    public NativeIndex(long address) {
        this.state = new State(address);
        this.cleanable = CLEANER.register(this, state);   // action must not capture `this`
    }

    @Override public void close() {
        state.explicitClose.set(true);
        cleanable.clean();                                 // release exactly once
    }
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
- **Distinguish explicit close from fallback execution.** `clean()` runs the same action on
  the normal path, so unconditional “leak” logging reports false incidents. Keep release
  idempotent and record the path without letting state capture the referent.

## finalize()

Deprecated for removal by JEP 421 and already disable-able with
`--finalization=disabled`; no specific removal release is promised here. Beyond the
deprecation, the reasons not to write one have not changed: unpredictable timing and
thread, no ordering, an exception in a finalizer is
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
