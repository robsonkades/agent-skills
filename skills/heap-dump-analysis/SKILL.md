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
legitimately needs. Retained size attributes reachability; counts, ownership paths and the
declared lifecycle/capacity contract together distinguish a defect from legitimate state.

The failure this prevents is capturing a dump that cannot decide the question — taken at
the wrong moment, without a full GC when one was needed (or with one during an incident
that could not afford it), with no baseline to compare against, and then read by shallow
size, which names the leaf array instead of the static map holding it.

## Workflow

1. **Record the context with the file.** `-Xmx`, wall-clock time, approximate load in
   req/s, JVM uptime, and whether `-XX:+UseCompactObjectHeaders` was on. A dump without
   these has limited comparability. Record JDK/vendor, collector, MAT/parser version, capture
   filter and object-layout settings too; inspect the target before applying JDK 25 examples.
2. **Decide the live-object filter deliberately.** A dump filtered to live objects requests a
   full GC first, removing unreachable-but-not-yet-collected objects from the capture—not proving
   that every survivor is a leak—and, on a heap already under
   pressure, can itself take tens of seconds to minutes before a byte is written.
3. **Capture, choosing the tool by reachability and incident risk.** `jcmd`/`jmap` need target-VM
   cooperation/safepoint and can block or time out when it is wedged. Serviceability Agent attach
   is invasive and may suspend/conflict with the process; prefer operating on a core dump when
   recovery time and disk permit.
4. **Take a second dump only when its incremental diagnostic value exceeds another global pause.**
   Choose separation from the suspected growth rate/business cycle and normalize for load, cache
   warm-up and topology. Continuous class/heap/JFR statistics may establish slope more safely.
5. **Triage by live heap and context**, then open the Dominator Tree. A large dominator is a useful
   starting point, not a universal 30% leak threshold; caches and immutable indexes can
   legitimately dominate, while a distributed leak may have no single large owner.
6. **Run Path to GC Roots on the suspect with reference strengths made explicit.** Start
   by excluding weak/soft/phantom paths to expose strong ownership, then inspect excluded
   strengths when a soft cache or reference-processing policy is itself the question. A
   static field often names an owner, but framework/JVM roots require version-aware
   interpretation rather than a guessed label.
7. **Validate the former retention path and growth trigger.** Use lifecycle regression checks
   and sufficiently long normalized heap/owner statistics; take comparable post-fix dumps when
   they resolve an ownership question worth another pause. Two stable snapshots alone cannot
   establish bounded retention, and absence of an OOM is not evidence of a fix.

## Rules

- Use retained heap — Dominator Tree, or the Histogram's calculated retained-set size — to
  identify owners to investigate, not to prove a leak. Shallow size alone assigns no
  responsibility: it can put arrays at the top when a static `HashMap` is the retainer.
- `jcmd GC.heap_dump` and attach-based `jmap -dump` converge on the HotSpot heap-dump
  operation: both schedule `VM_HeapDumper`, which requires a safepoint. Neither avoids the
  capture pause. GC filtering, compression, parallelism, heap content and storage affect cost;
  on JDK 25, fragment merging follows outside the safepoint, so total command/JFR dump duration
  is not identical to Java pause duration.
- `jcmd <pid> GC.heap_dump <file>` runs a full GC unless `-all` is passed;
  `jmap -dump:live,...` forces one, `jmap -dump:format=b,...` does not. On JDK 25 the
  command also takes `-gz=<1-9>`, `-parallel=<n>` and `-overwrite`, and a relative
  `<file>` is opened by the target JVM in _its_ working directory. Confirm the installed
  build with `jcmd <pid> help GC.heap_dump`.
- HPROF size is related to captured objects but also encoding, identifiers, class metadata and
  unreachable inclusion; budget near the configured heap plus filesystem/container headroom
  rather than assuming equality with live bytes. Include temporary dump fragments and merging
  in disk planning; object capture pauses Java execution, while final merging can continue afterward.
  In a cgroup the
  dirty page cache of that file is charged to the container, so a heap-sized dump written
  to the container's own filesystem can OOMKill the pod it was meant to diagnose. Budget
  the destination before capturing: see the cost table in the capture reference.
- `-XX:+HeapDumpOnOutOfMemoryError` attempts capture **once per process** — a failed
  write also consumes the attempt; later caught/rethrown OOMEs do not rearm it — and
  only for errors the VM itself raises (`Java heap space`, `Metaspace`, `Requested array
size exceeds VM limit`). An error constructed in Java code, such as `Cannot reserve N
bytes of direct buffer memory`, produces no dump. The flag, `HeapDumpPath` and
  `HeapDumpGzipLevel` are `manageable`: `jcmd <pid> VM.set_flag HeapDumpOnOutOfMemoryError
true` arms a running JVM that started without it.
- A dump written by `-XX:+HeapDumpOnOutOfMemoryError` is unfiltered by construction —
  the JVM has already failed to allocate. Treat its raw instance counts with suspicion
  and go to the Dominator Tree.
- Dominance means **every** path from any GC root passes through the dominator. An object
  shared by two branches is dominated by their nearest common dominator, which may be an
  application owner or the synthetic super-root; it does not automatically belong to the latter.
- Do not sum arbitrary dominator descendants as if they were disjoint. Direct children in
  a correctly constructed dominator tree partition dominated subgraphs, but report views,
  grouping and shared objects can change what is displayed; validate tool semantics before
  using an additive sanity check.
- MAT's OQL has no SQL-style aggregation. `SELECT SUM(...)` does not exist; totals come
  from the Histogram or from "Group Result by class".
- `@` accesses MAT model attributes (`@retainedHeapSize`, `@objectId`, `@definedClasses`),
  not arbitrary fields in the dumped object. Use documented MAT functions and inspect target
  fields; OQL does not execute the dumped program's collection or application methods.
- There is no `String.isInterned()` in the public API. Modern HotSpot's string table does not by
  itself make an otherwise unreachable interned string immortal, so `intern()` alone does not
  explain a `WeakHashMap` key leak. Use Paths to GC Roots to find the actual strong path and pin
  claims to the target JVM; calling `s.intern()` for comparison mutates the table and is not a
  neutral diagnostic.
- One `ThreadLocal` instance has at most **one** entry in each thread's map — the key is the
  `ThreadLocal` instance. Its leaks come from the value never being cleared or replaced,
  not from entries accumulating in one `ThreadLocalMap`.
- With virtual threads, an unmounted stack lives in the Java heap as
  continuation chunks. Check the actual HPROF and parser representation rather than assuming
  every stack-held reference appears as a chunk edge. Platform stack native bytes are absent,
  but its Java locals can appear as GC roots in MAT too.
- Native payload bytes are absent from HPROF, but `DirectByteBuffer`/FFM handles and owners can
  explain why they remain allocated. Compare RSS with actual heap occupancy/commitment;
  `-Xmx` is only a ceiling. Combine NMT (if enabled at startup) with OS mappings and allocator
  evidence: NMT does not cover every JDK-library or third-party native allocation.
- `-XX:+UseCompactObjectHeaders` (JEP 519, product in JDK 25; off by default through JDK 26,
  on by default from JDK 27 under JEP 534) can change shallow sizes, subject to alignment and
  parser sizing support; not every aligned object becomes smaller. Record
  which mode produced a dump: a histogram diff across that flag — or across the JDK 26→27
  boundary — may include layout/parser deltas as well as workload or code changes.
- JMC and GCeasy.io do not open `.hprof`. MAT is the reference tool; HeapHero.io and
  jxray.com handle dumps beyond what a local MAT can index.

## Evidence integrity and security

Report the suspect owner/path, retained-size calculation basis, observed growth versus expected
lifecycle, proposed fix and checks actually run. Missing baselines or parser support limit the
conclusion; do not turn a plausible retainer into a confirmed leak.

- A heap dump contains credentials, tokens, personal data, payloads and cryptographic material in
  plaintext object fields. Capture to an approved encrypted destination, restrict operator/tool
  access, hash/record provenance, transfer securely and delete by incident-retention policy.
- Do not upload production dumps to a third-party analyzer without explicit data-governance
  approval. Prefer a sanitized reproducer or controlled local/isolated analysis.
- Record whether a full GC/filter occurred, capture completion/truncation, tool/JDK version and
  parser warnings. A partial/corrupt dump or two captures with different layout/JDK/load cannot
  support a byte-for-byte growth conclusion.

## References

- [Capturing a dump and triaging it](references/capture-recipes.md) — the four capture
  methods and their trade-offs, the production cost table (safepoint, disk, page cache,
  compression, once-only auto-dump), container extraction, the size-against-`-Xmx`
  triage table, two-dump comparison, and options for dumps too large for a local MAT.
  Read before capturing, and when deciding whether a dump shows a leak at all.
- [MAT workflow, OQL and leak patterns](references/mat-workflow-and-oql.md) — the MAT
  navigation sequence, working OQL queries with the syntax traps, and the recurring leak
  shapes (interned keys, `ThreadLocal` values, classloader reloads, `StackChunk`). Read
  when driving MAT or writing a query.
