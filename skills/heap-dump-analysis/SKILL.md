---
name: heap-dump-analysis
description: >
  Taking and analysing a JVM heap dump: capturing without making the incident worse,
  dominator tree versus shallow and retained size, path to GC roots excluding weak
  references, Eclipse MAT and OQL, comparing two dumps, and separating a leak from a large
  working set. Use when heap grows monotonically with uptime, after an `OutOfMemoryError` or
  a `-XX:+HeapDumpOnOutOfMemoryError` file appears, when a histogram is being read by
  shallow size, when `jcmd` or `jmap` hangs against a stuck JVM, when a `WeakHashMap` or
  `ThreadLocal` cache never empties, when `StackChunk` or `Continuation` tops a dominator
  tree, or when writing OQL. Does not cover the region budget and which OOM message means
  what (jvm-memory-regions), why a live set costs what it costs (gc-fundamentals),
  classloader leaks specifically (jvm-class-loading), or core-dump and Serviceability Agent
  workflows (jhsdb-and-core-dumps).
---

# Heap Dump Analysis

## Purpose

Turn a `.hprof` file into an attribution of responsibility: which object is keeping which
bytes alive, and whether that retention is a defect or the working set the system
legitimately needs. Instance counts do not answer that. Retained size does.

The failure this prevents is capturing a dump that cannot decide the question — taken at
the wrong moment, without a full GC when one was needed (or with one during an incident
that could not afford it), with no baseline to compare against, and then read by shallow
size, which names the leaf array instead of the static map holding it.

## Workflow

1. **Record the context with the file.** `-Xmx`, wall-clock time, approximate load in
   req/s, JVM uptime, and whether `-XX:+UseCompactObjectHeaders` was on. A dump without
   these is not comparable to any other dump.
2. **Decide the live-object filter deliberately.** A dump filtered to live objects runs a
   full GC first, which is what removes false leaks — and which, on a heap already under
   pressure, can itself take tens of seconds to minutes before a byte is written.
3. **Capture, choosing the tool by whether the JVM can reach a safepoint.** `jcmd` and
   `jmap` both hang against a JVM that cannot; `jhsdb jmap --binaryheap` reads the process
   externally.
4. **Take a second dump 5–10 minutes later** whenever the process is still alive. The
   delta between two dumps separates "many objects because load is high now" from "many
   objects because nothing is ever released" far more reliably than a single dump.
5. **Triage by size against `-Xmx` first**, then open the Dominator Tree. One object
   retaining more than 30% of the heap is a probable single root cause; many medium
   objects with no dominant one suggests legitimate usage or several small leaks.
6. **Run Path to GC Roots on the suspect, excluding weak and soft references.** A static
   field in the path names a cache or singleton; a JVM-internal root names something like
   the string pool.
7. **Validate the fix with dumps, not with the absence of an OOM.** Two post-fix dumps
   under equivalent load, separated in time, must show the former dominator no longer
   growing.

## Rules

- Use retained heap — Dominator Tree, or the Histogram's "Retained Heap" column — to
  identify a leak. Shallow size alone assigns no responsibility: it puts `char[]` at the
  top when the static `HashMap` is the retainer.
- `jcmd GC.heap_dump` and `jmap -dump` are the same mechanism: both schedule
  `VM_HeapDumper`, which requires a safepoint and stops every Java thread. Neither is the
  "low-pause" option. The cost difference is the preceding full GC, not the tool.
- `jcmd <pid> GC.heap_dump <file>` runs a full GC unless `-all` is passed;
  `jmap -dump:live,...` forces one, `jmap -dump:format=b,...` does not. Confirm the
  behaviour of the installed build with `jcmd <pid> help GC.heap_dump`.
- A dump written by `-XX:+HeapDumpOnOutOfMemoryError` is unfiltered by construction —
  the JVM has already failed to allocate. Treat its raw instance counts with suspicion
  and go to the Dominator Tree.
- Dominance means **every** path from any GC root passes through the dominator. An object
  reachable from two independent roots belongs to neither branch and rises to the
  synthetic super-root.
- A dominator tree whose children sum to more than the parent's retained size is wrong by
  construction. Use that as a sanity check on any heap report, including your own.
- MAT's OQL has no SQL-style aggregation. `SELECT SUM(...)` does not exist; totals come
  from the Histogram or from "Group Result by class".
- `@` in OQL is reserved for MAT-computed attributes (`@retainedHeapSize`, `@objectId`),
  not for arbitrary object fields. `java.lang.ClassLoader`'s field is `classes`, not
  `loadedClasses`.
- There is no `String.isInterned()` in any public JDK API. Confirm an interned-key
  suspicion with Path to GC Roots: an interned string's path ends at the JVM-internal
  string pool root, bypassing the `WeakHashMap`'s weak reference entirely.
- A static `ThreadLocal` has exactly **one** entry per thread — the key is the
  `ThreadLocal` instance. Its leaks come from the value never being cleared or replaced,
  not from entries accumulating in one `ThreadLocalMap`.
- With virtual threads, an unmounted stack lives in the Java heap as
  `VirtualThread` → `Continuation` → `StackChunk` and is fully visible to MAT. A blocked
  platform thread's stack is not. Check `java.lang.VirtualThread`/`StackChunk` in the
  histogram before dismissing suspended-continuation retention.
- Off-heap is invisible here. `DirectByteBuffer`s, FFM `MemorySegment`/`Arena` and native
  library allocations show only their small Java handle. Growth in RSS that does not show
  in `-Xmx` is a Native Memory Tracking question, not a heap dump question.
- `-XX:+UseCompactObjectHeaders` (JEP 519, product in JDK 25; off by default through JDK 26,
  on by default from JDK 27 under JEP 534) shifts the shallow size of every object. Record
  which mode produced a dump: a histogram diff across that flag — or across the JDK 26→27
  boundary — shows a delta that came from layout, not from code.
- JMC and GCeasy.io do not open `.hprof`. MAT is the reference tool; HeapHero.io and
  jxray.com handle dumps beyond what a local MAT can index.

## References

- [Capturing a dump and triaging it](references/capture-recipes.md) — the four capture
  methods and their trade-offs, container extraction, the size-against-`-Xmx` triage
  table, two-dump comparison, and options for dumps too large for a local MAT. Read
  before capturing, and when deciding whether a dump shows a leak at all.
- [MAT workflow, OQL and leak patterns](references/mat-workflow-and-oql.md) — the MAT
  navigation sequence, working OQL queries with the syntax traps, and the recurring leak
  shapes (interned keys, `ThreadLocal` values, classloader reloads, `StackChunk`). Read
  when driving MAT or writing a query.
