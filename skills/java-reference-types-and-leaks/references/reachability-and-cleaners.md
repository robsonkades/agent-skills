# Reachability, reference types and Cleaner

## The levels, and when each is cleared

An object is _strongly reachable_ if some chain of strong references reaches it from a GC
root, for example through a live stack reference, reachable static field or strong JNI
reference. A loader/static-field cycle without an external root need not remain live.
Weaker levels apply only when no stronger path exists.

| Level   | Cleared when                                                                                                                                                                        | Practical meaning                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Strong  | never (until unreachable)                                                                                                                                                           | the default; ordinary fields and locals                                           |
| Soft    | at the collector's discretion under memory pressure; **all** soft references are guaranteed cleared before an `OutOfMemoryError` is thrown                                          | "keep while there is room" — the collector, not you, sets the policy              |
| Weak    | when the collector determines weak reachability; related weak references are cleared atomically as specified, and enqueueing may follow later                                       | “keep only while a stronger owner keeps it”; timing is not a next-GC API contract |
| Phantom | `get()` always returns `null`; after the object is phantom reachable, the collector atomically clears the relevant phantom references, which are enqueued at the same time or later | post-mortem notification/safety-net coordination, with no referent access         |

The soft-reference OOME guarantee applies to softly reachable referents, not references whose
referents still have strong owners. It does not make a reference-based cache a capacity contract.

For a custom reference queue, retain the `Reference` wrappers while notifications matter;
registration alone does not keep them reachable. `clear()` does not enqueue. Manual
`enqueue()` can occur while the referent is strongly owned, so a queue item alone does not
prove reclamation or authorize releasing a still-used resource. For usable referents, read
`get()` once and check that local; it creates a strong reference. `refersTo` (Java 16+) can
test referent identity or clearing without strengthening reachability.

HotSpot's `-XX:SoftRefLRUPolicyMSPerMB` is a heuristic, not an entry TTL or minimum survival
time. The [25.0.3 policy source](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shared/referencePolicy.cpp)
uses GC-related timestamps and heap state from the last collection; its policies distinguish
current free space from maximum-heap headroom. The consequences that matter:

- Soft retention can add GC/reference-processing work, but the cost needs actual evidence.
- Clustered clearing can trigger concentrated refill work. Whether this causes an origin
  overload depends on which entries are requested, request rates and refill capacity; memory
  pressure need not coincide with peak traffic. Do not infer a miss storm from reference type alone.
- Sizing is not expressible. `Caffeine.newBuilder().maximumSize(50_000)` or
  a weight limit expresses capacity. `.expireAfterWrite(...)` expresses freshness/lifetime,
  not a strict memory bound under unbounded arrivals; combine with capacity/entry-size limits
  when needed. Prefer explicit policy; caching-strategies owns that choice.

## WeakHashMap

Keys are weakly referenced; values are not. The key referent can be collected when weakly
reachable, but removal of the stale entry/value is lazy and occurs during subsequent map
operations. Thus an idle map can retain values and entry overhead even though cleared keys
appear as if entries disappeared asynchronously.

Two rules make it usable:

1. **Trace strong paths from values to every key, not just their own.** If `v1` strongly
   references `k2` and `v2` strongly references `k1`, both entries remain retained while the
   map is reachable even after callers release the keys. An inner value class or a lambda
   capturing a key can create the same ownership mismatch. If appropriate, weaken the
   value-to-key link; a `WeakReference` to the key does not itself keep the key strongly reachable.
   Storing a weak reference to the entire value is a different contract: the value can then
   disappear even while the key is strongly owned. Choose that only if allowed.
2. **Keys must have an independent lifetime and stable equality semantics.** `WeakHashMap`
   uses `equals`/`hashCode`, not identity. A `String` key's lifetime depends on its actual
   strong roots: literals are commonly retained while their defining class remains loaded,
   while modern HotSpot can unlink otherwise-unreachable interned strings. Class, loader or
   session keys are suitable only when that reachability contract is intentional.

The `null` key has no external object's lifetime to follow. In
[OpenJDK 25.0.3](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/java/util/WeakHashMap.java),
it is represented by a strongly held static sentinel, so its entry does not disappear through
weak-key collection while the map is live. Remove or replace that mapping when its value becomes
obsolete; do not expect dropping an external reference to expire it.

`ConcurrentHashMap` has no weak-key variant in the JDK; Guava's `MapMaker`/`CacheBuilder` and
Caffeine provide one, but their `weakKeys()` use identity (`==`) rather than `equals`;
do not silently change equal-key lookup behavior. See [Caffeine reference eviction](https://github.com/ben-manes/caffeine/wiki/Eviction)
and [Guava MapMaker](https://github.com/google/guava/blob/v33.4.8/guava/src/com/google/common/collect/MapMaker.java).
`Collections.synchronizedMap` can protect a `WeakHashMap`; client-composed operations and
iteration need the appropriate wrapper lock. Synchronization does not stop GC-driven disappearance.

## Cleaner

`java.lang.ref.Cleaner` (Java 9+) supports explicit cleanup and an automatic fallback after
phantom reachability. Use the fallback when best-effort cleanup/reporting is useful; it
does not replace deterministic ownership of a native/OS resource.

```java
import java.lang.ref.Cleaner;
import static java.lang.System.Logger.Level.WARNING;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public final class NativeIndex implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();

    // Static state makes the absence of an enclosing NativeIndex reference explicit.
    private static final class State implements Runnable {
        private final AtomicLong address;
        private final AtomicBoolean explicitClose = new AtomicBoolean();

        State(long address) { this.address = new AtomicLong(address); }

        @Override public void run() {
            long p = address.getAndSet(0);
            if (p != 0) {
                Native.free(p);
                if (!explicitClose.get()) {
                    System.getLogger("NativeIndex").log(WARNING, "native index was not closed");
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
        cleanable.clean();                                 // invoke release at most once
    }
}
```

This partial Java 9+ sketch omits `Native.free`; assume a valid exclusively owned nonzero
handle and a nonthrowing release operation. A real factory must release on allocation or
Cleaner-registration failure. If native use methods are added, design use-versus-close
synchronization and any required `Reference.reachabilityFence`; at-most-once cleaning alone
does not prevent use-after-free. Concurrent `clean()` calls are not a completion barrier:
another caller can return while the winning action is still running. If each `close()`
must await release, enforce that completion contract in the owner. Do not rely on fallback
logging to run during process exit.

- **The action cannot reference the registered object.** A lambda that reads any instance
  field of `NativeIndex` captures `this`, so the object is never phantom-reachable and the
  automatic action cannot run while that capture remains. Explicit `clean()` is different.
- **`close()` stays the release path.** `Cleanable.clean()` runs the action at most once and
  deregisters it, so an explicit close and a later cleanup do not double-free.
- **Timing is not guaranteed.** Automatic actions use the cleaner thread; explicit `clean()`
  invokes the action directly. Keep shared-cleaner actions short and nonblocking so one
  cleanup does not delay others. Fallback execution may never occur, and exit behavior is not guaranteed. Never
  place flush-my-data or release-a-lock work there.
- **Distinguish explicit close from fallback execution.** `clean()` runs the same action on
  the normal path, so unconditional “leak” logging reports false incidents. Keep release
  idempotent and record the path without letting state capture the referent.

## finalize()

Deprecated for removal by JEP 421 and already disable-able with
`--finalization=disabled`; no specific removal release is promised here. Beyond the
deprecation, the reasons not to write one have not changed: unpredictable timing and
thread, no ordering, an exception in a finalizer is
swallowed and may leave cleanup incomplete, finalization can delay reclamation without a portable
collection-cycle count, and the
finalizer can resurrect the object. If existing code has one, establish explicit ownership
with `AutoCloseable`, adding a `Cleaner` only where best-effort fallback is useful.

## Choosing

```text
Needs release at a known point            -> AutoCloseable + try-with-resources   (java-resource-management)
Bounded memory for hot values             -> capacity policy; expiry if needed   (caching-strategies)
Canonicalising map, keys owned elsewhere  -> WeakHashMap, no strong value-to-key paths
Listener/callback registry                -> explicit lifetime; weak refs if reachability is the contract
Native/OS handle, useful fallback         -> AutoCloseable + optional Cleaner safety net
Anything at all                           -> not finalize()
```

Primary references: [reference ownership and notification](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/package-summary.html),
[Reference operations](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/Reference.html),
[SoftReference guarantee](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/SoftReference.html),
[WeakHashMap contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/WeakHashMap.html)
and [Cleaner ownership/execution contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/ref/Cleaner.html).
