# Shenandoah: the JDK 25 log, the tools, and the symptom table

Every line below was captured on Temurin 25.0.3 with `-Xlog:gc,gc+init,gc+ergo` (and
`gc+stats` where stated) unless marked otherwise. Confirm the format on the deployed build
before writing a parser; Shenandoah renames phases between releases.

## Logging flags

```bash
# base: phases, triggers, occupancy
-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m

# what mode and heuristic are actually running (printed once at start-up)
-Xlog:gc+init

# trigger reasoning, collection-set selection, pacer tax rates, generation transfers
-Xlog:gc+ergo=info

# per-cycle phase timings with parallelism, plus accrued pacing since the prior report
-Xlog:gc+stats=info
```

## Start-up: what is running

```
[gc,init] CardTable entry size: 512
[gc,init] Heap Region Count: 1024
[gc,init] Heap Region Size: 256K
[gc,init] TLAB Size Max: 256K
[gc,init] Soft Max Heap Size: 256M
[gc,init] Parallel Workers: 12
[gc,init] Concurrent Workers: 6
[gc,init] Mode: Snapshot-At-The-Beginning (SATB)        # or: Mode: Generational
[gc,init] Heuristics: Adaptive
[gc,init] Young Heuristics: Adaptive                    # generational only
[gc,init] Old Heuristics: Old                           # generational only
```

`jcmd <pid> VM.flags -all | grep -E "ShenandoahGCMode|ShenandoahGCHeuristics"` gives the
same answer on a running process; `jcmd <pid> VM.info` prints `shenandoah gc` in its first
line and the full command line; `jcmd <pid> GC.heap_info` prints `Shenandoah Heap`, max /
soft max / committed / used, the region count and size, `Status: not cancelled` (or the
cancellation cause) and the current collection set.

## Triggers

| Line                                                                                                          | Source                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Trigger: Learning 3 of 5. Free (154M) is below initial threshold (179M)`                                     | Learning phase, `ShenandoahInitFreeThreshold`                                                                                                                  |
| `Trigger: Free (24167K) is below minimum threshold (26214K)`                                                  | `ShenandoahMinFreeThreshold` floor — the heuristic is behind                                                                                                   |
| `Trigger: Average GC time (…) is above the time for average allocation rate (…) to deplete free headroom (…)` | Adaptive rate trigger (from source; not reproduced here)                                                                                                       |
| `Trigger: Time since last GC (…) is larger than guaranteed interval (300000 ms)`                              | `ShenandoahGuaranteedGCInterval` (from source; not reproduced here)                                                                                            |
| `Trigger: Handle Allocation Failure`                                                                          | An allocation failed: the next line is a degenerated or full pause                                                                                             |
| `Trigger: GC request (System.gc())`                                                                           | Accepted explicit request; concurrent with default satb/generational policy, STW with passive or explicit override; DisableExplicitGC can suppress the request |
| `Trigger (Young): …` / `Trigger (Old): Old has overgrown, live at end of previous OLD marking: …`             | Generational young and old triggers                                                                                                                            |

Repeated minimum-threshold triggers warrant checking bursts, headroom and cycle times.
They do not guarantee allocation failure; verify pacing and actual outcomes.

## A cycle, single-generation

```
[gc,ergo] GC(3) Pacer for Mark. Expected Live: 65098K, Free: 147M, Non-Taxable: 15138K, Alloc Tax Rate: 0.5x
[gc     ] GC(3) Pause Init Mark (unload classes) 0.031ms
[gc     ] GC(3) Concurrent marking roots 0.062ms
[gc     ] GC(3) Concurrent marking (unload classes) 0.339ms
[gc,ergo] GC(3) Adaptive CSet Selection. Target Free: 37137K, Actual Free: 160M, Max Evacuation: 10922K, Min Garbage: 0B
[gc,ergo] GC(3) Collectable Garbage: 169K (83%), Immediate: 0B (0%), 0 regions, CSet: 169K (83%), 1 regions
[gc     ] GC(3) Pause Final Mark (unload classes) 0.109ms
[gc     ] GC(3) Concurrent cleanup (unload classes) 76M->76M(256M) 0.004ms
[gc     ] GC(3) Concurrent evacuation 0.031ms
[gc     ] GC(3) Pause Init Update Refs 0.066ms
[gc     ] GC(3) Concurrent update references 0.194ms
[gc     ] GC(3) Pause Final Update Refs 0.015ms
[gc     ] GC(3) Concurrent cleanup (unload classes) 79M->80M(256M) 0.004ms
[gc,ergo] GC(3) At end of GC: used: 83223K, used regions: 256M, humongous waste: 20478K, soft capacity: 256M, max capacity: 256M, available: 141M
```

Lines to trend across cycles:

- `Collectable Garbage: … Immediate: … CSet: …` — how much of the garbage is in wholly empty
  regions (cheap, no evacuation) versus in the collection set (evacuated). A rising `CSet`
  share with a falling `Immediate` share means more garbage needs evacuation; inspect
  lifetimes and region occupancy before diagnosing fragmentation.
- `Max Evacuation` — single-generation adaptive mode calculates this from soft capacity,
  `ShenandoahEvacReserve` and `ShenandoahEvacWaste`, not current free space. Compare actual
  free space, selected live bytes and failures; inspect generation-specific budget formulas.
- `At end of GC: … available:` — the number the next trigger will be computed from.
- `humongous waste` — internal fragmentation of allocations larger than a region.

## A cycle, generational

Captured lines from one young cycle (pacer lines omitted):

```
[gc     ] GC(2) Concurrent reset (Young) 0.412ms
[gc     ] GC(2) Pause Init Mark (Young) 0.030ms
[gc     ] GC(2) Concurrent remembered set scanning 0.321ms
[gc     ] GC(2) Concurrent marking roots 0.037ms
[gc     ] GC(2) Concurrent marking (Young) 0.548ms
[gc,ergo] GC(2) Planning to promote in place 0 humongous regions and 0 regular regions, spanning a total of 0 used bytes
[gc,ergo] GC(2) Adaptive CSet Selection for YOUNG. Max Evacuation: 8095K, Actual Free: 1280K.
[gc,ergo] GC(2) Chosen CSet evacuates young: 349K (of which at least: 0B are to be promoted), old: 0B
[gc,ergo] GC(2) Collectable Garbage: 1954K (100%), Immediate: 1280K (65%), 6 regions, CSet: 674K (34%), 4 regions
[gc,ergo] GC(2) Evacuation Targets: YOUNG: 349K, PROMOTE: 0B, OLD: 0B, TOTAL: 349K
[gc,ergo] GC(2) Transfer 1 region(s) from Old to Young, yielding increased size: 190M
[gc     ] GC(2) Pause Final Mark (Young) 0.192ms
[gc,ergo] GC(2) Promotion failed, size 112, has plab? yes, PLAB remaining: 0, plab promotions disabled, promotion reserve: 0, …
[gc     ] GC(2) Concurrent evacuation 0.312ms
[gc     ] GC(2) Pause Init Update Refs 0.018ms
[gc     ] GC(2) Concurrent update references 0.208ms
[gc     ] GC(2) Pause Final Update Refs 0.058ms
[gc,ergo] GC(2) At end of Concurrent Bootstrap GC: Young generation used: 60036K, used regions: 73728K, humongous waste: 13567K, soft capacity: 256M, max capacity: 190M, available: 108M
[gc,ergo] GC(2) At end of Concurrent Bootstrap GC: Old generation used: 54272K, … max capacity: 67584K, available: 0B
```

and the old-generation side, which is triggered separately and marked concurrently with the
young cycles that follow:

```
[gc     ] Trigger (Old): Old has overgrown, live at end of previous OLD marking: 16384K, current usage: 67584K, percent growth: 312.5%
[gc     ] GC(2) Concurrent marking (Old) 0.918ms
[gc,ergo] GC(2) Old-Gen Collectable Garbage: 0B consolidated with free: 0B, over 0 regions
[gc,ergo] GC(2) Old regions selected for defragmentation: 0
[gc     ] GC(2) Pause Final Mark (Old) 0.214ms
[gc     ] GC(2) Concurrent cleanup (Old) 117M->117M(256M) 0.010ms
```

Lines to read: `Planning to promote in place N humongous regions and M regular regions` is
tenuring without copying; `Promotion failed, … promotion reserve: 0` repeated inside a cycle
means old has no room to receive survivors, so they stay young and get copied again —
`Old generation … available: 0B` at the end of the cycle confirms it; `Transfer N region(s)
from Old to Young` / `from Young to Old` and the very frequent `Forcing transfer of` lines
are the adaptive split moving regions and are normal in volume; a `Bootstrap` cycle is the
young cycle that also prepares old marking.

## Fallbacks

```
[gc     ] Trigger: Handle Allocation Failure
[gc,ergo] GC(7) Good progress for free space: 37376K, need 2048K
[gc     ] GC(7) Pause Degenerated GC (Mark) 158M->123M(200M) 0.389ms

[gc,ergo] GC(10) Bad progress for free space: 1280K, need 1638K
[gc     ] GC(10) Degenerated GC upgrading to Full GC
[gc     ] GC(10) Pause Degenerated GC (Outside of Cycle) 120M->120M(160M) 3.689ms
```

Degeneration points seen on 25.0.3: `(Outside of Cycle)`, `(Roots)`, `(Mark)`; `(Evacuation)`
and `(Update Refs)` exist in `shenandoahDegeneratedGC.cpp` and were not reproduced here.

## Pacing

Accrued pacing in `gc+stats`:

```
[gc,stats] Pacing                            28965 us
[gc,stats] Allocation pacing accrued:
[gc,stats]      29 of    56 ms ( 51.4%): main
[gc,stats]      29 of    56 ms ( 51.4%): <total>
[gc,stats]       3 of    56 ms (  4.7%): <average total>
[gc,stats]      29 of    56 ms ( 51.4%): <average non-zero>
```

Per named thread: accrued pacing divided by elapsed wall time since the previous report,
including inter-cycle gaps (since pacer creation for the first report). Reporting visits
currently present Java threads and resets their counters; exited threads are absent.
Overlapping threads can make `<total>` exceed 100%. This is not a request-time fraction or
a latency percentile; correlate the interval and request population before attributing impact.
The same section lists phase wall time and parallelism (`Concurrent Marking 360 us,
parallelism: 5.05x`). Combine these with CPU quota/throttling and mutator evidence before
attributing cycle duration to too few `ConcGCThreads`.

## JFR

Shenandoah-specific events on JDK 25: `jdk.ShenandoahHeapRegionInformation`,
`jdk.ShenandoahHeapRegionStateChange`, `jdk.ShenandoahEvacuationInformation` (verified in
`jfr metadata`). Pauses and phases arrive through the generic `jdk.GarbageCollection`,
`jdk.GCPhasePause` and `jdk.GCPhaseConcurrent` events. This JDK 25 metadata has no dedicated
pacing event; correlate aggregate logs with thread/profile and application evidence.

## Symptom table

| Symptom                                                                 | Likely cause                                                                                                             | How to distinguish                                                                                                           | Remediation                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| p99 up, no pause longer than a few ms in the log                        | Pacing is one hypothesis; non-GC waiting or CPU contention can look similar                                              | Correlate accrued pacing's interval and covered threads with affected requests; no universal percentage proves cause         | If confirmed, compare reducing allocation/live work, available CPU, mode or headroom; validate application and memory costs before changing flags  |
| p99 up, no pause, no pacing                                             | Mutator evacuation is possible; incomplete pacing coverage or non-GC causes remain                                       | CPU profile shows `ShenandoahRuntime::load_reference_barrier_strong` → `ShenandoahHeap::evacuate_object` in affected threads | Check selected live bytes and CPU; reducing EvacReserve can worsen reclamation/headroom                                                            |
| `Pause Degenerated GC (Mark)` recurring, `Good progress`                | Time budget: cycle slower than allocation fills the headroom                                                             | `Trigger: … below minimum threshold` precedes it; `Concurrent marking` wall time vs the trigger-to-failure gap               | Reduce allocation/live work; evaluate generational mode; change learning threshold or `ConcGCThreads` only when phase/CPU evidence supports it     |
| `Pause Degenerated GC (Outside of Cycle)` recurring                     | Allocation failed between cycles: humongous fragmentation or the trigger fired too late                                  | `humongous waste` in `At end of GC:`; `Handle Allocation Failure` right after a cycle ended                                  | Check sizes and contiguous free regions; larger regions may increase waste, so measure                                                             |
| `Degenerated GC upgrading to Full GC`, `Bad progress`                   | Capacity: floating garbage or fragmentation the partial cycle cannot clear                                               | Actual free space, selected live bytes, failed allocation size and recovery outcome                                          | Inspect capacity versus late triggering; no threshold fits an oversized live set                                                                   |
| `Pause Full` with no degenerated pauses before it                       | Explicit/diagnostic GC, passive mode, disabled degeneration, or earlier failures outside the window                      | `VM.flags -all`; `gc+init` `Mode:`                                                                                           | Inspect GC cause and flags first; passive is diagnostic                                                                                            |
| Every cycle says `(unload classes)` and `Concurrent class unloading`    | Normal: class unloading runs on the cycles the heuristic picks                                                           | Not a fault                                                                                                                  | None                                                                                                                                               |
| Few `Concurrent evacuation` lines, many cycles                          | Immediate-garbage shortcut (`ShenandoahImmediateThreshold`)                                                              | `Collectable Garbage: … Immediate: 98%`, cycle ends at `Concurrent Final Roots`                                              | None — the workload's garbage dies by region                                                                                                       |
| Throughput lower than G1 by a margin on an allocation-heavy service     | Possible satb whole-live-set work, pacing, CPU contention or other costs                                                 | Confirm mode, comparable workload/build/quota, cycle work and pacing; mode alone does not identify the cause                 | Test generational mode if short-lived allocation and cycle evidence warrant it; retaining the measured configuration may meet the actual objective |
| `System.gc()` from a monitoring library "does nothing"                  | Concurrent collection may be less visible, or DisableExplicitGC suppresses the request; passive/overrides can select STW | Inspect DisableExplicitGC, ExplicitGCInvokesConcurrent, mode and request/phase logs                                          | Explain the effective policy; do not force full GC merely to obtain a visible pause                                                                |
| RSS shrinks and grows in 5-minute waves; first requests after idle slow | Uncommit/recommit is a hypothesis; timing alone does not prove request impact                                            | Match uncommit/commit and request evidence, with `-Xms` < `-Xmx`; distinguish normal idle reclamation                        | If impact is material, compare delay/fixed-heap/pre-touch changes against startup and resident-memory limits; retain defaults when adequate        |
| `Unrecognized VM option` / `must be enabled via -XX:+Unlock…`           | Threshold flags are experimental; `passive` and `aggressive` are diagnostic                                              | The message names the unlock                                                                                                 | Put the unlock flag **before** the option                                                                                                          |
| `Option -XX:+UseShenandoahGC not supported`                             | The exact build/platform lacks Shenandoah support; the error does not uniquely identify a vendor                         | Record vendor, version, architecture and build; check its supported collectors                                               | Use an available collector or evaluate a compatible build with verified support under project constraints                                          |
| Footprint estimate shows Shenandoah 8 bytes/object above G1             | A pre-JDK 13 model                                                                                                       | `GC.class_histogram` instance sizes are identical under both collectors                                                      | Correct the model; measure the real layout (see below)                                                                                             |
| Pause of tens of ms on a heap where every other pause is < 1 ms         | Safepoint synchronization, phase work or scheduling; correlate timestamps                                                | `-Xlog:safepoint`: time-to-safepoint dominates the pause                                                                     | Attribute the pause to the safepoint (see below); the collector's flags are not the lever                                                          |

The last two rows leave Shenandoah: object layout is measured with
`object-layout-and-footprint`, and a pause that is synchronisation rather than collection
belongs to `pause-attribution`.

## Source file index (JDK 25, `src/hotspot/share/gc/shenandoah/`)

```
shenandoahBarrierSet.inline.hpp        the LRB, runtime form; slot healing
shenandoahForwarding.inline.hpp        forwarding pointer in the mark word
shenandoahRuntime.hpp / .cpp           the stubs compiled code calls (the profile symbols)
c2/shenandoahBarrierSetC2.cpp          what C2 emits; leaf-call names
shenandoah_globals.hpp                 every flag, default and description
heuristics/shenandoahAdaptiveHeuristics.cpp   should_start_gc(), learning, rate and spike triggers
shenandoahPacer.cpp                    the pacer and its report
shenandoahDegeneratedGC.cpp            degeneration points, progress check, upgrade to full
shenandoahFullGC.cpp                   full GC
heuristics/shenandoahGenerationalHeuristics.cpp, heuristics/shenandoahOldHeuristics.cpp   generational triggers
shenandoahCardTable.cpp                the remembered set
```
