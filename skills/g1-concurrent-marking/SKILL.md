---
name: g1-concurrent-marking
description: >
  G1's concurrent marking cycle: SATB and the pre-write barrier, the five phases and the
  single mark bitmap with TAMS, adaptive IHOP triggering, mark stack overflow and its
  consequences, humongous allocation and eager reclaim, and mixed-collection candidate
  selection. Use when the log shows "Concurrent Mark Restart for Mark Stack Overflow", when
  "Pause Full" follows incomplete marking cycles, when "Concurrent Mark From Roots" grows
  longer cycle over cycle, when marking starts well away from 45% occupancy, when someone
  proposes -XX:G1HeapOccupancyPercent or -XX:+G1SummarizeConcMark, or when humongous
  allocations are frequent. Does not cover regions, remembered sets and the evacuation pause
  itself (g1-internals), choosing flag values against an SLO (g1-tuning-for-slo), or
  configuring and parsing the GC log (gc-log-analysis).
---

# G1 Concurrent Marking

## Purpose

Decide why a G1 marking cycle is failing to do its job — starting too late for the real
promotion rate, restarting because the SATB queue overflowed, or never finishing before the
old generation fills — and which of those the evidence in the log actually supports. Marking
is the only thing that tells the mixed collector which regions are worth evacuating; when it
is late or aborted, the collector loses its input and falls back to a full GC.

The failure this prevents is treating the visible last event as the cause. A `Pause Full` at
the end of a chain is the consequence; the cause is upstream, in the trigger, the barrier
queue or an evacuation failure that invalidated the snapshot. Tuning the pause that was
logged fixes nothing.

## Workflow

1. **Confirm which phase names you are reading.** G1's cycle is `Pause Young (Concurrent
Start)`, `Concurrent Mark From Roots`, `Pause Remark`, `Pause Cleanup`, `Concurrent
Cleanup`. `Pause Mark Start` / `Pause Mark End` are ZGC's — a log quoting those is not G1.
2. **Capture at least one complete cycle**, not fragments, with
   `-Xlog:gc+marking=debug` alongside the base `-Xlog:gc*`.
3. **Check whether the trigger is adaptive before touching it.**
   `java -XX:+PrintFlagsFinal -version | grep G1UseAdaptiveIHOP`. With the default `true`,
   `InitiatingHeapOccupancyPercent` is only the initial floor, and marking starting away from
   45% is the predictor working, not a bug.
4. **Track the occupancy at each `Pause Young (Concurrent Start)` over time.** A rising
   series is the predictor running behind the real promotion rate — the signature of a cycle
   starting too late.
5. **Classify the failure mode from the log line, not from the full GC.** Mark stack
   overflow, evacuation failure and humongous pressure produce different upstream evidence.
   Use the table in `references/marking-pathologies.md`.
6. **Separate humongous allocated from humongous reclaimed** before calling it pressure —
   eager reclaim returning regions every young GC is healthy behaviour, not a leak.
7. **Re-measure any region-size or IHOP change under the same allocation and promotion
   rate** as the original measurement, and check the effect on mixed collections: region size
   changes the Garbage-First granularity, not just the humongous threshold.

## Rules

- `-XX:G1HeapOccupancyPercent` does not exist. The flag is
  `-XX:InitiatingHeapOccupancyPercent`, deprecated from JDK 27 and aliased to `-XX:G1IHOP`.
  Confirm every externally sourced flag with `-XX:+PrintFlagsFinal` before it reaches a
  production script.
- `-XX:+G1SummarizeConcMark` was removed by the unified logging work (JEP 158, JDK 9). Use
  `-Xlog:gc+marking=debug`. `-XX:+G1SummarizeRSetStats` went the same way and is already
  `Unrecognized VM option` on JDK 11 — the JVM refuses to start and suggests the flag that did
  survive. For remembered-set cost use `-XX:G1SummarizeRSetStatsPeriod=<n>` with
  `-Xlog:gc+remset=trace`.
- With `G1UseAdaptiveIHOP=true` (default), setting a static IHOP **competes** with the
  predictor rather than replacing it predictably. Fixing a value manually is justified for
  bursty traffic, where the predictor never accumulates representative samples and is always
  reacting to the previous regime.
- `Pause Cleanup` (STW) and `Concurrent Cleanup` (concurrent) are two distinct phases sharing
  a word. Reporting `Concurrent Cleanup` as a short STW pause is self-contradictory.
- The SATB barrier enqueues the **old** value of the field, never the new one. It guarantees
  "live at the start of the snapshot"; a new reference created after the snapshot is already
  covered by the rest of the marked graph.
- SATB can only over-retain, never under-retain. Floating garbage is reclaimed next cycle; a
  lost live object would be heap corruption. Never "optimise" the barrier away from that
  asymmetry.
- The humongous threshold is **strict**: `size > G1HeapRegionSize / 2`. An object of exactly
  half the region size is not humongous. Size payloads with clear margin below the threshold,
  never at it — a worst case that just grazes it makes part of the traffic humongous and part
  of it not, under the same nominal load.
- Since JDK 20 (JDK-8210708) there is a **single** `G1CMBitMap`, not a prev/next pair; TAMS
  alone distinguishes pre-snapshot from post-snapshot objects, per region. Native bitmap
  overhead dropped from roughly 3% to 1.5% of the heap, and a concurrent
  "Rebuild Remembered Sets and Scrub Regions" phase appeared between `Pause Remark` and
  `Pause Cleanup`.
- Objects allocated at or above a region's TAMS are implicitly live and are never marked in
  the bitmap. That is what lets promotion continue during a cycle without forcing re-marking.
- Eager reclaim frees humongous regions inside an ordinary STW pause, but **only** for objects
  whose remembered set shows no other region pointing at them. A humongous object that survives
  long enough to accumulate cross-region references is not eligible and waits for a complete
  cycle. **There is no boolean to turn this off from JDK 20.**
  `-XX:+G1EagerReclaimHumongousObjects` — experimental, default `true` — was accepted on 11
  through 19 and is `Unrecognized VM option` from 20 onward, so the JVM refuses to start on it
  (executed on Temurin 11, 17, 18, 19, 20, 21, 24 and 25). What remains is
  `-XX:G1EagerReclaimRemSetThreshold`, the eligibility cut-off itself: experimental and
  **ergonomic**, measured at 16 on JDK 17–24 and 32 on 25, so read it off the runtime rather
  than quoting a value.
- Full GC in G1 has been parallel since JDK 10 (JEP 307). It is still the most expensive
  operation the collector performs — because it processes the whole heap rather than a
  selected subset of regions, not because it is serial. Repeating "serial and therefore slow"
  leads people to read "no longer serial" as "no longer expensive".
- The remembered set is a time cost, not only a memory cost: every phase that traverses it
  pays, including `Concurrent Mark From Roots`.
- Quote every write-barrier or RSet overhead figure as an estimate to be validated on the
  workload (a JMH run with `-prof gc` inside and outside a marking window), never as a
  constant of the collector.

## References

- [The cycle, its log and its flags](references/marking-cycle-log-and-flags.md) — the phase
  sequence with correct names, an annotated log of a complete cycle, the logging and
  diagnostic flags with their defaults, JFR events, and the HotSpot source paths. Read when
  configuring marking instrumentation or reading a marking log for the first time.
- [Marking pathologies](references/marking-pathologies.md) — symptom-to-hypothesis-to-
  instrument table, the SATB buffer and overflow mechanism, how evacuation failure invalidates
  the snapshot, and the humongous threshold and eager-reclaim decision. Read when a cycle
  restarts, does not finish, or is followed by a full GC.
