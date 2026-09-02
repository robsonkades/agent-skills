# The policy log and the symptom table

`-Xlog:gc*` records what G1 did. The lines below record what it _decided_ and from which
inputs, which is what a derivation is validated against. None of them are in `gc*` (an
8-second run under `gc*` alone contained zero `ihop` and zero `candidates` lines, executed
on 25.0.3), so they must be named. The cost is negligible at these levels; add them to the
baseline run rather than to a second one.

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
- `recent old gen allocation rate` **is the promotion rate** G1 measured — bytes that
  entered old regions, humongous allocations included. It is the number to reconcile a
  parser's `Old regions` delta against.

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

| Symptom                                                                                 | Likely cause                                                                                 | Distinguish by                                                                                                                          | Measure                                                                     | Lever, in order                                                                                                                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Pause Young (Normal)` p99 above the goal, `Object Copy` dominates                      | More live data per pause than the goal allows: survival ratio or promotion is high           | `Survivor regions` after-count and `Old regions` delta large; young already at `G1NewSizePercent` floor in `Eden regions: n->0(target)` | Survival ratio, promotion rate, copy bandwidth from `gc+phases`             | Allocation and lifetime first (`allocation-profiling`); then a lower `G1MaxNewSizePercent`; raising `MaxGCPauseMillis` if the SLO allows               |
| `Pause Young (Normal)` p99 above the goal, `Merge Heap Roots` dominates                 | Remembered-set cost, unrelated to allocation                                                 | Pause does not scale with `Eden regions` before-count                                                                                   | `gc+remset` and the phase breakdown                                         | `g1-internals` — no flag in this skill addresses it                                                                                                    |
| Young pauses fine, `Pause Young (Mixed)` violates                                       | Old collection set too large for the budget                                                  | Violations correlate with `(Mixed)` only; `Finish adding ... time remaining: 0.00ms` with `Min` equal to `Initial`                      | Old regions per mixed GC, `copy_time_per_region`, candidates per cycle      | Raise `G1MixedGCCountTarget` (the divisor); then lower `G1OldCSetRegionThresholdPercent`; never a smaller heap                                         |
| Mixed phase ends after fewer collections than the target and old keeps growing          | `G1HeapWastePercent` stopped it; remaining candidates are sparse or above the live threshold | `do not continue mixed GCs (reclaimable percentage not over threshold)`                                                                 | Reclaimable bytes at the end of each phase (`gc+ergo`), live per old region | Accept (it is working as designed) or lower `G1HeapWastePercent`; a live set close to the heap is `jvm-gc-tuning`                                      |
| `Pause Full (G1 Compaction Pause)` shortly after a `Concurrent Mark Cycle`              | Marking finished too late: old filled during the cycle                                       | `Concurrent Mark Cycle` duration × promotion rate ≈ free old at cycle start; `prediction active: false` if it was a fresh JVM           | Marking time, promotion rate, threshold at the cycle start                  | Lower the static IHOP (it governs the first cycles anyway); `ConcGCThreads` if marking is CPU-starved (`g1-concurrent-marking`); `G1ReservePercent` up |
| `(Evacuation Failure: Allocation)` on young pauses, then full GC                        | No free region for survivors at the pause                                                    | `Old regions` delta at the failing pause; `Humongous regions` climbing before it                                                        | Free regions at the pause (`GC.heap_info`), promotion at the spike          | `G1ReservePercent` up; heap up if the live set is the reason; humongous is `g1-internals`                                                              |
| `Pause Young (Concurrent Start)` after every `Pause Cleanup`, no `(Mixed)` between them | Old occupancy stays above the threshold; live set too large for the heap                     | `current occupancy` never drops below `threshold` between cycles                                                                        | Post-mixed old occupancy against IHOP                                       | No IHOP value helps — live set or heap (`jvm-gc-tuning`); check for a leak                                                                             |
| Cycles requested with cause `G1 Humongous Allocation`                                   | Large allocations, not occupancy, drive marking                                              | `gc+ergo+ihop` `source: concurrent humongous allocation`; `Humongous regions` non-zero                                                  | Allocation sizes above half a region                                        | `G1HeapRegionSize` (a power of two, ≤ 512 MB) so the objects fit a region; the allocation pattern; `g1-internals`                                      |
| GC overhead above 10 percent with pauses inside the goal                                | Frequency, not duration: young too small for the allocation rate                             | Interval between pauses short; `Eden regions` target small                                                                              | Allocation rate, interval, `T_fixed` share of each pause                    | Raise `MaxGCPauseMillis` if the SLO allows; `-Xms` equal to `-Xmx`; else allocation                                                                    |
| GC storm at start-up, settling after minutes                                            | `-Xms` below `-Xmx`: young is a percentage of the committed heap                             | `Heap expansion ... resize by` lines; `Eden regions` target growing pause by pause                                                      | Committed heap over time                                                    | `-Xms` equal to `-Xmx`; `-XX:+AlwaysPreTouch` when the container limit is the constraint                                                               |
| JVM refuses to start after a flag change                                                | Experimental flag without the unlock, or the unlock after the flag                           | `VM option '...' is experimental and must be enabled via -XX:+UnlockExperimentalVMOptions`                                              | —                                                                           | `-XX:+UnlockExperimentalVMOptions` before the flag; on 27+ the IHOP flag's old spelling warns as a deprecated alias (`jdk-upgrade-impact`)             |
| The client-side p99 exceeds any logged pause                                            | Time-to-safepoint, OS scheduling or throttling — not the collector                           | Requests flagged GC-affected whose latency far exceeds the pause; `safepoint` log shows reach time                                      | `-Xlog:safepoint`, cgroup throttling                                        | `pause-attribution`; no G1 flag                                                                                                                        |
| A flag change moved nothing                                                             | The flag does not govern the event, or the predictor overrode it                             | The policy lines above show the same `Min`/`max`/`threshold` before and after                                                           | The derivation's predicted value against the logged decision                | Revert; re-derive from the symptom row, not from the flag list                                                                                         |

## Version notes that change a derivation

- **JDK 25** merges the remembered sets of old regions in a collection-set candidate group
  (JDK-8343782), which is why candidates are logged in `groups` and why old-region RSet
  memory fell relative to 24; and selects mixed-collection regions using incoming reference
  counts gathered during marking (JDK-8351405), which removed a class of mixed-pause
  spikes. A mixed-pause derivation made on 21 or 17 measured a different collector.
- **JDK 25** ships compact object headers as a product option (JEP 519,
  `-XX:+UseCompactObjectHeaders`, default `false` on 25.0.3). Enabling it shrinks every
  header by 4 bytes, which lowers the live set and the copy cost per object — a footprint
  and copy-bandwidth measurement, not a flag in this skill, and one that invalidates a
  copy bandwidth measured without it.
- **Through JDK 26** a JVM that sees one CPU selects Serial; **JDK 27** (JEP 523) makes G1
  unconditional, and renames the IHOP flag to `G1IHOP` with the old spelling deprecated
  (JDK 27 early-access release notes; not executed here). Both are `jdk-upgrade-impact`
  items for a fleet that carries G1 flags on one-CPU pods.
- **JDK 18** raised the manual `G1HeapRegionSize` ceiling to 512 MB (JDK-8275056); the
  ergonomic ceiling stays at 32 MB. A humongous-driven derivation on an older runtime
  had no such lever above 32 MB.
