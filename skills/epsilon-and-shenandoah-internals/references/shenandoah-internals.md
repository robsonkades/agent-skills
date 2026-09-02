# Shenandoah internals

Facts marked "verified" were executed on Temurin 25.0.3 (Windows, 24 CPUs), which ships
Shenandoah; the rest is read from the JDK 25 GA sources named in brackets or from the JEP or
JBS issue cited. Oracle's own JDK builds do not include Shenandoah at all and reject the flag
with `Option -XX:+UseShenandoahGC not supported` (Red Hat, "Not all OpenJDK 12 builds include
Shenandoah", 2019; not verified here) — Temurin, Red Hat, Corretto and other OpenJDK-based
builds do. Check `java -XX:+UseShenandoahGC -version` before anything else.

## The Load Reference Barrier

Shenandoah has used the **Load Reference Barrier** since JDK 13 (JDK-8221766). It replaced
the Brooks-pointer scheme of JDK 12, and JDK-8224584 (also JDK 13) removed the forwarding
word that scheme needed. Two consequences that older material still gets wrong:

- **There is no extra word per object.** During evacuation the forwarding pointer is encoded
  in the object's mark word (`ShenandoahForwarding::get_forwardee_raw_unchecked` reads
  `obj->mark()`, tests `is_marked()` and decodes the pointer [`shenandoahForwarding.inline.hpp`]).
  Verified: `java.lang.Object` costs 16 bytes under `-XX:+UseShenandoahGC`, exactly as under
  G1, in both modes; 8 bytes with `-XX:+UseCompactObjectHeaders`, which Shenandoah supports
  on 25 (JEP 519). A footprint model that charges Shenandoah 8 bytes per object is a JDK 12
  model.
- **The barrier is conditional.** The runtime form [`shenandoahBarrierSet.inline.hpp`]:

```c++
inline oop ShenandoahBarrierSet::load_reference_barrier(oop obj) {
  if (!ShenandoahLoadRefBarrier) return obj;
  if (_heap->has_forwarded_objects() && _heap->in_collection_set(obj)) {
    oop fwd = resolve_forwarded_not_null(obj);          // mark word
    if (obj == fwd && _heap->is_evacuation_in_progress()) {
      return _heap->evacuate_object(obj, Thread::current());  // mutator copies it
    }
    return fwd;
  }
  return obj;
}
// the (decorators, obj, load_addr) overload then heals the slot it loaded from:
//   if (load_addr != nullptr && fwd != obj) atomic_update_oop(fwd, load_addr, obj);
```

The compiled form C2 emits after every reference load has the same shape
[`c2/shenandoahSupport.cpp`, `pin_and_expand`]: load the thread-local `gc_state` byte and
test `HAS_FORWARDED` (or `HAS_FORWARDED | WEAK_ROOTS` for weak and phantom loads); only if
set, for strong loads, load the byte for the object's region from
`ShenandoahHeap::in_cset_fast_test_addr()`; only if the region is in the collection set call
the stub — `ShenandoahRuntime::load_reference_barrier_strong` / `_strong_narrow` / `_weak` /
`_weak_narrow` / `_phantom` / `_phantom_narrow` [`shenandoahRuntime.hpp`]. Outside a cycle
the barrier is a byte load and a predicted branch; between Final Mark and Final Update Refs
it also costs a byte load per reference; only references into the collection set take the
slow path, and those are taken **once** per slot because the CAS heals the slot.

Three things follow for diagnosis:

- **The slow path is mutator evacuation.** A thread that loads a not-yet-copied object in the
  collection set copies it itself. That is where the barrier's latency lands: in the
  application thread that touched the object, during `Concurrent evacuation`, with no pause
  line in the log. `ShenandoahEvacReserve` (5%, experimental) is the space kept for these
  copies; exhausting it is an evacuation failure, which is one route to a degenerated cycle.
- **It is a load barrier.** Writes carry other barriers: during marking (`gc_state &
MARKING`) a reference store first records the previous value for SATB —
  `ShenandoahRuntime::write_ref_field_pre`, leaf name `shenandoah_wb_pre` — and in
  generational mode every reference store also marks a card. Calling the LRB a read barrier
  understates it only by name; calling it a write barrier searches the wrong frames.
- **Arraycopy and clone have their own barriers** (`ShenandoahRuntime::arraycopy_barrier_oop`,
  `clone_barrier`, leaf names `fast_arraycopy` and `shenandoah_clone`), which is why an
  `Object.clone()`- or `System.arraycopy`-heavy path can show barrier cost that a per-load
  model does not predict.

## Cost shape, against ZGC

| Mechanism                 | Fast path                                                                                               | Slow path                                                           | Memory                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| LRB (Shenandoah, JDK 13+) | Thread-local `gc_state` byte test; a second byte test against the cset table when forwarding is live    | Resolve via the mark word, or copy the object; CAS-heal the slot    | No per-object word; forwarding lives in the mark word. Compressed oops and compact headers both work (verified)        |
| Load barrier (ZGC)        | Test the loaded pointer's colour bits against the thread's bad mask                                     | Mark, relocate or remap through the forwarding table; heal the slot | Colour bits in the pointer: 64-bit uncompressed references only, so 8-byte references on heaps where Shenandoah uses 4 |
| Generational extras       | Shenandoah: card mark on every reference store. ZGC: store barrier maintaining per-page remembered sets | —                                                                   | Card table (512-byte cards, `GCCardSizeInBytes`) versus ZGC's remembered-set structures                                |

Both collectors pay a conditional load barrier whose fast path is a load and a branch; the
structural difference is where the state lives (a thread-local byte and a region table versus
bits in every pointer) and what the slow path does. The footprint difference that survives
measurement is the reference width: Shenandoah keeps compressed oops below 32 GB of heap
(verified `Compressed Oops: Enabled (32-bit)` in `gc+init`), ZGC cannot (verified:
`-XX:+UseZGC` sets `UseCompressedOops=false` ergonomically). Which barrier costs
more on a given workload is a measurement — the cost is a function of reference-load density,
of how much of the heap is in the collection set while it is touched, and for generational
mode of store density — not a property of the collector.

## Isolating barrier cost

```bash
asprof -e cpu -d 30 -o flamegraph -f cpu.html <pid>
```

Frames that are the barrier (JDK 25 symbol names, from `shenandoahRuntime.hpp`):

| Frame                                                        | What it is                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `ShenandoahRuntime::load_reference_barrier_strong[_narrow]`  | LRB slow path from compiled code; below it `ShenandoahHeap::evacuate_object` is mutator evacuation |
| `ShenandoahRuntime::load_reference_barrier_weak`, `_phantom` | The same for `Reference.get` and similar                                                           |
| `ShenandoahRuntime::write_ref_field_pre`                     | SATB pre-write barrier slow path (buffer full or first hit)                                        |
| `ShenandoahRuntime::arraycopy_barrier_oop`, `clone_barrier`  | Bulk barriers                                                                                      |
| `ShenandoahBarrierSet::load_reference_barrier`               | The runtime (interpreter / C++) path, not the compiled one                                         |

`ShenandoahBarrierSet::need_load_reference_barrier` and `need_keep_alive_barrier` exist but
are compile-time predicates the JIT consults when deciding whether to emit a barrier
[`shenandoahBarrierSet.hpp`]; they never appear on a mutator stack, and searching a flame graph
for them finds nothing.

The fast path never has a frame: it is inlined into the compiled method and its cost is
attributed to the Java frame that did the load. So the barrier's cost has two components with
two measurements. Slow-path cost is the sum of the frames above, and is mostly evacuation
while a cycle is between Final Mark and Final Update Refs. Fast-path cost is a diff: the same
workload under `-XX:+UseParallelGC` or Epsilon versus Shenandoah, with the GC threads' CPU
subtracted (`-Xlog:gc+stats` gives per-phase wall time and parallelism). Attributing the
fast-path cost from a profile alone is not possible on a release build. Symbols do change
between releases — confirm against the build in use before the incident write-up.

## The phase sequence

Verified on 25.0.3 with `-Xlog:gc` in `satb` mode. The `(unload classes)` suffix marks a
cycle that unloads classes; generational mode replaces it with `(Young)` or `(Old)`.

```
Concurrent reset                     concurrent — clear marking bitmaps, reset SATB
Pause Init Mark                      STW — sets gc_state MARKING, scans nothing else
Concurrent marking roots             concurrent — thread stacks, VM roots
Concurrent marking                   concurrent — SATB marking; class unloading follows
Pause Final Mark                     STW — drain SATB, choose the collection set,
                                     set HAS_FORWARDED and EVACUATION
Concurrent thread roots              concurrent — evacuate roots on thread stacks
Concurrent weak references           concurrent — reference processing
Concurrent weak roots                concurrent
Concurrent class unloading           concurrent (only with unload classes)
Concurrent cleanup  76M->76M(256M)   concurrent — free immediately-garbage regions
Concurrent strong roots              concurrent
Concurrent evacuation                concurrent — copy the cset; mutators copy what they touch
Concurrent Init Update Refs          concurrent
Pause Init Update Refs               STW, tens of µs
Concurrent update references         concurrent — rewrite every reference to cset objects
Concurrent update thread roots       concurrent
Pause Final Update Refs              STW — clear HAS_FORWARDED, recycle the cset regions
Concurrent cleanup  79M->80M(256M)   concurrent
Concurrent reset after collect       concurrent
```

Two shapes that are not errors:

- **A cycle with no evacuation.** When immediate garbage (wholly empty regions) is at least
  `ShenandoahImmediateThreshold` (70%) of the garbage found, the cycle ends after
  `Concurrent Final Roots` and `Concurrent cleanup` with no evacuation or update-refs phases
  (`ShenandoahImmediateThreshold` description; verified — 567 of 569 cycles in a
  short-lived-garbage run took the shortcut). A log with few `Concurrent evacuation` lines is
  a workload whose garbage dies by region, not a broken collector.
- **Pauses that are all synchronisation.** Verified pause lengths on a 256 MB heap were
  0.03–0.11 ms; on production heaps they stay in low milliseconds because none of them scans
  the heap. When a Shenandoah pause is long, the cause is almost always the safepoint —
  time-to-safepoint, a thread spinning in a counted loop, a JNI critical section — which is
  the domain of `pause-attribution`, not of Shenandoah's thresholds.

## Generational mode

| Milestone                              | JEP     | Status                                                                                | JDK          |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------- | ------------ |
| Generational Shenandoah (experimental) | JEP 404 | Delivered; required `-XX:+UnlockExperimentalVMOptions` (per JEP)                      | 24           |
| Generational Shenandoah                | JEP 521 | Delivered; **product**, no unlock (verified on 25.0.3)                                | 25           |
| Generational mode by default           | JEP 535 | **Targeted** to JDK 28 per jdk-dev; also deprecates non-generational mode for removal | 28 (planned) |

```bash
# generational, product on JDK 25 — explicit opt-in
java -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -jar app.jar

# without that flag: single-generation ("satb"), verified default on 25.0.3
java -XX:+UseShenandoahGC -jar app.jar

# confirm what is running
java ... -Xlog:gc+init | grep -E "Mode:|Heuristics:"      # Mode: Generational / Snapshot-At-The-Beginning (SATB)
jcmd <pid> VM.flags -all | grep -E "ShenandoahGCMode|ShenandoahGCHeuristics"
```

Product describes maturity and official support; default describes what runs when nothing is
specified. They are independent axes until JEP 535 ships.

The heap is partitioned by region into young and old; the split is adaptive between
`ShenandoahMinYoungPercentage` (20) and `ShenandoahMaxYoungPercentage` (100), and the log
reports each move (`Transfer 1 region(s) from Young to Old`, `Forcing transfer of …`).
Old-to-young references are tracked through a **card-table remembered set**: `gc+init`
prints `CardTable entry size: 512` (verified; `GCCardSizeInBytes`, product), and
`ShenandoahCardBarrier` — a diagnostic flag the mode sets to `true` itself (verified) — turns
on the post-write barrier that dirties the card of every reference store. A young cycle adds
`Concurrent remembered set scanning` and scans dirty cards instead of old regions.

The LRB cannot serve this purpose. It resolves a forwarding pointer on a load and says nothing
about generations. The old-to-young relation can only be captured when the reference is
**written** — waiting for the next read would be too late, and for a reference written and
never read again it would never happen at all.

Old cycles are separate and rarer: `Trigger (Old): Old has overgrown, live at end of previous
OLD marking: …` starts old marking, which young cycles may pre-empt
(`ShenandoahAllowOldMarkingPreemption`, diagnostic, true); `Pause Final Mark (Old)` and
`Coalescing and filling (Old)` are its visible phases, and old regions are then evacuated
piecemeal inside young cycles (`Chosen CSet evacuates young: …, old: …`, bounded by
`ShenandoahOldEvacRatioPercent`, 75). Tenuring is adaptive by age cohort
(`ShenandoahGenerationalAdaptiveTenuring`, ages 1–15). All verified as log lines and flags on
25.0.3.

| Aspect                               | `satb` (default single-generation)  | `generational` (opt-in, JEP 521)                                   |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ |
| Treats young and old alike           | Yes                                 | No — frequent young cycles, separate old marking                   |
| Barriers                             | LRB, SATB pre-write during marking  | LRB, SATB pre-write, card-mark post-write on every reference store |
| Extra memory                         | None per object                     | Card table plus remembered-set bookkeeping                         |
| Work per cycle under high allocation | Marks every live object every cycle | Young cycles mark young plus dirty cards                           |
| Maturity on JDK 25                   | Product since JDK 15 (JEP 379)      | Product since JDK 25, becomes default in 28 (JEP 535, targeted)    |

Among the three generational region-based collectors, Shenandoah's remembered set is
structurally the closest to G1's: a card table with fixed card size, scanned during young
cycles. ZGC's is per page with double buffering between the set being consumed by marking
and the mutations arriving in the same cycle (`zgc-generational-internals`).

## Triggers, the budget, and pacing

The `adaptive` heuristic decides when a cycle starts in `ShenandoahAdaptiveHeuristics::
should_start_gc` [`heuristics/shenandoahAdaptiveHeuristics.cpp`], in this order:

1. `available < ShenandoahMinFreeThreshold% × max capacity` (10) → `Trigger: Free (…) is
below minimum threshold (…)`. Always, in every phase.
2. During learning — the first `ShenandoahLearningSteps` (5) cycles, and **again after any
   degenerated or full GC** (flag description) — `available < ShenandoahInitFreeThreshold% ×
capacity` (70) → `Trigger: Learning 1 of 5. Free (176M) is below initial threshold (179M)`
   (verified line).
3. After learning, from the sampled allocation rate and the history of cycle times:
   `avg_cycle_time × avg_alloc_rate > allocation_headroom`, where headroom is `available`
   minus `ShenandoahAllocSpikeFactor`% (5) of capacity minus a penalty accumulated from past
   degenerated cycles; `avg_cycle_time` carries a margin of `_margin_of_error_sd` standard
   deviations. A separate spike detector fires when the current rate is an outlier. Every
   degenerated cycle raises both the margin and the spike threshold by 0.1 SD, so the
   heuristic triggers earlier after failing.
4. `ShenandoahGuaranteedGCInterval` (5 min) forces a cycle in idle periods.

The learning-phase arithmetic is the one worth doing by hand, because it is the budget the
collector has before it knows anything:

```
H   = Xmx (soft max if set)
IFT = ShenandoahInitFreeThreshold (%, default 70)
MFT = ShenandoahMinFreeThreshold  (%, default 10)
A   = sustained allocation rate (bytes/s)
C   = real duration of the concurrent cycle

    A × C <= (IFT − MFT)% × H       C_max = (IFT − MFT) × H / (100 × A)
```

Worked: `H = 8192 MB`, defaults give a budget of `60% × 8192 MB = 4915 MB`. At
`A = 500 MB/s`, `C_max ≈ 9.8 s` — comfortable if the measured concurrent cycle runs 1–3 s.
At a peak of `A = 3 GB/s`, `C_max ≈ 1.6 s`, and a cycle still taking 2–3 s **will** end in a
degenerated pause. Cycle duration depends on live set, heap size and GC thread count, not on
the allocation rate, so it does not shrink to meet the shrinking budget. After learning, the
adaptive trigger sizes the budget to the observed `C` with margin, so the steady-state
question is whether `C × A` plus the spike allowance fits in the heap at all.

This is a **time** constraint. The **capacity** constraint is separate: at Final Mark the
collection set is bounded so that its live data fits into the free set with
`ShenandoahEvacWaste` (1.2) slack, and `ShenandoahEvacReserve` (5% of heap) is withheld for
evacuation (flag descriptions). A heap too small for its live set shows up as small
collection sets (`Adaptive CSet Selection. … Max Evacuation: …` shrinking), rising `humongous
waste` in `At end of GC:`, and full GCs — and no threshold fixes it. Do not quote a fixed
multiplier of the live set as "the" requirement; read `At end of GC: … available:` and the
CSet lines instead.

A legacy `-XX:ShenandoahInitFreeThreshold=35` halves the learning budget against the default
(`25%` of the heap against `60%`). For a spiky workload that is backwards — spikes are when
more budget is needed. Raise it instead. Both threshold flags are **experimental**: verified,
`-XX:ShenandoahInitFreeThreshold=80` without `-XX:+UnlockExperimentalVMOptions` aborts the
launch.

### The pacer

`ShenandoahPacing` (experimental, **true** by default) is the mechanism between "the cycle is
falling behind" and "degenerate". While a cycle runs, each phase publishes a tax rate
(`Pacer for Mark. Expected Live: 26214K, Free: 176M, Non-Taxable: 18022K, Alloc Tax Rate:
0.2x`, verified in `gc+ergo`), and an allocating thread that gets ahead of GC progress is
stalled in the allocation path for up to `ShenandoahPacingMaxDelay` (10 ms) per episode. The
stall is invisible in the pause lines. It is reported only in `-Xlog:gc+stats`, per cycle:

```
Pacing                            28965 us
Allocation pacing accrued:
     29 of    56 ms ( 51.4%): main
```

Verified under an overloaded 200 MB heap: the main thread spent 51% of a cycle's wall time
paced, with **zero** degenerated cycles in the log. The same load with
`-XX:-ShenandoahPacing` produced hundreds of `Pause Degenerated GC` lines. So a Shenandoah
service whose latency rises with no pause in the log is, first, a pacing question, and the
diagnosis is `gc+stats`, not `gc`. Disabling the pacer converts hidden allocation stalls into
visible STW pauses — useful for a diagnosis run, a trade to measure before making it
permanent.

## Heuristics and modes

| `ShenandoahGCHeuristics` | Unlock needed                               | Trigger (flag description, JDK 25)                                                         | Use                                                                          |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `adaptive` (default)     | none                                        | Learning on `InitFreeThreshold`, then rate and spike prediction; `MinFreeThreshold` always | Production default; converges on the workload's real behaviour               |
| `static`                 | none (verified)                             | Free heap below the threshold; no learning, no adaptation                                  | Predictable load where `A` is measured and an auditable trigger is wanted    |
| `compact`                | none (verified)                             | Runs GC more frequently with deeper targets to free more memory; also shortens uncommit    | Constrained heap where footprint dominates throughput                        |
| `aggressive`             | `-XX:+UnlockDiagnosticVMOptions` (verified) | Runs GC continuously and evacuates everything                                              | Stress-testing the collector and correctness diagnosis only — not production |

| `ShenandoahGCMode` | Unlock needed                               | What it is                                                                                                                                                                             |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `satb` (default)   | none                                        | Single-generation concurrent mark–evacuate–update-refs                                                                                                                                 |
| `generational`     | none on 25 (verified); experimental on 24   | Young and old generations, card-table remembered set                                                                                                                                   |
| `passive`          | `-XX:+UnlockDiagnosticVMOptions` (verified) | No concurrent cycles and **no barriers** (`ShenandoahLoadRefBarrier`, `SATBBarrier`, `CASBarrier`, `CloneBarrier`, `CardBarrier` all `false`, verified); GC only on allocation failure |
| `iu`               | —                                           | Removed; `Unknown -XX:ShenandoahGCMode option` on 25 (verified)                                                                                                                        |

`passive` is not "the same cycle, world stopped": no heuristic ever triggers, so the log
contains only `Pause Degenerated GC (Outside of Cycle)` and `Pause Full` lines (verified —
640 and 23 of them in a short run), each started by an allocation failure and each doing a
whole mark–evacuate–update cycle STW. It does evacuate and compact. `ShenandoahDegeneratedGC`
(diagnostic, true) picks which of the two: set it `false` to measure full-GC cost in
isolation. Two uses follow: a problem that disappears under `passive` is in the concurrency
mechanism (LRB, SATB, card barrier) rather than in marking or evacuation; and a heap measured
under `passive` is the live set without floating garbage from overlapping cycles.

## Flags, with kinds

Defaults read with `-XX:+PrintFlagsFinal` on Temurin 25.0.3; ergonomic values change with
the machine. Experimental and diagnostic flags need their unlock flag **before** them on the
command line or the JVM refuses to start.

| Flag                                             | Default          | Kind         | Meaning                                                                                                                                                                                |
| ------------------------------------------------ | ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShenandoahGCMode`                               | `satb`           | product      | `satb`, `generational`, `passive` (diagnostic)                                                                                                                                         |
| `ShenandoahGCHeuristics`                         | `adaptive`       | product      | `adaptive`, `static`, `compact`, `aggressive` (diagnostic)                                                                                                                             |
| `ShenandoahInitFreeThreshold`                    | 70               | experimental | Learning-phase trigger, % of soft max heap                                                                                                                                             |
| `ShenandoahMinFreeThreshold`                     | 10               | experimental | Safety floor, every phase; young generation in generational mode                                                                                                                       |
| `ShenandoahLearningSteps`                        | 5                | experimental | Cycles spent learning, at start and after each degenerated or full GC                                                                                                                  |
| `ShenandoahAllocSpikeFactor`                     | 5                | experimental | Headroom reserved for spikes, % of heap                                                                                                                                                |
| `ShenandoahGuaranteedGCInterval`                 | 300000 ms        | experimental | Forced cycle in idle periods; 0 disables                                                                                                                                               |
| `ShenandoahPacing` / `ShenandoahPacingMaxDelay`  | true / 10 ms     | experimental | Allocation stalls before degeneration; max per episode                                                                                                                                 |
| `ShenandoahEvacReserve` / `ShenandoahEvacWaste`  | 5 / 1.2          | experimental | Space withheld for evacuation; slack factor bounding the collection set                                                                                                                |
| `ShenandoahDegeneratedGC`                        | true             | diagnostic   | Degenerate instead of going straight to full GC                                                                                                                                        |
| `ShenandoahFullGCThreshold`                      | 3                | experimental | Back-to-back degenerated cycles before a full GC                                                                                                                                       |
| `ShenandoahCriticalFreeThreshold`                | 1                | experimental | % free a recovery cycle must reach to count as progress                                                                                                                                |
| `ShenandoahNoProgressThreshold`                  | 5                | experimental | Consecutive no-progress full GCs before `OutOfMemoryError`                                                                                                                             |
| `ShenandoahImmediateThreshold`                   | 70               | experimental | % of garbage in empty regions above which the cycle skips evacuation                                                                                                                   |
| `ShenandoahGarbageThreshold`                     | 25               | experimental | % garbage a region needs to enter the collection set                                                                                                                                   |
| `ShenandoahUncommit` / `ShenandoahUncommitDelay` | true / 300000 ms | experimental | Return unused regions to the OS; disabled when `-Xms` = `-Xmx`                                                                                                                         |
| `ShenandoahRegionSize`                           | 0 (auto)         | experimental | Region size; auto targets `ShenandoahTargetNumRegions` (2048) between 256 KB and 32 MB                                                                                                 |
| `ShenandoahMinYoungPercentage` / `Max…`          | 20 / 100         | experimental | Bounds of the adaptive young-generation size                                                                                                                                           |
| `ShenandoahCardBarrier`                          | false → true     | diagnostic   | Set by generational mode; the post-write card mark                                                                                                                                     |
| `ShenandoahImplicitGCInvokesConcurrent`          | true (heuristic) | experimental | Internally requested GCs run concurrently                                                                                                                                              |
| `ExplicitGCInvokesConcurrent`                    | **true**         | product      | Shenandoah flips this on: `System.gc()` logs `Trigger: GC request (System.gc())` and runs a concurrent cycle; `-XX:-ExplicitGCInvokesConcurrent` makes it `Pause Full` (both verified) |
| `SoftMaxHeapSize`                                | = `MaxHeapSize`  | manageable   | The heuristics size thresholds from this; settable at run time with `jcmd VM.set_flag`                                                                                                 |
| `GCCardSizeInBytes`                              | 512              | product      | Card size for the generational remembered set                                                                                                                                          |

```bash
# basic production — adaptive heuristic, defaults implicit; -Xms = -Xmx disables uncommit
-XX:+UseShenandoahGC -Xmx8g -Xms8g -XX:+AlwaysPreTouch

# the same defaults made explicit: the thresholds are experimental, so the unlock is required
-XX:+UseShenandoahGC -Xmx8g -Xms8g \
  -XX:+UnlockExperimentalVMOptions \
  -XX:ShenandoahGCHeuristics=adaptive \
  -XX:ShenandoahInitFreeThreshold=70 -XX:ShenandoahMinFreeThreshold=10 \
  -XX:ShenandoahLearningSteps=5

# allocation-spiky workload: raise the initial threshold, do not lower it
-XX:+UnlockExperimentalVMOptions -XX:ShenandoahInitFreeThreshold=80 -XX:ShenandoahMinFreeThreshold=15

# generational — product, no unlock
-XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -Xmx8g -Xms8g

# diagnosis only: fully STW, no barriers
-XX:+UseShenandoahGC -XX:+UnlockDiagnosticVMOptions -XX:ShenandoahGCMode=passive -Xmx8g -Xms8g
```

Region size is derived from the heap (verified: 256 KB regions on a 256 MB heap, 4 MB on
8 GB — 2048 regions either way). Two things scale with it: an allocation larger than a region
is humongous and needs contiguous regions (`humongous waste` in `At end of GC:` is the cost),
and the maximum TLAB is one region (`TLAB Size Max: 256K`, verified) — a thread-per-request
service with many threads on a small heap refills TLABs far more often under Shenandoah than
under G1.

The adaptive heuristic self-calibrates after learning. Tuning the thresholds by hand is
justified mainly when the allocation profile changes faster than the heuristic can relearn —
seasonal peaks, traffic regime changes. Tuning without first measuring `A` is guessing.

## The two fallbacks

```
[0.057s][gc     ] Trigger: Handle Allocation Failure
[0.058s][gc,ergo] GC(7) Good progress for free space: 37376K, need 2048K
[0.058s][gc     ] GC(7) Pause Degenerated GC (Mark) 158M->123M(200M) 0.389ms

[0.166s][gc,ergo] GC(10) Bad progress for free space: 1280K, need 1638K
[0.166s][gc     ] GC(10) Degenerated GC upgrading to Full GC
[0.168s][gc     ] GC(10) Pause Degenerated GC (Outside of Cycle) 120M->120M(160M) 3.689ms
```

| Fallback                                                 | What happens [`shenandoahDegeneratedGC.cpp`]                                                                                                                                                                               | What it means                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Degenerated GC (Mark)`, `(Evacuation)`, `(Update Refs)` | An allocation failed while that concurrent phase was running (after pacing gave up). The cycle **resumes in STW from that phase**: finish marking, or finish evacuation, or finish updating references, then clean up      | The time constraint was violated: `C` exceeded the budget. Heuristic, thresholds, heap, GC threads, or allocation rate                                 |
| `Degenerated GC (Roots)`                                 | Failure during concurrent root marking; marking state is reset and marking **restarts** STW                                                                                                                                | Same as above, earliest point                                                                                                                          |
| `Degenerated GC (Outside of Cycle)`                      | Allocation failed between cycles — "heavy humongous fragmentation, or very low on free space". A **whole** mark–evacuate–update cycle runs STW                                                                             | Capacity or fragmentation, or the trigger fired too late; the only shape `passive` ever produces                                                       |
| `Degenerated GC upgrading to Full GC`                    | After a degenerated cycle, free space is still below `ShenandoahCriticalFreeThreshold` (`Bad progress …`). In `satb` mode one bad-progress degeneration upgrades immediately; in generational mode two consecutive ones do | Floating garbage or fragmentation the partial cycle cannot clear                                                                                       |
| `Pause Full`                                             | Also reached after `ShenandoahFullGCThreshold` (3) back-to-back degenerated cycles, or directly when `ShenandoahDegeneratedGC=false`. Sliding compaction of the whole heap, STW, from scratch                              | Structural capacity or fragmentation. No threshold fixes it; `ShenandoahNoProgressThreshold` (5) such cycles without progress is an `OutOfMemoryError` |

Every degenerated or full GC also restarts the learning phase (flag description), so the
next `ShenandoahLearningSteps` cycles trigger on `InitFreeThreshold` again — a burst of
degenerated cycles is followed by a period of earlier, more frequent cycles by design.

Reading a degenerated GC as "just increase the heap" skips the diagnosis: the degeneration
point names the phase, `Good/Bad progress` names the outcome, and the two constraints have
different fixes. The symptom table in `shenandoah-log-and-troubleshooting.md` walks them.

## Comparing Shenandoah with ZGC

Any comparison that does not state `ShenandoahGCMode` compares Shenandoah at a structural
disadvantage — without the generational hypothesis — against ZGC, which has had it as its only
mode since JEP 490 (JDK 24). The gap is widest exactly where such benchmarks tend to run: high
young allocation.

| Aspect                                   | ZGC (generational, only mode)               | Shenandoah `satb` (default)                                                              | Shenandoah `generational` (opt-in)              |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Barrier                                  | Conditional load barrier plus store barrier | Conditional LRB plus SATB pre-write                                                      | LRB, SATB pre-write, card-mark post-write       |
| Per-object memory                        | None; colour bits in the pointer            | None; forwarding in the mark word                                                        | None; card table on the side                    |
| Compressed oops                          | No — 64-bit references always               | Yes below 32 GB                                                                          | Yes below 32 GB                                 |
| Sensitive to the generational hypothesis | Yes, since JEP 439/474/490                  | No — every object treated alike                                                          | Yes — JEP 404/521                               |
| Mutator stall mechanism before STW       | Allocation stalls when GC falls behind      | Pacer (`ShenandoahPacing`)                                                               | Pacer                                           |
| Fallback                                 | Allocation stall, then OOM — no full GC     | Degenerated, then full                                                                   | Degenerated, then full                          |
| Maturity on JDK 25                       | Product                                     | Product since JDK 15, longest tested                                                     | Product since JDK 25, default from 28 (planned) |
| Availability (JDK 25 builds)             | Every OpenJDK build, Oracle's included      | OpenJDK vendor builds (verified: Temurin Windows x64); **absent from Oracle JDK builds** | Same                                            |

When a published benchmark concludes Shenandoah loses on throughput under high allocation, the
first question is which mode it ran. If it ran the default — which is what happens when no
extra flag is passed — the result may reflect the missing mode rather than a limit of the
collector. Re-run with `-XX:ShenandoahGCMode=generational` before generalising; and re-run
with `-Xlog:gc+stats`, because a run whose mutators were paced 30% of the time and a run
that degenerated twice are different results with the same throughput number.
