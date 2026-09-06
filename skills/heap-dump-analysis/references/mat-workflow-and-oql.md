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
6. Histogram         -> per-class counts/shallow totals; calculate retained set when needed
7. OQL               -> domain-specific ad-hoc queries
```

Reading Path to GC Roots: how many distinct strong paths reach the object after excluding
the reference strengths you intentionally chose? A static field can name a cache or
singleton. JVM/framework roots and MAT pseudo-roots need version-specific interpretation;
do not convert their display label directly into ownership.

## Shallow versus retained, concretely

| Structure                                                      | Shallow heap                   | Retained heap                                                                                 |
| -------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| Empty `ArrayList`                                              | small object; layout-dependent | list object plus any non-shared backing state; inspect the target dump                        |
| `ArrayList` of 1,000 unique ~20-char `String`s                 | list object only               | list + reference array + strings/backing arrays, subject to sharing and compact-string layout |
| Static `HashMap`, 5,000,000 entries each with a 500 B `byte[]` | map object only                | potentially gigabytes if it uniquely dominates nodes, keys and payloads                       |

This is why a histogram sorted by shallow size puts `char[]` at the top while the static
`HashMap` that retains all of it sits far below. The raw bytes are in the leaves;
responsibility is in the retainer.

Dominance is strict: Y dominates X only if **every** path from any GC root to X passes
through Y. If two subsystems share an object, neither subsystem need dominate it, but
their common application owner can. Only when no real object dominates it does its
immediate dominator become the synthetic super-root.

Direct dominator-tree children represent disjoint dominated branches in the underlying
graph, but MAT grouping/report views may aggregate or repeat data differently. Before
summing displayed rows, confirm whether they are direct children, class groups, retained
sets or query projections.

## OQL

MAT's OQL is SQL-_like_, not SQL. It has **no aggregation functions** — no `SUM`, `AVG`
or `COUNT` over an expression in the `SELECT` clause. For totals, use the Histogram
(which sums counts/shallow sizes) or "Group Result by class" over an OQL result.
Calculate the retained size of the selected set separately: it is not generally the sum
of instance retained sizes. Distinguish MAT's minimum approximation from exact retained
size; overlapping retained sets must not be added as independent memory budgets.

```sql
-- HashMaps with more than 10,000 entries
SELECT h, h.size FROM java.util.HashMap h WHERE h.size > 10000

-- Strings containing a marker
SELECT s FROM java.lang.String s WHERE toString(s).contains("sessionId=")

-- Instances whose field is null
SELECT b FROM com.example.UserSession b WHERE b.userId = null

-- Large char arrays. No SUM: list the candidates, then group the result for a total.
SELECT c FROM char[] c WHERE c.@usedHeapSize > 1024

-- Classes defined per loader, including subclasses. Sort the result column in MAT.
-- @definedClasses accesses MAT's model, not a JDK-private collection field.
SELECT cl, cl.@definedClasses.size() AS "Defined Classes"
FROM INSTANCEOF java.lang.ClassLoader cl

-- Virtual thread footprint
SELECT * FROM java.lang.VirtualThread
```

The normative syntax reference is the Eclipse MAT documentation. Check every function
before using it. MAT has no SQL `ORDER BY` or built-in `sizeof`; sort the result in the UI
and use `@usedHeapSize`. Run each query separately; `com.example.UserSession` is an
application placeholder. Validate queries on the installed MAT/parser and target dump.

## Recurring leak shapes

### A `WeakHashMap` whose key is strongly reachable elsewhere

Interning a string does **not** by itself make a modern HotSpot `WeakHashMap` key permanent;
otherwise-unreachable string-table entries can be unlinked. A map that never empties instead has
another strong path: a value referencing its key, a static/application cache, active frame,
listener, thread context or implementation-specific root. Symptom: the map dominates substantial
heap and Paths to GC Roots excluding weak references show that other path.

There is no `String.isInterned()` public API, and calling `s.intern()` to compare identity mutates
the table. Inspect roots in the target JVM/dump and fix the actual owner. A bounded cache may still
be appropriate, but `maximumSize`/expiry is a capacity policy—not a substitute for explaining
reachability.

### A `ThreadLocal` value that is never replaced

A single `ThreadLocal` has at most **one** entry per thread: the `Entry` key is the
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
pool thread that is never discarded. Fix with a scope that restores/removes state in
`finally`; a fresh value installed with `set()` but never removed still retains the latest
request on each owning thread and breaks nested restoration. Virtual-thread locals belong
to the virtual thread, not its carrier. Prefer explicit
parameter passing or `ScopedValue` where its Java-version/lifetime contract fits.

### Classloader retention across reloads

A `ClassLoader` can remain live through a reachable instance/class it defined, a live thread's
`contextClassLoader`, or another external root path. Cycles wholly inside an unreachable
loader graph do not by themselves prevent collection. With plugin
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

The native bytes of a platform thread's stack are outside the heap, but HPROF can record
its Java frame locals as GC roots, visible in MAT's Thread Overview. HotSpot 25 also emits
stack/root records for virtual threads. Do not assume the parser represents every local
as an ordinary edge from `StackChunk`; inspect thread roots and the actual ownership path.
Large suspended state can be legitimate in-flight work or an unbounded-lifetime/concurrency
defect; chunk presence alone does not distinguish them.

### Off-heap is not here

Native payload bytes are absent, but Java handles/capacities/cleanup owners may explain
their lifetime. Compare RSS with measured heap occupancy/commitment, not the fixed `-Xmx`
ceiling. Add NMT when already enabled, OS mapping/residency and native allocator evidence;
third-party allocations and some JDK-library memory are outside NMT's coverage.

## Primary references

- [MAT OQL syntax](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/reference/oqlsyntax.html)
- [MAT properties and functions](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/reference/propertyaccessors.html)
- [Retained sets and minimum versus exact size](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/concepts/shallowretainedheap.html)
- [MAT thread stacks and locals](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/analyzingthreads.html)
- [NMT coverage, JDK 25](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html)
