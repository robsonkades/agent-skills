# The policy log and the symptom table

`-Xlog:gc*` records what G1 did. The lines below record what it _decided_ and from which
inputs, which is what a derivation is validated against. They require more than `gc*`'s default
info level (an
8-second run under `gc*` alone contained zero `ihop` and zero `candidates` lines, executed
on 25.0.3). Explicit selectors below keep the capture focused; `gc*=debug` can also include
debug-level policy lines. Reuse adequate evidence and validate log volume, sink latency and
rotation within the authorized capture budget.

```bash
-Xlog:gc*,gc+ergo+ihop=debug,gc+ihop=debug,gc+ergo+cset=debug,gc+ergo=debug,gc+ergo+heap=debug:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m
```

## What each line says

The numeric excerpts below were recorded as Temurin 25.0.3 examples in the existing skill;
they are independent excerpts, not a reconstructed single cycle. Source-format examples are
identified separately. Match GC ids, times and the actual update build in a real capture.

**Adaptive IHOP, at eligible value updates (`gc+ihop=debug`):**

```
Basic information (value update), threshold: 483183820B (45.00), target occupancy: 1073741824B, current occupancy: 201673544B, recent allocation size: 48653520B, recent allocation duration: 27.38ms, recent old gen allocation rate: 1777239104.47B/s, recent marking phase length: 65.65ms
Adaptive IHOP information (value update), threshold: 483183820B (52.94), internal target occupancy: 912680550B, occupancy: 201673544B, additional buffer size: 643825664B, predicted old gen allocation rate: 1193883314.93B/s, predicted marking phase length: 131.31ms, prediction active: false
```

- JDK 25 IHOP statistics log `heap.used()` as `current occupancy`, not the trigger's non-young
  occupancy. The printed 45% is threshold/target; the adaptive 52.94% uses the internal target.
  `gc+ergo+ihop` logs qualifying above-threshold initiation checks and divides threshold by
  current heap capacity. It can return without logging during an active cycle/mixed transition
  or below threshold; no line is not proof that marking is unnecessary.
- Internal target is the minimum of max capacity minus reserve/waste percentages and target
  occupancy minus waste percentage. The 85% shortcut applies here at full heap size.
  `additional buffer size` is the unrestrained young allowance; predicted old growth is a
  separate subtraction. The inactive example still uses the initial threshold.
- `prediction active: false` means the initial threshold is still in force. Both eligible
  marking-time and allocation-rate histories need `G1AdaptiveIHOPNumInitialSamples` values;
  a completed cycle is not automatically one sample in each history. Restart resets learning.
- `recent old gen allocation rate` is G1's policy input for bytes entering old-generation
  occupancy, including paths beyond ordinary promotion such as humongous allocation. Do
  not label it simply “promotion rate”; reconcile it with old/humongous region evidence.

**Mixed collection-set choice (`gc+ergo+cset=debug`):**

```
Start adding marking candidates to collection set. Min 1 regions, max 103 regions, available 1 regions (1 groups), time remaining 8.60ms, optional threshold 1.72ms
Finish adding marking candidates to collection set. Initial: 14 regions (1 groups), optional: 0 regions (0 groups), predicted initial time: 8.59ms, predicted optional time: 0.00ms, time remaining: 0.00ms
```

- `Min` uses the initial marking-candidate list after pruning, not the remaining `available`
  count. `max` uses committed heap regions and is raised to `Min` if necessary. Whole groups
  can cross the numeric limits; retained candidates have separate selection.
- Initial `time remaining` is the pause goal minus predicted young/base cost, clamped at zero;
  selection then consumes it. Zero with nonzero predicted old work shows budget pressure,
  not an observed overrun or, by itself, which minimum forced the work.
- `optional` regions are evacuated only if time remains after the initial set (the
  optional collection set of JEP 344, JDK 12). Compare predictions, actual phases and elapsed
  pauses across representative events; one pause near the goal does not prove calibration.

**Candidate pruning and exhaustion (`gc+ergo+cset=debug`):**

Source-format examples from the pinned 25.0.3 implementation, not new runtime captures:

```
Pruned <n> regions out of <n>, leaving <bytes> bytes waste (allowed <bytes>)
Finished creating <n> collection groups from <n> regions
Marking candidates exhausted.
```

`G1CollectionSetChooser` prunes candidates against the waste allowance before grouping,
while preserving minimum progress. `next_gc_should_be_mixed` then checks whether marking
candidates remain. Older logs can contain `do not continue mixed GCs (...)` reason strings;
do not require them from this implementation. Reconcile the initial list, groups and remaining
candidates before interpreting a count below the target as a failure.

**Heap resizing when `-Xms` < `-Xmx` (`gc+ergo+heap=debug`):**

```
Heap expansion: short term pause time ratio 47.91% long term pause time ratio 13.90% threshold 1.00% pause time ratio 7.69% fully expanded false resize by 138412032B
Expand the heap. requested expansion amount: 138412032B expansion amount: 138412032B
```

`pause time ratio 7.69%` is `1 / (1 + GCTimeRatio)` with G1's default of 12. Expansion
uses recent pause ratios and capacity-dependent thresholds; the example's `threshold 1.00%`
is not the printed 7.69% goal. This does not guarantee a variable heap will later meet the
overhead budget. Young bounds change with committed capacity, so separate warm-up/expansion
from the target operating regime. The existing 25.0.3 churn example reports for 8 s:
`-Xms64m -Xmx2g` gave 23 Eden regions at the first pauses and 508 young GCs;
`-Xms2g -Xmx2g` gave 481 regions and 154.

## Symptom → cause → how to distinguish → what to measure → lever

Each row names the first flag to consider. A flag is a hypothesis; the prediction and the
validation run in `derivation.md` decide whether it stays.

| Symptom                                                                         | Likely cause                                                                                                     | Distinguish by                                                                                                                       | Measure                                                                                                          | Lever, in order                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Pause Young (Normal)` p99 above the goal, `Object Copy` dominates              | More live data per pause than the goal allows: survival ratio or promotion is high                               | Compare Eden plus Survivor targets with effective bounds; distinguish a binding minimum, burst at the maximum and fixed young sizing | Survival, old-generation pressure, copy cost and committed capacity                                              | Allocation/lifetime first (`allocation-profiling`); lower `G1NewSizePercent` if the floor binds, or the maximum for a justified burst ceiling; check legal bounds and pause-frequency cost |
| `Pause Young (Normal)` p99 above the goal, `Merge Heap Roots` dominates         | Incoming-reference/card work; allocation and mutation patterns can contribute                                    | Pause does not scale with `Eden regions` before-count alone                                                                          | `gc+remset` and the phase breakdown                                                                              | `g1-internals` for the mechanism; do not infer independence from allocation from this phase name                                                                                           |
| Young pauses fine, `Pause Young (Mixed)` violates                               | Old collection-set work is a candidate cause                                                                     | Violations correlate with `(Mixed)`; inspect selected groups, predicted/actual phase costs and `time remaining`                      | Old groups/regions, phase costs, candidates and reclaimed bytes                                                  | If minimum candidate share is causal, raise `G1MixedGCCountTarget`; consider the percent cap only with headroom/reclamation consequences measured                                          |
| Mixed phase ends after fewer collections than the target and old keeps growing  | Candidate eligibility/pruning, group selection or genuine live-set pressure                                      | Reconcile `Pruned`, group creation and exhaustion with liveness and actual reclaimed bytes on this build                             | Initial/remaining candidates, waste allowance and old/humongous occupancy                                        | Retain if headroom/SLO hold; change waste allowance only if pruning is causal and added work is affordable; live-set pressure is `jvm-gc-tuning`                                           |
| `Pause Full (G1 Compaction Pause)` shortly after a `Concurrent Mark Cycle`      | Late marking is one hypothesis; evacuation/to-space, humongous and explicit causes compete                       | Compare cycle-time × old-allocation rate with free headroom, then inspect the actual Full-GC cause and preceding failures            | Marking time, old-allocation rate, threshold, free regions and cause                                             | Lower static IHOP only if startup timing is causal; otherwise fix marking CPU, allocation/live set, humongous topology or evacuation margin                                                |
| `(Evacuation Failure: Allocation)` on young pauses, then full GC                | Evacuation destination allocation failed; distinguish exhaustion, fragmentation and other runtime constraints    | `Old regions` delta at the failing pause; `Humongous regions` climbing before it                                                     | GC allocation-failure logs and runtime free-region evidence, promotion at the spike; heap_info is aggregate only | `G1ReservePercent` up; heap up if the live set is the reason; humongous is `g1-internals`                                                                                                  |
| Rapid back-to-back concurrent starts with little mixed reclaim                  | Old occupancy stays near threshold because live set, allocation, humongous occupancy or poor candidates dominate | Compare equivalent post-reclamation occupancy and mixed termination reasons                                                          | Old/humongous occupancy, candidate efficiency, old allocation and headroom                                       | IHOP cannot create garbage; fix the causal pressure or heap/live-set ratio, then revisit trigger timing                                                                                    |
| Cycles requested with cause `G1 Humongous Allocation`                           | Large-allocation requests interact with occupancy thresholds and contiguous capacity                             | `gc+ergo+ihop` `source: concurrent humongous allocation`; `Humongous regions` non-zero                                               | Allocation sizes above half a region                                                                             | `G1HeapRegionSize` (a power of two, ≤ 512 MB) so aligned total object size is at most half a region; the allocation pattern; `g1-internals`                                                |
| Pause share/GC CPU exceeds its service budget while individual pauses meet goal | Frequency, fixed phase cost, allocation or concurrent work                                                       | Split STW share from concurrent CPU; inspect interval, Eden target and phases                                                        | Allocation, pause share, GC CPU, throughput and queueing                                                         | Raise pause goal only if latency allows; assess young bounds, allocation and capacity. Fixed `-Xms` is conditional, not automatic                                                          |
| Startup GC frequency settles as heap expands                                    | Variable heap/young ergonomics may contribute alongside warm-up allocation/JIT/class loading                     | Correlate heap expansion and Eden targets with allocation and compilation/class-loading phases                                       | Committed/RSS heap, Eden target, allocation, CPU and page faults                                                 | Consider higher `-Xms` if causal; use `AlwaysPreTouch` only when moving page cost to startup is acceptable and measured                                                                    |
| JVM refuses to start after a flag change                                        | Experimental flag without ordered unlock, removed/renamed flag or vendor mismatch                                | Run the full command with `-version`; inspect exact option error and `PrintFlagsFinal`                                               | Startup exit/error on the target build                                                                           | Order the unlock where required; use the spelling supported by that release; do not assume EA aliases (`jdk-upgrade-impact`)                                                               |
| The client-side p99 exceeds any individual logged pause                         | TTSP, scheduling, queue amplification, overlapping events or non-GC work                                         | Align intervals and compare affected/unaffected requests plus queue recovery; inspect safepoint reach time                           | Safepoints, queue depth, request traces, CPU throttling and GC events                                            | `pause-attribution`; choose a G1 lever only after establishing the causal mechanism                                                                                                        |
| A flag change moved nothing                                                     | The flag does not govern the event, or the predictor overrode it                                                 | The policy lines above show the same `Min`/`max`/`threshold` before and after                                                        | The derivation's predicted value against the logged decision                                                     | Revert; re-derive from the symptom row, not from the flag list                                                                                                                             |

## Version notes that change a derivation

Source anchors for the HotSpot 25.0.3+9 interpretation (commit pinned; other builds can differ):
[G1IHOPControl](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1IHOPControl.cpp),
[G1Policy](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1Policy.cpp),
[candidate pruning](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1CollectionSetChooser.cpp)
and [group selection](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1CollectionSet.cpp).

- **JDK 25** shares remembered sets across old-region candidate groups
  ([JDK-8343782](https://bugs.openjdk.org/browse/JDK-8343782)) and changes early-pruning
  efficiency estimates ([JDK-8351405](https://bugs.openjdk.org/browse/JDK-8351405)). These
  change memory and selection inputs; the intended reductions in overhead or pause spikes
  are not guaranteed workload outcomes. Recalibrate a derivation made on 21 or 17.
- **JDK 25** ships compact object headers as a product option (JEP 519,
  `-XX:+UseCompactObjectHeaders`, default `false` on 25.0.3). Aligned object-size savings
  depend on field packing, arrays and reference compression; measure actual layouts. Traversal
  and per-object costs may still dominate; remeasure rather than assuming shorter pauses.
- **JDK 27 GA**, released 2026-09-15, makes G1 the default in all environments (JEP 523),
  enables compact object headers by default and renames IHOP to `G1IHOP`, retaining the
  deprecated old spelling. These are
  [release-note facts](https://www.oracle.com/java/technologies/javase/27all-relnotes.html),
  not new workload measurements here. Remeasure object layouts and copy-cost estimates;
  verify collector selection and accepted flags on the exact vendor/build (`jdk-upgrade-impact`).
- **JDK 18** raised the manual `G1HeapRegionSize` ceiling to 512 MB (JDK-8275056); the
  ergonomic ceiling stays at 32 MB. A humongous-driven derivation on an older runtime
  had no such lever above 32 MB.
