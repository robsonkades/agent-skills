# The policy log and the symptom table

`-Xlog:gc*` records what G1 did. The lines below record what it _decided_ and from which
inputs, which is what a derivation is validated against. None of them are in `gc*` (an
8-second run under `gc*` alone contained zero `ihop` and zero `candidates` lines, executed
on 25.0.3), so they must be named. These levels are usually low overhead, but validate log
volume, sink latency and rotation under representative load before making them baseline.

```bash
-Xlog:gc*,gc+ihop=trace,gc+ergo+cset=debug,gc+ergo=debug,gc+ergo+heap=debug:file=gc.log:time,uptime:filecount=5,filesize=20m
```

## What each line says

All examples captured on Temurin 25.0.3.

**Adaptive IHOP, per pause (`gc+ihop=trace`):**

```
Basic information (value update), threshold: 483183820B (45.00), target occupancy: 1073741824B, current occupancy: 201673544B, recent allocation size: 48653520B, recent allocation duration: 27.38ms, recent old gen allocation rate: 1777239104.47B/s, recent marking phase length: 65.65ms
Adaptive IHOP information (value update), threshold: 483183820B (52.94), internal target occupancy: 912680550B, occupancy: 201673544B, additional buffer size: 643825664B, predicted old gen allocation rate: 1193883314.93B/s, predicted marking phase length: 131.31ms, prediction active: false
```

- `target occupancy` is the heap capacity; `current occupancy` is old plus humongous. IHOP
  is the ratio of the second to the first — read this before arguing about what 45 means.
- `internal target occupancy` is the heap minus `G1ReservePercent + G1HeapWastePercent`
  (85 percent here); `additional buffer size` is the predicted promotion during marking
  plus the last young size. Threshold = internal target − buffer, floored at zero.
- `prediction active: false` means the static IHOP is still in force — fewer than
  `G1AdaptiveIHOPNumInitialSamples` cycles have completed. A service that restarts every
  deploy runs its first cycles on the static value every time.
- `recent old gen allocation rate` is G1's policy input for bytes entering old-generation
  occupancy, including paths beyond ordinary promotion such as humongous allocation. Do
  not label it simply “promotion rate”; reconcile it with old/humongous region evidence.

**Mixed collection-set choice (`gc+ergo+cset=debug`):**

```
Start adding marking candidates to collection set. Min 1 regions, max 103 regions, available 1 regions (1 groups), time remaining 8.60ms, optional threshold 1.72ms
Finish adding marking candidates to collection set. Initial: 14 regions (1 groups), optional: 0 regions (0 groups), predicted initial time: 8.59ms, predicted optional time: 0.00ms, time remaining: 0.00ms
```

- `Min` is `ceil(candidates / G1MixedGCCountTarget)`; `max` is the
  `G1OldCSetRegionThresholdPercent` cap, already raised to `Min` when `Min` is larger.
- `time remaining` is the pause goal minus the predicted young cost. Zero with a
  non-zero `predicted initial time` means the minimum forced regions in past the budget.
- `optional` regions are evacuated only if time remains after the initial set (the
  optional collection set of JEP 344, JDK 12), so a mixed pause that lands exactly on the
  goal is the predictor working, not luck.

**Why the mixed phase ended (`gc+ergo=debug`):**

```
do not continue mixed GCs (candidate old regions not available)
do not continue mixed GCs (reclaimable percentage not over threshold)
continue mixed GCs (candidate old regions available)
```

The first was captured on 25.0.3; the other two are the remaining branches of
`G1Policy::next_gc_should_be_mixed` (`g1Policy.cpp`). The second reason is
`G1HeapWastePercent`. A derivation that expected eight mixed collections and got three
should find this line before touching the count target.

**Heap resizing when `-Xms` < `-Xmx` (`gc+ergo+heap=debug`):**

```
Heap expansion: short term pause time ratio 47.91% long term pause time ratio 13.90% threshold 1.00% pause time ratio 7.69% fully expanded false resize by 138412032B
Expand the heap. requested expansion amount: 138412032B expansion amount: 138412032B
```

`pause time ratio 7.69%` is `1 / (1 + GCTimeRatio)` with G1's default of 12. Expansion is
decided at the end of a young pause once the pause-time ratio exceeds it — which is why a
variable heap spends its early life above the overhead target it will later meet, and why
the young generation (a percentage of the committed heap) is smallest exactly when the
allocation rate is being measured. Measured on 25.0.3 with the same churn for 8 s:
`-Xms64m -Xmx2g` gave 23 Eden regions at the first pauses and 508 young GCs;
`-Xms2g -Xmx2g` gave 481 regions and 154.

## Symptom → cause → how to distinguish → what to measure → lever

Each row names the first flag to consider. A flag is a hypothesis; the prediction and the
validation run in `derivation.md` decide whether it stays.

| Symptom                                                                         | Likely cause                                                                                                     | Distinguish by                                                                                                                          | Measure                                                                     | Lever, in order                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pause Young (Normal)` p99 above the goal, `Object Copy` dominates              | More live data per pause than the goal allows: survival ratio or promotion is high                               | `Survivor regions` after-count and `Old regions` delta large; young already at `G1NewSizePercent` floor in `Eden regions: n->0(target)` | Survival ratio, promotion rate, copy bandwidth from `gc+phases`             | Allocation and lifetime first (`allocation-profiling`); then a lower `G1MaxNewSizePercent`; raising `MaxGCPauseMillis` if the SLO allows          |
| `Pause Young (Normal)` p99 above the goal, `Merge Heap Roots` dominates         | Remembered-set cost, unrelated to allocation                                                                     | Pause does not scale with `Eden regions` before-count                                                                                   | `gc+remset` and the phase breakdown                                         | `g1-internals` — no flag in this skill addresses it                                                                                               |
| Young pauses fine, `Pause Young (Mixed)` violates                               | Old collection-set work is a candidate cause                                                                     | Violations correlate with `(Mixed)`; inspect selected groups, predicted/actual phase costs and `time remaining`                         | Old groups/regions, phase costs, candidates and reclaimed bytes             | If minimum candidate share is causal, raise `G1MixedGCCountTarget`; consider the percent cap only with headroom/reclamation consequences measured |
| Mixed phase ends after fewer collections than the target and old keeps growing  | `G1HeapWastePercent` stopped it; remaining candidates are sparse or above the live threshold                     | `do not continue mixed GCs (reclaimable percentage not over threshold)`                                                                 | Reclaimable bytes at the end of each phase (`gc+ergo`), live per old region | Accept (it is working as designed) or lower `G1HeapWastePercent`; a live set close to the heap is `jvm-gc-tuning`                                 |
| `Pause Full (G1 Compaction Pause)` shortly after a `Concurrent Mark Cycle`      | Late marking is one hypothesis; evacuation/to-space, humongous and explicit causes compete                       | Compare cycle-time × old-allocation rate with free headroom, then inspect the actual Full-GC cause and preceding failures               | Marking time, old-allocation rate, threshold, free regions and cause        | Lower static IHOP only if startup timing is causal; otherwise fix marking CPU, allocation/live set, humongous topology or evacuation margin       |
| `(Evacuation Failure: Allocation)` on young pauses, then full GC                | No free region for survivors at the pause                                                                        | `Old regions` delta at the failing pause; `Humongous regions` climbing before it                                                        | Free regions at the pause (`GC.heap_info`), promotion at the spike          | `G1ReservePercent` up; heap up if the live set is the reason; humongous is `g1-internals`                                                         |
| Rapid back-to-back concurrent starts with little mixed reclaim                  | Old occupancy stays near threshold because live set, allocation, humongous occupancy or poor candidates dominate | Compare equivalent post-reclamation occupancy and mixed termination reasons                                                             | Old/humongous occupancy, candidate efficiency, old allocation and headroom  | IHOP cannot create garbage; fix the causal pressure or heap/live-set ratio, then revisit trigger timing                                           |
| Cycles requested with cause `G1 Humongous Allocation`                           | Large allocations, not occupancy, drive marking                                                                  | `gc+ergo+ihop` `source: concurrent humongous allocation`; `Humongous regions` non-zero                                                  | Allocation sizes above half a region                                        | `G1HeapRegionSize` (a power of two, ≤ 512 MB) so the objects fit a region; the allocation pattern; `g1-internals`                                 |
| Pause share/GC CPU exceeds its service budget while individual pauses meet goal | Frequency, fixed phase cost, allocation or concurrent work                                                       | Split STW share from concurrent CPU; inspect interval, Eden target and phases                                                           | Allocation, pause share, GC CPU, throughput and queueing                    | Raise pause goal only if latency allows; assess young bounds, allocation and capacity. Fixed `-Xms` is conditional, not automatic                 |
| Startup GC frequency settles as heap expands                                    | Variable heap/young ergonomics may contribute alongside warm-up allocation/JIT/class loading                     | Correlate heap expansion and Eden targets with allocation and compilation/class-loading phases                                          | Committed/RSS heap, Eden target, allocation, CPU and page faults            | Consider higher `-Xms` if causal; use `AlwaysPreTouch` only when moving page cost to startup is acceptable and measured                           |
| JVM refuses to start after a flag change                                        | Experimental flag without ordered unlock, removed/renamed flag or vendor mismatch                                | Run the full command with `-version`; inspect exact option error and `PrintFlagsFinal`                                                  | Startup exit/error on the target build                                      | Order the unlock where required; use the spelling supported by that release; do not assume EA aliases (`jdk-upgrade-impact`)                      |
| The client-side p99 exceeds any individual logged pause                         | TTSP, scheduling, queue amplification, overlapping events or non-GC work                                         | Align intervals and compare affected/unaffected requests plus queue recovery; inspect safepoint reach time                              | Safepoints, queue depth, request traces, CPU throttling and GC events       | `pause-attribution`; choose a G1 lever only after establishing the causal mechanism                                                               |
| A flag change moved nothing                                                     | The flag does not govern the event, or the predictor overrode it                                                 | The policy lines above show the same `Min`/`max`/`threshold` before and after                                                           | The derivation's predicted value against the logged decision                | Revert; re-derive from the symptom row, not from the flag list                                                                                    |

## Version notes that change a derivation

- **JDK 25** merges the remembered sets of old regions in a collection-set candidate group
  (JDK-8343782), which is why candidates are logged in `groups` and why old-region RSet
  memory fell relative to 24; and selects mixed-collection regions using incoming reference
  counts gathered during marking (JDK-8351405), which removed a class of mixed-pause
  spikes. A mixed-pause derivation made on 21 or 17 measured a different collector.
- **JDK 25** ships compact object headers as a product option (JEP 519,
  `-XX:+UseCompactObjectHeaders`, default `false` on 25.0.3). Enabling it shrinks every
  header by 4 bytes, which can lower the live set and alter cache/copy behavior. Traversal
  and per-object costs may still dominate; remeasure rather than assuming shorter pauses.
- JDK 27 early-access documentation says G1 is the default and documents `G1IHOP` rather
  than `InitiatingHeapOccupancyPercent`. JEP 523 nevertheless remains Candidate as of
  2026-09-03, and alias behavior is build-specific. Treat both as EA evidence to verify on
  the exact vendor build, not as a finalized JEP promise (`jdk-upgrade-impact`).
- **JDK 18** raised the manual `G1HeapRegionSize` ceiling to 512 MB (JDK-8275056); the
  ergonomic ceiling stays at 32 MB. A humongous-driven derivation on an older runtime
  had no such lever above 32 MB.
