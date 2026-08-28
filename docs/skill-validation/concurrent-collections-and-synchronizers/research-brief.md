# Research brief — `java.util.concurrent` building blocks & synchronizers (JDK 25 LTS)

**Audience of the eventual skill:** senior/staff Java engineers. Operational decision guide, not tutorial.
**Research date:** 2026-08-27. **Baseline:** JDK 25 LTS. Deltas noted for 8/11/17/21 and 24/26/27.

## Source-quality legend

| Tag              | Meaning                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **[JDOC-25]**    | Oracle javadoc, Java SE 25 (`docs.oracle.com/en/java/javase/25/docs/api/...`) — fetched and quoted                                             |
| **[SRC-25]**     | OpenJDK source at tag `jdk-25+36` (raw.githubusercontent.com/openjdk/jdk) — read directly                                                      |
| **[SRC-master]** | OpenJDK mainline, read 2026-08-27                                                                                                              |
| **[JEP-n]**      | openjdk.org/jeps/n — full text fetched                                                                                                         |
| **[JBS-n]**      | bugs.openjdk.org issue `JDK-n` — fetched via JBS REST API (summary/description/fixVersion/resolution)                                          |
| **[BLOG]**       | Secondary source; confidence stated inline                                                                                                     |
| **[JCiP]**       | _Java Concurrency in Practice_, Goetz et al., 2006 — cited by chapter/section, **not** quoted verbatim except where a primary source quotes it |

Everything below marked **[JDOC-25]**, **[SRC-25]**, **[JEP-n]** or **[JBS-n]** was fetched during this
research pass, not recalled.

---

# 1. `ConcurrentHashMap`

## 1.1 What is atomic and what is not

**Atomic (single method invocation):** `putIfAbsent`, `remove(k,v)`, `replace(k,v)`, `replace(k,old,new)`,
`compute`, `computeIfAbsent`, `computeIfPresent`, `merge`. The javadoc for each of the `compute*`/`merge`
family says verbatim: _"The entire method invocation is performed atomically."_ **[JDOC-25]**

**Not atomic:**

- Any _compound_ action written by the caller: `if (!m.containsKey(k)) m.put(k, v)`,
  `V v = m.get(k); if (v == null) m.put(k, f())`, check-then-act on `size()`.
- `putAll` and `clear`: _"Aggregate operations such as `putAll` and `clear` may reflect insertion or removal
  of only some entries."_ **[JDOC-25]**
- Bulk `forEach`/`search`/`reduce`: the result _"is not necessarily atomic with respect to the map as a whole
  unless it is somehow known to be quiescent."_ **[JDOC-25]**

**The rewrite rule the skill should state:**

| Compound action              | Atomic replacement                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containsKey` + `put`        | `putIfAbsent(k, v)`                                                                                                                                         |
| `get` + (null check) + `put` | `computeIfAbsent(k, loader)`                                                                                                                                |
| `get` + mutate + `put`       | `compute(k, fn)` or `merge(k, seed, fn)`                                                                                                                    |
| `get` + compare + `put`      | `replace(k, oldValue, newValue)`                                                                                                                            |
| `get` + compare + `remove`   | `remove(k, expectedValue)`                                                                                                                                  |
| counter increment            | `merge(k, 1L, Long::sum)` — or better, `CHM<K, LongAdder>` + `computeIfAbsent` (the javadoc's own recommended "scalable frequency map" idiom **[JDOC-25]**) |

`putIfAbsent`'s javadoc gives the equivalence explicitly: _"This is equivalent to: `if (!map.containsKey(key))
return map.put(key, value); else return map.get(key);` except that the action is performed atomically."_
**[JDOC-25]**

## 1.2 The `compute*` mapping-function restriction — and what actually happens

The javadoc constraint (all four methods): the function _"must not modify this map during computation"_, and
`merge` adds _"must not attempt to update any other mappings of this Map."_ **[JDOC-25]**

**Mechanism (why it exists).** `computeIfAbsent`/`compute`/`computeIfPresent`/`merge` all run the user
function while holding `synchronized (f)` on the **bin head node** — verified in **[SRC-25]**
(`ConcurrentHashMap.java` lines 1043, 1136, 1214, 1742, 1835, 1947, 2063, 2499). This is what makes the
method atomic, and it is also the source of every hazard below.

**What actually happens if you violate it — three distinct outcomes, only one of which is diagnosed:**

1. **Recursive update into the _same bin_ → `IllegalStateException("Recursive update")`.** Detection is
   bin-local. In `computeIfAbsent` **[SRC-25]** the two checks are:
   ```java
   if ((val = mappingFunction.apply(key)) != null) {
       if (pred.next != null)                       // the function inserted into this bin
           throw new IllegalStateException("Recursive update");
   ...
   } else if (f instanceof ReservationNode)          // recursed into a bin being reserved
       throw new IllegalStateException("Recursive update");
   ```
   `"Recursive update"` appears 9× in the JDK 25 source (lines 1075, 1181, 1758, 1779, 1879, 1974, 2007,
   2117, 2568) **[SRC-25]**.
2. **Recursive update into a _different bin_ → NOT detected.** It "succeeds", but the operation is no longer
   atomic, and two threads recursing into each other's bins can deadlock on the two bin-head monitors
   (classic lock-ordering deadlock). _Derived from source, not from javadoc — high confidence, but state it
   as a source-derived inference in the skill._
3. **Table resize during the callback** → the state the function observed is stale.

**Since which JDK.** The detection did **not** exist in early Java 8: `JDK-8062841 "ConcurrentHashMap.
computeIfAbsent stuck in an endless loop"`, affects 8 / 8u25 / 9, **Fix Version 9**, and the JBS comment
thread says _"Pending any further discussion on concurrency-interest, we should integrate to JDK9, then 8u."_
**[JBS-8062841]**. The current JDK 8 javadoc does document `IllegalStateException`
(verified against `docs.oracle.com/javase/8/docs/api/...`), i.e. the fix was backported into an 8u.
**Before that fix, a recursive `computeIfAbsent` spun forever** — a hung thread, 100% CPU, no exception.

**Documentation inconsistency worth flagging in the skill:** `merge`'s `@throws` clause in the JDK 25 javadoc
lists **only `NullPointerException`** — it does _not_ list `IllegalStateException`, unlike
`compute`/`computeIfAbsent`/`computeIfPresent` **[JDOC-25]**. But the implementation _does_ throw
`IllegalStateException("Recursive update")` from `merge` (line 2117) **[SRC-25]**. Do not rely on the
javadoc's throws clause here.

**Related sibling gotcha (route lightly):** `HashMap.computeIfAbsent` with recursion throws
`ConcurrentModificationException` since Java 9 (`JDK-8071667`, Fix Version 9) **[JBS-8071667]** — a different
class and a different exception, commonly confused with the CHM case.

## 1.3 Why `size()` / `isEmpty()` / iterators are weakly consistent

**Counters.** `size()` and `mappingCount()` both sum a striped `@Contended`-annotated `CounterCell[]`
(LongAdder-style). `isEmpty()` is literally:

```java
public boolean isEmpty() {
    return sumCount() <= 0L; // ignore transient negative values
}
```

**[SRC-25]** (line 931). The `<= 0L` and the comment are the tell: **the counter can transiently read
negative** under concurrent removals. `mappingCount()`'s javadoc: _"The value returned is an estimate; the
actual count may differ if there are concurrent insertions or removals."_ **[JDOC-25]**

**Class-level statement:** _"The results of aggregate status methods including `size`, `isEmpty`, and
`containsValue` are typically useful only when a map is not undergoing concurrent updates."_ **[JDOC-25]**

**Iterators.** _"Iterators, Spliterators and Enumerations return elements reflecting the state of the hash
table at some point at or since the creation of the iterator/enumeration. They do not throw
`ConcurrentModificationException`... Iterators are designed to be used by only one thread at a time."_
**[JDOC-25]** The package-level definition of _weakly consistent_ **[JDOC-25 `java.util.concurrent`
package-summary]**:

> - they may proceed concurrently with other operations
> - they will never throw `ConcurrentModificationException`
> - they are guaranteed to traverse elements as they existed upon construction exactly once, and may (but are
>   not guaranteed to) reflect any modifications subsequent to construction.

**What this means for a caller (the operational translation the skill needs):**

- Never gate a decision on `size()` (`if (map.size() < LIMIT) map.put(...)` is a race, not a limit).
- Never export `size()` as a hard capacity metric; it is a gauge with sampling error under write load.
- Never assume an iteration is a snapshot. A key present at iterator creation _will_ be returned once; a key
  added afterwards _might_ be. So "count while iterating" and "sum while iterating" both produce values that
  never existed atomically.
- `size()` returning `Integer.MAX_VALUE` is a real ceiling; use `mappingCount()` for maps that can exceed
  2^31 entries. _"This method should be used instead of `size()` because a ConcurrentHashMap may contain more
  mappings than can be represented as an int."_ **[JDOC-25]**

## 1.4 `keySet(V)` / `newKeySet()` as a `Set`

`keySet(V mappedValue)` returns a `KeySetView` where `add`/`addAll` insert the given common value; throws
`NullPointerException` if `mappedValue` is null **[JDOC-25]**. Class doc: _"A `Set` projection of a
`ConcurrentHashMap` may be created (using `newKeySet()` or `newKeySet(int)`), or viewed (using
`keySet(Object)` when only keys are of interest, and the mapped values are (perhaps transiently) not used or
all take the same mapping value."_ **[JDOC-25]**

Decision rule: want a _new_ concurrent set → `ConcurrentHashMap.newKeySet()`. Want a mutable set _view_ over
an existing map → `map.keySet(sentinel)` (the "`keySet(true)`" idiom is `map.keySet(Boolean.TRUE)`). Want a
read-only view → plain `keySet()` (its `add` throws `UnsupportedOperationException`).

## 1.5 Bulk operations and the parallelism threshold

_"These bulk operations accept a `parallelismThreshold` argument. Methods proceed sequentially if the current
map size is estimated to be less than the given threshold. Using a value of `Long.MAX_VALUE` suppresses all
parallelism. Using a value of `1` results in maximal parallelism by partitioning into enough subtasks to
fully utilize the `ForkJoinPool.commonPool()` that is used for all parallel computations. Normally, you would
initially choose one of these extreme values, and then measure performance of using in-between values that
trade off overhead versus throughput."_ **[JDOC-25]**

Additional documented properties **[JDOC-25]**:

- Reduction functions _"cannot rely on ordering (more formally, it should be both associative and
  commutative)"_.
- Except for `forEach` actions, the supplied functions _"should ideally be side-effect-free"_.
- _"Bulk operations may complete abruptly, throwing an exception encountered in the application of a supplied
  function... other concurrently executing functions could also have thrown exceptions."_
- _"Speedups for parallel compared to sequential forms are common but not guaranteed."_

**Operational trap:** these run on `ForkJoinPool.commonPool()`. That pool is shared with parallel streams and
with `CompletableFuture`'s default async execution. In a container with a small CPU quota, common-pool
parallelism is small, and setting the threshold to `1` buys nothing while adding fork overhead. The JDK 25
javadoc for `ForkJoinPool` notes the parallelism can be set via
`java.util.concurrent.ForkJoinPool.common.parallelism` (_"Usage is discouraged. Use `setParallelism(int)`
instead"_) and warns _"it is strongly discouraged to set the parallelism property to zero, which may be
internally overridden in the presence of intrinsically async tasks."_ **[JDOC-25 ForkJoinPool]**
Default guidance for the skill: pass `Long.MAX_VALUE` unless you have measured otherwise.

## 1.6 `Segment` / lock striping: gone since JDK 8

`Segment` still exists in JDK 25 source, but only as a corpse:

```java
/**
 * Stripped-down version of helper class used in previous version,
 * declared for the sake of serialization compatibility.
 */
static class Segment<K,V> extends ReentrantLock implements Serializable {
    private static final long serialVersionUID = 2249069246763182397L;
    final float loadFactor;
    Segment(float lf) { this.loadFactor = lf; }
}
```

**[SRC-25]** (line 1390). It is **not** in the public nested-class summary of the JDK 25 javadoc (only
`KeySetView` is) **[JDOC-25]**.

**What replaced it:** per-bin locking. Reads are lock-free volatile reads; the first insertion into an empty
bin is a plain CAS on the table slot; every other write path takes `synchronized (binHeadNode)`. Counting is
a striped `CounterCell[]` rather than summing per-segment counts. **[SRC-25]**

**`concurrencyLevel` is now only a sizing hint:** _"for compatibility with previous versions of this class,
constructors may optionally specify an expected `concurrencyLevel` as an additional hint for internal
sizing."_ **[JDOC-25]** It does **not** set a number of locks any more. Tuning it is cargo cult.

## 1.7 CHM × virtual threads — the specific interaction

Because CHM's write path is `synchronized (binHead)` **[SRC-25]**:

- **JDK 21–23:** a virtual thread inside `computeIfAbsent` with a slow mapping function (I/O, a remote call, a
  lock acquisition) is **pinned** for the duration — it is executing inside a `synchronized` block
  (**[JEP-444]** "two scenarios in which a virtual thread cannot be unmounted... when it executes code inside
  a `synchronized` block or method"). This is one of the highest-yield real pinning sources in application
  code, because the `synchronized` is inside the JDK, not in your source.
- **JDK 24+ (JEP 491):** it no longer pins. The virtual thread unmounts while holding the bin monitor.
  **[JEP-491]**

But it still **serializes**: _"Some attempted update operations on this map by other threads may be blocked
while computation is in progress, so the computation should be short and simple."_ **[JDOC-25]**

**Recommendation:** never put I/O inside `computeIfAbsent`. Use the JCiP §5.6 `Memoizer` shape
(`ConcurrentHashMap<K, Future<V>>` + `putIfAbsent` + `FutureTask.run()` outside the map operation) or a real
cache library. See §11 for the JCiP verdict.

---

# 2. `Collections.synchronizedMap` / `Hashtable` / `Vector` vs concurrent collections

## 2.1 What the JDK itself says

From the `java.util.concurrent` package summary **[JDOC-25]**:

> The "Concurrent" prefix used with some classes in this package is a shorthand indicating several differences
> from similar "synchronized" classes. For example `java.util.Hashtable` and
> `Collections.synchronizedMap(new HashMap())` are synchronized. But `ConcurrentHashMap` is "concurrent". A
> concurrent collection is thread-safe, but not governed by a single exclusion lock. ... **"Synchronized"
> classes can be useful when you need to prevent all access to a collection via a single lock, at the expense
> of poorer scalability.** In other cases in which multiple threads are expected to access a common
> collection, "concurrent" versions are normally preferable. And unsynchronized collections are preferable
> when either collections are unshared, or are accessible only when holding other locks.

That last sentence is the whole decision tree, from the primary source.

## 2.2 The compound-action trap

Both wrappers make each _method_ atomic; neither makes a _sequence_ atomic. `synchronizedMap` at least gives
you a lock you can hold across a sequence — and that is the one thing a `ConcurrentHashMap` cannot give you.
This is the legitimate residual use case.

`Hashtable` and `Vector` are worse than `synchronizedMap`, not better: same single lock, plus a legacy API
(`Enumeration`, `elements()`) and no way to name the mutex.

## 2.3 Iteration requires external synchronisation — with the exact idiom

`Collections.synchronizedMap` javadoc **[JDOC-25 `java.util.Collections`]**:

> It is imperative that the user manually synchronize on the returned map when traversing any of its
> collection views via `Iterator`, `Spliterator` or `Stream`:
>
> ```java
> Map m = Collections.synchronizedMap(new HashMap());
> ...
> Set s = m.keySet();  // Needn't be in synchronized block
> ...
> synchronized (m) {   // Synchronizing on m, not s!
>     Iterator i = s.iterator(); // Must be in synchronized block
>     while (i.hasNext())
>         foo(i.next());
> }
> ```
>
> Failure to follow this advice may result in non-deterministic behavior.

Two failure symptoms an engineer sees when this is skipped: a `ConcurrentModificationException` on a map
"nobody is modifying", or a silently truncated/duplicated traversal.

**Note also:** the third line, `foo(i.next())`, is calling an alien method while holding the map's lock →
route to `java-thread-safety-contracts`.

## 2.4 Do the wrappers cover the Java 8 default methods?

Yes, and this is worth stating because it is commonly assumed otherwise. `Collections.SynchronizedMap` in
JDK 25 **[SRC-25 `java.util.Collections`]** explicitly overrides and synchronizes `getOrDefault`, `forEach`,
`replaceAll`, `putIfAbsent`, `remove(k,v)`, `replace(k,old,new)`, `replace(k,v)`, `computeIfAbsent`,
`computeIfPresent`, `compute`, `merge`. The same overrides are present in current jdk8u
**[SRC jdk8u/master `java.util.Collections`]**. So `synchronizedMap(...).computeIfAbsent(...)` _is_ atomic
w.r.t. other calls through the same wrapper — but it holds the **whole-map** lock for the duration of your
mapping function, which is a much bigger deal than CHM's bin lock.

`stream()` / `parallelStream()` are **not** synchronized — hence the javadoc's explicit mention of `Stream`.

## 2.5 When the synchronized wrapper is still the right answer

1. You need to hold one lock across a **multi-step invariant** spanning the map (or spanning the map _and_
   other state). CHM has no whole-map lock; the javadoc says so: _"there is not any support for locking the
   entire table in a way that prevents all access."_ **[JDOC-25]**
2. The map is small, contention is negligible, and you want the simplest possible thing that is obviously
   correct.
3. You need `null` keys or values. **CHM forbids both** (_"This class does not allow `null` to be used as a
   key or value"_ **[JDOC-25]**); `ConcurrentSkipListMap` also forbids both; `Hashtable` forbids both;
   `synchronizedMap(new HashMap<>())` permits both. This is a real, frequently-hit migration blocker.
4. You are wrapping a `LinkedHashMap` (LRU/access-order) — there is no concurrent equivalent in the JDK.

Everything else: use a concurrent collection.

---

# 3. Copy-on-write collections

## 3.1 What the javadoc commits to

`CopyOnWriteArrayList` **[JDOC-25]**:

> A thread-safe variant of `ArrayList` in which all mutative operations (`add`, `set`, and so on) are
> implemented by making a fresh copy of the underlying array.
> This is ordinarily too costly, but may be more efficient than alternatives when **traversal operations
> vastly outnumber mutations**, and is useful when you cannot or don't want to synchronize traversals, yet
> need to preclude interference among concurrent threads. The "snapshot" style iterator method uses a
> reference to the state of the array at the point that the iterator was created. This array never changes
> during the lifetime of the iterator, so interference is impossible and the iterator is guaranteed not to
> throw `ConcurrentModificationException`. The iterator will not reflect additions, removals, or changes to
> the list since the iterator was created. Element-changing operations on iterators themselves (`remove`,
> `set`, and `add`) are **not supported**. These methods throw `UnsupportedOperationException`.
> **All elements are permitted, including `null`.**

`CopyOnWriteArraySet` **[JDOC-25]**: _"best suited for applications in which **set sizes generally stay
small**, read-only operations vastly outnumber mutative operations..."_, _"Mutative operations ... are
expensive since they usually entail copying the entire underlying array."_

Package summary **[JDOC-25]**: _"A `CopyOnWriteArrayList` is preferable to a synchronized `ArrayList` when the
expected number of reads and traversals greatly outnumber the number of updates to a list."_

## 3.2 The ratio at which it stops being right

There is **no number in any primary source.** Anyone who quotes "100:1" or "1000:1" is quoting folklore.
What the primary sources give you is the _shape_ of the cost, which is what the skill should teach:

- Every mutation is `O(n)` array copy **and** `O(n)` garbage. Two independent costs: CPU time on the writer,
  and allocation pressure (route to `java-performance` / allocation profiling).
- Writers serialize on a single lock; readers are wait-free.
- Total cost per unit time ≈ `writeRate × n`. **The decision variable is `writeRate × size`, not the
  read:write ratio alone.** A 1M-element COW list with one write per second is worse than a 10-element COW
  list with 1000 writes/s.
- `addAll(Collection)` copies once, not once per element — batch your mutations. (Both `CopyOnWriteArrayList`
  and its Set are backed by the same array **[JDOC-25 COWAS]**.)
- `CopyOnWriteArraySet.contains` is a linear scan (it is a list underneath). A `CopyOnWriteArraySet` with
  thousands of elements and a hot `contains` is a performance bug even if it never mutates.

**Practical rule for the skill:** COW is for _configuration-shaped_ state — listener registries, handler
chains, feature-flag snapshots, service-discovery endpoint lists — where the write rate is bounded by human
or control-plane action, not by request traffic. It is never for request-scoped or per-event data.

**Alternative that beats COW when writes are batched:** a `volatile` reference to an immutable
`List.copyOf(...)`, swapped on update. Same read cost, explicit publication, no accidental `remove()` calls.
Route the publication semantics to `java-memory-model`.

## 3.3 Snapshot iterator semantics — the failure mode

The iterator is a **snapshot**, not weakly consistent. This is the opposite trap to CHM:

- **CHM iterator:** may reflect later modifications; never throws CME.
- **COW iterator:** definitely will **not** reflect later modifications; never throws CME.

The symptom of getting this wrong: a listener registered during a dispatch loop is not called for the current
event and the code "works on my machine" because the test registers everything up front. Also: `iterator()
.remove()` throws `UnsupportedOperationException` — so `list.removeIf(...)` works (it is implemented
natively) but a hand-written iterator-remove loop does not.

**JDK 24 note:** `JDK-8332842 "Optimize empty CopyOnWriteArrayList allocations"` **[JBS-8332842]** — pure
optimisation, no semantic change; relevant only if you allocate very many empty COW lists.

---

# 4. `ConcurrentSkipListMap` / `ConcurrentSkipListSet`

## 4.1 What forces the choice

**[JDOC-25]**: _"A scalable concurrent `ConcurrentNavigableMap` implementation. The map is sorted according to
the natural ordering of its keys, or by a `Comparator` provided at map creation time... expected average
log(n) time cost for the `containsKey`, `get`, `put` and `remove` operations."_

You choose CSLM when you need **ordering as an operation**, not merely as a presentation concern:
`firstKey()`, `lastKey()`, `ceilingEntry`, `floorEntry`, `headMap`/`tailMap`/`subMap`, `pollFirstEntry`,
descending views. Time-series buckets, leaderboard ranges, expiry wheels keyed by deadline, sorted index
views.

If you only need sorted _output_, sort a snapshot from a CHM instead. That is `O(n log n)` once, versus a
permanent `log n` factor on every single `get`.

## 4.2 Cost versus CHM

|                      | `ConcurrentHashMap`                | `ConcurrentSkipListMap`                                                                                                                                                                                      |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get`/`put`/`remove` | amortised O(1)                     | expected average O(log n) **[JDOC-25]**                                                                                                                                                                      |
| Reads                | lock-free volatile read            | lock-free, but multi-level pointer chase → more cache misses                                                                                                                                                 |
| Writes               | CAS on empty bin, else bin monitor | CAS-based, no locks                                                                                                                                                                                          |
| Memory               | one node per entry + table         | index levels on top of nodes → strictly more                                                                                                                                                                 |
| Ordering ops         | none                               | full `NavigableMap`                                                                                                                                                                                          |
| `null` key/value     | forbidden **[JDOC-25]**            | forbidden **[JDOC-25]**                                                                                                                                                                                      |
| Iterator             | weakly consistent                  | weakly consistent **[JDOC-25]**                                                                                                                                                                              |
| Entries returned     | live-ish                           | _"All `Map.Entry` pairs returned by methods in this class and its views represent **snapshots** of mappings at the time they were produced. They do not support the `Entry.setValue` method."_ **[JDOC-25]** |
| Bulk ops atomic?     | no                                 | _"Beware that bulk operations `putAll`, `equals`, `toArray`, `containsValue`, and `clear` are not guaranteed to be performed atomically."_ **[JDOC-25]**                                                     |
| Directional cost     | n/a                                | _"Ascending key ordered views and their iterators are faster than descending ones."_ **[JDOC-25]**                                                                                                           |

## 4.3 FOLKLORE — `ConcurrentSkipListMap.size()` is O(n)

**This was true through JDK 9 and is false from JDK 10 onward.**

- JDK 8u source and javadoc: _"Beware that, unlike in most collections, this method is NOT a constant-time
  operation. Because of the asynchronous nature of these maps, determining the current number of elements
  requires traversing them all to count them."_ **[SRC jdk8u/master `ConcurrentSkipListMap`]**
- `LongAdder adder` field first appears at tag `jdk-10+46`; absent at `jdk-9+181` and in jdk8u.
  **[SRC — grep across tags]**
- JDK 25 implementation **[SRC-25 line 1396]**:
  ```java
  public int size() {
      long c;
      return ((baseHead() == null) ? 0 :
              ((c = getAdderCount()) >= Integer.MAX_VALUE) ? Integer.MAX_VALUE : (int) c);
  }
  ```
  and the JDK 25 javadoc for `size()` no longer carries the warning **[JDOC-25]**.
- The stale warning survived in the **`ConcurrentSkipListSet`** javadoc until it was removed by
  `JDK-8336462 "ConcurrentSkipListSet Javadoc incorrectly warns about size method complexity"`, **fixVersion
  24** **[JBS-8336462]**.

So: on JDK 21 and 25, `ConcurrentSkipListMap/Set.size()` is a cheap estimate, not a traversal. It is still an
_estimate_ under concurrent update — the `size()` discipline from §1.3 still applies. (Contrast with
`ConcurrentLinkedQueue` and `LinkedTransferQueue`, where `size()` genuinely is O(n) — see §5.)

---

# 5. The `BlockingQueue` family

## 5.1 The four method forms — memorise this table

**[JDOC-25 `BlockingQueue`]**:

| Operation   | Throws Exception | Special Value | Blocks   | Times Out              |
| ----------- | ---------------- | ------------- | -------- | ---------------------- |
| **Insert**  | `add(e)`         | `offer(e)`    | `put(e)` | `offer(e, time, unit)` |
| **Remove**  | `remove()`       | `poll()`      | `take()` | `poll(time, unit)`     |
| **Examine** | `element()`      | `peek()`      | n/a      | n/a                    |

**Which one is the deliberate backpressure choice?**

- `put(e)` — _unconditional_ backpressure. The producer's own thread is the throttle. Correct when the
  producer is a request thread you _want_ to slow down and there is no SLA on the enqueue path.
- **`offer(e, timeout, unit)` — the right default for a service.** It bounds the backpressure: you get a
  `false` you can turn into a 503 / shed-load / spill-to-disk decision, and you get a _deadline_. This is the
  one senior engineers under-use.
- `offer(e)` — fail-fast. Correct only when dropping is genuinely acceptable (metrics, sampled telemetry).
  Silent data loss when it is not.
- `add(e)` — throws `IllegalStateException("Queue full")`. Almost always wrong in a producer loop: it turns a
  routine capacity condition into an exception, and on an unbounded queue it can never fire, so the code
  reads as if it handles overflow when it cannot.

**Other contract facts [JDOC-25 `BlockingQueue`]:**

- _"A `BlockingQueue` does not accept `null` elements... A `null` is used as a sentinel value to indicate
  failure of `poll` operations."_
- _"A `BlockingQueue` without any intrinsic capacity constraints always reports a remaining capacity of
  `Integer.MAX_VALUE`."_ — so `remainingCapacity()` is useless as an overload signal on an unbounded queue.
- _"A `BlockingQueue` does not intrinsically support any kind of 'close' or 'shutdown' operation... a common
  tactic is for producers to insert special end-of-stream or **poison** objects."_
- Memory model: _"actions in a thread prior to placing an object into a `BlockingQueue` happen-before actions
  subsequent to the access or removal of that element from the `BlockingQueue` in another thread."_ (Route the
  general rule to `java-memory-model`.)

## 5.2 Choosing an implementation

| Implementation             | Bounded?                                                       | Lock structure                                                                           | Pick it when                                                                                                                                                                                        | Watch out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArrayBlockingQueue`       | **always** (fixed at construction)                             | **one** `ReentrantLock` + `notEmpty`/`notFull` Conditions **[SRC-25 lines 122–130]**     | you want a hard, pre-allocated bound and predictable memory; classic bounded buffer                                                                                                                 | producers and consumers contend on the **same** lock → throughput ceiling under high concurrency; capacity cannot change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LinkedBlockingQueue(int)` | yes                                                            | **two** locks: `putLock` + `takeLock` + `AtomicInteger count` **[SRC-25 lines 141–163]** | high producer/consumer concurrency with a bound                                                                                                                                                     | node allocation per element; _"Linked queues typically have higher throughput than array-based queues but less predictable performance in most concurrent applications."_ **[JDOC-25]**                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `LinkedBlockingQueue()`    | **NO — `Integer.MAX_VALUE`** **[JDOC-25]**                     | as above                                                                                 | almost never                                                                                                                                                                                        | **the classic hidden failure mode — §5.3**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SynchronousQueue`         | zero capacity                                                  | —                                                                                        | direct handoff / rendezvous; you want the producer to block until a consumer is _actually_ ready                                                                                                    | _"does not have any internal capacity, not even a capacity of one"_, _"You cannot `peek`"_, _"You cannot iterate"_, `isEmpty()` always `true`, `size()` always `0`, `remainingCapacity()` always `0` **[JDOC-25]** — every monitoring hook returns a lie                                                                                                                                                                                                                                                                                                                                                       |
| `LinkedTransferQueue`      | **unbounded** **[JDOC-25]**                                    | CAS/dual-queue                                                                           | you want SynchronousQueue-style handoff _and_ buffering: `transfer(e)` blocks until consumed, `tryTransfer(e)` only hands off to a _waiting_ consumer, `hasWaitingConsumer()` lets a producer adapt | unbounded → same OOM exposure; `size()` is O(n); **and see the JDK 21–25 `poll()` bug in §5.4**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PriorityBlockingQueue`    | **unbounded**                                                  | single lock + heap                                                                       | you need priority ordering on the consumer side                                                                                                                                                     | _"While this queue is logically unbounded, attempted additions may fail due to resource exhaustion (causing `OutOfMemoryError`)"_ **[JDOC-25]**; **iteration is NOT in priority order** — _"The `Iterator`... and the `Spliterator`... are not guaranteed to traverse the elements... in any particular order"_, use `drainTo` or `Arrays.sort(pq.toArray())` **[JDOC-25]**; ties are unordered — _"Operations on this class make no guarantees about the ordering of elements with equal priority"_ → add a sequence number to your comparator for FIFO tie-breaking (the javadoc gives a `FIFOEntry` sample) |
| `DelayQueue`               | **unbounded**                                                  | —                                                                                        | scheduled/expiring work, retry backoff, TTL eviction                                                                                                                                                | see §5.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LinkedBlockingDeque`      | optionally bounded (`Integer.MAX_VALUE` default) **[JDOC-25]** | one lock                                                                                 | work stealing, LIFO processing, put-back-on-failure                                                                                                                                                 | _"Most operations run in constant time... Exceptions include `remove`, `removeFirstOccurrence`, `removeLastOccurrence`, `contains`, and the bulk operations, all of which run in **linear** time."_ **[JDOC-25]** (this wording was clarified by `JDK-8354111`, fixVersion 25 **[JBS-8354111]**)                                                                                                                                                                                                                                                                                                               |
| `ConcurrentLinkedQueue`    | **unbounded, non-blocking**                                    | CAS (Michael & Scott algorithm)                                                          | you want a queue with no blocking semantics at all — pure handoff buffer polled by an already-running loop                                                                                          | **`size()` is O(n)** — see §5.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 5.3 The unbounded queue as the classic hidden failure mode

**The mechanism.** An unbounded queue converts a _rate mismatch_ into _memory growth_. There is no
backpressure signal anywhere: `put` never blocks, `offer` never returns `false`, `remainingCapacity()` always
reports `Integer.MAX_VALUE`, and `add` never throws. Every mechanism the API gives you to notice overload is
disabled at once.

**Where it hides in real systems (each of these defaults to unbounded):**

- `new LinkedBlockingQueue<>()` — the no-arg constructor.
- `Executors.newFixedThreadPool(n)` and `newSingleThreadExecutor()` — both use an unbounded
  `LinkedBlockingQueue`. (Pool internals → route to `executors-and-task-lifecycle`; the _queue choice_ is
  ours.)
- `PriorityBlockingQueue`, `DelayQueue`, `LinkedTransferQueue`, `ConcurrentLinkedQueue` — unbounded by
  construction, no bounded variant exists.
- Spring Boot's `applicationTaskExecutor` default queue capacity (`Integer.MAX_VALUE`) — route to
  `async-and-scheduling`.

**Symptoms an engineer actually observes, in order:**

1. Latency climbs while CPU is _flat_ and thread count is _flat_ — because everything is queued, not running.
   (Little's Law: `L = λW`; the queue is `L`. Route sizing arithmetic to `littles-law-and-queueing`.)
2. Old-gen occupancy after full GC ratchets upward across hours; GC frequency climbs, then pause time.
3. Requests time out downstream, clients retry, arrival rate goes _up_, queue grows faster → the classic
   metastable failure. Route to `cascading-failures`.
4. Eventually `OutOfMemoryError: Java heap space`, with a heap dump dominated by the queue's `Node` objects
   or your task lambdas' captured state.
5. Work in the queue at the moment of crash is lost silently — nothing ever acknowledged it.

**The rule:** _every_ queue in a production path has an explicit capacity, and an explicit policy for what
happens when it is full. If you cannot name the policy, you have not bounded the queue; you have hidden it.

## 5.4 `LinkedTransferQueue.poll()` can spuriously return `null` on JDK 21–25 — REAL BUG

`JDK-8371740 "LinkedTransferQueue.poll() returns null even though queue is not empty"`.
**Affected versions: 21, 22, 23, 24, 25. Fix Version: 26. Resolution: Fixed. No backport exists as of
2026-08-27** (JBS shows exactly one issue with that summary and one fixVersion). **[JBS-8371740]**

Verified in source: the JDK 25 code falls out of the match loop when `cmpExItem` loses its CAS, whereas
mainline now retries:

```java
// jdk-25+36
if (p.isData != haveData && haveData != (m != null) && p.cmpExItem(m, e) == m) { ... }
// mainline (JDK 26)
if (p.isData != haveData && haveData != (m != null)) {
    if (p.cmpExItem(m, e) == m) { ... }
    continue restart;
}
```

**[SRC-25 vs SRC-master, `LinkedTransferQueue.java` ~line 591]**

The reporter's reproducer uses 4 threads doing `offer`/`peek`/`poll` and observes non-empty-but-null polls;
`LinkedBlockingQueue`, `LinkedBlockingDeque` and `ArrayBlockingQueue` do not exhibit it **[JBS-8371740]**.

**Operational consequence:** on JDK 21/25 LTS, code shaped `E e = ltq.poll(); if (e == null) { /* queue is
empty, go idle / shut down / report drained */ }` is **incorrect**. Symptom: a consumer loop that idles or
exits while items remain, or a "drained" assertion that fails under load, only under concurrency, never
reproducible in a unit test. Workaround: retry the `poll`, or use `LinkedBlockingQueue`.

Related history: `JDK-8301341 "LinkedTransferQueue does not respect timeout for poll()"` — fixVersion 22
**[JBS-8301341]**; so on JDK 21, `LTQ.poll(timeout, unit)` may also over/under-wait.

**Bottom line for the skill: `LinkedTransferQueue` is the least battle-tested member of the family. Prefer
`LinkedBlockingQueue`/`ArrayBlockingQueue` unless you specifically need `transfer`/`tryTransfer`/
`hasWaitingConsumer`.**

## 5.5 `DelayQueue` — the contract violation is deliberate and documented

**[JDOC-25]**, class doc, verbatim structure:

- _"An element is considered **expired** when its `getDelay(TimeUnit.NANOSECONDS)` method would return a value
  less than or equal to zero."_
- _"An element is considered the **head** of the queue if it is the element with the earliest expiration time,
  whether in the past or the future."_
- _"An element is considered the **expired head** ... if it is the expired element with the earliest
  expiration time in the past."_
- _"While this class implements the `BlockingQueue` interface, it **intentionally violates the general
  contract of `BlockingQueue`**, in that the following methods disregard the presence of unexpired elements
  and only ever remove the expired head: `poll()`, `poll(long,TimeUnit)`, `take()`, `remove()`."_
- _"All other methods operate on both expired and unexpired elements. For example, the `size()` method returns
  the count of all elements. Method `peek()` may return the (non-null) head even when `take()` would block
  waiting for that element to expire."_

This wording is JDK 21+; it came from `JDK-8297605 "improve DelayQueue removal method javadoc"`, fixVersion 21
**[JBS-8297605]**. Older javadocs are vaguer.

**`drainTo` caveat.** The class doc's list of "removal-only-expired" methods does **not** include `drainTo`,
and `drainTo`'s own javadoc is inherited boilerplate (_"Removes all available elements..."_) **[JDOC-25]**.
The implementation drains **only expired elements** (`DelayQueue.drainTo` walks `q.peek()` while
`first.getDelay(NANOSECONDS) <= 0`). Treat "available" as "expired". _Source-derived; the javadoc is
ambiguous — worth calling out as a documentation gap._

**Failure modes:** (a) `size()` used as a "work pending now" metric — it counts the future too; (b) an
unbounded `DelayQueue` used as a retry buffer grows without limit during a downstream outage (§5.3 applies);
(c) a mutable `getDelay()` that can go _backwards_ corrupts the internal heap ordering.

## 5.6 `ConcurrentLinkedQueue` — non-blocking, unbounded, O(n) size

**[JDOC-25]**, verbatim:

> An unbounded thread-safe queue based on linked nodes... employs an efficient non-blocking algorithm based on
> one described in _Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms_ by
> Maged M. Michael and Michael L. Scott.
>
> **Beware that, unlike in most collections, the `size` method is _NOT_ a constant-time operation.** Because
> of the asynchronous nature of these queues, determining the current number of elements requires a traversal
> of the elements, and so may report inaccurate results if this collection is modified during traversal.
>
> Bulk operations that add, remove, or examine multiple elements, such as `addAll(Collection)`,
> `removeIf(Predicate)` or `forEach(Consumer)`, are _not_ guaranteed to be performed atomically.
>
> Iterators are _weakly consistent_... Elements contained in the queue since the creation of the iterator will
> be returned exactly once.

**The killer anti-pattern:** exporting `clq.size()` as a Micrometer gauge scraped every 15s on a queue with
100k elements. You have just added a 100k-node pointer chase to your metrics path, on a queue whose whole
point was to be lock-free. Symptom: a CPU flame graph where a large sample fraction sits in
`ConcurrentLinkedQueue.size` under the metrics scrape thread. Track a `LongAdder` you increment/decrement
yourself instead, or use `isEmpty()` (which is O(1) — it only checks for a first node).

`LinkedTransferQueue` carries the identical O(n) `size()` warning **[JDOC-25]**.

## 5.7 `drainTo`

**[JDOC-25 `BlockingQueue`]**: _"Removes all available elements from this queue and adds them to the given
collection. This operation may be more efficient than repeatedly polling this queue. A failure encountered
while attempting to add elements to collection `c` may result in elements being in neither, either or both
collections when the associated exception is thrown. Attempts to drain a queue to itself result in
`IllegalArgumentException`. Further, the behavior of this operation is undefined if the specified collection
is modified while the operation is in progress."_

Use `drainTo(list, maxElements)` — the batching primitive for consumer loops (one lock acquisition per batch
instead of per element, and it is the _only_ way to read a `PriorityBlockingQueue` in priority order in bulk
**[JDOC-25 PBQ]**). Note it is **non-blocking**: it drains what is there _now_ and returns, possibly 0. The
standard shape is a blocking `take()` for the first element followed by `drainTo` for the rest.

Failure mode: `drainTo(unboundedList)` on a queue under load pulls an unbounded batch into memory — the
`maxElements` overload exists for a reason.

## 5.8 `BlockingDeque` / work stealing

`LinkedBlockingDeque` is the only `BlockingDeque` in the JDK. Two uses:

1. **Work stealing by hand:** each worker pushes/pops at its own _head_ (LIFO — good locality, the most
   recently produced task is hottest in cache) and thieves take from the _tail_ (FIFO — steals the oldest,
   biggest task, and contends with the owner least). This is JCiP §8.3.5's description of the pattern and
   what `ForkJoinPool` implements internally.
2. **Put-back on failure:** `addFirst(item)` to re-queue an item whose processing failed, ahead of newer work.

For real fork/join workloads, use `ForkJoinPool` — do not hand-roll. `LinkedBlockingDeque` uses a **single**
lock, so it does not actually give you the contention-avoidance property that makes work stealing fast; it
gives you the _ordering_ property only.

---

# 6. Synchronizers

## 6.1 `CountDownLatch` — one-shot

**[JDOC-25]**: _"The `await` methods block until the current count reaches zero due to invocations of the
`countDown()` method, after which all waiting threads are released and any subsequent invocations of `await`
return immediately. **This is a one-shot phenomenon — the count cannot be reset.** If you need a version that
resets the count, consider using a `CyclicBarrier`."_

Also: _"A useful property of a `CountDownLatch` is that it doesn't require that threads calling `countDown`
wait for the count to reach zero before proceeding"_ **[JDOC-25]** — i.e. it is a **gate/completion signal**,
not a barrier. Nobody rendezvouses.

Memory model **[JDOC-25]**: _"Until the count reaches zero, actions in a thread prior to calling `countDown()`
happen-before actions following a successful return from a corresponding `await()` in another thread."_

**Failure modes:**

- `countDown()` not in a `finally` → a worker that throws leaves the coordinator blocked in `await()` forever.
  **Symptom:** a thread dump showing one thread parked in `CountDownLatch$Sync` / `AbstractQueuedSynchronizer.
acquireSharedInterruptibly` with no progress and no error in the log. This is the single most common latch
  bug.
- `await()` with no timeout in a request path → an unbounded hang. Always prefer
  `await(timeout, unit)` and check the returned `boolean`.
- Latch count computed from a collection that can change → count never reaches zero, or reaches zero early.
- Catching `InterruptedException` and swallowing it (as the javadoc's own `Worker` sample does with
  `catch (InterruptedException ex) {}` **[JDOC-25]** — the sample is illustrative, not exemplary).

In modern code, `StructuredTaskScope` replaces most latch usage → route to `structured-concurrency`.

## 6.2 `CyclicBarrier` — reusable, with a barrier action and all-or-none breakage

**[JDOC-25]**:

- _"The barrier is called cyclic because it can be re-used after the waiting threads are released."_
- _"A `CyclicBarrier` supports an optional `Runnable` command that is run once per barrier point, **after the
  last thread in the party arrives, but before any threads are released**. This barrier action is useful for
  updating shared-state before any of the parties continue."_
- _"each invocation of `await()` returns the arrival index of that thread at the barrier"_ → the
  `if (barrier.await() == 0) {...}` idiom to elect one thread.
- **All-or-none breakage:** _"If a thread leaves a barrier point prematurely because of interruption, failure,
  or timeout, all other threads waiting at that barrier point will also leave abnormally via
  `BrokenBarrierException` (or `InterruptedException` if they too were interrupted at about the same time)."_
- Memory model: _"Actions in a thread prior to calling `await()` happen-before actions that are part of the
  barrier action, which in turn happen-before actions following a successful return from the corresponding
  `await()` in other threads."_

**Failure modes:**

- **Party-count mismatch is the classic deadlock.** `new CyclicBarrier(N)` with `N-1` live threads → every
  thread parks forever. Symptom: all worker threads in `CyclicBarrier.dowait`, zero CPU, no error.
- A barrier action that throws propagates to the triggering thread **and breaks the barrier** for everyone.
- `BrokenBarrierException` treated as a retryable error: once broken, the barrier stays broken until
  `reset()`. The javadoc for `reset()` warns _"resets after a breakage has occurred for other reasons can be
  complicated to carry out; threads need to re-synchronize in some other way... It may be preferable to
  instead create a new barrier for subsequent use."_ **[SRC-master `CyclicBarrier.reset` javadoc]**
- Using a barrier where a latch suffices (or vice versa). Rule: **do the threads need to meet, or does one
  thread need to know the others finished?** Meet → barrier. Know → latch.

## 6.3 `Phaser` — dynamic parties

**[JDOC-25]**, key properties:

- **Registration:** _"Unlike the case for other barriers, the number of parties registered to synchronize on a
  phaser may vary over time. Tasks may be registered at any time (using `register()`, `bulkRegister(int)`, or
  forms of constructors...), and optionally deregistered upon any arrival (using `arriveAndDeregister()`)...
  registration and deregistration affect only internal counts... **tasks cannot query whether they are
  registered**."_
- **Arrival vs waiting are separate:** _"Methods `arrive()` and `arriveAndDeregister()` record arrival. These
  methods **do not block**, but return an associated arrival phase number."_ `awaitAdvance(int phase)`
  returns when the phaser has moved past that phase. `arriveAndAwaitAdvance()` is the `CyclicBarrier.await`
  analogue.
- **`awaitAdvance` is uninterruptible by default:** _"Unlike similar constructions using `CyclicBarrier`,
  method `awaitAdvance` continues to wait even if the waiting thread is interrupted. Interruptible and
  timeout versions are also available, but exceptions encountered while tasks wait interruptibly or with
  timeout do not change the state of the phaser."_
- **Termination:** _"Upon termination, all synchronization methods immediately return without waiting for
  advance, as indicated by a negative return value."_ Triggered by `onAdvance(...)` returning `true`; default
  implementation returns `true` when deregistration drops registered parties to zero. `forceTermination()`
  releases everyone abruptly.
- **Phase number wraps:** _"The phase number starts at zero, and advances when all parties arrive at the
  phaser, wrapping around to zero after reaching `Integer.MAX_VALUE`."_
- **Tiering:** _"Phasers may be tiered (i.e., constructed in tree structures) to reduce contention... This may
  greatly increase throughput even though it incurs greater per-operation overhead."_
- **Hard limit:** _"This implementation restricts the maximum number of parties to **65535**. Attempts to
  register additional parties result in `IllegalStateException`."_ **[JDOC-25 Implementation notes]** — with
  virtual threads this is a limit you can actually hit; the documented answer is tiering.

**Decision rule (latch vs barrier vs phaser):**

|                  | parties               | reusable | dynamic | interruptible wait                                        | action on trip                                                     |
| ---------------- | --------------------- | -------- | ------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `CountDownLatch` | fixed at construction | **no**   | no      | yes (`await`)                                             | none                                                               |
| `CyclicBarrier`  | fixed at construction | yes      | no      | yes                                                       | `Runnable` barrier action                                          |
| `Phaser`         | dynamic, ≤65535       | yes      | **yes** | `awaitAdvance` is **not**; `awaitAdvanceInterruptibly` is | overridable `onAdvance(phase, parties)`, also controls termination |

Use `Phaser` only when parties genuinely join/leave between phases. Otherwise it is a strictly more complex
`CyclicBarrier`, and the "negative return value means terminated" convention is a bug magnet.

**Failure modes:** forgetting `arriveAndDeregister()` in a `finally` → the phase never advances (same shape as
a missing `countDown()`); ignoring the negative return from `arriveAndAwaitAdvance()`; assuming
`getRegisteredParties()`/`getArrivedParties()` are usable for control flow — _"The values returned by these
methods may reflect transient states and so are not in general useful for synchronization control"_
**[JDOC-25]**.

## 6.4 `Semaphore`

**Fair vs unfair [JDOC-25]:**

> When set false, this class makes no guarantees about the order in which threads acquire permits. In
> particular, **barging** is permitted, that is, a thread invoking `acquire()` can be allocated a permit ahead
> of a thread that has been waiting — logically the new thread places itself at the head of the queue of
> waiting threads. When fairness is set true, the semaphore guarantees that threads invoking any of the
> `acquire` methods are selected to obtain permits in the order in which their invocation of those methods was
> processed (first-in-first-out; FIFO).
>
> **Generally, semaphores used to control resource access should be initialized as fair, to ensure that no
> thread is starved out from accessing a resource. When using semaphores for other kinds of synchronization
> control, the throughput advantages of non-fair ordering often outweigh fairness considerations.**

**`acquire` vs `tryAcquire` [JDOC-25]:**

> Also note that the **untimed `tryAcquire` methods do not honor the fairness setting**, but will take any
> permits that are available.

and on `tryAcquire()`:

> Even when this semaphore has been set to use a fair ordering policy, a call to `tryAcquire()` will
> immediately acquire a permit if one is available, whether or not other threads are currently waiting. This
> "barging" behavior can be useful in certain circumstances, even though it breaks fairness. **If you want to
> honor the fairness setting, then use `tryAcquire(0, TimeUnit.SECONDS)` which is almost equivalent (it also
> detects interruption).**

That last sentence is a genuinely non-obvious, high-value API fact.

**Release without acquire is legal — and dangerous [JDOC-25]:**

> There is no requirement that a thread that releases a permit must have acquired that permit by calling
> `acquire()`. **Correct usage of a semaphore is established by programming convention in the application.**

and:

> A semaphore initialized to one... can serve as a mutual exclusion lock... the binary semaphore has the
> property (unlike many `Lock` implementations), that the "lock" can be released by a thread other than the
> owner (as semaphores have no notion of ownership). This can be useful in some specialized contexts, such as
> **deadlock recovery**.

**Permit leaks — the two shapes and their symptoms:**

1. **Leak on the exception path (permits vanish).**

   ```java
   sem.acquire();
   doWork();          // throws
   sem.release();     // never reached
   ```

   **Symptom:** throughput decays _monotonically over days_, in steps, never recovers without a restart;
   `sem.availablePermits()` trends to 0; threads pile up parked in `AbstractQueuedSynchronizer` /
   `Semaphore$NonfairSync`. The classic "it's fine after a restart, degrades over a week" ticket.
   **Fix:** `acquire()` immediately before `try`, `release()` as the first statement of `finally` — the same
   discipline as `ReentrantLock`, and for the same reason.

2. **Over-release (permits multiply).** Because `release()` has no ownership check, a double-release or a
   `release()` on an error path that also ran normally _silently raises the limit_. **Symptom:** the
   concurrency limit you configured is not the limit you observe — 12 in-flight calls against a semaphore of
   8, and no error anywhere. Nothing in the JDK will ever tell you.
   **Fix:** a boolean `acquired` flag, or `Semaphore.tryAcquire` + a single well-defined release site; assert
   `availablePermits() <= configured` in a health check (see §12).

3. **Interruption:** `acquire()` throws `InterruptedException` _without_ taking a permit — correct. But
   `acquireUninterruptibly()` does not, and combined with a leaked permit it produces a thread that can never
   be shut down.

**Note `reducePermits(int reduction)` is `protected`** — _"This method can be useful in subclasses that use
semaphores to track resources that become unavailable... it does not block waiting for permits to become
available."_ **[JDOC-25]** It is the correct primitive for shrinking a limit; `drainPermits()` is the
sledgehammer.

**Semaphore is the JDK-endorsed way to limit concurrency under virtual threads** — see §10.4.
Resilience-pattern framing (bulkhead) → route to `concurrency-limiting-and-bulkheads`.

## 6.5 `Exchanger`

**[JDOC-25]**: _"A synchronization point at which threads can pair and swap elements within pairs. Each thread
presents some object on entry to the `exchange` method, matches with a partner thread, and receives its
partner's object on return. **An `Exchanger` may be viewed as a bidirectional form of a `SynchronousQueue`.**
Exchangers may be useful in applications such as genetic algorithms and pipeline designs."_

Canonical use: double-buffering (filler thread swaps a full buffer for an empty one).

Rare in application code, and rightly so: it only pairs _two_ threads, `exchange()` blocks indefinitely
without a partner, and `exchange(v, timeout, unit)` throws `TimeoutException`. With virtual threads and
`BlockingQueue`s of capacity 1 you can usually express the same pipeline more legibly.

`JDK-8338146 "Improve Exchanger performance with VirtualThreads"`, fixVersion 24 **[JBS-8338146]** — worth
knowing that pre-24 `Exchanger` spun in ways that were hostile to virtual threads.

---

# 7. `Condition` and the wait/notify protocol

## 7.1 What `Condition` is

**[JDOC-25]**: _"`Condition` factors out the `Object` monitor methods (`wait`, `notify` and `notifyAll`) into
distinct objects to give the effect of **having multiple wait-sets per object**, by combining them with the
use of arbitrary `Lock` implementations."_ And: _"The key property that waiting for a condition provides is
that it **atomically releases the associated lock and suspends the current thread**, just like
`Object.wait`."_

Obtain one with `lock.newCondition()`.

## 7.2 The mandatory `while` loop

**[JDOC-25 Implementation Considerations]**:

> When waiting upon a `Condition`, a **"spurious wakeup"** is permitted to occur, in general, as a concession
> to the underlying platform semantics. This has little practical impact on most application programs as a
> `Condition` **should always be waited upon in a loop, testing the state predicate that is being waited
> for.** An implementation is free to remove the possibility of spurious wakeups but it is recommended that
> applications programmers always assume that they can occur and so always wait in a loop.

The identical rule for the legacy monitor form, from `Object.wait` **[JDOC-25 `java.lang.Object`]**:

```java
synchronized (obj) {
    while (<condition does not hold and timeout not exceeded>) {
        long timeoutMillis = ...; // recompute timeout values
        int nanos = ...;
        obj.wait(timeoutMillis, nanos);
    }
    ... // Perform action appropriate to condition or timeout
}
```

_"Among other things, this approach avoids problems that can be caused by spurious wakeups."_

**Three independent reasons the `while` is mandatory** (the skill should give all three, because engineers
who only know "spurious wakeups" will happily write `if` when they believe the platform is well-behaved):

1. Spurious wakeup (platform concession).
2. `signalAll` wakes every waiter but only one can make the predicate true.
3. **Barging:** between the signal and the waiter re-acquiring the lock, a third thread can acquire the lock
   and invalidate the predicate. This one is guaranteed by the non-fair lock policy, not a rare event.

Reason 3 is why `if` is wrong even on a hypothetical platform with no spurious wakeups.

**Symptom of getting it wrong:** a bounded buffer that occasionally overwrites an element or returns a stale
one; an `ArrayIndexOutOfBoundsException` or a negative `count`, appearing under load only.

## 7.3 `signal` vs `signalAll` — when `signal` is safe

`signal()` _"Wakes up one waiting thread"_; `signalAll()` _"Wakes up all waiting threads"_ **[JDOC-25]**.

`signal()` is safe **only when all three hold**:

1. **Uniform waiters** — every thread waiting on _this_ condition is waiting for the _same_ predicate.
2. **One-in / one-out** — a single state change enables exactly one waiter.
3. The waiter that is woken, if it cannot proceed, will itself signal onward (or the invariant is preserved
   by construction).

If waiters on one condition are waiting for _different_ predicates, `signal()` can wake the wrong one and the
right one sleeps forever. **Symptom: a lost wakeup — permanent, silent stall of one thread while the system
otherwise runs.** This is the hardest concurrency bug to diagnose from a thread dump because everything looks
"normally parked".

**Which is why multiple `Condition`s on one `Lock` is the correct design**, not an optimisation. The
`Condition` javadoc's own bounded-buffer sample **[JDOC-25]** — the canonical shape the skill should print:

```java
class BoundedBuffer<E> {
  final Lock lock = new ReentrantLock();
  final Condition notFull  = lock.newCondition();
  final Condition notEmpty = lock.newCondition();
  final Object[] items = new Object[100];
  int putptr, takeptr, count;

  public void put(E x) throws InterruptedException {
    lock.lock();
    try {
      while (count == items.length) notFull.await();
      items[putptr] = x;
      if (++putptr == items.length) putptr = 0;
      ++count;
      notEmpty.signal();
    } finally { lock.unlock(); }
  }

  public E take() throws InterruptedException {
    lock.lock();
    try {
      while (count == 0) notEmpty.await();
      E x = (E) items[takeptr];
      if (++takeptr == items.length) takeptr = 0;
      --count;
      notFull.signal();
      return x;
    } finally { lock.unlock(); }
  }
}
```

Note the javadoc's own postscript: _"(The `ArrayBlockingQueue` class provides this functionality, so there is
no reason to implement this sample usage class.)"_ **[JDOC-25]** — the strongest possible statement of "don't
write this."

With `Object.wait`/`notify` you have exactly **one** wait-set per object, so `notifyAll()` is the only safe
choice in almost all cases. That single fact is the strongest reason to prefer `Lock` + `Condition` for any
non-trivial state-dependent class.

## 7.4 `awaitUninterruptibly`, `awaitNanos`, and remaining-time arithmetic

Three forms, and the javadoc is explicit that they may differ: _"The three forms of condition waiting
(interruptible, non-interruptible, and timed) may differ in their ease of implementation on some platforms
and in their performance characteristics... an implementation is not required to define exactly the same
guarantees or semantics for all three forms of waiting."_ **[JDOC-25]**

Also: _"As interruption generally implies cancellation, and checks for interruption are often infrequent, an
implementation can favor responding to an interrupt over normal method return. This is true even if it can be
shown that the interrupt occurred after another action that may have unblocked the thread."_ **[JDOC-25]**
→ an `InterruptedException` does **not** prove the condition was not signalled; the signal may have been
redirected. Cancellation handling → route to `cancellation-and-interruption`.

**`awaitNanos` — why nanos and not millis [JDOC-25]:**

> The method returns an estimate of the number of nanoseconds remaining to wait given the supplied
> `nanosTimeout` value upon return, or a value less than or equal to zero if it timed out. This value can be
> used to determine whether and how long to re-wait in cases where the wait returns but an awaited condition
> still does not hold.
>
> **Design note:** This method requires a nanosecond argument so as to avoid truncation errors in reporting
> remaining times. Such precision loss would make it difficult for programmers to ensure that total waiting
> times are not systematically shorter than specified when re-waits occur.

The canonical loop, verbatim from the javadoc **[JDOC-25]**:

```java
boolean aMethod(long timeout, TimeUnit unit) throws InterruptedException {
    long nanosRemaining = unit.toNanos(timeout);
    lock.lock();
    try {
        while (!conditionBeingWaitedFor()) {
            if (nanosRemaining <= 0L)
                return false;
            nanosRemaining = theCondition.awaitNanos(nanosRemaining);
        }
        // ...
        return true;
    } finally { lock.unlock(); }
}
```

**The bug this prevents:** re-passing the _original_ timeout inside the `while` loop. With N spurious wakeups
the total wait becomes N×timeout — an unbounded wait dressed up as a bounded one. **Symptom:** a "5 second
timeout" that occasionally takes minutes, with no timeout ever reported. (`await(time, unit)` returns
`false` on timeout but gives you no remaining time, so it cannot be used correctly inside a re-wait loop —
`awaitNanos` exists precisely for that.)

`awaitUninterruptibly()` _"Causes the current thread to wait until it is signalled"_ **[JDOC-25]** and does
not throw. It is correct only in code that genuinely cannot be cancelled (usually: cleanup paths). Using it
in a request path produces a thread that ignores shutdown — **symptom: a JVM that will not exit and
`shutdownNow()` that does nothing.**

## 7.5 Legacy `Object.wait`/`notify` — equivalence and the differences that matter

|                           | `Object.wait/notify/notifyAll`                                                       | `Condition.await/signal/signalAll`                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Lock                      | the object's intrinsic monitor                                                       | any `Lock`                                                                                                                        |
| Wait sets per lock        | **one**                                                                              | as many as you create                                                                                                             |
| Guard required            | must hold the monitor, else `IllegalMonitorStateException` **[JDOC-25 Object.wait]** | must hold the `Lock`; _"Typically, an exception will be thrown (such as `IllegalMonitorStateException`)"_ **[JDOC-25 Condition]** |
| Timed form                | `wait(millis)`, `wait(millis, nanos)` — no remaining-time return                     | `awaitNanos` returns remaining; `awaitUntil(Date)` for absolute deadlines                                                         |
| Uninterruptible form      | none                                                                                 | `awaitUninterruptibly()`                                                                                                          |
| Spurious wakeups          | permitted                                                                            | permitted                                                                                                                         |
| Virtual threads (JDK ≤23) | `Object.wait()` **pinned** the carrier **[JEP-444]**                                 | `Condition.await` parks via `LockSupport` → **unmounts** **[JEP-444]**                                                            |
| Virtual threads (JDK 24+) | `Object.wait()` unmounts **[JEP-491]**                                               | unmounts                                                                                                                          |

**Warning [JDOC-25 `Condition`]:** _"Note that `Condition` instances are just normal objects and can
themselves be used as the target in a `synchronized` statement, and can have their own monitor `wait` and
`notify` methods invoked. Acquiring the monitor lock of a `Condition` instance, or using its monitor methods,
has no specified relationship with acquiring the `Lock` associated with that `Condition`... It is recommended
that to avoid confusion you never use `Condition` instances in this way."_ — i.e.
`synchronized (condition) { condition.wait(); }` compiles, runs, and is a bug.

---

# 8. Explicit locks

## 8.1 `ReentrantLock`

**Semantics [JDOC-25]:** _"A reentrant mutual exclusion `Lock` with the same basic behavior and semantics as
the implicit monitor lock accessed using `synchronized` methods and statements, but with extended
capabilities."_ Owned by the last thread to lock it; re-entrant; `isHeldByCurrentThread()` and
`getHoldCount()` expose that. Max 2147483647 recursive locks, then `Error`.

**Fairness cost, verbatim [JDOC-25]:**

> Programs using fair locks accessed by many threads may display **lower overall throughput (i.e., are slower;
> often much slower)** than those using the default setting, but have smaller variances in times to obtain
> locks and guarantee lack of starvation. Note however, that fairness of locks does not guarantee fairness of
> thread scheduling. Thus, one of many threads using a fair lock may obtain it multiple times in succession
> while other active threads are not progressing and not currently holding the lock.
>
> Also note that the **untimed `tryLock()` method does not honor the fairness setting.** It will succeed if the
> lock is available even if other threads are waiting.

Note the tension with the `Semaphore` javadoc's advice to _default_ to fair (§6.4). See §14, disagreement #1.

**The try/finally discipline, verbatim [JDOC-25]:**

```java
class X {
  private final ReentrantLock lock = new ReentrantLock();
  public void m() {
    lock.lock();   // lock() as the last statement before the try block
    try {
      // ... method body
    } finally {
      lock.unlock();   // unlock() as the first statement in the finally block
    }
  }
}
```

Those two inline comments were added by `JDK-8278255 "Add more warning text in ReentrantLock and
ReentrantReadWriteLock"`, **fixVersion 23** **[JBS-8278255]**. The issue text explains why with unusual
precision:

> The call to `lock()` should occur _immediately before_ the beginning of the try block (but not inside of
> it), with no intervening statements or expressions. The call to `unlock()` should occur as the _very first_
> statement of the finally block. **The danger here is that somebody might put in an apparently innocuous
> statement (such as logging a message) that, if it were to throw an exception, would violate the locking
> invariants.**

The same issue calls the pre-JDK-23 `ReentrantReadWriteLock` javadoc sample out for exactly this: _"the code
is in a precarious state between the lock acquisition and the beginning of the try-finally statement...
an apparently innocuous refactoring from checking the boolean `cacheValid` field to calling an
`isCacheValid()` method could introduce errors, if that method could possibly throw an exception."_
**[JBS-8278255]**

**Symptom of violating it:** a permanently held lock. Thread dump shows N threads blocked in
`AbstractQueuedSynchronizer.acquire` on the same lock object, and the _owner_ thread is doing something
completely unrelated (or has died). Note that unlike a monitor, a `ReentrantLock` is **not** released when the
holding thread dies or when the stack unwinds — that is precisely the trade-off.

**`tryLock()` vs `tryLock(t,u)` vs `lockInterruptibly()`:**

- `tryLock()` — non-blocking, **ignores fairness** (barges). Correct for lock-ordering deadlock avoidance
  (acquire A, `tryLock` B, on failure release A and retry) and for "skip the work if someone else is doing
  it" idempotence guards.
- `tryLock(timeout, unit)` — honours fairness, responds to interruption, gives you a deadline. The right
  choice in a request path with an SLA.
- `lockInterruptibly()` — blocks but stays cancellable. **This is the single capability with no `synchronized`
  equivalent**, and it is why a task that must be cancellable cannot use `synchronized` for a contended lock.

## 8.2 `ReentrantReadWriteLock`

**Acquisition order [JDOC-25]:**

- _"This class does not impose a reader or writer preference ordering for lock access."_
- Non-fair (default): _"the order of entry to the read and write lock is unspecified... A nonfair lock that is
  continuously contended may **indefinitely postpone one or more reader or writer threads**, but will normally
  have higher throughput than a fair lock."_
- Fair: readers block if a writer is waiting; _"A thread that tries to acquire a fair write lock
  (non-reentrantly) will block unless both the read lock and write lock are free."_ And again:
  _"the non-blocking `ReadLock.tryLock()` and `WriteLock.tryLock()` methods do not honor this fair setting."_

**Writer starvation** is the headline risk, and the implementation's mitigation in non-fair mode is only a
heuristic **[SRC-25 / SRC-master, `NonfairSync.readerShouldBlock`]**:

```java
/* As a heuristic to avoid indefinite writer starvation,
 * block if the thread that momentarily appears to be head
 * of queue, if one exists, is a waiting writer.  This is
 * only a probabilistic effect since a new reader will not
 * block if there is a waiting writer behind other enabled
 * readers that have not yet drained from the queue.
 */
return apparentlyFirstQueuedIsExclusive();
```

Note the flip side: this heuristic is _itself_ a long-standing complaint —
`JDK-6714849 "ReentrantReadWriteLock: Abnormal behavior in non-fair mode"` **[JBS-6714849]** describes a
reader blocking even though no writer holds the lock, contradicting `ReadLock.lock()`'s own javadoc
(_"Acquires the read lock if the write lock is not held by another thread and returns immediately"_).
JBS marks it Fixed/26 — but see §13 for why that is probably a doc fix.

**No upgrade, downgrade is legal [JDOC-25]:**

> Additionally, a writer can acquire the read lock, but not vice-versa... **If a reader tries to acquire the
> write lock it will never succeed.**
>
> **Lock downgrading.** Reentrancy also allows downgrading from the write lock to a read lock, by acquiring
> the write lock, then the read lock and then releasing the write lock. However, **upgrading from a read lock
> to the write lock is not possible.**

"Never succeed" is literal: an attempted upgrade **deadlocks the thread against itself**. Symptom: one thread
parked in `ReentrantReadWriteLock$Sync.acquire` while holding a read lock of the same object, forever, and
`ThreadMXBean.findDeadlockedThreads()` reports **nothing** (it is not a cycle of two threads).

**Condition support [JDOC-25]:** the write lock provides a `Condition`; _"The read lock does not support a
`Condition` and `readLock().newCondition()` throws `UnsupportedOperationException`."_

**JDK 25 change — the reader-count limit was raised.** Through JDK 24, `Sync extends
AbstractQueuedSynchronizer` with an `int` state split 16/16, so `MAX_COUNT = (1 << 16) - 1 = 65535`
(verified at tags `jdk-17+35`, `jdk-21+35`, `jdk-22+36`, `jdk-24+36` **[SRC]**). In JDK 25 it is
`Sync extends AbstractQueuedLongSynchronizer`, `SHARED_SHIFT = 32`, `MAX_COUNT = Integer.MAX_VALUE`
**[SRC-25 lines 254, 264–267]**. Bugs: `JDK-8352971 "Increase maximum number of hold counts for
ReentrantReadWriteLock"` and `JDK-8354016 "Update ReentrantReadWriteLock documentation to reflect its new max
capacity"`, both **fixVersion 25** **[JBS]**.

→ **FOLKLORE ALERT:** "RRWL supports at most 65535 concurrent readers" is **true on JDK 21, false on JDK 25.**
Exceeding it threw `Error("Maximum lock count exceeded")`, which with a million virtual threads was reachable.

**When RRWL actually beats a plain `ReentrantLock`:** only when read critical sections are _long enough_ that
the reader-side CAS on the shared state word costs less than the serialisation it avoids. For short reads
(a map lookup, a field read) the readers all CAS the same cache line and you get worse throughput than a
plain mutex plus more complexity. There is no primary-source number for the crossover; see §14 disagreement
#2. Also consider: a `volatile` reference to an immutable snapshot often removes the lock entirely.

## 8.3 `StampedLock`

**Three modes [JDOC-25]:** writing (`writeLock()`/`unlockWrite(stamp)`), reading
(`readLock()`/`unlockRead(stamp)`), and **optimistic reading** (`tryOptimisticRead()` returns a non-zero
stamp only if not write-locked; `validate(stamp)` checks it is still valid).

**The hard constraints — every one is a footgun:**

- **NOT reentrant.** _"locked bodies should not call other unknown methods that may try to re-acquire locks
  (although you may pass a stamp to other methods that can use or convert it)."_ **[JDOC-25]**
  A recursive `writeLock()` self-deadlocks.
- **No `Condition` support.** `asReadLock()` / `asWriteLock()` return `Lock` views whose `newCondition()`
  throws `UnsupportedOperationException`. **[JDOC-25]**
- **No ownership.** _"Like `Semaphore`, but unlike most `Lock` implementations, StampedLocks have no notion of
  ownership. Locks acquired in one thread can be released or converted in another."_ **[JDOC-25]** → no
  ownership check, no `isHeldByCurrentThread`, and — critically — **no deadlock detection**: JVM/`jstack`
  deadlock reporting sees nothing.
- **No fairness policy at all.** _"The scheduling policy of StampedLock does not consistently prefer readers
  over writers or vice versa. All 'try' methods are best-effort and do not necessarily conform to any
  scheduling or fairness policy."_ **[JDOC-25]**
- **Optimistic reads see torn state.** _"Fields read while in optimistic read mode may be **wildly
  inconsistent**"_ — so the body must only copy fields into locals, be side-effect-free, and validate before
  using anything. **[JDOC-25]**
- **Stamps recycle.** _"Stamp values may recycle after (no sooner than) one year of continuous operation... a
  valid stamp may be guessable"_ — do not treat a stamp as a capability token across a trust boundary.
  **[JDOC-25]**
- **Deserializes unlocked.** _"always deserialize into initial unlocked state, so they are not useful for
  remote locking."_ **[JDOC-25]**

**Canonical optimistic-read idiom, verbatim [JDOC-25]:**

```java
double distanceFromOrigin() {
  long stamp = sl.tryOptimisticRead();
  try {
    retryHoldingLock: for (;; stamp = sl.readLock()) {
      if (stamp == 0L) continue retryHoldingLock;
      double currentX = x;              // only reads into locals
      double currentY = y;
      if (!sl.validate(stamp)) continue retryHoldingLock;
      return Math.hypot(currentX, currentY);
    }
  } finally {
    if (StampedLock.isReadLockStamp(stamp)) sl.unlockRead(stamp);
  }
}
```

The verbosity is the point: if your read section cannot be written in this shape, `StampedLock` is not the
tool.

**What happens if you block while holding it.** Because it is not reentrant, has no ownership tracking, and
readers/writers have no fairness policy, blocking inside a stamped critical section is worse than with any
other lock: no deadlock detection, no `lockInterruptibly` on the plain `writeLock()` path (you must use
`writeLockInterruptibly()` explicitly), and a self-reentry deadlock looks exactly like a slow operation. Under
virtual threads (JDK 21+) the park itself is fine — `StampedLock` uses `LockSupport`, so it unmounts — which
makes the deadlock _cheaper to create_ (you can have a million of them) and no easier to see.

**Writer starvation under many readers.** Heinz Kabutz, _JavaSpecialists_ issue 321, "StampedLock
ReadWriteLock Dangers" **[BLOG — high credibility author, medium confidence in the exact numbers]**:
`StampedLock` (via `asReadWriteLock()`) exhibits writer starvation where `ReentrantReadWriteLock` does not
(measured 3725 ms vs 709 ms to acquire a write lock in his harness), and its ability to hold far more than
65535 concurrent readers _worsens_ the starvation because readers tag-team indefinitely. Also confirms
non-reentrancy breaks nested write-lock code paths.

**JDK 24 note:** `JDK-8345052 "Harden StampedLock"`, fixVersion 24 **[JBS-8345052]** — signal that
`StampedLock` has been receiving robustness work as recently as JDK 24. Treat it as the least mature of the
three lock types.

**Decision rule:** `StampedLock` is for hot, small, in-memory data structures with a stable field layout,
where reads vastly dominate and each read is a handful of field loads (a `Point`, a `Rect`, a rate-limiter's
counters). It is not a general-purpose replacement for `ReentrantReadWriteLock` and never a replacement for
`synchronized`.

## 8.4 When each beats `synchronized` — and what JEP 491 changed

**JEP 491 settles the argument, in its own words [JEP-491]:**

> Once the `synchronized` keyword no longer pins virtual threads, you can choose between `synchronized` and
> the APIs in the `java.util.concurrent.locks` package **based solely upon which best solves the problem at
> hand.**
>
> ...
>
> The flexibility of the `java.util.concurrent.locks` APIs comes at the expense of more awkward syntax. The
> APIs should generally be used with the try-finally construct in order to ensure that locks are released
> appropriately; this is, of course, not necessary with `synchronized`. The `java.util.concurrent.locks` APIs
> also have different performance characteristics than `synchronized` methods or statements.
>
> **We previously recommended solving frequent and long-lived pinning problems by migrating code from using
> `synchronized` to using `ReentrantLock`. Once the `synchronized` keyword no longer pins virtual threads,
> such migration will no longer be necessary. You need not revert code that has been migrated to use
> `ReentrantLock` back to using `synchronized`.**
>
> If you are writing new code, **we agree with the recommendation in Java Concurrency in Practice §13.4: Use
> `synchronized` where practical, since it is more convenient and less error prone, and use `ReentrantLock`
> and the other APIs in `java.util.concurrent.locks` when more flexibility is required.** Either way, reduce
> the potential for contention by narrowing the scope of locks and avoid, where possible, doing I/O or other
> blocking operations while holding locks.

That is the JDK team explicitly endorsing JCiP §13.4 in 2024, twenty years after it was written. It is the
single most citable sentence in this whole brief.

**The capability table (what `synchronized` cannot do):**

| Need                                                  | `synchronized`        | `ReentrantLock`                | `RRWL`          | `StampedLock`                  |
| ----------------------------------------------------- | --------------------- | ------------------------------ | --------------- | ------------------------------ |
| Reentrant                                             | ✅                    | ✅                             | ✅              | ❌                             |
| Auto-release on scope exit / exception                | ✅                    | ❌ (try/finally)               | ❌              | ❌                             |
| Released if thread dies abruptly                      | ✅                    | ❌                             | ❌              | ❌                             |
| Timed acquisition                                     | ❌                    | ✅                             | ✅              | ✅                             |
| Interruptible acquisition                             | ❌                    | ✅                             | ✅              | ✅ (explicit `*Interruptibly`) |
| Poll (`tryLock`)                                      | ❌                    | ✅                             | ✅              | ✅                             |
| Fair ordering option                                  | ❌                    | ✅                             | ✅              | ❌                             |
| Non-block-structured (hand-over-hand)                 | ❌                    | ✅                             | ✅              | ✅                             |
| Multiple condition queues                             | ❌ (one wait-set)     | ✅                             | write lock only | ❌                             |
| Concurrent readers                                    | ❌                    | ❌                             | ✅              | ✅                             |
| Optimistic read (no CAS at all)                       | ❌                    | ❌                             | ❌              | ✅                             |
| Instrumentation (`isLocked`, `getQueueLength`, owner) | partial (thread dump) | ✅                             | ✅              | partial                        |
| Visible in `jstack` deadlock detection                | ✅                    | ✅ (AQS-aware)                 | ✅              | ❌ (no ownership)              |
| Visible as `jdk.JavaMonitorEnter` in JFR              | ✅                    | ❌ (shows as `jdk.ThreadPark`) | ❌              | ❌                             |

**FOLKLORE — "`ReentrantLock` is faster than `synchronized`".** This came from JCiP Ch.13's Java 5-era
throughput measurements. Three things have since changed:

1. Java 6 largely closed the gap (JCiP itself says so and shows both curves).
2. **Biased locking, which made _uncontended_ `synchronized` nearly free, is gone.** JEP 374 disabled it by
   default in **JDK 15** and deprecated all its flags **[JEP-374]**; `JDK-8256425 "Obsolete Biased Locking in
JDK 18"`, fixVersion 18, removed it **[JBS-8256425]**. So uncontended `synchronized` now costs a CAS —
   which is what `ReentrantLock` always cost. **The performance argument moved _toward_ parity, not toward
   `ReentrantLock`.** JEP 374's motivation section is explicit that the classes biased locking used to help
   were `Hashtable`/`Vector`, and that _"applications built around a thread-pool queue and worker threads
   generally perform better with biased locking disabled."_ **[JEP-374]**
3. Under contention, both inflate to an OS-level wait; monitor inflation cost → route to `lock-inflation`.

**Do not benchmark this argument from a blog post.** Measure your own workload with JMH, or don't claim it.

---

# 9. `AbstractQueuedSynchronizer`

## 9.1 The contract

**[JDOC-25]**: _"Provides a framework for implementing blocking locks and related synchronizers (semaphores,
events, etc) that rely on first-in-first-out (FIFO) wait queues. This class is designed to be a useful basis
for most kinds of synchronizers that rely on a **single atomic `int` value to represent state**."_

**How you use it [JDOC-25]:**

> To use this class as the basis of a synchronizer, redefine the following methods, as applicable, by
> inspecting and/or modifying the synchronization state using `getState()`, `setState(int)` and/or
> `compareAndSetState(int, int)`:
> `tryAcquire(int)`, `tryRelease(int)`, `tryAcquireShared(int)`, `tryReleaseShared(int)`, `isHeldExclusively()`
>
> Each of these methods by default throws `UnsupportedOperationException`. Implementations of these methods
> **must be internally thread-safe, and should in general be short and not block. Defining these methods is
> the only supported means of using this class. All other methods are declared final because they cannot be
> independently varied.**

And: _"Subclasses **should be defined as non-public internal helper classes** that are used to implement the
synchronization properties of their enclosing class. Class `AbstractQueuedSynchronizer` does not implement any
synchronization interface."_ **[JDOC-25]** — AQS is composed into a synchronizer, never exposed as one.

**Exclusive vs shared.** _"Threads waiting in the different modes share the same FIFO queue."_ Shared-mode
acquires cascade signals to subsequent waiters. Most subclasses implement only one mode; `ReadWriteLock` needs
both. **[JDOC-25]**

**Barging is the default and is deliberate [JDOC-25]:**

> Because checks in `acquire` are invoked before enqueuing, a newly acquiring thread may **barge** ahead of
> others that are blocked and queued. However, you can, if desired, define `tryAcquire` and/or
> `tryAcquireShared` to disable barging by internally invoking one or more of the inspection methods... In
> particular, most fair synchronizers can define `tryAcquire` to return false if `hasQueuedPredecessors()`
> ... returns true.
>
> **Throughput and scalability are generally highest for the default barging (also known as greedy,
> renouncement, and convoy-avoidance) strategy.** While this is not guaranteed to be fair or starvation-free,
> earlier queued threads are allowed to recontend before later queued threads, and each recontention has an
> unbiased chance to succeed against incoming threads.

That paragraph is the source of every "fair = slower" statement elsewhere in the package, and it names the
mechanism: convoy avoidance.

**Conditions.** `AbstractQueuedSynchronizer.ConditionObject` can serve as a `Condition` **only** for exclusive
mode where `isHeldExclusively()` is meaningful, `release(getState())` fully releases, and `acquire(savedState)`
restores. _"No `AbstractQueuedSynchronizer` method otherwise creates such a condition, so if this constraint
cannot be met, do not use it."_ **[JDOC-25]**

**`AbstractOwnableSynchronizer`.** _"You are encouraged to use them — this enables monitoring and diagnostic
tools to assist users in determining which threads hold locks."_ **[JDOC-25]** If you write a custom exclusive
synchronizer and skip `setExclusiveOwnerThread`, your lock becomes invisible to thread-dump deadlock analysis.

**`AbstractQueuedLongSynchronizer`** is the same framework with a `long` state — use it when 32 bits cannot
hold your state (as `ReentrantReadWriteLock` now does since JDK 25, §8.2).

## 9.2 What almost always beats writing one

In order of preference, and the skill should push hard down this list before allowing AQS:

1. **A `BlockingQueue`.** Most "custom synchronizer" requirements are actually a producer/consumer handoff.
2. **`Semaphore`** for counting/limiting.
3. **`CountDownLatch` / `CyclicBarrier` / `Phaser`** for coordination.
4. **`ReentrantLock` + one `Condition` per predicate.** This covers essentially every state-dependent class an
   application will ever need (JCiP Ch.14's whole point). It is more code than AQS-with-two-methods, but the
   code is _readable_ and the failure modes are known.
5. **`CompletableFuture` / `StructuredTaskScope`** for "wait for these results" → route to
   `structured-concurrency`.
6. **Atomics + a CAS loop** for lock-free counters/flags → route to `lock-free-patterns`.
7. **AQS**, only when: you need a _blocking_ synchronizer, with a _novel_ acquisition predicate, that must
   support timeouts/interruption/queue instrumentation, in a hot path where the extra allocation of a
   `ReentrantLock` + `Condition` per instance actually shows up in a profile.

**The cost of getting AQS wrong** is not a wrong answer, it is a permanently parked thread with no exception
and no log line. Requirement for review: a `jcstress` test (§12) and a documented state-word encoding.

## 9.3 AQS internals were rewritten — the contract was not

Verified by source inspection across tags **[SRC]**: `waitStatus` appears 42× at `jdk-11+28` and `jdk-13+33`,
and **0× at `jdk-14+36` and later** (JDK 15/17/21/25 all use the newer `Node`/`ConditionNode`/`ExclusiveNode`/
`SharedNode` + `status` design). So the CLH-variant queue implementation was replaced in **JDK 14**. The
public `tryAcquire`/`tryRelease`/state contract is unchanged, so nothing you wrote against it breaks — but
anything that read AQS internals (or reasoned about `waitStatus` from a blog post) is stale.
_Bug id for that rewrite: **UNVERIFIED** — I could not pin it in JBS._

Related later fixes worth knowing: `JDK-8325754 "Dead AbstractQueuedSynchronizer$ConditionNodes survive minor
garbage collections"` (fixVersion 23) **[JBS]** — a real footprint issue with long-lived `Condition`s; and
`JDK-8336384 "AbstractQueuedSynchronizer.acquire should cancel acquire when failing due to a LinkageError or
other errors"` (fixVersion 24) **[JBS]**.

---

# 10. Virtual-thread interaction — the table that matters

## 10.1 The baseline mechanism (JDK 21, JEP 444)

**[JEP-444], §java.util.concurrent, verbatim:**

> The primitive API to support locking, `java.util.concurrent.LockSupport`, now supports virtual threads:
> **Parking a virtual thread releases the underlying platform thread to do other work**, and unparking a
> virtual thread schedules it to continue. This change to `LockSupport` enables **all APIs that use it
> (`Lock`s, `Semaphore`s, blocking queues, etc.) to park gracefully when invoked in virtual threads.**

and:

> Typically, a virtual thread will unmount when it blocks on I/O or some other blocking operation in the JDK,
> **such as `BlockingQueue.take()`.**

and, pre-491:

> There are two scenarios in which a virtual thread cannot be unmounted during blocking operations because it
> is **pinned** to its carrier:
>
> - When it executes code inside a `synchronized` block or method, or
> - When it executes a native method or a foreign function.
>
> ... The scheduler does not compensate for pinning by expanding its parallelism.

and, on the JDK-level exceptions:

> some blocking operations in the JDK do not unmount the virtual thread... because of limitations at either the
> OS level (e.g., many filesystem operations) or the JDK level (e.g., `Object.wait()`). The implementations of
> these blocking operations **compensate** for the capture of the OS thread by temporarily expanding the
> parallelism of the scheduler... The maximum number of platform threads available to the scheduler can be
> tuned with the system property `jdk.virtualThreadScheduler.maxPoolSize`.

JEP 491 later gives that limit a number: _"The maximum number of platform threads available to the scheduler
is limited, with a default limit of **256** threads."_ **[JEP-491]**

## 10.2 What JEP 491 changed (JDK 24)

**[JEP-491], Description, verbatim:**

> We will change the JVM's implementation of the `synchronized` keyword so that virtual threads can acquire,
> hold, and release monitors, independently of their carriers... **Blocking to acquire a monitor will unmount
> a virtual thread and release its carrier to the JDK's scheduler.**
>
> **The `Object.wait()` method, and its timed-wait variants, will similarly unmount a virtual thread** when
> waiting and blocking to re-acquire a monitor.

**Diagnostics changed too [JEP-491]:**

- `jdk.VirtualThreadPinned` is **retained but repurposed**: _"if a virtual thread calls native code, either
  through a native method or the Foreign Function & Memory API, and that native code calls back to Java code
  that performs a blocking operation or blocks on a monitor, then the virtual thread will be pinned. We will
  therefore change the JVM to issue a `jdk.VirtualThreadPinned` event in these cases, and we will enhance the
  event itself to convey **both the reason why the virtual thread is pinned and the identity of the carrier
  thread**."_
  Confirmed in JDK 25's JFR metadata **[SRC-25 `jfr/metadata/metadata.xml` line 174]**:
  ```xml
  <Event name="VirtualThreadPinned" category="Java Application" label="Virtual Thread Pinned"
         thread="true" stackTrace="true">
    <Field type="string" name="blockingOperation" label="Blocking Operation" />
    <Field type="string" name="pinnedReason"      label="Pinned Reason" />
    <Field type="Thread" name="carrierThread"     label="Carrier Thread" />
  </Event>
  ```
- **`-Djdk.tracePinnedThreads` is REMOVED.** _"We will therefore remove this system property; setting it on
  the command line will have no effect."_ **[JEP-491]** Any runbook, Dockerfile or JAVA_OPTS that still sets
  it on JDK 24+ is silently doing nothing. **This is a high-value operational fact.**

**Residual pinning — the complete list [JEP-491, Future Work], verbatim:**

> There are a few remaining cases, unrelated to the `synchronized` keyword, in which a virtual thread cannot
> unmount when blocking:
>
> - When resolving a symbolic reference (JVMS §5.4.3) to a class or interface and the virtual thread blocks
>   while loading a class. This is a case where the virtual thread pins the carrier due to a **native frame**
>   on the stack.
> - When blocking inside a **class initializer**. This is also a case where the virtual thread pins the carrier
>   due to a native frame on the stack.
> - When waiting for a class to be **initialized by another thread** (JVMS §5.5). This is a special case where
>   the virtual thread blocks in the JVM, thus pinning the carrier.
>
> These cases should rarely cause issues but we will revisit them if they prove to be problematic.

Plus the standing one from JEP 444: **native frames** generally — JNI methods and FFM downcalls. The
`Continuation.Pinned` enum in JDK 25 lists `CRITICAL_SECTION`, `NATIVE`, `MONITOR`, `EXCEPTION`
**[SRC-25 `jdk/internal/vm/Continuation.java` lines 67–92]** (`MONITOR` remains for the JVM-internal cases).

**JEP 491's own risk note, worth quoting to teams that expect a free lunch [JEP-491]:**

> The performance of some code may be different when virtual threads are used in place of platform threads.
> When a thread exits a monitor it may have to queue a virtual thread to the scheduler. This is currently not
> as efficient as the case where exiting a monitor unparks a platform thread.

## 10.3 The primitive-by-primitive matrix

| Primitive                                                                                           | JDK 21–23 on a virtual thread                                                                                             | JDK 24, 25, 26                         | Source                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `LockSupport.park/parkNanos`                                                                        | **unmounts**                                                                                                              | unmounts                               | JEP 444                                         |
| `ReentrantLock.lock/lockInterruptibly/tryLock(t,u)`                                                 | **unmounts**                                                                                                              | unmounts                               | JEP 444 (uses LockSupport)                      |
| `Condition.await*`                                                                                  | **unmounts**                                                                                                              | unmounts                               | JEP 444                                         |
| `ReentrantReadWriteLock`, `StampedLock`                                                             | **unmounts**                                                                                                              | unmounts                               | JEP 444 (AQS/LockSupport)                       |
| `Semaphore.acquire / tryAcquire(t,u)`                                                               | **unmounts**                                                                                                              | unmounts                               | JEP 444 names `Semaphore`s explicitly           |
| `BlockingQueue.take/put/poll(t,u)`                                                                  | **unmounts**                                                                                                              | unmounts                               | JEP 444 names `BlockingQueue.take()` explicitly |
| `CountDownLatch.await`, `CyclicBarrier.await`, `Phaser.awaitAdvance`, `Exchanger.exchange`          | **unmounts** (all AQS/LockSupport)                                                                                        | unmounts                               | JEP 444 ("all APIs that use it")                |
| **`synchronized` — entering an uncontended monitor**                                                | no block, no pin issue                                                                                                    | same                                   | —                                               |
| **`synchronized` — blocking to _acquire_ a contended monitor**                                      | ❌ **PINS**                                                                                                               | ✅ unmounts                            | JEP 444 → JEP 491                               |
| **Blocking (I/O, `take()`, lock) _inside_ a `synchronized` block**                                  | ❌ **PINS**                                                                                                               | ✅ unmounts                            | JEP 444 → JEP 491                               |
| **`Object.wait()` / `wait(ms)`**                                                                    | ❌ **PINS** (JVM-level block; scheduler compensates with a spare carrier)                                                 | ✅ unmounts                            | JEP 444 → JEP 491                               |
| **`ConcurrentHashMap.compute*/merge` with a blocking function**                                     | ❌ **PINS** (bin `synchronized`)                                                                                          | ✅ unmounts (still serialises the bin) | SRC-25 + JEP 491                                |
| **JNI method / FFM downcall that blocks or calls back into blocking Java**                          | ❌ PINS                                                                                                                   | ❌ **still PINS**                      | JEP 444, JEP 491                                |
| **Blocking during class loading / in a class initializer / waiting on another thread's `<clinit>`** | ❌ PINS                                                                                                                   | ❌ **still PINS**                      | JEP 491 Future Work                             |
| **Most file-system I/O**                                                                            | does not unmount; scheduler _compensates_ by adding a carrier (cap `jdk.virtualThreadScheduler.maxPoolSize`, default 256) | same                                   | JEP 444                                         |

**The distinction "pins" vs "does not unmount but compensates" is important and almost always conflated.**
Filesystem I/O in the compensating category consumes a carrier but the scheduler grows the pool; true pinning
gets **no compensation** (JEP 444: _"The scheduler does not compensate for pinning by expanding its
parallelism"_).

## 10.4 Bounded queue + fixed pool when the consumer is virtual threads

**What JEP 444 actually says [JEP-444, "Do not pool virtual threads"], verbatim:**

> A thread pool, like any resource pool, is intended to share expensive resources, but virtual threads are not
> expensive so there is never a need to pool them.
>
> Developers sometimes use thread pools to limit concurrent access to limited resources. For example, if a
> service cannot handle more than 20 concurrent requests then making all requests to the service via tasks
> submitted to a thread pool of size 20 will ensure that. This idiom has become ubiquitous because the high
> cost of platform threads has made thread pools ubiquitous, but **do not be tempted to pool virtual threads
> in order to limit concurrency. Instead use constructs specifically designed for that purpose, such as
> semaphores.**

**So: separate the two jobs the "bounded queue + fixed pool" idiom used to do at once.**

| Job the old idiom did                         | Virtual-thread replacement                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Limit concurrency against a scarce downstream | `Semaphore` at the call site (or a bulkhead library)                                            |
| Provide backpressure to the producer          | a **bounded** `BlockingQueue` with `offer(timeout)`, or the semaphore's `tryAcquire(timeout)`   |
| Amortise thread creation cost                 | not needed — virtual threads are cheap                                                          |
| Batch work for efficiency                     | still a queue: `take()` + `drainTo(batch, N)`                                                   |
| Smooth bursty arrivals                        | still a queue                                                                                   |
| Reuse thread-locals / per-thread resources    | **anti-pattern** with virtual threads (JEP 444 warns explicitly); route to `java-scoped-values` |

**Practical answer for the skill:** the _queue_ keeps making sense; the _fixed pool_ usually does not.
Keep the bounded queue when you need batching, smoothing, or durable-ish buffering. Drop the fixed pool in
favour of `newVirtualThreadPerTaskExecutor()` plus a `Semaphore` sized to the real downstream limit. The one
case where a fixed _platform_-thread pool still wins: **CPU-bound** work, where the limit you want is core
count and the queue is what stops you over-subscribing. Route sizing arithmetic to
`thread-sizing-and-virtual-threads` and `littles-law-and-queueing`.

---

# 11. _Java Concurrency in Practice_ cross-check (Ch. 5, 11, 13, 14, 15)

The book targets Java 5/6. Verdict per recommendation.

| #   | JCiP recommendation                                                                                                                                               | Verdict                                                                                      | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ch.5** Prefer concurrent collections over `synchronized` wrappers when multiple threads share a collection                                                      | **STILL CURRENT**                                                                            | Restated almost word-for-word in the JDK 25 `java.util.concurrent` package summary **[JDOC-25]**                                                                                                                                                                                                                                                                                                                                                    |
| 2   | **Ch.5** Compound actions on a synchronized collection need external locking; iteration needs external locking                                                    | **STILL CURRENT**                                                                            | `Collections.synchronizedMap` javadoc still carries the `synchronized (m) { iterator }` sample and _"Failure to follow this advice may result in non-deterministic behavior"_ **[JDOC-25]**                                                                                                                                                                                                                                                         |
| 3   | **Ch.5 / Ch.11.4.3** `ConcurrentHashMap` uses **lock striping** across 16 `Segment`s; `size()` and `isEmpty()` are weakened as a consequence                      | **SUPERSEDED by the JDK 8 CHM rewrite**                                                      | `Segment` survives only as a serialization stub **[SRC-25 line 1390]**; locking is per-bin `synchronized`/CAS; counting is a striped `CounterCell[]`. `concurrencyLevel` is now _"an additional hint for internal sizing"_ **[JDOC-25]**. The _conclusion_ (`size()`/`isEmpty()` are approximations) survives; the _mechanism_ is wrong, and tuning `concurrencyLevel` is now a no-op-ish                                                           |
| 4   | **Ch.5** `Memoizer` — `ConcurrentHashMap<K, Future<V>>` + `putIfAbsent` + `FutureTask`                                                                            | **STILL CURRENT, with a nuance**                                                             | `computeIfAbsent` (Java 8) is simpler and atomic, but it runs the loader **while holding the bin monitor** **[SRC-25]** and _"the computation should be short and simple"_ **[JDOC-25]**. For an _expensive_ loader the `Future` idiom is still the better design because it does not hold any lock during the computation. Verdict: `computeIfAbsent` for cheap in-memory derivations; JCiP's `Memoizer` (or Caffeine) for anything that can block |
| 5   | **Ch.5** Bounded blocking queues give you backpressure; unbounded queues do not                                                                                   | **STILL CURRENT — arguably more important now**                                              | Nothing in the API has changed. Unbounded is still the default in `LinkedBlockingQueue()`, `Executors.newFixedThreadPool`, `PriorityBlockingQueue`, `DelayQueue`, `LinkedTransferQueue`                                                                                                                                                                                                                                                             |
| 6   | **Ch.5/8** Thread-pool sizing: `N_threads = N_cpu × U_cpu × (1 + W/C)`                                                                                            | **STILL CURRENT for CPU-bound / platform threads; SUPERSEDED by JEP 444 for I/O-bound work** | For I/O-bound thread-per-request work the answer is now "one virtual thread per task, and a `Semaphore` for the real bottleneck" **[JEP-444]**. The formula's _reasoning_ (Little's Law) is untouched → route to `littles-law-and-queueing`, `thread-sizing-and-virtual-threads`                                                                                                                                                                    |
| 7   | **Ch.8** Work stealing via a per-worker `Deque` (owner LIFO, thief FIFO)                                                                                          | **STILL CURRENT as a concept; SUPERSEDED as an implementation**                              | `ForkJoinPool` does this properly. `LinkedBlockingDeque` uses a single lock **[SRC-25]** so hand-rolling it gets you the ordering but not the contention benefit                                                                                                                                                                                                                                                                                    |
| 8   | **Ch.13** Choose `ReentrantLock` for timed/polled/interruptible acquisition, fair queueing, non-block-structured locking; otherwise prefer `synchronized` (§13.4) | **STILL CURRENT — and explicitly re-endorsed by OpenJDK in 2024**                            | JEP 491: _"we agree with the recommendation in Java Concurrency in Practice §13.4: Use `synchronized` where practical, since it is more convenient and less error prone, and use `ReentrantLock` ... when more flexibility is required."_ **[JEP-491]**                                                                                                                                                                                             |
| 9   | **Ch.13** The `ReentrantLock`-vs-`synchronized` **throughput numbers** (Java 5 much better for RL; Java 6 close)                                                  | **SUPERSEDED — do not cite the numbers**                                                     | Java 6 closed most of the gap (the book says so); biased locking, which made uncontended `synchronized` cheapest, was disabled by default in **JDK 15** (JEP 374) and removed in **JDK 18** (`JDK-8256425`). Uncontended `synchronized` now costs a CAS. Any 2006 microbenchmark is meaningless on JDK 25                                                                                                                                           |
| 10  | **Ch.13** Fair locks have substantially lower throughput                                                                                                          | **STILL CURRENT**                                                                            | `ReentrantLock` javadoc: _"lower overall throughput (i.e., are slower; often much slower)"_ **[JDOC-25]**; AQS javadoc explains why (convoy avoidance) **[JDOC-25]**                                                                                                                                                                                                                                                                                |
| 11  | **Ch.13** Read-write locks pay off when locks are held a moderately long time and reads dominate                                                                  | **STILL CURRENT as stated, but the "moderately long" qualifier is routinely dropped**        | Nothing in the JDK contradicts it. Field practice increasingly finds short-read RRWL loses to a plain lock — see §14 disagreement #2                                                                                                                                                                                                                                                                                                                |
| 12  | **Ch.13** `ReentrantReadWriteLock` cannot upgrade; downgrade is legal                                                                                             | **STILL CURRENT**                                                                            | Verbatim in the JDK 25 javadoc **[JDOC-25]**                                                                                                                                                                                                                                                                                                                                                                                                        |
| 13  | **Ch.14** Always wait in a `while` loop testing the state predicate                                                                                               | **STILL CURRENT**                                                                            | `Condition` and `Object.wait` javadocs both mandate it **[JDOC-25]**                                                                                                                                                                                                                                                                                                                                                                                |
| 14  | **Ch.14** Prefer `notifyAll`/`signalAll` unless the "uniform waiters + one-in/one-out" conditions hold                                                            | **STILL CURRENT**                                                                            | Unchanged semantics                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | **Ch.14** Multiple `Condition`s on one `Lock` is the right way to express a bounded buffer                                                                        | **STILL CURRENT**                                                                            | The javadoc's own sample is exactly this **[JDOC-25]** — with the postscript "use `ArrayBlockingQueue` instead"                                                                                                                                                                                                                                                                                                                                     |
| 16  | **Ch.14** AQS is the basis of the j.u.c synchronizers; the `tryAcquire`/`tryRelease` + state-word contract                                                        | **STILL CURRENT (contract); internals SUPERSEDED**                                           | Public contract unchanged **[JDOC-25]**; the CLH queue implementation was replaced in **JDK 14** (`waitStatus` gone) **[SRC]**                                                                                                                                                                                                                                                                                                                      |
| 17  | **Ch.14** Document a class's thread-safety policy                                                                                                                 | **STILL CURRENT**                                                                            | → route to `java-thread-safety-contracts`                                                                                                                                                                                                                                                                                                                                                                                                           |
| 18  | **Ch.15** CAS, atomics, nonblocking algorithms                                                                                                                    | **STILL CURRENT, but the tooling moved**                                                     | `VarHandle` (Java 9) supersedes `*FieldUpdater` — `JDK-8333172 "Document a recommendation to use VarHandles instead of java.util.concurrent.atomic.*FieldUpdater"`, fixVersion 26 **[JBS]**. Also `LongAdder`/`LongAccumulator` (Java 8) beat `AtomicLong` under write contention. → route to `lock-free-patterns` and `varhandles-and-memory-ordering`                                                                                             |
| 19  | **Ch.15** Atomics for hot counters                                                                                                                                | **PARTIALLY SUPERSEDED by `LongAdder` (Java 8)**                                             | The CHM javadoc itself recommends `CHM<K, LongAdder>` for a scalable frequency map **[JDOC-25]**                                                                                                                                                                                                                                                                                                                                                    |

---

# 12. Failure modes & anti-patterns — with the symptom actually observed

| #   | Anti-pattern                                                                                     | Symptom an engineer observes                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `if (!chm.containsKey(k)) chm.put(k, v)`                                                         | Duplicate initialisation; two `Connection`s / two schedulers / a doubled counter. Non-deterministic, load-dependent, invisible in tests                                                                                                            |
| 2   | `chm.computeIfAbsent(k, x -> chm.computeIfAbsent(...))` (same bin)                               | `IllegalStateException: Recursive update` **[SRC-25]** — at least it fails loudly                                                                                                                                                                  |
| 3   | Same, but recursing into a **different bin / another CHM** that recurses back                    | **No exception.** Either a silently non-atomic result, or a two-thread deadlock on bin-head monitors. Thread dump: two threads in `ConcurrentHashMap.computeIfAbsent`, each `- waiting to lock` a `ConcurrentHashMap$Node`                         |
| 4   | I/O inside `computeIfAbsent` (cache loader hitting a DB)                                         | JDK ≤23 virtual threads: carrier pinned, throughput collapses to `maxPoolSize`, `jdk.VirtualThreadPinned` events. JDK 24+: no pinning, but all writers to that bin serialise behind the slowest loader — p99 latency cliff under cache-miss storms |
| 5   | `if (map.size() < LIMIT) map.put(...)` as an admission control                                   | The limit is exceeded, occasionally, by an unbounded amount. Nothing logs it                                                                                                                                                                       |
| 6   | `clq.size()` / `ltq.size()` as a Prometheus gauge                                                | Metrics scrape thread burns CPU proportional to queue depth; flame graph shows `ConcurrentLinkedQueue.size`. Under load, scrape latency grows with the very backlog you were trying to measure                                                     |
| 7   | `new LinkedBlockingQueue<>()` / `Executors.newFixedThreadPool(n)`                                | Latency climbs with flat CPU → old-gen ratchets up → `OutOfMemoryError: Java heap space`, heap dump dominated by queue nodes. Work in flight lost silently                                                                                         |
| 8   | `queue.add(task)` in a producer loop on a bounded queue                                          | `IllegalStateException: Queue full` surfacing as a 500 with a stack trace nobody expected, instead of a designed 503                                                                                                                               |
| 9   | `queue.offer(task)` with the boolean ignored                                                     | **Silent data loss.** No exception, no log, no metric. The single worst failure mode in this brief                                                                                                                                                 |
| 10  | `LinkedTransferQueue.poll() == null` treated as "empty" on JDK 21–25                             | Consumer idles/exits with items still queued; "drained" assertions fail under load only. `JDK-8371740`, fixed only in 26 **[JBS]**                                                                                                                 |
| 11  | `DelayQueue.size()` as "work due now"                                                            | Alerting on a backlog that is mostly scheduled for the future; or the reverse — a real backlog masked by expiry times                                                                                                                              |
| 12  | Missing `latch.countDown()` in a `finally`                                                       | One thread parked forever in `CountDownLatch.await`; job never completes; no error in logs. Restart "fixes" it                                                                                                                                     |
| 13  | `new CyclicBarrier(N)` with N-1 live parties                                                     | All workers parked in `CyclicBarrier.dowait`, zero CPU, no error                                                                                                                                                                                   |
| 14  | `BrokenBarrierException` retried without `reset()` / a new barrier                               | Every subsequent phase fails instantly; the loop spins hot                                                                                                                                                                                         |
| 15  | `semaphore.acquire()` without `release()` in `finally`                                           | Throughput decays monotonically over hours/days, never recovers without restart. `availablePermits()` → 0; threads parked in `Semaphore$NonfairSync`                                                                                               |
| 16  | Double `release()` on an error path                                                              | The configured limit is silently _higher_ than configured. 12 concurrent calls against a limit of 8, and nothing anywhere reports it                                                                                                               |
| 17  | `if (!predicate) cond.await();` instead of `while`                                               | Rare data corruption: negative counts, `ArrayIndexOutOfBoundsException` in a buffer, a consumed-twice item. Only under load                                                                                                                        |
| 18  | `cond.signal()` where waiters wait on different predicates                                       | **Lost wakeup.** One thread parked forever while the system otherwise runs normally. Hardest bug in this table to diagnose                                                                                                                         |
| 19  | `awaitNanos`/`await(t,u)` re-passed the _original_ timeout inside the retry loop                 | A "5-second timeout" that occasionally takes minutes and never reports a timeout                                                                                                                                                                   |
| 20  | `lock.lock()` with a statement (e.g. a log line) between it and `try`                            | Permanently held lock if that statement throws. Exactly the case `JDK-8278255` was filed about **[JBS]**                                                                                                                                           |
| 21  | Read-lock → write-lock upgrade on `ReentrantReadWriteLock`                                       | Thread deadlocked against itself, forever. `ThreadMXBean.findDeadlockedThreads()` reports **nothing**                                                                                                                                              |
| 22  | Long or blocking read critical sections on a non-fair RRWL                                       | Writer starvation: writes land in bursts after long stalls; write latency p99 is orders of magnitude above p50                                                                                                                                     |
| 23  | `StampedLock` in code that can re-enter (callbacks, listeners, `toString()` of a guarded object) | Self-deadlock with **no** deadlock report — `StampedLock` has no ownership **[JDOC-25]**                                                                                                                                                           |
| 24  | Optimistic read section that dereferences an object read before `validate()`                     | `NullPointerException`, `ArrayIndexOutOfBoundsException`, or infinite loop on a torn linked structure — _"Fields read while in optimistic read mode may be wildly inconsistent"_ **[JDOC-25]**                                                     |
| 25  | `-Djdk.tracePinnedThreads=full` still in JAVA_OPTS on JDK 24+                                    | Silently no output. Team concludes "we have no pinning" **[JEP-491]**                                                                                                                                                                              |
| 26  | Migrating `synchronized` → `ReentrantLock` purely for pinning on JDK 24+                         | Wasted change, new try/finally bugs, and locks no longer auto-released on abrupt unwind. JEP 491 explicitly says migration _"will no longer be necessary"_ **[JEP-491]**                                                                           |
| 27  | Pooling virtual threads to limit concurrency                                                     | The pool re-imposes the ceiling virtual threads removed. JEP 444: _"do not be tempted"_ **[JEP-444]**                                                                                                                                              |
| 28  | `CopyOnWriteArrayList` for request-rate data                                                     | GC pressure and CPU proportional to `writeRate × size`; allocation profile dominated by `Object[]` copies                                                                                                                                          |
| 29  | `CopyOnWriteArraySet` with thousands of elements + hot `contains`                                | O(n) scan per lookup; a CPU hotspot in a class chosen "for thread safety"                                                                                                                                                                          |
| 30  | Registering a listener during dispatch over a COW list                                           | Listener silently missed for the current event (snapshot iterator)                                                                                                                                                                                 |
| 31  | `synchronized (condition) { condition.wait(); }`                                                 | Compiles, runs, deadlocks or loses signals. Explicitly warned against **[JDOC-25 Condition]**                                                                                                                                                      |
| 32  | Custom AQS subclass without `setExclusiveOwnerThread`                                            | Lock invisible to `jstack` deadlock detection; incident triage stalls **[JDOC-25 AQS]**                                                                                                                                                            |
| 33  | `Phaser` with >65535 parties (easy with virtual threads)                                         | `IllegalStateException` at registration. Fix is tiering **[JDOC-25]**                                                                                                                                                                              |
| 34  | Ignoring `arriveAndAwaitAdvance()`'s negative return (phaser terminated)                         | Loop treats "terminated" as "advanced"; silent early exit                                                                                                                                                                                          |
| 35  | Assuming `PriorityBlockingQueue` iteration/`toArray`/`forEach` is in priority order              | Log/export ordering wrong; a "top-N" report that is not top-N **[JDOC-25]**                                                                                                                                                                        |
| 36  | `drainTo(unboundedList)` on a deep queue                                                         | A batch of unbounded size materialised in memory; latency spike then OOM                                                                                                                                                                           |

---

# 13. Version matrix

| JDK          | In-scope change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Evidence                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **8**        | CHM rewritten: `Segment` striping → per-bin CAS + `synchronized(bin)`, striped `CounterCell[]` counters, `mappingCount()`, `newKeySet()`/`keySet(V)`, `compute*`/`merge`, bulk `forEach`/`search`/`reduce` with `parallelismThreshold`. `StampedLock`, `LongAdder`, `CompletableFuture` added. `ConcurrentSkipListMap.size()` still O(n) traversal. Early 8: recursive `computeIfAbsent` **spins forever**                                                                                                             | [SRC-25], [JDOC-25], [SRC jdk8u], [JBS-8062841]                                  |
| **9**        | CHM gains `IllegalStateException("Recursive update")` detection (later backported to 8u). `HashMap.computeIfAbsent` recursion → `CME`. `VarHandle` (route away)                                                                                                                                                                                                                                                                                                                                                        | [JBS-8062841] fixVersion 9, [JBS-8071667] fixVersion 9                           |
| **10**       | **`ConcurrentSkipListMap` gains a `LongAdder` counter → `size()` stops being O(n)**                                                                                                                                                                                                                                                                                                                                                                                                                                    | `LongAdder adder` absent at `jdk-9+181`, present at `jdk-10+46` [SRC]            |
| **11**       | No in-scope semantic change found. AQS still `waitStatus`-based                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [SRC]                                                                            |
| **14**       | **AQS internals rewritten** (`waitStatus`/CLH node design → `ConditionNode`/`ExclusiveNode`/`SharedNode` + `status`). Public contract unchanged                                                                                                                                                                                                                                                                                                                                                                        | 42 `waitStatus` hits at `jdk-13+33`, 0 at `jdk-14+36` [SRC]. _Bug id UNVERIFIED_ |
| **15**       | **JEP 374: biased locking disabled by default and all its flags deprecated** — uncontended `synchronized` now costs a CAS                                                                                                                                                                                                                                                                                                                                                                                              | [JEP-374]                                                                        |
| **17**       | No in-scope change found beyond inherited 14/15                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [SRC], [JBS]                                                                     |
| **18**       | **Biased locking obsoleted/removed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `JDK-8256425 "Obsolete Biased Locking in JDK 18"`, fixVersion 18 [JBS]           |
| **21 (LTS)** | **JEP 444 virtual threads final.** `LockSupport` parks virtual threads → all j.u.c locks, semaphores, latches, barriers, blocking queues unmount. `synchronized`, native frames, and `Object.wait()` **pin**. `jdk.VirtualThreadPinned` JFR event (20 ms threshold); `-Djdk.tracePinnedThreads` available. `DelayQueue` javadoc rewritten with "expired head" wording (`JDK-8297605`). `SequencedCollection` (JEP 431) reaches `CopyOnWriteArrayList`, `LinkedBlockingDeque`                                           | [JEP-444], [JBS-8297605], [JDOC-25]                                              |
| **22**       | `JDK-8301341` LTQ now respects `poll()` timeout. `JDK-8267502` fixes a 16× `SynchronousQueue` perf regression. (HotSpot lightweight locking default — _UNVERIFIED here_, route to `lock-inflation`)                                                                                                                                                                                                                                                                                                                    | [JBS]                                                                            |
| **23**       | `JDK-8278255` adds the "lock() as the last statement before try / unlock() as the first statement in finally" wording to `ReentrantLock` and `RRWL`. `JDK-8322149` CHM smarter presizing for copy-constructor/`putAll`. `JDK-8325754` dead `ConditionNode`s surviving minor GCs. `JDK-8332154` `SynchronousQueue` memory leak                                                                                                                                                                                          | [JBS]                                                                            |
| **24**       | **JEP 491: `synchronized` and `Object.wait()` no longer pin virtual threads.** `-Djdk.tracePinnedThreads` **removed** (no effect). `jdk.VirtualThreadPinned` repurposed with `blockingOperation` / `pinnedReason` / `carrierThread`. `JDK-8336462` removes the bogus O(n)-`size()` warning from `ConcurrentSkipListSet` javadoc. `JDK-8345052` "Harden StampedLock". `JDK-8338146` Exchanger perf with virtual threads. `JDK-8343250` ABQ serialization not thread-safe. JEP 450 compact object headers (experimental) | [JEP-491], [JBS], [SRC-25 metadata.xml]                                          |
| **25 (LTS)** | **`ReentrantReadWriteLock` max hold counts raised from 65535 → `Integer.MAX_VALUE`**; `Sync` now extends `AbstractQueuedLongSynchronizer` (`JDK-8352971`, `JDK-8354016`). `JDK-8354111` LinkedBlockingDeque `Iterator.remove()` linear-time doc. JEP 519 compact object headers → product (opt-in, not default). JEP 505 structured concurrency 5th preview (route away). **`LinkedTransferQueue.poll()` spurious-null bug is PRESENT** (`JDK-8371740` affects 21–25)                                                  | [SRC-25], [JBS], [JEP-519]                                                       |
| **26**       | `JDK-8371740` **LTQ `poll()` spurious null FIXED** (verified in mainline source). `JDK-8372256` `ClassCastException` in `ConcurrentHashMap#equals`. `JDK-6374942` thread safety of collection `.equals()`. `JDK-8355726` LinkedBlockingDeque fixes. `JDK-8311131` CHM `forEachKey` parallelismThreshold doc. `JDK-8333172` doc: prefer VarHandles over `*FieldUpdater`. JEP 525 structured concurrency 6th preview (route away). **Caveat below**                                                                      | [JBS], [SRC-master]                                                              |
| **27**       | **JEP 534: Compact Object Headers by Default** (96→64-bit headers; touches the lock/monitor word — route detail to `lock-inflation`). No other in-scope j.u.c change verified                                                                                                                                                                                                                                                                                                                                          | [JEP-534]                                                                        |

### JDK 26 caveat — do not promise new APIs

JBS lists four ancient RFEs as **Resolution=Fixed, fixVersion=26**:
`JDK-6317534 "CyclicBarrier should have a cancel() method"`, `JDK-6351533 "CyclicBarrier reset() should
return the number of awaiters"`, `JDK-6714849 "ReentrantReadWriteLock: Abnormal behavior in non-fair mode"`,
`JDK-6625724 "Allow ReentrantReadWriteLock to not track per-thread read holds"` **[JBS]**.

**But mainline source, read 2026-08-27, shows no corresponding change [SRC-master]:**

- `CyclicBarrier` has **no** `cancel()`; `reset()` still returns `void`.
- `ReentrantReadWriteLock` still has exactly two constructors (no "don't track read holds" option) and
  `NonfairSync.readerShouldBlock()` still returns `apparentlyFirstQueuedIsExclusive()`.

Most likely these were closed by a documentation change (e.g. `JDK-8359919 "Minor java.util.concurrent doc
improvements"` or `JDK-8195628`, both fixVersion 26). **Marked UNVERIFIED — the skill must not claim a JDK 26
`CyclicBarrier.cancel()` or a non-tracking `ReentrantReadWriteLock` constructor.**

---

# 14. Open disagreements — stated as disagreements

**1. Should a `Semaphore` default to fair, or should a lock?** The JDK's own javadocs disagree with each
other inside one package. `Semaphore` **[JDOC-25]**: _"Generally, semaphores used to control resource access
should be initialized as fair, to ensure that no thread is starved out."_ `ReentrantLock` **[JDOC-25]**: fair
locks _"may display lower overall throughput (i.e., are slower; often much slower)."_ AQS **[JDOC-25]**:
_"Throughput and scalability are generally highest for the default barging... strategy."_ Not actually a
contradiction (a semaphore guards a _resource_ held for a long time; a lock guards a _critical section_), but
teams read one page and apply it to the other. **Unresolved in practice; the skill should teach the
distinction rather than a default.**

**2. Is `ReentrantReadWriteLock` worth it at all?** Doug Lea's javadoc frames it as a scalability win when
reads dominate. A large body of practitioner experience holds that for short read sections the reader-side
CAS on one shared state word makes RRWL _slower_ than a plain `ReentrantLock`, because the readers now
contend on a cache line they previously never touched. **No primary source settles this**, and there is no
published crossover threshold. Positions in the field: (a) always measure against a plain mutex first;
(b) skip locks entirely — a `volatile` reference to an immutable snapshot; (c) use `StampedLock`'s optimistic
read. The skill should present it as "measure", not pick a winner.

**3. Post-JEP 491, should new code go back to `synchronized`?** JEP 491 endorses JCiP §13.4 ("use
`synchronized` where practical") and says _"You need not revert code that has been migrated to use
`ReentrantLock`"_ **[JEP-491]**. But many teams standardised on `ReentrantLock` across a whole codebase during
JDK 21–23 and now argue that a _uniform_ style is worth more than the marginal ergonomics of `synchronized`.
Counter-argument: `synchronized` is released automatically on abrupt unwind and is visible to
`jdk.JavaMonitorEnter` / `jstack` deadlock detection in ways `ReentrantLock` is not.
**Genuinely unsettled; both positions defensible.**

**4. Is `computeIfAbsent` an acceptable cache-loading primitive?** Camp A: yes for anything short, it is
atomic and reads well. Camp B: never — it holds a bin monitor across arbitrary user code, it is a reentrancy
landmine whose detection is only bin-local, and a real cache needs eviction/refresh/stats anyway (Caffeine).
The javadoc's _"the computation should be short and simple"_ **[JDOC-25]** supports B for expensive loaders
and A for cheap ones, but "short" is undefined. **Unresolved.**

**5. `StampedLock`: sharp tool or trap?** The javadoc presents optimistic reads as a real win. Kabutz
**[BLOG]** demonstrates writer starvation and non-reentrancy breakage. `JDK-8345052 "Harden StampedLock"`
(JDK 24) suggests ongoing robustness concerns **[JBS]**. Positions range from "the only thing that scales for
hot read-mostly structures" to "never appropriate in application code, only inside libraries."
**Unresolved; my read of the evidence leans strongly toward the second for application code.**

**6. Does a queue still belong in a virtual-thread architecture?** JEP 444 removes the _pooling_ motivation
but says nothing about queues. Camp A: drop the queue; a virtual thread per request plus a semaphore expresses
everything, and the queue is just latency you cannot see. Camp B: the queue is where batching, smoothing,
prioritisation and shed-load policy live, and none of that has a virtual-thread substitute.
**Unresolved.** (Related: whether backpressure should live in a queue at all → route to
`reactive-backpressure`.)

**7. Should `size()` on a concurrent collection ever be exported as a metric?** Camp A: it is a useful gauge;
sampling error is irrelevant at scrape resolution. Camp B: it is either O(n) (CLQ, LTQ) or an estimate that
can read _negative_ transiently (CHM `sumCount()` **[SRC-25]**), and exporting it invites people to alert on
it. **Unresolved; the O(n) cases are not, though — those are simply a bug.**

**8. Is `Phaser` ever worth its complexity?** Its own javadoc is 200 lines. Camp A: dynamic parties and
`onAdvance` termination genuinely have no substitute. Camp B: every real use is either a `CountDownLatch`, a
`CyclicBarrier`, or `StructuredTaskScope`, and `Phaser`'s negative-return-means-terminated convention causes
more bugs than it prevents. **Unresolved.**

---

# 15. Candidate verification techniques (6–10)

**V1 — jcstress: compound-action atomicity.** `@JCStressTest` with two `@Actor`s racing
`containsKey`+`put` against `putIfAbsent` on the same key, an `@Arbiter` reading the final value, and
`@Outcome`s marking the interleaved result `FORBIDDEN`. Run the same shape twice: once with the compound
action (shows the bad outcome), once with `putIfAbsent` (shows only good outcomes). This is the _teaching_
harness — it makes "not atomic" reproducible on demand rather than theoretical. jcstress annotations:
`@JCStressTest`, `@State`, `@Actor`, `@Arbiter`, `@Outcome`; `-m quick` for CI **[openjdk/jcstress README]**.
Caveat from the project itself: _"most tests are probabilistic"_ and need substantial runtime.

**V2 — jcstress: `Mode.Termination` for lost-wakeup and permit-leak bugs.** A termination-mode test starts an
actor that blocks (`cond.await()` inside an `if`, or `semaphore.acquire()`), and a signaller that should
release it. A `STALE` outcome means the wakeup was lost. This is the only mechanical way I know to catch
category-18 (`signal` vs `signalAll`) bugs, because they never throw.

**V3 — Invariant assertion on the synchronizer itself, permanently on in staging.** Cheap, no harness:

- `assert semaphore.availablePermits() <= CONFIGURED_PERMITS` — catches over-release (anti-pattern 16),
  which is otherwise _completely_ silent.
- Export `availablePermits()` as a gauge and alert on a **monotonic decline** rather than on a threshold —
  catches the permit leak (15) days before it becomes an outage.
- `assert !rwLock.isWriteLockedByCurrentThread()` at the top of a read path; `assert lock.getHoldCount() <= 1`
  to catch accidental recursion into a non-reentrant design.
- `assert queue.remainingCapacity() != Integer.MAX_VALUE` in a factory that requires bounded queues — a
  one-line guard that makes anti-pattern 7 impossible to introduce.

**V4 — A "no unbounded queue" architecture test.** ArchUnit / a `-parameters` reflection sweep over
constructors: fail the build on `new LinkedBlockingQueue<>()` (no-arg), `Executors.newFixedThreadPool`,
`Executors.newSingleThreadExecutor`, and on `ThreadPoolExecutor` constructed with a queue whose
`remainingCapacity()` is `Integer.MAX_VALUE`. This is the highest-ROI check in this list because anti-pattern
7 is the most expensive one.

**V5 — JFR: contention triage.** Record with `-XX:StartFlightRecording=settings=profile` and read:

| Event                           | Default enabled | `default.jfc` threshold | `profile.jfc` threshold | Tells you                                                                                               |
| ------------------------------- | --------------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `jdk.JavaMonitorEnter`          | true            | **20 ms**               | **10 ms**               | blocked entering a `synchronized` monitor; has `monitorClass`, `previousOwner`, stack trace             |
| `jdk.JavaMonitorWait`           | true            | 20 ms                   | 10 ms                   | `Object.wait`; has `notifier`, `timedOut`                                                               |
| `jdk.ThreadPark`                | true            | **20 ms**               | **10 ms**               | `LockSupport.park` → **every `ReentrantLock`/`Semaphore`/`BlockingQueue`/AQS block**; has `parkedClass` |
| `jdk.VirtualThreadPinned`       | true            | **20 ms**               | 20 ms                   | pinned park; JDK 24+ carries `blockingOperation`, `pinnedReason`, `carrierThread`                       |
| `jdk.JavaMonitorInflate`        | **false**       | 0 ms                    | —                       | monitor inflation; enable explicitly → route to `lock-inflation`                                        |
| `jdk.VirtualThreadSubmitFailed` | true            | —                       | —                       | scheduler could not accept a virtual thread — resource exhaustion                                       |

All thresholds verified from `src/jdk.jfr/share/conf/jfr/default.jfc` and `profile.jfc` at `jdk-25+36`
**[SRC-25]**. **The 20 ms default threshold is the trap:** a lock contended 50 000 times for 1 ms each
produces **zero** events. Lower it explicitly (`jfr configure` / a custom `.jfc`) before concluding "no
contention".

**Key mapping to remember:** `synchronized` shows up as `jdk.JavaMonitorEnter`; `ReentrantLock` shows up as
`jdk.ThreadPark` with `parkedClass = ReentrantLock$NonfairSync`. Teams that migrated to `ReentrantLock` and
then looked only at monitor events conclude their contention "disappeared".

**V6 — Pinning audit on JDK 24/25.** `jdk.VirtualThreadPinned` is enabled by default at a 20 ms threshold
**[SRC-25]**. On JDK 24+ any occurrence now means a _native frame_ or a class-init block — a much narrower and
more actionable signal than pre-24. Two operational notes: (a) **`-Djdk.tracePinnedThreads` is dead on JDK
24+** — remove it and use JFR; (b) correlate `carrierThread` across events — repeated pinning of the same
carrier is the shape that starves the scheduler.

**V7 — Thread dump forensics, per primitive.** Build a lookup table into the runbook, because the frame name
is what an on-call engineer actually has:

| Frame you see                                                                      | Means                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `- waiting to lock <0x...> (a Foo)`                                                | blocked on a monitor; the dump names the owner → real deadlock detection works              |
| `LockSupport.park` + `ReentrantLock$NonfairSync`                                   | contended `ReentrantLock`; `jstack` **does** report AQS-based deadlocks                     |
| `CountDownLatch$Sync` / `AbstractQueuedSynchronizer.acquireSharedInterruptibly`    | latch never counted down                                                                    |
| `CyclicBarrier.dowait` on all workers                                              | party-count mismatch                                                                        |
| `Semaphore$NonfairSync` piling up over time                                        | permit leak                                                                                 |
| `ConcurrentHashMap.computeIfAbsent` + `waiting to lock ... ConcurrentHashMap$Node` | recursive/cross-bin CHM deadlock                                                            |
| `StampedLock` frames                                                               | **no deadlock report will ever be produced** — `StampedLock` has no ownership **[JDOC-25]** |
| `ReentrantReadWriteLock$Sync` in a thread that also holds a read lock              | attempted upgrade → self-deadlock; `findDeadlockedThreads()` reports nothing                |

For virtual threads use `jcmd <pid> Thread.dump_to_file -format=json <file>` — the traditional dump
deliberately excludes them, and _"does not include object addresses, locks, JNI statistics"_ **[JEP-444]**.
Also: `ThreadMXBean.findDeadlockedThreads()` _"finds cycles of platform threads that are in deadlock; it does
not find cycles of virtual threads that are in deadlock"_ **[JEP-444]** — a live-incident fact worth routing
to `concurrency-diagnostics`.

**V8 — Metrics worth watching (and the shape, not the level).**

- Bounded queue **depth as a fraction of capacity**, plus a counter of `offer` **rejections/timeouts**.
  Rejections are the backpressure signal; depth alone is not.
- **Enqueue-to-dequeue latency** (timestamp the item), not queue depth — this is the number Little's Law
  actually relates to.
- `Semaphore.availablePermits()` — alert on _trend_, not threshold (V3).
- `ReentrantLock.getQueueLength()` / `hasQueuedThreads()` — the javadocs state these are _"designed for
  monitoring system state, not for synchronization control"_ **[JDOC-25 RRWL]**; use them for a gauge, never
  in an `if`.
- Carrier-thread count vs `jdk.virtualThreadScheduler.maxPoolSize` (default 256) — approaching the cap means
  either pinning or filesystem-I/O compensation **[JEP-444], [JEP-491]**.
- **Never** a `size()` gauge on `ConcurrentLinkedQueue` or `LinkedTransferQueue` (O(n)).

**V9 — Deterministic unit tests for state-dependent classes.** Inject a `Clock` and drive
`awaitNanos`-based timeout arithmetic directly (assert the returned remaining time decreases monotonically
across simulated spurious wakeups). Use a `CyclicBarrier` in the _test_ to align threads at the exact
interleaving you want to hit — this turns a probabilistic race into a reproducible one for the specific
interleaving you already suspect. (It cannot find interleavings you did not think of; that is what V1/V2 are
for.)

**V10 — Pin the JDK behaviour you depend on with a version guard.** Two live examples from this brief that
warrant an actual assertion in a startup check: `Runtime.version().feature() >= 24` before relying on
`synchronized` not pinning; and, if you use `LinkedTransferQueue.poll()`'s null-means-empty contract, a guard
(or a retry) for feature < 26 (`JDK-8371740`) **[JBS]**.

---

# 16. Explicitly NOT verified

1. **The JBS bug id for the JDK 14 AQS rewrite.** Confirmed by source diff (`waitStatus` 42 hits at
   `jdk-13+33`, 0 at `jdk-14+36`); could not identify the issue key. **UNVERIFIED.**
2. **Whether the four JDK 26 "Fixed" RFEs (`JDK-6317534`, `JDK-6351533`, `JDK-6714849`, `JDK-6625724`)
   correspond to any behaviour or API change.** Mainline source shows none as of 2026-08-27. Very likely
   documentation-only closures. **UNVERIFIED — do not claim new JDK 26 APIs.**
3. **Exact backport status of the `computeIfAbsent` "Recursive update" fix into 8u.** JBS shows Fix Version 9
   plus an intent to integrate "then 8u"; the current JDK 8 javadoc documents the exception. The precise 8uNN
   is **UNVERIFIED**.
4. **Whether `DelayQueue.drainTo` draining only expired elements is _specified_ anywhere.** The
   implementation does; the class doc's list of expired-only methods omits `drainTo`, and `drainTo`'s own
   javadoc is inherited boilerplate. Treated here as source-derived. **Specification status UNVERIFIED.**
5. **The read:write ratio at which copy-on-write stops paying.** No primary source gives a number. Every
   number in circulation is folklore. **UNVERIFIED by construction.**
6. **The crossover point where `ReentrantReadWriteLock` beats `ReentrantLock`.** No primary source. Field
   disagreement documented in §14. **UNVERIFIED.**
7. **The Kabutz `StampedLock` starvation numbers (3725 ms vs 709 ms).** Secondary source, single author's
   harness, hardware unspecified. Directionally credible; **magnitude UNVERIFIED.**
8. **JDK version where HotSpot's legacy stack-locking was replaced by lightweight locking as the default**
   (relevant to `synchronized` cost and to compact object headers). Believed JDK 22 but **not verified in
   this pass**; owned by `lock-inflation` anyway.
9. **Whether `jdk.ThreadPark` events are emitted for virtual-thread parks on JDK 25** (as opposed to only
   platform threads). The event is enabled by default with a 20 ms threshold; whether unmounted virtual-thread
   parks produce it, and how the 20 ms threshold interacts with unmounting, was **not verified**. Flag before
   the skill recommends it as the primary virtual-thread contention signal.
10. **Any JDK 27 change to `java.util.concurrent`** beyond JEP 534's header layout. **UNVERIFIED** — JDK 27 is
    still open; re-check before publication.
11. **Whether `JDK-8371740` (LTQ spurious null) will be backported to 21u/25u.** No backport issues exist as
    of 2026-08-27. **Status may change — re-check.**
12. **Precise JCiP page/figure numbers.** Chapters and section numbers are cited from structural knowledge of
    the book; §13.4's content is corroborated by JEP 491's direct quotation of it. Other section numbers
    (§5.6 Memoizer, §11.4.3 lock striping, §8.3.5 work stealing) are **not independently verified** against
    the printed edition — the skill author should confirm against a copy before printing section numbers.

---

# 17. Boundaries — route, do not restate

| Topic that will come up                                                               | Owning skill                                                    |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| happens-before, `volatile`, safe publication, final-field semantics                   | `java-memory-model`                                             |
| `VarHandle` access modes, fences                                                      | `varhandles-and-memory-ordering`                                |
| Documenting a class's thread-safety policy, lock scope, alien methods under a lock    | `java-thread-safety-contracts`                                  |
| CAS loops, lock-free algorithm design, `LongAdder` vs `AtomicLong` internals          | `lock-free-patterns`                                            |
| Monitor inflation cost, compact object headers' effect on locking                     | `lock-inflation`                                                |
| `ExecutorService` lifecycle, `submit` vs `execute`, rejection policies, `shutdownNow` | `executors-and-task-lifecycle`                                  |
| Pool sizing arithmetic, Little's Law                                                  | `littles-law-and-queueing`, `thread-sizing-and-virtual-threads` |
| Bulkhead / concurrency limiting as a resilience pattern                               | `concurrency-limiting-and-bulkheads`                            |
| Backpressure in reactive pipelines                                                    | `reactive-backpressure`                                         |
| `StructuredTaskScope`                                                                 | `structured-concurrency`                                        |
| Diagnosing a live incident                                                            | `concurrency-diagnostics`                                       |
| Interrupt/cancellation policy in depth                                                | `cancellation-and-interruption`                                 |
| Virtual-thread adoption strategy, pinning migration                                   | `java-virtual-threads`                                          |

---

## Appendix: primary sources fetched during this pass

- Java SE 25 API docs (`docs.oracle.com/en/java/javase/25/docs/api/java.base/...`): `ConcurrentHashMap`,
  `ConcurrentSkipListMap`, `CopyOnWriteArrayList`, `CopyOnWriteArraySet`, `BlockingQueue`,
  `ArrayBlockingQueue`, `LinkedBlockingQueue`, `LinkedBlockingDeque`, `SynchronousQueue`,
  `LinkedTransferQueue`, `PriorityBlockingQueue`, `DelayQueue`, `ConcurrentLinkedQueue`, `CountDownLatch`,
  `CyclicBarrier`, `Phaser`, `Semaphore`, `Exchanger`, `ForkJoinPool`, `locks/Condition`,
  `locks/ReentrantLock`, `locks/ReentrantReadWriteLock`, `locks/StampedLock`,
  `locks/AbstractQueuedSynchronizer`, `java.util.concurrent` package-summary, `java.util.Collections`,
  `java.lang.Object`
- Java SE 8 API docs: `ConcurrentHashMap`, `ConcurrentSkipListMap`
- OpenJDK source at `jdk-25+36`: `ConcurrentHashMap.java`, `ConcurrentSkipListMap.java`,
  `LinkedTransferQueue.java`, `ArrayBlockingQueue.java`, `LinkedBlockingQueue.java`,
  `locks/ReentrantReadWriteLock.java`, `Collections.java`, `VirtualThread.java`,
  `jdk/internal/vm/Continuation.java`, `hotspot/share/jfr/metadata/metadata.xml`,
  `jdk.jfr/share/conf/jfr/default.jfc`, `profile.jfc`
- OpenJDK source at tags `jdk-9+181`, `jdk-10+46`, `jdk-11+28`, `jdk-13+33`, `jdk-14+36`, `jdk-15+36`,
  `jdk-17+35`, `jdk-21+35`, `jdk-22+36`, `jdk-24+36`, and `master` (2026-08-27); jdk8u `master`
- JEPs 374, 444, 491, 519, 534 (full text via curl)
- JBS REST API: JDK-8062841, 8071667, 8278255, 8297605, 8301341, 8311131, 8332842, 8333172, 8336384, 8336462,
  8338146, 8343250, 8345052, 8352971, 8354016, 8354111, 8355726, 8256425, 8371740, 8372256, 6317534, 6351533,
  6625724, 6714849; plus full `fixVersion` sweeps of subcomponent `java.util.concurrent` for JDK 21–26
- openjdk/jcstress README
- Heinz Kabutz, _JavaSpecialists_ issue 321 (secondary, flagged)
