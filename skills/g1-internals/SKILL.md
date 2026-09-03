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
different things depending on which phase dominates: `Object Copy` says there is a lot of
live data to move; `Merge Heap Roots` says the remembered sets are expensive to scan.
These have opposite fixes, and the summary line cannot distinguish them.

The failure this prevents is diagnosing G1 with the vocabulary of a fixed-generation
collector. Mixed GC is not full GC. Humongous objects are not tenured survivors. Regions
are not a young/old split. Each of those confusions sends the investigation somewhere the
cause is not.

## Workflow

1. **Read young and mixed collections separately.** They are different events with
   different budgets; grep them apart before computing any statistic.
2. **Break the pause into phases** with `-Xlog:gc+phases` and identify which one dominates.
   Everything after this step depends on that answer.
3. **If `Object Copy` / `Evacuate Collection Set` dominates**, the cause is the volume of
   live data being moved — look at promotion rate and at how many old regions entered the
   collection set.
4. **If `Merge Heap Roots` / `Merge RS` dominates**, the cause is remembered-set scanning
   cost, and neither allocation nor promotion rate will explain it. Check reference fan-in
   and RSet representation.
5. **Check humongous allocation** with `-Xlog:gc+humongous` whenever the old generation
   grows without matching application state. Short-lived buffers above half a region can mimic
   retention until eager reclaim or a completed marking cycle; prove allocation, eligibility and
   reclamation rather than declaring either leak or non-leak from occupancy alone.
6. **Take at least ten mixed cycles** before calling anything a pattern, and report
   p50/p99/p99.9/max for the pauses — never the mean.
7. **Confirm every flag default in the target runtime** with `-XX:+PrintFlagsFinal
-version` before quoting it, and show the arithmetic behind any number you report.

## Rules

- A region size is chosen at startup as `clamp(1 MB, 32 MB, roundup_pow2(heap / 2048))`,
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
  mixed collections most of all.
- Through JDK 25, the post-write barrier does **not** update the RSet directly: it dirties the
  card and normally enqueues it for concurrent refinement; pause-time merging handles remaining
  work. JDK 26's delivered JEP 522 replaces the per-store fence/queue path with dual card tables
  that refinement swaps/sweeps. Confirm card size and mechanism on the target build.
- SATB is a snapshot of the object graph taken when marking begins, not continuous
  surveillance. A pre-write barrier records the previous value of every overwritten
  reference so an object that moves from one referrer to another mid-cycle is not lost.
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
  Both depend on the workload's reference fan-in; measure with `-Xlog:gc+remset` and a JMH
  `-prof gc` run on your own code.
- Do not cite a G1-specific JFR event name from memory. Discover what your runtime emits
  with `jfr summary <file> | grep -i g1` and use that as the source of truth.

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
  barrier path, concurrent refinement and the hot card cache, and the three RSet
  representations with the cost each one shifts. Read when `Merge Heap Roots` or
  `Merge RS` dominates, or when RSet memory is suspected of squeezing the heap.
