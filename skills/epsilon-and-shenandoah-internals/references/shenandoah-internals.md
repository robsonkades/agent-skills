# Shenandoah internals

Facts marked "verified" were executed on Temurin 25.0.3 (Windows, 24 CPUs), which ships
Shenandoah; the rest is read from the JDK 25 sources named in brackets or from the JEP or
JBS issue cited. GA and update behavior can differ, as the fallback section shows. Collector
inclusion is a build/platform choice, not guaranteed by a product JEP or vendor name alone.
Check `java -XX:+UseShenandoahGC -version` on the target binary before a workload experiment.

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

Where C2 retains a barrier (redundant barriers can be eliminated), it has this shape
[`c2/shenandoahSupport.cpp`, `pin_and_expand`]: load the thread-local `gc_state` byte and
test `HAS_FORWARDED` (or `HAS_FORWARDED | WEAK_ROOTS` for weak and phantom loads); only if
set, for strong loads, load the byte for the object's region from
`ShenandoahHeap::in_cset_fast_test_addr()`; only if the region is in the collection set call
the stub — `ShenandoahRuntime::load_reference_barrier_strong` / `_strong_narrow` / `_weak` /
`_weak_narrow` / `_phantom` / `_phantom_narrow` [`shenandoahRuntime.hpp`]. Outside a cycle
the barrier is a byte load and a predicted branch; between Final Mark and Final Update Refs
it also costs a byte load per reference; only references into the collection set take the
slow path. Healing reduces repeat work, but races, failed CAS and slot rewrites prevent a
once-per-slot guarantee.

Three things follow for diagnosis:

- **The slow path is mutator evacuation.** A thread that loads a not-yet-copied object in the
  collection set copies it itself. That is where the barrier's latency lands: in the
  application thread that touched the object, during `Concurrent evacuation`, with no pause
  line in the log. The evacuation reserve serves copies by GC workers and mutators; its
  exhaustion is not itself proof of evacuation failure. See the capacity constraint below
  for overflow borrowing and the resulting trade-off with allocation headroom.
- **It is a load barrier.** Writes carry other barriers: during marking (`gc_state &
MARKING`) a reference store first records the previous value for SATB —
  `ShenandoahRuntime::write_ref_field_pre`, leaf name `shenandoah_wb_pre` — and in
  generational mode reference stores also have a card-marking barrier, subject to compiler
  elimination where safe. Calling the LRB a read barrier
  understates it only by name; calling it a write barrier searches the wrong frames.
- **Arraycopy and clone have their own barriers** (`ShenandoahRuntime::arraycopy_barrier_oop`,
  `clone_barrier`, leaf names `fast_arraycopy` and `shenandoah_clone`), which is why an
  `Object.clone()`- or `System.arraycopy`-heavy path can show barrier cost that a per-load
  model does not predict.

## Cost shape, against ZGC

| Mechanism                                      | Fast path                                                                                                    | Slow path                                                                                                           | Memory                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| LRB (Shenandoah, JDK 13+)                      | Thread-local `gc_state` byte test; a second byte test against the cset table when forwarding is live         | Resolve via the mark word, or copy the object; CAS-heal the slot                                                    | No per-object word; forwarding lives in the mark word. Compressed oops and compact headers both work (verified) |
| Strong load barrier (generational ZGC, JDK 25) | Check the loaded pointer's metadata and produce a colorless pointer; generated shape depends on architecture | Relocate/remap and heal; ordinary marking moved to store barriers (JEP 439). Weak/reference paths have other duties | 64-bit uncompressed references, so 8-byte references where Shenandoah uses 4                                    |
| Generational extras                            | Shenandoah: card-marking store barrier. ZGC: store barrier with marking and per-page remembered-set duties   | —                                                                                                                   | Card table (512-byte cards by default, `GCCardSizeInBytes`) versus ZGC's remembered-set structures              |

Both collectors pay a conditional load barrier; the exact fast-path instructions depend on
architecture and compilation. Their state lives in different places: Shenandoah's thread-local
byte and region table versus ZGC's metadata in colored heap references. Shenandoah can use
compressed oops, typically with 8-byte object alignment below roughly 32 GiB; inspect effective
flags and layout rather than assuming a fixed heap-size boundary. The captured `gc+init`
reports `Compressed Oops: Enabled (32-bit)` for Shenandoah, whereas `-XX:+UseZGC` sets
`UseCompressedOops=false` ergonomically. Which barrier costs
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

The compiled fast path is attributed to the containing Java method. Count slow-path samples
once: summing nested barrier and evacuation frames double-counts them. Compare mutator and
GC-worker CPU separately. Parallel/Epsilon versus Shenandoah changes more than barriers;
subtracting GC phase wall time (even with parallelism) does not isolate fast-path CPU. Use
annotated assembly and controlled experiments for inlined instructions and report remaining
confounders. Confirm symbols against the target build.

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
- **Short normal-cycle pauses.** The reported 0.03–0.11 ms sample is not a production bound.
  Separate safepoint synchronization from work after threads stop; phase work, scheduling
  and fallback collection can matter. A long GC pause line does not prove slow
  time-to-safepoint; correlate `-Xlog:safepoint` (`pause-attribution`).

## Generational mode

| Milestone                              | JEP     | Status                                                                                 | JDK         |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------- | ----------- |
| Generational Shenandoah (experimental) | JEP 404 | Delivered; required `-XX:+UnlockExperimentalVMOptions` (per JEP)                       | 24          |
| Generational Shenandoah                | JEP 521 | Delivered; **product**, no unlock (verified on 25.0.3)                                 | 25          |
| Generational mode by default           | JEP 535 | Targeted to JDK 28, not delivered; also proposes deprecating satb (checked 2026-09-05) | 28 (target) |

```bash
# generational, product on JDK 25 — explicit opt-in
java -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -jar app.jar

# without that flag: single-generation ("satb"), verified default on 25.0.3
java -XX:+UseShenandoahGC -jar app.jar

# startup logs show active policy; flags can retain an ignored heuristic request
java ... -Xlog:gc+init | grep -E "Mode:|Heuristics:"      # Mode: Generational / Snapshot-At-The-Beginning (SATB)
jcmd <pid> VM.flags -all | grep -E "ShenandoahGCMode|ShenandoahGCHeuristics"
```

Product means experimental unlocking is no longer needed; vendor support is build-specific.
Default describes what runs when nothing is
specified. JEP 535 does not change the effective default of a JDK 25 installation.

The heap is partitioned by region into young and old; the split is adaptive between
`ShenandoahMinYoungPercentage` (20) and `ShenandoahMaxYoungPercentage` (100), and the log
reports each move (`Transfer 1 region(s) from Young to Old`, `Forcing transfer of …`).
Old-to-young references are tracked through a **card-table remembered set**: `gc+init`
prints `CardTable entry size: 512` (verified; `GCCardSizeInBytes`, product), and
`ShenandoahCardBarrier` — a diagnostic flag the mode sets to `true` itself (verified) — turns
on the post-write card barrier. C2 can skip known-null and eligible fresh-object initialization
stores; promotion preserves coverage by dirtying cards backing promoted objects
[`c2/shenandoahBarrierSetC2.cpp`, `post_barrier`]. A young cycle adds
`Concurrent remembered set scanning` and scans dirty cards instead of old regions.

The LRB cannot serve this purpose. Waiting for the next read cannot reliably record
old-to-young edges before young collection: a stored reference might never be read again.
The write barrier records mutator changes; collector operations such as promotion must also
preserve remembered-set coverage.

Old cycles are separate and rarer: `Trigger (Old): Old has overgrown, live at end of previous
OLD marking: …` starts old marking, which young cycles may pre-empt
(`ShenandoahAllowOldMarkingPreemption`, diagnostic, true); `Pause Final Mark (Old)` and
`Coalescing and filling (Old)` are its visible phases, and old regions are then evacuated
piecemeal inside young cycles (`Chosen CSet evacuates young: …, old: …`, bounded by
`ShenandoahOldEvacRatioPercent`, 75). Tenuring is adaptive by age cohort
(`ShenandoahGenerationalAdaptiveTenuring`, ages 1–15). All verified as log lines and flags on
25.0.3.

| Aspect                               | `satb` (default single-generation)  | `generational` (opt-in, JEP 521)                              |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------- |
| Treats young and old alike           | Yes                                 | No — frequent young cycles, separate old marking              |
| Barriers                             | LRB, SATB pre-write during marking  | LRB, SATB pre-write, card-mark post-write with safe omissions |
| Extra memory                         | None per object                     | Card table plus remembered-set bookkeeping                    |
| Work per cycle under high allocation | Marks every live object every cycle | Young cycles mark young plus dirty cards                      |
| Maturity on JDK 25                   | Product since JDK 15 (JEP 379)      | Product since JDK 25; JEP 535 targets default mode in JDK 28  |

Among the three generational region-based collectors, Shenandoah's remembered set is
structurally the closest to G1's: a card table with fixed card size, scanned during young
cycles. ZGC's is per page with double buffering between the set being consumed by marking
and the mutations arriving in the same cycle (`zgc-generational-internals`).

## Triggers, the budget, and pacing

The `adaptive` heuristic decides when a cycle starts in `ShenandoahAdaptiveHeuristics::
should_start_gc` [`heuristics/shenandoahAdaptiveHeuristics.cpp`], in this order:

1. `available < min_free_threshold()` → `Trigger: Free (…) is below minimum threshold (…)`.
   In single-generation mode this uses `ShenandoahMinFreeThreshold` (10%) and maximum capacity.
   It applies during and after learning when the heuristic is evaluated; it is not a
   continuously enforced floor inside every concurrent phase.
2. During learning — while the learned-cycle count is below `ShenandoahLearningSteps` (5) —
   `available < ShenandoahInitFreeThreshold% ×
capacity` (70) → `Trigger: Learning 1 of 5. Free (176M) is below initial threshold (179M)`
   (verified line).
3. If prior checks did not trigger (including during learning), from sampled rate and history:
   `avg_cycle_time × avg_alloc_rate > allocation_headroom`, where headroom is `available`
   minus `ShenandoahAllocSpikeFactor`% (5) of capacity minus a penalty accumulated from past
   degenerated cycles; `avg_cycle_time` carries a margin of `_margin_of_error_sd` standard
   deviations. A separate spike detector fires when the current rate is an outlier. Every
   degenerated cycle raises the margin and lowers the spike threshold by 0.1 SD (bounded), so the
   heuristic triggers earlier after failing.
4. `ShenandoahGuaranteedGCInterval` (5 min) forces a cycle in idle periods.

This single-generation learning headroom illustration assumes starting near IFT, constant consumption and no
intervening reclamation/pacing. It is not the implemented trigger equation or a hard
degeneration deadline: MFT is a trigger floor, not zero free space. This illustration assumes
soft and hard maxima match: the initial threshold uses soft capacity, whereas
`min_free_threshold()` uses maximum capacity on this baseline. When they differ, inspect
both bases instead of applying a single heap percentage. Generational mode uses
generation-specific capacity, available space and policy; do not substitute whole-heap
`Xmx` for a young-generation budget.

```
H   = Xmx (SoftMaxHeapSize = Xmx for this illustration)
IFT = ShenandoahInitFreeThreshold (%, default 70)
MFT = ShenandoahMinFreeThreshold  (%, default 10)
A   = sustained allocation rate (bytes/s)
C   = real duration of the concurrent cycle

    A × C <= (IFT − MFT)% × H       C_max = (IFT − MFT) × H / (100 × A)
```

Worked: `H = 8192 MB`, defaults give a budget of `60% × 8192 MB = 4915 MB`. At
`A = 500 MB/s`, `C_max ≈ 9.8 s` — comfortable if the measured concurrent cycle runs 1–3 s.
At a peak of `A = 3 GB/s`, the estimate is about 1.6 s: a 2–3 s cycle warrants investigation,
not a guaranteed fallback. Reclamation, pacing and actual starting headroom matter;
allocation/SATB work and CPU contention also affect cycle duration. After learning, the
adaptive trigger sizes the budget to the observed `C` with margin, so the steady-state
question is whether `C × A` plus the spike allowance fits in the heap at all.

This is a **time** constraint. The **capacity** constraint is separate: at Final Mark the
collection set is bounded so that its live data fits into the free set with
`ShenandoahEvacWaste` (1.2) slack, and `ShenandoahEvacReserve` (5% of heap) is withheld for
evacuation (flag descriptions). A heap too small for its live set shows up as small
collection sets, low actual free space and repeated failures. In single-generation adaptive
mode, `Max Evacuation = soft capacity × EvacReserve% / EvacWaste`; it is not a live free-space
gauge. `ShenandoahEvacReserveOverflow=true` by default permits attempts to borrow from the
mutator free set after reserved space runs out. The reserve serves GC-worker and mutator
copies; it is not a hard failure boundary. Borrowing can avoid evacuation failure at the cost
of application allocation headroom, and can still fail if usable space is unavailable.
Inspect actual allocation outcomes before diagnosing degeneration from the reserve alone.
No threshold creates space for an oversized live set. Do not quote a fixed
multiplier of the live set as "the" requirement; read `At end of GC: … available:` and the
CSet lines instead.

A legacy `-XX:ShenandoahInitFreeThreshold=35` reduces this model's headroom to about 42%
of its default (`25%` of the heap against `60%`). Raise it only when learning-cycle evidence
supports earlier starts, not as a universal spike remedy. Both flags are experimental: verified,
`-XX:ShenandoahInitFreeThreshold=80` without `-XX:+UnlockExperimentalVMOptions` aborts the
launch.

### The pacer

`ShenandoahPacing` (experimental, **true** by default) is the mechanism between "the cycle is
falling behind" and "degenerate". While a cycle runs, each phase publishes a tax rate
(`Pacer for Mark. Expected Live: 26214K, Free: 176M, Non-Taxable: 18022K, Alloc Tax Rate:
0.2x`, verified in `gc+ergo`), and an allocating thread that gets ahead of GC progress is
stalled against a `ShenandoahPacingMaxDelay` (10 ms) deadline per episode. Scheduling can
overshoot it and requests can encounter many episodes; it is not a request-latency bound. The
stall is invisible in the pause lines. `-Xlog:gc+stats` includes this accrued-time report:

```
Pacing                            28965 us
Allocation pacing accrued:
     29 of    56 ms ( 51.4%): main
```

The captured overloaded 200 MB example reports 51% paced for main with **zero** degenerated
cycles in the log. In both `jdk-25-ga` and `jdk-25.0.3+9`, `print_cycle_on` divides by
elapsed wall time since the previous report (since pacer construction for the first),
including inter-cycle gaps. It iterates currently present Java threads and resets their
counters; exited threads are absent, and thread totals can exceed 100% through overlap.
This is neither a request-time percentage nor a GC-cycle-only denominator. The same sample load with
`-XX:-ShenandoahPacing` produced hundreds of `Pause Degenerated GC` lines. So a Shenandoah
service whose latency rises with no pause has pacing as one hypothesis. Correlate the
report's interval and population with affected requests, mutator evacuation and non-GC
evidence. Disabling pacing may increase degeneration; it neither guarantees full recovery
nor removes every allocation stall. Any diagnostic toggle needs a bounded workload and
acceptance/recovery criteria; the sample is not a universal result.

## Heuristics and modes

The heuristic choices below apply to `satb`. JDK 25 generational mode supports only
`adaptive`; on the tested 25.0.3 build, requests for `static`, `compact` or `aggressive`
produce an ignored-option warning and still run Adaptive. `PrintFlagsFinal` can retain the
requested string. Inspect startup `gc+init` and warnings before interpreting a comparison or
tuning a heuristic; flag presence and successful startup do not prove it is active.

| `ShenandoahGCHeuristics` | Unlock needed                               | Trigger (flag description, JDK 25)                                                         | Use                                                                          |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `adaptive` (default)     | none                                        | Learning on `InitFreeThreshold`, then rate and spike prediction; `MinFreeThreshold` always | Production default; converges on the workload's real behaviour               |
| `static`                 | none (verified)                             | Free heap below the threshold; no learning, no adaptation                                  | Predictable load where `A` is measured and an auditable trigger is wanted    |
| `compact`                | none (verified)                             | Runs GC more frequently with deeper targets to free more memory; also shortens uncommit    | Constrained heap where footprint dominates throughput                        |
| `aggressive`             | `-XX:+UnlockDiagnosticVMOptions` (verified) | Runs GC continuously and evacuates everything                                              | Stress-testing the collector and correctness diagnosis only — not production |

| `ShenandoahGCMode` | Unlock needed                               | What it is                                                                                                                                                                                                |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `satb` (default)   | none                                        | Single-generation concurrent mark–evacuate–update-refs                                                                                                                                                    |
| `generational`     | none on 25 (verified); experimental on 24   | Young and old generations, card-table remembered set                                                                                                                                                      |
| `passive`          | `-XX:+UnlockDiagnosticVMOptions` (verified) | No concurrent cycles and **no barriers** (`ShenandoahLoadRefBarrier`, `SATBBarrier`, `CASBarrier`, `CloneBarrier`, `CardBarrier` all `false`, verified); STW GC on allocation failure or explicit request |
| `iu`               | —                                           | Removed; `Unknown -XX:ShenandoahGCMode option` on 25 (verified)                                                                                                                                           |

`passive` has no concurrent heuristic cycles. An allocation-pressure sample contained
`Pause Degenerated GC (Outside of Cycle)` and `Pause Full` lines (640 and 23), doing a
whole mark–evacuate–update cycle STW. It does evacuate and compact. `ShenandoahDegeneratedGC`
(diagnostic, true) picks which of the two: set it `false` to measure full-GC cost in
isolation. Explicit GC can also trigger collection: passive defaults
`ExplicitGCInvokesConcurrent=false`. A problem disappearing under passive suggests a timing
or collector interaction but does not identify a barrier bug; scheduling and collection
timing changed too. Occupancy can include uncollected garbage; use a defined post-collection
point to estimate live set.

## Flags, with kinds

Defaults read with `-XX:+PrintFlagsFinal` on Temurin 25.0.3; ergonomic values change with
the machine. Experimental and diagnostic flags need their unlock flag **before** them on the
command line or the JVM refuses to start.

| Flag                                             | Default          | Kind         | Meaning                                                                                                                                                                                |
| ------------------------------------------------ | ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShenandoahGCMode`                               | `satb`           | product      | `satb`, `generational`, `passive` (diagnostic)                                                                                                                                         |
| `ShenandoahGCHeuristics`                         | `adaptive`       | product      | `satb`: `adaptive`, `static`, `compact`, `aggressive` (diagnostic); generational supports only `adaptive`                                                                              |
| `ShenandoahInitFreeThreshold`                    | 70               | experimental | Learning-phase trigger, % of soft max heap                                                                                                                                             |
| `ShenandoahMinFreeThreshold`                     | 10               | experimental | Trigger floor during/after learning; generation-specific scope in generational mode                                                                                                    |
| `ShenandoahLearningSteps`                        | 5                | experimental | Learned-cycle threshold; confirm active learning from trigger logs instead of inferring it from every fallback                                                                         |
| `ShenandoahAllocSpikeFactor`                     | 5                | experimental | Headroom reserved for spikes, % of heap                                                                                                                                                |
| `ShenandoahGuaranteedGCInterval`                 | 300000 ms        | experimental | Forced cycle in idle periods; 0 disables                                                                                                                                               |
| `ShenandoahPacing` / `ShenandoahPacingMaxDelay`  | true / 10 ms     | experimental | Allocation stalls before degeneration; max per episode                                                                                                                                 |
| `ShenandoahEvacReserve` / `ShenandoahEvacWaste`  | 5 / 1.2          | experimental | Space withheld for evacuation; slack factor bounding the collection set                                                                                                                |
| `ShenandoahDegeneratedGC`                        | true             | diagnostic   | Degenerate instead of going straight to full GC                                                                                                                                        |
| `ShenandoahFullGCThreshold`                      | 3                | experimental | Consecutive-degeneration policy limit; see the exact predicate and counter lifecycle below                                                                                             |
| `ShenandoahCriticalFreeThreshold`                | 1                | experimental | % free a recovery cycle must reach to count as progress                                                                                                                                |
| `ShenandoahNoProgressThreshold`                  | 5                | experimental | No-progress allocation-recovery limit; tested against a counter, not a promise of OOM on the fifth full GC                                                                             |
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

# candidate only when logs show insufficient learning-phase headroom
-XX:+UnlockExperimentalVMOptions -XX:ShenandoahInitFreeThreshold=80 -XX:ShenandoahMinFreeThreshold=15

# generational — product, no unlock
-XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -Xmx8g -Xms8g

# diagnosis only: fully STW, no barriers
-XX:+UseShenandoahGC -XX:+UnlockDiagnosticVMOptions -XX:ShenandoahGCMode=passive -Xmx8g -Xms8g
```

Region size is derived from the heap (verified: 256 KB regions on a 256 MB heap, 4 MB on
8 GB — 1024 and 2048 regions respectively). Two things scale with it: an allocation larger than a region
is humongous and needs contiguous regions (`humongous waste` in `At end of GC:` is the cost),
and the maximum TLAB is one region (`TLAB Size Max: 256K`, verified) — a thread-per-request
service may incur refill/waste costs; compare actual allocation and TLAB behavior before
claiming a difference from G1.

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

| Fallback                                                 | What happens [`shenandoahDegeneratedGC.cpp`]                                                                                                                                                                          | What it means                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Degenerated GC (Mark)`, `(Evacuation)`, `(Update Refs)` | An allocation failed while that concurrent phase was running (after pacing gave up). The cycle **resumes in STW from that phase**: finish marking, or finish evacuation, or finish updating references, then clean up | Investigate actual headroom, allocation/evacuation failure and cycle progress; the rough time model alone is not proof      |
| `Degenerated GC (Roots)`                                 | Failure during concurrent root marking; marking state is reset and marking **restarts** STW                                                                                                                           | Same as above, earliest point                                                                                               |
| `Degenerated GC (Outside of Cycle)`                      | Allocation failed between cycles — "heavy humongous fragmentation, or very low on free space". A **whole** mark–evacuate–update cycle runs STW                                                                        | Capacity or fragmentation, or the trigger fired too late; the degeneration point used by passive mode                       |
| `Degenerated GC upgrading to Full GC`                    | On 25.0.3, bad-progress recovery upgrades immediately in `satb`, or after two consecutive bad-progress degenerations in generational mode. Exact GA behavior differs (below)                                          | Investigate actual progress criteria, floating garbage, fragmentation and update-specific behavior                          |
| `Pause Full`                                             | Can follow the consecutive-degeneration policy, a futile/failed recovery, explicit cause, or disabled degeneration. Sliding compaction of the whole heap, STW, from scratch                                           | Inspect cause, flags and counter history; neither the default 3 nor no-progress limit 5 is an unconditional pause/OOM count |

In `jdk-25-ga` and `jdk-25.0.3+9`, `should_degenerate_cycle()` permits degeneration while
the policy's consecutive count is **less than or equal to** `ShenandoahFullGCThreshold`.
The decision occurs on allocation failure; completed-cycle recording and concurrent/full
resets matter. Do not read `3` as "the third degeneration forces a full GC".

The update also changed progress handling: GA's post-cycle branch can upgrade `satb` even
after good progress and tracks bad-progress state on the degeneration object; 25.0.3 records
consecutive/bad-progress counts in `ShenandoahCollectorPolicy`, returns normally on good
progress, and applies the bad-progress upgrade policy above. Pin this explanation to the
build, not merely "JDK 25". Its allocation slow path checks failed non-LAB allocation and
`gc_no_progress_count > ShenandoahNoProgressThreshold`; that count includes recovery
degenerations/full GCs without progress, not just full-pause lines.

Do not infer a fresh learning phase merely from a fallback. The inspected GA and 25.0.3
base heuristics increment `_gc_times_learned` on successful concurrent cycles and reset it
in `record_requested_gc()`; their successful-degenerated/full recording methods adjust
penalties, not that counter. Flag-description prose is insufficient to establish the active
state. Confirm `Learning …` triggers before treating `InitFreeThreshold` as the relevant knob.

Reading a degenerated GC as "just increase the heap" skips the diagnosis: the degeneration
point names the phase, `Good/Bad progress` names the outcome, and the two constraints have
different fixes. The symptom table in `shenandoah-log-and-troubleshooting.md` walks them.

## Comparing Shenandoah with ZGC

A comparison omitting `ShenandoahGCMode` is underspecified; omission from a report does not
prove which mode ran. JDK 25 defaults to `satb`; ZGC is generational-only since JDK 24.
High short-lived allocation is a reason to test generational Shenandoah, not proof it wins.

| Aspect                                   | ZGC (generational, only mode)                 | Shenandoah `satb` (default)                                       | Shenandoah `generational` (opt-in)                           |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Barrier                                  | Conditional load barrier plus store barrier   | Conditional LRB plus SATB pre-write                               | LRB, SATB pre-write, card-mark post-write                    |
| Per-object memory                        | None; colour bits in the pointer              | None; forwarding in the mark word                                 | None; card table on the side                                 |
| Compressed oops                          | No — 64-bit references                        | Supported; inspect effective alignment/heap/flags                 | Supported; inspect effective alignment/heap/flags            |
| Sensitive to the generational hypothesis | Yes, since JEP 439/474/490                    | No — every object treated alike                                   | Yes — JEP 404/521                                            |
| Mutator stall mechanism before STW       | Allocation stalls when GC falls behind        | Pacer (`ShenandoahPacing`)                                        | Pacer                                                        |
| Fallback                                 | Allocation stall, then OOM — no full GC       | Degenerated, then full                                            | Degenerated, then full                                       |
| Maturity on JDK 25                       | Product                                       | Product since JDK 15, longest tested                              | Product since JDK 25; JEP 535 targets default mode in JDK 28 |
| Availability (JDK 25 builds)             | Build/platform-dependent; test the target JVM | Build/platform-dependent (captured examples: Temurin Windows x64) | Same                                                         |

When a published benchmark concludes Shenandoah loses on throughput under high allocation, the
first question is which mode it ran. If it ran the default — which is what happens when no
extra flag is passed — the result includes generation-policy differences. A declared
defaults comparison remains valid for that question. Broader claims may warrant a
generational-mode comparison and missing pacing evidence, subject to the task's cost and
acceptance criteria. Retain an adequate measured configuration when no change is justified.

## Primary implementation references

- [JDK 25 adaptive heuristics](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/shenandoah/heuristics/shenandoahAdaptiveHeuristics.cpp) — trigger ordering, spike adjustment and evacuation budget.
- [JDK 25 pacer](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/shenandoah/shenandoahPacer.cpp) — deadline checks and forced allocation after waiting.
- [JDK 25 passive mode](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/shenandoah/mode/shenandoahPassiveMode.cpp) — barrier defaults and explicit collection policy.
- [25.0.3 Shenandoah flags](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shenandoah/shenandoah_globals.hpp) — generational heuristic restriction and evacuation-reserve overflow default.
- [25.0.3 free-set allocation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shenandoah/shenandoahFreeSet.cpp) — borrowing from mutator space when evacuation reserve overflows.
- [JEP 521](https://openjdk.org/jeps/521) — generational mode in JDK 25. Pin source to the deployed build tag before depending on implementation details.
- [JEP 535](https://openjdk.org/jeps/535) — default change targeted to JDK 28; verify status separately from deployed behavior.
- [JEP 439](https://openjdk.org/jeps/439) — generational ZGC moves ordinary marking responsibility from load to store barriers.
- [25.0.3 pacing report](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shenandoah/shenandoahPacer.cpp) — `print_cycle_on` interval, population and resets (also present in GA).
- [25.0.3 degeneration](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shenandoah/shenandoahDegeneratedGC.cpp) and [collector policy](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/shenandoah/shenandoahCollectorPolicy.cpp) — progress/counter lifecycle; compare [GA](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shenandoah/shenandoahDegeneratedGC.cpp) before reusing the update's explanation.
