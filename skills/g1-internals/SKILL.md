---
name: g1-internals
description: >
  How G1 actually works: uniform regions and the ergonomic sizing formula, remembered sets
  and the card table with its write barrier, SATB and the pre-write barrier, the phases of
  an evacuation pause, humongous allocation and why it bypasses the young generation, and
  how the collection set is chosen for a mixed collection. Use when a pause is longer than
  the live-set size explains, when `Merge Heap Roots` or `Merge RS` dominates
  `-Xlog:gc+phases`, when legacy `To-space exhausted` or current `Evacuation Failure`
  appears, when the old generation grows
  without the application retaining anything, when `Humongous regions` climbs in the log,
  when someone sets `-Xmn` under G1, or when mixed GC is being described as a full GC. Does
  not cover the introductory collector mental model and generational hypothesis
  (gc-fundamentals), choosing values for the flags against a latency SLO
  (g1-tuning-for-slo), or the concurrent marking cycle in depth (g1-concurrent-marking).
---

# G1 Internals

## Purpose

Explain a G1 pause from the mechanism that produced it, so that the tuning action follows
from evidence rather than from a flag someone remembers. The same 40 ms pause means
different things depending on which phase dominates: `Object Copy` identifies live-data
movement and its execution cost; `Merge Heap Roots` identifies root-card
preparation cost. The sub-phases and supporting measurements distinguish causes; neither
duration alone nor the summary line establishes the fix.

The failure this prevents is diagnosing G1 with the vocabulary of a fixed-generation
collector. Mixed GC is not full GC. Humongous objects are not tenured survivors. Regions
are not a young/old split. Each of those confusions sends the investigation somewhere the
cause is not.

## Workflow

The detailed source model here is OpenJDK 25; older/newer releases are labelled where discussed.
Inspect target vendor/update, effective flags and collector before using internal names or defaults.
These are HotSpot implementation details, not Java language guarantees; do not upgrade to apply them.

1. **Read young and mixed collections separately.** They are different events with
   different budgets; grep them apart before computing any statistic.
2. **Break the pause into phases** with `-Xlog:gc+phases` and identify which one dominates.
   Everything after this step depends on that answer.
3. **If `Evacuate Collection Set` dominates**, distinguish `Object Copy` from root scanning.
   For copying, correlate live bytes, promotion and CSet size with worker imbalance, CPU availability
   and memory bandwidth; a long phase does not prove a larger live set.
4. **If `Merge Heap Roots` / `Merge RS` dominates**, inspect card-set merging and pending dirty
   cards; correlate `Scan Heap Roots` separately for heap-reference scanning. Check reference fan-in,
   RSet representation and refinement activity before selecting an action.
5. **Check humongous allocation** with `-Xlog:gc+humongous` whenever the old generation
   grows without matching application state. Short-lived buffers above half a region can mimic
   retention until eager reclaim or a completed marking cycle; prove allocation, eligibility and
   reclamation rather than declaring either leak or non-leak from occupancy alone.
6. **Sample representative workload windows**, separating pause types and reporting event count,
   duration, distribution and maxima. Ten mixed cycles is not a statistical guarantee; omit or label
   unsupported tail estimates. A mean can supplement, not replace, the distribution.
7. **Confirm every flag default in the target runtime** with `-XX:+PrintFlagsFinal
-version` before quoting it, and show the arithmetic behind any number you report.

## Rules

- On OpenJDK 25, automatic region sizing uses `clamp(1 MiB, 32 MiB, roundup_pow2(max_heap / 2048))`,
  targeting about 2048 regions. The 32 MB ceiling applies to the **automatic ergonomic
  selection only**: since JDK 18 (JDK-8275056) `-XX:G1HeapRegionSize` accepts manual
  values up to **512 MB**, powers of two.
- An object is humongous when its size exceeds `G1HeapRegionSize / 2`. Humongous objects
  skip Eden and occupy one or more contiguous humongous regions in the old-generation address
  space. Eligible short-lived humongous objects can be eagerly reclaimed during an ordinary
  young pause; otherwise liveness comes from a marking cycle. Contiguous free-region demand can
  fail despite sufficient noncontiguous free capacity.
- Young GC is always stop-the-world and always collects **every** Eden and Survivor
  region. G1 sizes young dynamically between `G1NewSizePercent` (default 5) and
  `G1MaxNewSizePercent` (default 60), aiming at `MaxGCPauseMillis` (default 200).
- Avoid `-Xmn` under G1 in normal operation: it constrains young sizing and can defeat the
  adaptive pause/throughput trade. A fixed young size is defensible only as a measured diagnostic
  or tightly controlled workload choice with promotion, pause and throughput validation;
  percentage bounds preserve more ergonomics across heap sizes.
- `MaxGCPauseMillis` is a best-effort goal, not a hard limit. Allocation failure, to-space
  exhaustion and a pressured old generation all force collections that violate it,
  including mixed collections; no universal ranking of pause overruns follows from the type.
- Through JDK 25, the post-write barrier does **not** update the RSet directly: it dirties the
  card and normally enqueues it for concurrent refinement; pause-time merging handles remaining
  work. JDK 26's delivered JEP 522 replaces the per-store fence/queue path with dual card tables
  that refinement swaps/sweeps. Confirm card size and mechanism on the target build.
- SATB preserves snapshot-at-the-beginning reachability without copying the entire graph.
  While marking is active, eligible pre-write barriers log overwritten non-null values;
  initialization/elision and queue filtering mean not every store produces a retained entry.
  Its cost depends on eligible reference-store rate, marking duration, buffer processing and the
  generated fast path; measure it rather than deriving a constant from card marking.
- Mixed GC collects the young collection set plus selected old candidates whose liveness/cost
  satisfy policy (including `G1MixedGCLiveThresholdPercent`). `G1MixedGCCountTarget` is the
  **target number over which to spread** candidate reclamation, not a guaranteed minimum or
  maximum; pause prediction, minimum old-set sizing and `G1HeapWastePercent` can change/stop the
  sequence. Read the actual CSet and reclaimed bytes.
- Legacy `To-space exhausted` and current `Evacuation Failure: Allocation` indicate copy
  allocation could not complete; `Evacuation Failure: Pinned` names a distinct pinned-region
  cause. G1 may retain failed regions, expand when possible, retry young collections or eventually
  compact. Reconstruct the following events; none of these labels alone means a full GC occurred.
- "Initial Mark" does not appear in a modern log. The phase is
  `Pause Young (Concurrent Start)`; searching for the old name returns nothing.
- G1 has been the standard HotSpot default since JDK 9, so `-XX:+UseG1GC` usually does not change
  an otherwise default launch. Keeping it can make collector intent explicit and guard against an
  inherited alternative flag; verify the effective collector rather than calling explicit config
  universally redundant.
- `System.gc()` triggers a full GC by default. Decide explicitly:
  `-XX:+ExplicitGCInvokesConcurrent` makes it a concurrent cycle,
  `-XX:+DisableExplicitGC` ignores it.
- Never quote a per-entry RSet size or a write-barrier overhead percentage as a constant.
  RSet cost depends on card density, tracking and representation; barrier cost also depends on
  store paths and generated code. RSet logs measure metadata/activity; JMH `-prof gc` reports
  allocation/GC, not isolated barrier CPU. Use controlled throughput/CPU comparisons and profiles
  or assembly inspection to support attribution, preserving the target workload and JDK.
- Do not cite a G1-specific JFR event name from memory. Inspect `jfr summary <file>` for recorded
  counts and `jfr metadata` plus recording settings for availability/enabling; absence is not proof
  the runtime lacks an event.

## Decision and validation ledger

For any change record `(JDK vendor/update, heap/container limit, region size, workload,
hypothesis, evidence, flag, expected mechanism)`. Compare allocation and old-allocation rates,
post-GC live set, CSet composition, phase percentiles, concurrent/total GC CPU, application
throughput/tail latency, evacuation failure and recovery. Larger regions raise the humongous
threshold but reduce collection granularity and make each coarse/full card-set scan cover more
bytes; a lower pause target can increase collection frequency/overhead. No flag is one-dimensional.

GC logs and recordings may reveal class-loader, path and workload metadata. Restrict collection
and access, rotate/encrypt captures, and avoid shipping diagnostic verbosity indefinitely.

## References

- [Phase breakdown and region diagnostics](references/phase-diagnostics.md) — the log
  configuration, how to read a G1 summary line, and the mapping from a dominant phase to
  the mechanism responsible. Read when you have a pause to explain and need to turn the
  log into a cause.
- [Remembered sets in depth](references/remembered-sets.md) — the card table and write
  barrier path, concurrent refinement and legacy hot-card-cache changes, and current RSet
  representations with the cost each one shifts. Read when `Merge Heap Roots` or
  `Merge RS` dominates, or when RSet memory is suspected of squeezing the heap.
