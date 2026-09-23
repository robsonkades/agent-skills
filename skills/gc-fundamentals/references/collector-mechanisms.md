# Collector mechanisms

Flag checks use Temurin 25.0.3 (`-XX:+PrintFlagsFinal`); diagnostic log excerpts illustrate
that baseline. Timings and flags must be checked on the target collector/build. Other-release
claims identify the JEP or JBS record, separately from local runtime validation.

## Reachability, reclamation and resource lifetime

An unwanted object can remain strongly reachable through a listener, cache or another live
object; the collector cannot infer that the application no longer needs it. Conversely, a
local variable's lexical scope does not guarantee its referent remains reachable until that
scope ends. Eligibility depends on root reachability and reference semantics, not a desired
business lifetime. Reclamation is a later collector action, with no fixed deadline from
`System.gc()`. External resources require their own explicit ownership/close protocol; heap
collection is not that protocol. Detailed retaining paths and reference levels belong to
java-reference-types-and-leaks.

## The three base algorithms

| Algorithm    | Moves objects | Fragments            | Cost proportional to                      | Space overhead      |
| ------------ | ------------- | -------------------- | ----------------------------------------- | ------------------- |
| Mark-sweep   | no            | possible             | reachable graph + swept space             | metadata/free lists |
| Mark-compact | yes           | reduces it           | marking, relocation and reference updates | metadata/work space |
| Copying      | yes           | compacts destination | survivors plus roots/reference processing | reserved to-space   |

The table isolates algorithmic work, not total pause time or all metadata overhead. Copying
compacts its destination but requires space and root/reference processing; mark-compact algorithms
do not universally visit live data exactly twice. High mortality reduces copying, while other
pause phases may dominate even when almost nothing survives.

Evacuation visits surviving objects, follows references, manages forwarding and copies bodies.
Object count can dominate a graph of small nodes; byte volume can dominate large arrays.
To compare object layouts, hold the object graph, collector, heap, CPU and workload constant,
record actual layout and compare the same GC phases across repeated runs. Include roots,
remembered sets, worker balance and copy bandwidth. Layout arithmetic belongs to
object-layout-and-footprint; fewer bytes alone does not establish a pause-time improvement.

## Tri-colour marking and the two invariants

Every marker, stop-the-world or concurrent, is the same abstraction: white (not yet seen),
grey (seen, references not yet scanned), black (done). On a stable graph after processing the
roots, exhausting grey work identifies the unreachable white objects. Concurrent collection
also has to account for mutation, allocation and reference processing before reclaiming them.
A concurrent marker can lose an object when
the application stores a white object's only reference into a black object and then
overwrites the grey one that used to reach it. Two invariants prevent it, and the choice
decides the barrier and the floating garbage:

- **Snapshot-at-the-beginning (SATB)** — G1, Shenandoah. A pre-write barrier records the
  reference being _overwritten_, so everything reachable when marking started is marked.
  Newly allocated areas are treated conservatively for that marking cycle. Objects that die
  after the snapshot can remain as floating garbage, but young collections may reclaim some
  allocations and old reclamation can occur after marking. Occupancy error is not simply the
  allocation of one cycle. The cycle mechanics are g1-concurrent-marking.
- **Incremental update** — CMS historically (removed in JDK 14, JEP 363). A post-write
  barrier records the reference being _stored_, so marking follows the new edge. Less
  floating garbage, but marking can never be sure it is finished until a final
  stop-the-world remark rescans what changed.

Non-generational ZGC used load barriers for marking. Generational ZGC (the only mode on 25)
moves SATB marking work to store barriers, alongside remembered-set maintenance; load barriers
remove pointer metadata and repair relocated addresses ([JEP 439](https://openjdk.org/jeps/439)).
See zgc-generational-internals for the exact fast/slow paths.

## Generations, survivors and promotion

Serial and Parallel split the heap into Eden, two survivor spaces and old. Configured bounds
and ratios such as `NewRatio` and `SurvivorRatio` affect sizing, but their resizing policies
differ: Parallel uses `UseAdaptiveSizePolicy`; JDK 25 Serial computes young capacity from old
capacity, `NewRatio` and other bounds rather than that Parallel policy. A flag appearing as
`true` in `PrintFlagsFinal` does not establish that the selected collector consumes it.
G1 keeps the same roles but assigns them to regions, so the young generation is a
set of regions whose count is adaptive. Generational ZGC and generational Shenandoah use
different page/region aging and promotion policies; Shenandoah's default `satb` mode on 25
is non-generational. The following survivor-space model applies to Serial/Parallel/G1:

- A young collection compares the object's existing header age with the **tenuring threshold**.
  An object below the threshold can be copied to survivor space and then have its age
  incremented. Reaching the threshold through that increment does not promote it in the
  same collection. An age already at or above the threshold, collector policy or insufficient
  survivor space can instead cause promotion to old. `MaxTenuringThreshold` bounds the
  threshold (15 default in the tested build); it does not guarantee survivor occupancy or
  successful promotion when old space is unavailable.
  Do not project these flags or header-age mechanics onto ZGC or Shenandoah.
- **Premature promotion** can occur when a lowered threshold or insufficient survivor space
  moves soon-to-die objects into old. Survivor-space overflow can promote an object below
  the age threshold. `-Xlog:gc+age=trace` prints the computed threshold each
  pause for applicable collectors. A threshold below the maximum is normal adaptive policy,
  not proof of harmful promotion; correlate survival, promoted bytes and old pressure.
- **Promotion is one-way.** Old is collected by a mixed collection (G1), a major cycle
  (generational ZGC/Shenandoah) or a full collection (Serial, Parallel). Their frequency depends
  on workload and collector policy. Remembered old-to-young edges add young-scan work,
  but old objects without relevant edges need not be revisited each time.
- **Nepotism.** A dead object in old that references young objects still has its card
  represented in remembered metadata, so a partial young collection can retain its referents
  without proving the old source reachable. This may prolong young lifetimes and lead to
  promotion; neither a permanently dirty card nor one promoted node per pause is required.
  Confirm the graph and reclamation behavior rather than inferring nepotism from timings alone.

G1 normally adapts young size to its pause goal. `-Xmn` is accepted and fixes young bounds,
constraining that adaptation; it is not a general tuning shortcut. A lower pause goal can
shrink Eden and raise frequency/promotion, but observe the result. See g1-tuning-for-slo.

## Where the generational hypothesis fails

The hypothesis — most objects die young — is empirical. It breaks in four recognisable
shapes:

- **Caches.** Long residence times can shift entries and eviction churn into old; bounded
  short-lived entries can still die young. Measure residence and survival.
- **Object pools.** Retained pooled objects can add remembered edges when referencing young
  data; primitive-only payloads and cleared references have different costs.
- **High downstream latency.** By `N = λ × R`, slower dependencies mean more requests in
  flight, so more per-request objects are alive at any young collection. GC gets more
  expensive without anything in the JVM having changed.
- **Long-lived batches.** A request that assembles a large result before writing it, or
  a consumer that holds a batch of messages until the batch commits, keeps per-request
  objects alive across several young pauses and promotes them wholesale.

For the third case, verify stable throughput, residence time and admission limits before
attributing live-data growth to the dependency; investigate its owner when evidence supports it.

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
| `Evacuate Collection Set` → `Object Copy`               | survivor objects/bytes, graph and bandwidth                             | retained data, mixed old work or reduced CPU/bandwidth                                           |
| `Evacuate Collection Set` → `Termination`               | imbalance between GC workers                                            | one huge object graph on one worker, too many workers for the work                               |
| `Post Evacuate Collection Set` → `Reference Processing` | discovered `Reference` objects                                          | soft/weak/final/phantom references in the collection set — see below                             |
| `Post Evacuate Collection Set` → `Weak Processing`      | JNI weak handles, string table, resolved-method table entries           | many interned strings or classes being unloaded                                                  |
| `Other`                                                 | serial bookkeeping                                                      | rarely the problem; if it is, `-Xlog:gc+phases=trace` splits it further                          |

Two readings this table makes immediate:

- With **few survivors**, inspect roots/cards/references plus scheduling, faults and worker
  balance. Young sizing can change the collection set and phase work; it is not a universal fix.
- `Object Copy` dominating is a hypothesis about evacuation cost, not proof of more survival.
  Compare survivor bytes/count, object shape, mixed old work and CPU/bandwidth before attributing it.

Serial and Parallel print the same information with fewer phases; the equivalent JFR
events are `jdk.GCPhasePause` and its level-1/2 children, `jdk.G1EvacuationYoungStatistics`
and `jdk.GCReferenceStatistics` (all present in `jfr metadata` on 25). The per-region
detail — remembered sets, refinement, the collection-set choice — is g1-internals.

## Write barriers

Generational and regional collectors need to know about references that cross their
boundary. Barriers are a common mechanism; compiler proofs can eliminate some barriers,
fast paths differ by GC phase, and not every concurrent collector uses load barriers.

| Collector            | Barrier on store                                                                                                                                                                                                                           | Barrier on load                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Serial, Parallel     | Card mark: one byte per card (`GCCardSizeInBytes` 512) set dirty, unconditionally (`UseCondCardMark` false)                                                                                                                                | none                                                  |
| G1 (through 25)      | SATB pre-barrier enqueuing the overwritten value while marking is active, plus a post-barrier that filters same-region and null stores, dirties the card and enqueues it for the refinement threads (`G1ConcRefinementThreads`, ergonomic) | none                                                  |
| G1 (JDK 26, JEP 522) | Same pre-barrier; the post-barrier writes to a second card table and refinement scans it, removing the queue and its memory fences — JEP 522, integrated in 26 (not verified here)                                                         | none                                                  |
| ZGC (generational)   | SATB marking and remembered-set maintenance (JEP 439)                                                                                                                                                                                      | remove colour metadata and repair relocated addresses |
| Shenandoah           | SATB pre-barrier; in `ShenandoahGCMode=generational` (JEP 521) a card-marking post-barrier as well                                                                                                                                         | Load-reference barrier resolving forwarded objects    |

This can change the throughput of the same code under different collectors even
outside pauses: required fast paths can remain, while slow-path work is conditional.
It is also why a benchmark of reference-heavy code — pointer chasing, collections of
collections — separates the collectors more than a numeric one does. Measure before
attributing a throughput gap to the collector; the split by reads versus writes is
zgc-generational-internals and the LRB is epsilon-and-shenandoah-internals.

## Allocation on the fast path

TLAB fast allocation commonly bumps a pointer, with initialization and checks. Refill timing
depends on collector, allocation space and memory commitment; it is not guaranteed sub-microsecond.
Slow allocation can include GC, pacing/stalls, commitment, page faults, synchronization and zeroing.

An object that does not fit the remaining TLAB may trigger refill or allocation outside it,
depending on the remaining waste and collector. Large-array zeroing can be expensive and
some VM/intrinsic paths have sparse polls (references/safepoints.md); optimized initialization
need not always zero the whole object in a separate step. `-Xlog:gc+tlab=debug` prints refill/waste;
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

under `-Xlog:gc+humongous=debug`. A humongous allocation can request concurrent marking,
but each allocation need not trigger a pause or that cause. Three costs follow from the mechanism:

- **Waste.** A humongous object owns whole regions; that 530 KB array occupies 1 MB, and
  a 1.1 MB one occupies two. Region size grows with the heap (4 MB at the 8 GB default on
  this host; `-Xlog:gc+init` prints it), so the same object may or may not be humongous
  in different pods.
- **Fragmentation.** The regions must be contiguous. A heap with plenty of free regions
  can still fail a humongous allocation and force a full collection to compact.
- **Reclaim timing.** Eager reclaim considers eligible primitive arrays with sufficiently small
  remembered sets, subject to tracking and pinning checks. A candidate is not proof of death:
  evacuation can discover references and retain it. Other objects may require marking/full
  reclamation. Repeated allocation can drive marking requests; confirm the logged cause.

```bash
grep -i humongous gc.log
```

Frequency alone does not establish a problem. If reclaim, headroom and application outcomes
are adequate, retain the existing design. When measured pressure warrants a change, compare
allocation size/lifetime (for example buffer growth or bounded chunking) with relevant
collector tradeoffs. Raising region size to make objects ordinary is a g1-tuning-for-slo
decision with its own costs, not a universal fix or a forbidden alternative.

## Reference processing

`SoftReference`, `WeakReference`, `FinalReference` (finalizers) and `PhantomReference`
are discovered and processed according to collector-specific phases; concurrent collectors
can move processing outside pauses. G1 pause logs can show `SoftWeakFinalRefsPhase`,
`KeepAliveFinalRefsPhase`, `PhantomRefsPhase`. `ParallelRefProcEnabled` is true for G1/Parallel
but false for Serial in the tested 25 build. Finalization can delay reclamation and resurrect
objects; it does not guarantee one extra collection or exactly two copies. When
`Reference Processing` dominates, a reference-heavy structure is one candidate — a
`WeakHashMap`, a soft-reference cache, a finalizer-backed resource.
Compare counts, processing phases and available CPU before attributing a long duration to
more references. The levels,
when each is cleared and the leak catalogue are java-reference-types-and-leaks, and the
count per type is `jdk.GCReferenceStatistics`.

## What the concurrent collectors trade

ZGC and Shenandoah do their marking and relocation while the application runs, so their
normal stop-the-world pauses avoid much of the work scaling with heap/live-set size, but are
not a hard bound on latency
(ZGC scans thread stacks concurrently since JEP 376, JDK 16). The mechanism has four
costs that a pause-time comparison hides:

- **Barrier work** on relevant reference accesses, with conditional slow paths and compiler optimizations.
- **Concurrent CPU.** GC threads run alongside the mutators; on a pod with one or two
  CPUs they are the same cores. Thread counts and the throughput consequence are
  jvm-gc-tuning.
- **Headroom.** The cycle must finish before the application exhausts the free memory it
  started with. `allocation rate × cycle time` is a first budget estimate, not a sufficient
  sizing formula: account for relocation reserves, bursts and reclaim timing. Lose
  the race and the mutators block on allocation — ZGC's `Allocation Stall`
  (`jdk.ZAllocationStall`), Shenandoah's degenerated or full GC. Operating that boundary
  is zgc-and-shenandoah.
- **Floating garbage**, as above, which makes their post-cycle occupancy a poor estimate
  of the live set.

These are candidate explanations for throughput loss or stalls after a collector change,
not grounds to exclude a regression or misconfiguration without evidence.

## The JDK 25 collector landscape

| Collector  | Pause depends on                                                                       | Generational                           | Status on 25                                                                                                      | Design point                                        |
| ---------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Serial     | young: survivors; full: live data and heap                                             | yes                                    | product; ergonomic choice observed with one CPU on JDK 25                                                         | tiny heaps, single core                             |
| Parallel   | young: survivors; full: live data and heap                                             | yes                                    | product                                                                                                           | throughput, batch, no latency SLO                   |
| G1         | young: survivors, roots, cards and phase overhead                                      | yes (regions)                          | product; server-class default on tested 25; JEP 523 Delivered for 27, not tested here                             | balanced default                                    |
| ZGC        | normal pauses: primarily roots and bounded coordination; fallback behavior differs     | yes, by definition (JEP 490)           | product                                                                                                           | large heaps, latency SLO                            |
| Shenandoah | normal pauses: primarily roots and bounded coordination; degenerated/full paths differ | generational mode is product (JEP 521) | product in builds that ship it (Temurin does); `ShenandoahGCMode` defaults to `satb` on the verified JDK 25 build | large heaps, latency SLO                            |
| Epsilon    | never collects                                                                         | no                                     | experimental (JEP 318); requires UnlockExperimentalVMOptions                                                      | finite allocation windows; all allocations must fit |
| CMS        | —                                                                                      | —                                      | **removed** in JDK 14 (JEP 363); 25.0.3 refuses `-XX:+UseConcMarkSweepGC` with `Unrecognized VM option`           | —                                                   |

Baseline corrections; 25 behavior was checked on 25.0.3, later releases use primary metadata:

- `-XX:+ZGenerational` **no longer selects a mode** (JEP 490, JDK 24). ZGC is generational,
  period. Carrying the flag forward is an upgrade failure in waiting: 25.0.3 starts and
  warns `Ignoring option ZGenerational; support was removed in 24.0`, which is HotSpot's
  _obsolete_ stage; the flag is scheduled to _expire_ in 26, where an unrecognised option
  stops the JVM (see the lifecycle in references/diagnosis-and-versions.md).
- Generational Shenandoah is product (JEP 521), not experimental. On the verified JDK 25
  build, `-XX:+UseShenandoahGC` alone runs `satb` mode. As of 2026-09-05,
  [JEP 535](https://openjdk.org/jeps/535) (JDK-8379682) is Targeted for JDK 28 to change
  the default; it is not delivered or verified on this runtime.
- `-XX:+UseCompactObjectHeaders` is a product flag on 25 (JEP 519) and **off by default**.
  It changes layout and can affect allocation/GC costs; verify the actual object graph and phases.
- `-XX:+UseBiasedLocking` is gone (deprecated JDK 15, JEP 374; removed JDK 18, JDK-8256425):
  25.0.3 refuses it. Biased-lock revocation is no longer a safepoint cause.

## Primary sources

- [JLS 25 section 12.6.1](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.6.1),
  [System GC contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/System.html)
  and [AutoCloseable](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/AutoCloseable.html):
  reachability, nondeterministic reclamation and explicit resource closure are separate contracts.
- [Serial young sizing on JDK 25.0.3](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/serial/defNewGeneration.cpp)
  and [Parallel adaptive sizing](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/parallel/psScavenge.cpp):
  shared flags do not imply shared collector policies.
- Promotion paths in [G1](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1ParScanThreadState.cpp),
  [Serial](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/serial/defNewGeneration.cpp)
  and [Parallel](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/parallel/psPromotionManager.inline.hpp):
  the age comparison precedes the increment for objects retained in young; survivor capacity also matters.
- [G1 mechanisms on JDK 25](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-g1-garbage-collector1.html)
  and [G1 tuning](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-garbage-collector-tuning.html):
  adaptive young sizing, marking versus reclamation and evacuation/humongous behavior.
- [JEP 439](https://openjdk.org/jeps/439): generational ZGC store/load responsibilities,
  aging and inter-generational retention.
- [JDK 25u G1 source](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/g1/g1CollectedHeap.cpp):
  eager-reclaim candidacy and allocation paths; verify the matching tag for a deployed build.
