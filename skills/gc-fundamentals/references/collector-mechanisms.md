# Collector mechanisms

Flag defaults and log text below were read off Temurin 25.0.3 (`-XX:+PrintFlagsFinal`,
`-Xlog:gc*`); behaviour attributed to another release cites the JEP or JBS issue that
establishes it.

## The three base algorithms

| Algorithm    | Moves objects | Fragments | Cost proportional to            | Space overhead    |
| ------------ | ------------- | --------- | ------------------------------- | ----------------- |
| Mark-sweep   | no            | yes       | live data (mark) + heap (sweep) | none              |
| Mark-compact | yes           | no        | live data, visited twice        | none              |
| Copying      | yes           | no        | **survivors only**              | reserved to-space |

Copying is why a young collection is cheap: with 99% mortality, almost nothing is copied,
and the whole Eden is reclaimed by moving a pointer. This is also why the same collection
becomes expensive the moment survival rises — the algorithm did not change, the input did.

The evacuation component is often better predicted by survivor count than allocated
bytes. Every
survivor is visited, its references are followed, its forwarding pointer is installed and
checked; the memcpy of its body is the cheap part. Executed on 25.0.3 with a linked list of
ten million 24-byte nodes: the young pause that evacuated it spent 327.93 ms in `Evacuate
Collection Set`, and the full collection took 241 ms with 8-byte-aligned headers and 240 ms
with `-XX:+UseCompactObjectHeaders`, although the live set shrank from 230 MB to 154 MB.
In this object graph, fewer bytes bought more room in Eden and therefore fewer collections,
while object count dominated traversal. Copy bandwidth, cache locality, reference density,
roots, remembered sets and worker balance can change the result; treat the numbers as a
falsifiable example, not a universal cost model. The layout arithmetic is
object-layout-and-footprint.

## Tri-colour marking and the two invariants

Every marker, stop-the-world or concurrent, is the same abstraction: white (not yet seen),
grey (seen, references not yet scanned), black (done). Marking finishes when no grey
remains; whatever is still white is garbage. A concurrent marker can lose an object when
the application stores a white object's only reference into a black object and then
overwrites the grey one that used to reach it. Two invariants prevent it, and the choice
decides the barrier and the floating garbage:

- **Snapshot-at-the-beginning (SATB)** — G1, Shenandoah. A pre-write barrier records the
  reference being _overwritten_, so everything reachable when marking started is marked.
  Everything allocated during the cycle is treated as live without being looked at. The
  cost is floating garbage: an object that dies during the cycle is reclaimed only by the
  next one, and the occupancy after a cycle overstates the live set by roughly the
  allocation of one cycle. The cycle mechanics are g1-concurrent-marking.
- **Incremental update** — CMS historically (removed in JDK 14, JEP 363). A post-write
  barrier records the reference being _stored_, so marking follows the new edge. Less
  floating garbage, but marking can never be sure it is finished until a final
  stop-the-world remark rescans what changed.

ZGC marks through its load barrier instead of a store barrier: a reference loaded with a
stale colour is marked and repaired on the way out, so the invariant is enforced on reads
(zgc-generational-internals).

## Generations, survivors and promotion

Serial and Parallel split the heap into Eden, two survivor spaces and old, with sizes
from `NewRatio` (2), `SurvivorRatio` (8) and adaptive resizing (`UseAdaptiveSizePolicy`,
true). G1 keeps the same roles but assigns them to regions, so the young generation is a
set of regions whose count changes at every pause; ZGC and Shenandoah do the same at page
and region granularity. In all of them:

- A young collection copies survivors from Eden and the from-survivor space into the
  to-survivor space, bumping each object's age in its header, and promotes an object to
  old when its age reaches the **tenuring threshold** — at most `MaxTenuringThreshold`
  (15), computed each pause so that the survivor space stays under `TargetSurvivorRatio`
  (50%) full. `InitialTenuringThreshold` (7) is Parallel's starting point.
- **Premature promotion** is the threshold being driven down because the survivor space
  cannot hold what survived: objects that would have died in one more young collection
  are copied to old instead. `-Xlog:gc+age=trace` prints the computed threshold each
  pause; a `new threshold` below `max threshold` is the signal, and its reading is
  gc-log-analysis.
- **Promotion is one-way.** Old is collected by a mixed collection (G1), a major cycle
  (ZGC, Shenandoah) or a full collection (Serial, Parallel), all much rarer than a young
  pause. Until then a promoted object costs at every young pause through its card.
- **Nepotism.** A dead object in old that references young objects still has its card
  dirty, so young collections treat those referents as live and copy them — and promote
  them, where they in turn keep _their_ referents alive. A queue or linked structure whose
  head was promoted drags its tail into old one node per pause. The mechanism is described
  in Jones, Hosking and Moss, _The Garbage Collection Handbook_ (2nd ed., ch. 9); the
  symptom is a young pause whose copying cost rises while the application retains
  nothing, and a mixed or full collection that then frees far more than expected.

G1 has no `-Xmn` in the Serial sense: the young size is derived from the pause target
each pause, which is why lowering `MaxGCPauseMillis` (200) shrinks Eden and raises
promotion. The flag's contract is g1-tuning-for-slo.

## Where the generational hypothesis fails

The hypothesis — most objects die young — is empirical. It breaks in four recognisable
shapes:

- **Caches.** Entries are created to survive. Everything promoted, nothing reclaimed
  cheaply — and an LRU cache at steady state evicts _old_ objects, so the churn lands on
  the generation that is most expensive to collect.
- **Object pools.** The same objects live forever by design and are repeatedly scanned;
  every pooled object that points at a young one is a dirty card.
- **High downstream latency.** By `N = λ × R`, slower dependencies mean more requests in
  flight, so more per-request objects are alive at any young collection. GC gets more
  expensive without anything in the JVM having changed.
- **Long-lived batches.** A request that assembles a large result before writing it, or
  a consumer that holds a batch of messages until the batch commits, keeps per-request
  objects alive across several young pauses and promotes them wholesale.

The third is the one that gets misdiagnosed as a GC problem. The fix is upstream.

## Anatomy of a young pause

`-Xlog:gc+phases=debug` breaks a G1 pause into the phases below (names as 25.0.3 prints
them). Each is proportional to something different, which is why "the pause got longer"
is not yet a diagnosis.

| Phase (25.0.3 name)                                     | Proportional to                                                         | Grows when                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Pre Evacuate Collection Set` → `Choose Collection Set` | number of candidate regions                                             | mixed collections with many old candidates                                                       |
| `Merge Heap Roots`                                      | dirty cards and remembered-set entries pointing into the collection set | old-to-young references: nepotism, a pool or cache being mutated, promoted objects being updated |
| `Evacuate Collection Set` → `Ext Root Scanning`         | thread count × stack depth, class-loader and JNI roots                  | thousands of platform threads with deep stacks; the stacks are scanned inside the pause          |
| `Evacuate Collection Set` → `Scan Heap Roots`           | cards merged above                                                      | same as `Merge Heap Roots`                                                                       |
| `Evacuate Collection Set` → `Code Root Scan`            | compiled methods holding references into the collection set             | large code cache, many embedded constants                                                        |
| `Evacuate Collection Set` → `Object Copy`               | **survivors, in objects**                                               | survival rises: hypothesis failing, premature promotion, a burst of retained requests            |
| `Evacuate Collection Set` → `Termination`               | imbalance between GC workers                                            | one huge object graph on one worker, too many workers for the work                               |
| `Post Evacuate Collection Set` → `Reference Processing` | discovered `Reference` objects                                          | soft/weak/final/phantom references in the collection set — see below                             |
| `Post Evacuate Collection Set` → `Weak Processing`      | JNI weak handles, string table, resolved-method table entries           | many interned strings or classes being unloaded                                                  |
| `Other`                                                 | serial bookkeeping                                                      | rarely the problem; if it is, `-Xlog:gc+phases=trace` splits it further                          |

Two readings this table makes immediate:

- A long young pause with **few survivors** is `Merge Heap Roots`/`Scan Heap Roots` (old
  pointing at young), `Ext Root Scanning` (threads) or `Reference Processing`. None of
  those is fixed by a smaller young generation, and the first is made worse by a bigger
  old one.
- `Object Copy` dominating with a stable allocation rate means survival changed — ask what
  is holding the objects (a slow dependency, a batch, a cache), not which flag.

Serial and Parallel print the same information with fewer phases; the equivalent JFR
events are `jdk.GCPhasePause` and its level-1/2 children, `jdk.G1EvacuationYoungStatistics`
and `jdk.GCReferenceStatistics` (all present in `jfr metadata` on 25). The per-region
detail — remembered sets, refinement, the collection-set choice — is g1-internals.

## Write barriers

Generational and regional collectors need to know about references that cross their
boundary, and the only way is to intercept every reference store — and, for the
concurrent collectors, every reference load.

| Collector            | Barrier on store                                                                                                                                                                                                                           | Barrier on load                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Serial, Parallel     | Card mark: one byte per card (`GCCardSizeInBytes` 512) set dirty, unconditionally (`UseCondCardMark` false)                                                                                                                                | none                                                     |
| G1 (through 25)      | SATB pre-barrier enqueuing the overwritten value while marking is active, plus a post-barrier that filters same-region and null stores, dirties the card and enqueues it for the refinement threads (`G1ConcRefinementThreads`, ergonomic) | none                                                     |
| G1 (JDK 26, JEP 522) | Same pre-barrier; the post-barrier writes to a second card table and refinement scans it, removing the queue and its memory fences — JEP 522, integrated in 26 (not verified here)                                                         | none                                                     |
| ZGC (generational)   | Store barrier maintaining the remembered set for old-to-young references (JEP 439)                                                                                                                                                         | Load barrier on coloured pointers: mark, relocate, remap |
| Shenandoah           | SATB pre-barrier; in `ShenandoahGCMode=generational` (JEP 521) a card-marking post-barrier as well                                                                                                                                         | Load-reference barrier resolving forwarded objects       |

This is why "the same code" has different throughput under different collectors even
when no collection happens: the barrier runs on every reference store or load regardless.
It is also why a benchmark of reference-heavy code — pointer chasing, collections of
collections — separates the collectors more than a numeric one does. Measure before
attributing a throughput gap to the collector; the split by reads versus writes is
zgc-generational-internals and the LRB is epsilon-and-shenandoah-internals.

## Allocation on the fast path

TLAB allocation is a pointer bump — a few nanoseconds. TLAB refill is sub-microsecond and
sized adaptively (`ResizeTLAB` true, `TLABWasteTargetPercent` 1). The millisecond spikes
people attribute to allocation are the **collection** the slow path eventually triggers,
not the allocation itself.

Two allocations do not take the fast path: an object larger than the TLAB's waste limit
goes to a shared, CAS-protected Eden allocation, and an array large enough must be zeroed
in full before it is returned. Zeroing is proportional to size and happens with no
safepoint poll — a 256 MB `int[]` cost 18–108 ms of Time-To-SafePoint on 25.0.3
(references/safepoints.md). `-Xlog:gc+tlab=debug` prints the refill and waste statistics;
finding the allocating code is allocation-profiling.

The consequence: "don't create objects" is almost never the right answer. Managing
allocation _rate_ and object _lifetime_ almost always is.

## Humongous allocations

An object larger than **half a G1 region** is allocated directly into one or more
contiguous humongous regions, bypassing Eden and the TLAB. Executed on 25.0.3 with
`-Xmx64m` (`G1HeapRegionSize` ergonomically 1 MB): a `byte[500_000]` is an ordinary young
allocation; a `byte[530_000]` is humongous and logs

```
[gc,humongous] GC(0) Humongous region 0 (object size 530016 @ 0x…) remset 0 code roots 0 marked 0 pinned count 0 reclaim candidate 1 type array 1
```

under `-Xlog:gc+humongous=debug`, and the pause that follows carries the cause
`G1 Humongous Allocation`. Three costs follow from the mechanism:

- **Waste.** A humongous object owns whole regions; that 530 KB array occupies 1 MB, and
  a 1.1 MB one occupies two. Region size grows with the heap (4 MB at the 8 GB default on
  this host; `-Xlog:gc+init` prints it), so the same object may or may not be humongous
  in different pods.
- **Fragmentation.** The regions must be contiguous. A heap with plenty of free regions
  can still fail a humongous allocation and force a full collection to compact.
- **Reclaim timing.** An unreferenced humongous _array_ with an empty remembered set
  (`reclaim candidate 1` above) is freed at the next young pause — eager reclaim, part of
  g1-concurrent-marking. Anything else waits for the marking cycle, and repeated
  humongous allocation drives `Request concurrent cycle initiation … source: concurrent
humongous allocation` back to back.

```bash
grep -i humongous gc.log
```

If they are frequent, the fix is the allocation site (a large array, a big buffer, a
`ByteArrayOutputStream` that doubles), not a collector flag. Raising the region size to
make them ordinary is a g1-tuning-for-slo decision with its own costs.

## Reference processing

`SoftReference`, `WeakReference`, `FinalReference` (finalizers) and `PhantomReference`
are discovered during marking and processed inside the pause, in the `Reference
Processing` phase, in that order (`-Xlog:gc+ref=debug` shows `SoftWeakFinalRefsPhase`,
`KeepAliveFinalRefsPhase`, `PhantomRefsPhase`). `ParallelRefProcEnabled` is true by
default on 25. A finalizable object is kept alive through one more collection so its
`finalize()` can run, so it costs two copies and a queue hand-off. A pause whose
`Reference Processing` line dominates has a reference-heavy structure in the collection
set — a `WeakHashMap`, a soft-reference cache, a finalizer-backed resource; the levels,
when each is cleared and the leak catalogue are java-reference-types-and-leaks, and the
count per type is `jdk.GCReferenceStatistics`.

## What the concurrent collectors trade

ZGC and Shenandoah do their marking and relocation while the application runs, so their
stop-the-world pauses are bounded by root work rather than by heap or live-set size
(ZGC scans thread stacks concurrently since JEP 376, JDK 16). The mechanism has four
costs that a pause-time comparison hides:

- **Barrier cost on every load** (and store), paid whether or not a cycle is running.
- **Concurrent CPU.** GC threads run alongside the mutators; on a pod with one or two
  CPUs they are the same cores. Thread counts and the throughput consequence are
  jvm-gc-tuning.
- **Headroom.** The cycle must finish before the application exhausts the free memory it
  started with, so the heap needs `allocation rate × cycle time` above the live set. Lose
  the race and the mutators block on allocation — ZGC's `Allocation Stall`
  (`jdk.ZAllocationStall`), Shenandoah's degenerated or full GC. Operating that boundary
  is zgc-and-shenandoah.
- **Floating garbage**, as above, which makes their post-cycle occupancy a poor estimate
  of the live set.

None of this argues against them; it says a service that moved to ZGC and lost
throughput, or stalls at traffic peaks, is seeing the mechanism, not a defect.

## The JDK 25 collector landscape

| Collector  | Pause depends on                                                                       | Generational                           | Status on 25                                                                                                                                     | Design point                           |
| ---------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Serial     | young: survivors; full: live data and heap                                             | yes                                    | product; ergonomic choice observed with one CPU on JDK 25                                                                                        | tiny heaps, single core                |
| Parallel   | young: survivors; full: live data and heap                                             | yes                                    | product                                                                                                                                          | throughput, batch, no latency SLO      |
| G1         | young: survivors, roots, cards and phase overhead                                      | yes (regions)                          | product; default on a server-class machine on the verified JDK 25 build; JEP 523 proposes broadening the default but is Candidate with no target | balanced default                       |
| ZGC        | normal pauses: primarily roots and bounded coordination; fallback behavior differs     | yes, by definition (JEP 490)           | product                                                                                                                                          | large heaps, latency SLO               |
| Shenandoah | normal pauses: primarily roots and bounded coordination; degenerated/full paths differ | generational mode is product (JEP 521) | product in builds that ship it (Temurin does); `ShenandoahGCMode` defaults to `satb` on the verified JDK 25 build                                | large heaps, latency SLO               |
| Epsilon    | never collects                                                                         | no                                     | experimental (JEP 318): `-XX:+UnlockExperimentalVMOptions` required, executed                                                                    | measurement instrument, not production |
| CMS        | —                                                                                      | —                                      | **removed** in JDK 14 (JEP 363); 25.0.3 refuses `-XX:+UseConcMarkSweepGC` with `Unrecognized VM option`                                          | —                                      |

Baseline corrections that invalidate older comparisons, all executed on 25.0.3:

- `-XX:+ZGenerational` **does not exist** any more (JEP 490, JDK 24). ZGC is generational,
  period. Carrying the flag forward is an upgrade failure in waiting: 25.0.3 starts and
  warns `Ignoring option ZGenerational; support was removed in 24.0`, which is HotSpot's
  _obsolete_ stage; the flag is scheduled to _expire_ in 26, where an unrecognised option
  stops the JVM (see the lifecycle in references/diagnosis-and-versions.md).
- Generational Shenandoah is product (JEP 521), not experimental. On the verified JDK 25
  build, `-XX:+UseShenandoahGC` alone runs `satb` mode. A 2026 draft (JDK-8379682)
  proposes making generational mode the default, but as of 2026-09-03 it has neither a JEP
  number nor a target release.
- `-XX:+UseCompactObjectHeaders` is a product flag on 25 (JEP 519) and **off by default**.
  It changes object size, not collector behaviour — see the measurement at the top.
- `-XX:+UseBiasedLocking` is gone (deprecated JDK 15, JEP 374; removed JDK 18, JDK-8256425):
  25.0.3 refuses it. Biased-lock revocation is no longer a safepoint cause.
