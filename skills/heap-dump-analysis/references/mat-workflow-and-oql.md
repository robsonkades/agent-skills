# MAT workflow, OQL and recurring leak shapes

## Navigation sequence

```
1. Open the .hprof in Eclipse MAT — the "Parsing heap dump..." phase builds the index
   and computes the dominator tree once, for reuse by every later retained-size query.
2. Overview          -> total retained heap, biggest objects
3. Leak Suspects     -> automatic report; a starting point, not a substitute for step 4
4. Dominator Tree    -> largest retainers, ordered by retained heap
5. On a suspect object:
     List Objects        -> individual instances
     Path to GC Roots    -> why was this not collected? EXCLUDE weak and soft references
     Show Retained Set   -> what would be freed if this object died
6. Histogram         -> per-class counts, with shallow and retained aggregated
7. OQL               -> domain-specific ad-hoc queries
```

Reading Path to GC Roots: how many distinct roots reach the object? A static field in the
path names a cache or a singleton. A JVM-internal root — the string pool, a loaded-class
registry — names something the application does not hold directly.

## Shallow versus retained, concretely

| Structure                                                      | Shallow heap | Retained heap                                                                                |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| Empty `ArrayList`                                              | ~24 B        | ~24 B — the initial array is the shared `EMPTY_ELEMENTDATA`                                  |
| `ArrayList` of 1,000 unique ~20-char `String`s                 | ~24 B        | ~24 B + ~4 KB of references + Σ shallow of the strings and their backing arrays — tens of KB |
| Static `HashMap`, 5,000,000 entries each with a 500 B `byte[]` | ~48 B        | gigabytes — it dominates the whole subtree of nodes, keys and payloads                       |

This is why a histogram sorted by shallow size puts `char[]` at the top while the static
`HashMap` that retains all of it sits far below. The raw bytes are in the leaves;
responsibility is in the retainer.

Dominance is strict: Y dominates X only if **every** path from any GC root to X passes
through Y. A shared configuration object read by two subsystems is dominated by neither
and rises to the synthetic super-root, however large it is.

Sanity check any dominator report — one you read or one you write: if the children's
retained sizes sum to more than the parent's, it is wrong by construction.

## OQL

MAT's OQL is SQL-_like_, not SQL. It has **no aggregation functions** — no `SUM`, `AVG`
or `COUNT` over an expression in the `SELECT` clause. For totals, use the Histogram
(which already sums shallow and retained per class) or "Group Result by class" over an
OQL result.

```sql
-- HashMaps with more than 10,000 entries
SELECT h, h.size FROM java.util.HashMap h WHERE h.size > 10000

-- Strings containing a marker
SELECT s FROM java.lang.String s WHERE s.toString().contains("sessionId=")

-- Instances whose field is null
SELECT b FROM com.example.UserSession b WHERE b.userId = null

-- Large char arrays. No SUM: list the candidates, then group the result for a total.
SELECT c FROM char[] c WHERE sizeof(c) > 1024

-- ClassLoader with the most loaded classes.
-- The real field is `classes` (java.util.Vector<Class<?>>); `@` is reserved for
-- MAT-computed attributes such as @retainedHeapSize and @objectId, not object fields.
SELECT cl, cl.classes.size()
FROM java.lang.ClassLoader cl
ORDER BY cl.classes.size() DESC

-- Virtual thread footprint
SELECT * FROM java.lang.VirtualThread
```

The normative syntax reference is the Eclipse MAT documentation. Check every function
before using it — plausible functions that "ought to exist" are the dominant failure mode
when writing OQL from memory.

## Recurring leak shapes

### Interned keys defeating a `WeakHashMap`

A `WeakHashMap<String, byte[]>` cache whose keys came from `String.intern()` never
empties: interned strings are held by the JVM's internal string pool, which acts as a
permanent GC root for them. Symptom in MAT: the `WeakHashMap` with multi-GB retained
heap, and tens of millions of `java.lang.String` instances in the histogram.

There is no `String.isInterned()` in any public JDK API. Confirm by selecting a sample of
keys and running Path to GC Roots: the path of an interned string ends directly at the
JVM-internal string pool root without passing through the map's weak reference, which is
what defeats the `WeakReference` semantics. The fix is a real cache with a bound —
`maximumSize`/`expireAfterWrite` — and no interning of cache keys.

### A `ThreadLocal` value that is never replaced

A static `ThreadLocal` has exactly **one** entry per thread: the `Entry` key is the
`ThreadLocal` instance itself, so entries cannot accumulate within one thread's
`ThreadLocalMap`. That mental model sends the investigation the wrong way.

```
Per thread ("http-nio-8080-exec-1"):
  Thread
    └── ThreadLocalMap.Entry[] -> one relevant entry (key = LOGGING_CONTEXT)
          └── LoggingContext (retained ~50 KB and growing)
                └── internal List<Breadcrumb>   <- appended per request, never cleared

System-wide (Histogram grouped by LoggingContext):
  900 pool threads x ~50 KB average, rising with uptime
```

The value object was reused rather than replaced, and its internal list grew forever on a
pool thread that is never discarded. Fix with `finally { ctx.clear(); }` in the filter, or
better, a fresh context per request via `set()`, leaving the previous one to the GC.

### Classloader retention across reloads

A `ClassLoader` is collectable only when no instance of any class it loaded, no thread
holding it as `contextClassLoader`, and no external reference to it survives. With plugin
hot-reload, each reload creates a new `URLClassLoader`; the histogram then shows many
instances of "the same" class (`com.example.Plugin$1` × 5000), each from a different
loader. Path to GC Roots from one of the extra instances names the forgotten reference —
usually a pool thread whose `contextClassLoader` was never reset, or a listener still
registered on a static bus.

### Virtual threads and `StackChunk`

When a virtual thread is unmounted, its stack does not live in an OS thread stack — it
lives in the Java heap, in a `StackChunk` under `jdk.internal.vm.Continuation`. Two
consequences:

- `jstack` enumerates OS threads and therefore does **not** list unmounted virtual
  threads. Use `jcmd <pid> Thread.dump_to_file -format=json`, which walks the JVM's own
  registry.
- With tens of thousands of virtual threads in flight (for example
  `spring.threads.virtual.enabled=true`), aggregate retained heap under
  `VirtualThread` → `Continuation` → `StackChunk` is a real and non-obvious memory driver.
  A handler holding a large array or buffer across a blocking point pays for it in the
  heap, per in-flight request.

This has no pre-Loom equivalent: a blocked platform thread's stack lives outside the Java
heap and is invisible to MAT. A dominator tree topped by `Continuation`/`StackChunk`
points at handlers holding large state across suspension points, not necessarily at a
forgotten reference.

### Off-heap is not here

`DirectByteBuffer`s, FFM `MemorySegment`/`Arena` mappings and JNI allocations appear only
as their small Java handle. Growth visible in process RSS but not in `-Xmx` is a Native
Memory Tracking question; a `.hprof` cannot answer it.
