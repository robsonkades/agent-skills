# Concurrent collections

Complete classes here compile against JDK 25, `java.base` only, no external dependencies; shorter
fragments are method bodies in that same setting.

## What the atomic methods actually promise

The substitution table lives in the skill body. What it does not say is the boundary of the
guarantee.

Atomic in one invocation: `putIfAbsent`, `remove(k, v)`, `replace(k, v)`, `replace(k, old, new)`,
`compute`, `computeIfAbsent`, `computeIfPresent`, `merge`. Each `compute*`/`merge` javadoc says
"The entire method invocation is performed atomically" (Java SE 25 API).

The body's last row — a hot counter as `CHM<K, LongAdder>` — is the javadoc's own "scalable
frequency map" idiom:

```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

final class Frequencies {
    private final ConcurrentHashMap<String, LongAdder> counts = new ConcurrentHashMap<>();

    void record(String key) {
        counts.computeIfAbsent(key, k -> new LongAdder()).increment();
    }

    long get(String key) {
        LongAdder adder = counts.get(key);
        return adder == null ? 0L : adder.sum();
    }
}
```

`computeIfAbsent` here is safe because `new LongAdder()` allocates and returns; it takes no lock,
performs no I/O and touches no map.

The frequency example never removes/replaces counters; otherwise an increment may land on
a detached `LongAdder`. `sum()` is not an atomic snapshot during concurrent updates, so this
is telemetry, not an exact quota or balance. Likewise `compute` serializes mapping updates,
not arbitrary mutations through leaked value references: prefer immutable replacement values
or give the mutable value its own synchronization contract.

**Not atomic, whatever the map:** `putAll` and `clear` ("may reflect insertion or removal of only
some entries"), and the bulk `forEach`/`search`/`reduce` family, whose result "is not necessarily
atomic with respect to the map as a whole unless it is somehow known to be quiescent".

## Internal coordination and recursive-update limits

The `compute*`/`merge` methods run the caller's function while holding `synchronized` on the bin
head node (or on a `ReservationNode` CAS'd into an empty bin). That is what makes them atomic, and
the source of every hazard here. It is an _implementation_ fact, not a specification one: the
javadoc never mentions bins, and promises only that "Some attempted update operations on this map
by other threads **may** be blocked while computation is in progress, so the computation should be
short and simple."

The javadoc's constraint is that the function "must not modify this map during computation", and
`merge` adds "must not attempt to update any other mappings of this Map". What it promises about
enforcement is one word:

```
* @throws IllegalStateException if the computation detectably
*         attempts a recursive update to this map that would
*         otherwise never complete
```

**`detectably` is the whole enforcement guarantee, and it is much narrower than "same bin".** In
the examined OpenJDK 25 source, detection is structural, not bin-scoped. Two observed conditions
throw:

1. `computeIfAbsent` finds `pred.next != null` — the function appended to the tail of the very
   list this call was walking.
2. The traversal lands on a `ReservationNode` — the function re-entered a bin that another
   `compute*` on this thread had reserved (an empty bin, mid-computation). This is the **only**
   arm that can fire in `merge`; `merge` has no `pred.next` check at all.

Other prohibited recursion may complete without that exception. That does not make it supported or
define its atomicity: the API says the function must not modify the map. Observed on Temurin 25.0.3
with keys
1, 17 and 33, all of which hash to bin 1 of a 16-slot table:

```
A nested computeIfAbsent, empty bin reserved -> IllegalStateException: Recursive update
B same-bin nested compute, both keys present -> NO THROW  {1=v, 17=changed}
C same-bin put during compute                -> NO THROW  {1=v, 17=new-same-bin}
D append to the list being walked            -> IllegalStateException: Recursive update
```

Case **C** is useful as a negative test, not a supported technique: `m.put(1, "one")` then
`m.compute(1, (k, v) -> { m.put(17, "new-same-bin"); return "v"; })` performs a prohibited recursive
insert with no exception in that build. Case **B** and a same-key nested `merge` also pass silently.
The API provides no supported semantics for these callbacks, so "our tests never threw" is not a
safety argument.

Two further outcomes, neither detected:

- **Two threads recursing into each other's bins deadlock** on the two bin-head monitors. A dump
  shows both threads inside `ConcurrentHashMap.computeIfAbsent`, each
  `- waiting to lock <0x…> (a ConcurrentHashMap$Node)`. (Source-derived, not specified.)
  Historically the detection did not exist at all: JDK-8062841 added it in JDK 9 (JBS shows fix
  version 9 and an intent to integrate to 8u; the JDK 8 javadoc documents the exception, but the
  exact 8u is unverified here). Before that fix a recursive `computeIfAbsent` **spun forever** — a
  hung thread at 100% CPU with no exception.

`merge`'s `@throws` clause lists `NullPointerException` and "RuntimeException or Error if the
remappingFunction does so" — but not `IllegalStateException`, unlike its three siblings, even
though the implementation can throw it. Do not read the throws clause as the boundary.

`HashMap.computeIfAbsent` with recursion throws `ConcurrentModificationException` instead, since
JDK 9 (JDK-8071667) — a different class and a different exception, commonly confused with this.

### A loader that can block: the failure-evicting memoiser

`computeIfAbsent` is simpler and atomic, but coordinates map updates across the load. Use it for
cheap in-memory derivations. For blocking loads, compare sharing a future outside map coordination
with the project's existing cache. This example chooses eviction of failed loads so later callers
can retry; bounded failure caching/backoff may instead be appropriate during an outage.

```java
import java.util.concurrent.*;

final class Memoizer<K, V> {
    private final ConcurrentHashMap<K, Future<V>> cache = new ConcurrentHashMap<>();

    V get(K key, Callable<V> loader) throws InterruptedException, ExecutionException {
        Future<V> f = cache.get(key);
        if (f == null) {
            FutureTask<V> task = new FutureTask<>(loader);
            f = cache.putIfAbsent(key, task);      // no lock held across the load
            if (f == null) {
                f = task;
                task.run();                        // runs OUTSIDE any map operation
            }
        }
        try {
            return f.get();
        } catch (CancellationException | ExecutionException e) {
            cache.remove(key, f);                  // this example retries after failure
            throw e;
        }
    }
}
```

**The `cache.remove(key, f)` implements this example's retry policy.**
Without it, a `FutureTask` that failed stays in the map forever: with a loader that fails once and
then succeeds, the loader is invoked **once** and every subsequent caller re-throws the same cached
`ExecutionException` until the process restarts. A one-second downstream blip becomes a
restart-only outage, with no exception at the point of damage. With the removal in place, run on
25.0.3, the same loader is invoked twice, the second call returns the value, and the third serves
it from cache — evicting the failure did not turn the memoiser into a pass-through.

An interrupted first caller is the same story by a different route, and not the route the name
suggests: the `Callable` throws `InterruptedException`, `FutureTask` records that as an
_exceptional_ completion, `f.get()` throws `ExecutionException`, and the entry is evicted, so a
later caller reloads cleanly. Nothing in this class ever calls `cancel()`, so the
`CancellationException` arm is dead here — keep it anyway, because it goes live the moment a caller
can cancel the future.

The two-argument `remove(key, f)` matters: it removes only if the mapping is still _this_ future,
so a concurrent refresh that already installed a new one is not clobbered. It also makes the
concurrent-waiter case safe — two callers sharing one future both see the same
`ExecutionException`, and the second removal is a no-op rather than a clobber.

This minimal memoizer has no size/expiry bound and caches a successfully returned null inside
the Future. Require bounded key cardinality or a real cache policy. Loaders for one key must
mean the same thing, and must not recursively request the same key or form cross-key cycles:
the future can otherwise wait for its own completion. Loading runs on the winning caller;
`get()` provides neither an operation timeout nor a way to stop a stuck loader. Interrupting
a waiting caller does not cancel shared loading. If a winning loader throws
`InterruptedException`, it is wrapped in `ExecutionException`; the caller must apply its
cancellation policy rather than assume this method propagated interruption directly.

For eviction, refresh or statistics, evaluate an existing cache library against the project's
version and failure/cancellation semantics instead of expanding this illustration blindly.

## Views, counts and iteration

- `size()`/`isEmpty()`/`containsValue()` are "typically useful only when a map is not undergoing
  concurrent updates". The internal striped sum really can read negative under concurrent removal:
  `isEmpty()` is literally `sumCount() <= 0L` with the comment "ignore transient negative values",
  and `size()` clamps the sum at 0, so `size()` itself never returns a negative `int`.
- `mappingCount()` returns a `long` and should be preferred over `size()` for maps that can exceed
  `Integer.MAX_VALUE` entries.
- Iterators, spliterators and enumerations are **weakly consistent**: they do not throw
  `ConcurrentModificationException` and reflect table state at some point at or since their
  creation; they may reflect concurrent changes. Each iterator is for one thread at a time.

Choosing a set view:

| Want                          | Use                             | Note                                               |
| ----------------------------- | ------------------------------- | -------------------------------------------------- |
| a new concurrent set          | `ConcurrentHashMap.newKeySet()` | also `newKeySet(int initialCapacity)`              |
| a mutable set view over a map | `map.keySet(sentinel)`          | `add` inserts `sentinel`; NPE if null              |
| a removal-capable key view    | `map.keySet()`                  | additions unsupported; remove/clear affect the map |

Bulk operations take a `parallelismThreshold` and run on `ForkJoinPool.commonPool()` — shared with
parallel streams and `CompletableFuture`'s default async execution. `Long.MAX_VALUE` suppresses
parallelism entirely and is the right default; `1` maximises it. Reduction functions must be
associative and commutative, and a bulk operation may complete abruptly on an exception from a
supplied function while others are still running.

`concurrencyLevel` is documented as an additional hint for internal sizing, not as a current number
of lock stripes or a concurrency guarantee. It can influence initial sizing, so extreme inherited
values may waste memory; normally size from expected mappings/load and measure rather than tuning it
as a throughput dial.

## Synchronized wrappers: the three surviving reasons

The `java.util.concurrent` package summary states the whole decision tree: "Synchronized" classes
"can be useful when you need to prevent all access to a collection via a single lock, at the
expense of poorer scalability"; otherwise concurrent versions "are normally preferable"; and
unsynchronized collections are preferable when unshared or accessed under other locks.

Keep `Collections.synchronizedMap` only for:

1. **A multi-step invariant needing one lock over the whole map.** `ConcurrentHashMap` has no
   whole-map lock — "there is not any support for locking the entire table in a way that prevents
   all access".
2. **`null` keys or values.** CHM and `ConcurrentSkipListMap` forbid both; a wrapped `HashMap`
   permits both. This is a real migration blocker.
3. **A `LinkedHashMap`** in insertion or access order — there is no concurrent equivalent.

`Hashtable` and `Vector` retain legacy per-method synchronization and compatibility semantics. They
are rarely the best choice for new APIs, but replacing them requires checking compound-operation,
iteration and null-value contracts rather than declaring behavioral equivalence.

The wrapper _does_ synchronize the Java 8 default methods (`getOrDefault`, `forEach`, `replaceAll`,
`putIfAbsent`, `remove(k,v)`, `replace`, `computeIfAbsent`, `computeIfPresent`, `compute`, `merge`)
— but under the whole-map lock, which is far coarser than CHM's bin lock. `stream()` and
`parallelStream()` are **not** synchronized, which is why the javadoc names `Stream` explicitly:

```java
Map<String, Integer> m = Collections.synchronizedMap(new HashMap<>());
Set<String> keys = m.keySet();           // need not be inside the block
synchronized (m) {                       // synchronize on m, not on keys
    for (String k : keys) {
        listener.accept(k);              // an alien call under the lock: see
    }                                    // java-thread-safety-contracts
}
```

Skipping the `synchronized (m)` gives one of two symptoms: a `ConcurrentModificationException` on a
map "nobody is modifying", or a silently truncated or duplicated traversal.

## Copy-on-write

`CopyOnWriteArrayList` normally copies its backing array for changes; the iterator holds a
reference to the array as it was at creation, so it never throws CME and never reflects later
changes, and `remove`/`set`/`add` on the iterator throw `UnsupportedOperationException`. `null` is
permitted. `CopyOnWriteArraySet` is backed by the same array, so `contains` is a linear scan and
the javadoc restricts it to sets that "generally stay small".

No primary source gives a read:write ratio at which it stops paying — every number in circulation
is folklore. What the sources do give is the shape of the cost:

- copying changes allocate an O(n) array; old arrays remain live while iterators retain them.
  No-op operations need not copy (OpenJDK 25 `set` of the same reference is one counterexample);
- writers serialize on one lock; ordinary `get` and snapshot traversal avoid that writer lock.
  This is not a wait-free guarantee for every operation: user equality/predicate code can block;
- `copyingWriteRate × size` estimates copied references, not end-to-end throughput or GC cost;
- `addAll(Collection)` can batch publication instead of copying once per element.

Small read-mostly configuration or listener lists are candidates; confirm size, update frequency
and snapshot lifetime rather than imposing a scope or ratio rule. When updates replace the whole
list, a `volatile` reference to `List.copyOf(...)` gives explicit publication (java-memory-model)
and rejects accidental mutation through the published list.

```java
private volatile List<Endpoint> endpoints = List.of();      // read: volatile publication read
void refresh(Collection<Endpoint> discovered) {             // write: one publication
    endpoints = List.copyOf(discovered);
}
```

This is whole-list replacement, not a concurrent read-modify-write protocol: competing writers
that derive replacements from the old list need serialization or a CAS retry to avoid lost
updates. Unlike copy-on-write collections, `List.copyOf` rejects null elements. Neither approach
freezes mutable element state; obtain a coherent source collection before publishing a snapshot.

## Skip lists

`ConcurrentSkipListMap` is a `ConcurrentNavigableMap` with expected average `log(n)` cost for
`containsKey`, `get`, `put` and `remove`. Choose it only when ordering is an **operation** —
`firstKey`, `ceilingEntry`, `headMap`/`tailMap`/`subMap`, `pollFirstEntry`, descending views — as
in time buckets, deadline indexes and leaderboard ranges. If sorted output is infrequent, compare
sorting collected CHM entries with maintaining ordering on every update. Output frequency and
workload decide the cost; concurrent CHM traversal is not an atomic whole-map snapshot.

|                                                     | `ConcurrentHashMap`                | `ConcurrentSkipListMap`                                  |
| --------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `get`/`put`/`remove`                                | amortised O(1)                     | expected average O(log n)                                |
| Writes                                              | concurrent hash-table coordination | concurrent ordered-index coordination                    |
| Memory                                              | one node per entry plus table      | index levels on top of nodes                             |
| Ordering operations                                 | none                               | full `NavigableMap`                                      |
| `null` key/value                                    | forbidden                          | forbidden                                                |
| Entries returned                                    | live-ish                           | **snapshots**; `Entry.setValue` unsupported              |
| `putAll`/`equals`/`toArray`/`containsValue`/`clear` | not atomic                         | not atomic                                               |
| Direction                                           | n/a                                | ascending views and iterators are faster than descending |

The cost and implementation of skip-list `size()` have changed across JDK releases, while the value
remains an estimate under concurrent mutation. Do not make hot-path synchronization decisions from
it; profile the deployed JDK if collection-size telemetry itself is suspected. In contrast,
`ConcurrentLinkedQueue` and `LinkedTransferQueue` explicitly document traversal cost for `size()`.

## Authoritative references

- [Java 25 `ConcurrentHashMap`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [Java 25 `ConcurrentSkipListMap`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentSkipListMap.html)
- [Java 25 `CopyOnWriteArrayList`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CopyOnWriteArrayList.html)
- [Java 25 `List.copyOf`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
- [Java 25 concurrent package summary](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
