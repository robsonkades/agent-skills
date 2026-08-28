---
name: gc-fundamentals
description: >
  How JVM garbage collectors work, as the mental model behind every GC diagnosis: the
  generational hypothesis and where it fails, mark-sweep versus mark-compact versus copying,
  why collection cost tracks survivors rather than allocation, write barriers, safepoints
  and Time-To-SafePoint, and the JDK 25 collector landscape. Use when explaining why a
  collection is expensive, when the reported pause does not match the latency the client
  feels, when a cache or pool breaks the generational assumption, when humongous allocations
  appear, or when comparing collectors written before JDK 23. Does not cover choosing a
  collector or sizing the heap (jvm-gc-tuning), parsing the log (gc-log-analysis), or the
  non-heap regions (jvm-memory-regions). Per-collector internals are g1-internals and
  zgc-and-shenandoah, and the safepoint mechanism is safepoints.
---

# GC Fundamentals

## Purpose

Supply the mechanism behind GC symptoms, so a diagnosis explains rather than describes.
The failure this prevents is tuning a collector to fix something the collector is not
doing — most reported "GC problems" are the collector behaving correctly given how much
live data it is handed.

## Workflow

1. **Separate pause duration from pause frequency.** Duration points at the collector or
   the heap size. Frequency points _upstream_, at allocation rate.
2. **Ask what survived, not what was allocated.** Copying cost is proportional to
   survivors. Collecting a large Eden with 99% mortality costs about the same as
   collecting a small one.
3. **Check whether the generational hypothesis holds here.** It fails in caches, object
   pools, and any system where high downstream latency keeps many requests in flight.
   Recognising the failure is part of the diagnosis.
4. **Reconcile the reported pause with the observed one.** The GC log's pause does **not**
   include Time-To-SafePoint. If the log says 16 ms and the client felt 200 ms, the
   collector is not the problem — go to `-Xlog:safepoint`.
5. **Look upstream before touching a flag.** By `N = λ × R`, slower downstream calls mean
   more requests in flight, which means more live young objects. Expensive GC is
   frequently a symptom of slowness elsewhere.

## Rules

- The generational hypothesis is an empirical observation, not a theorem. Most objects die
  young — except where your design says otherwise.
- Cost follows survivors. "Allocating a lot" is rarely the problem; "surviving a lot"
  usually is.
- The three base algorithms are mark-sweep (does not move, fragments), mark-compact
  (compacts, expensive because it moves) and copying (no fragmentation, reserves space).
  Every real collector combines them per region and generation.
- Writing a reference is never just writing a reference: the write barrier maintains the
  card table, and G1's scheme (SATB pre-barrier plus a queued post-barrier) is
  substantially more expensive than the classic one.
- Short pause is a requirement, not a universal virtue. ZGC and Shenandoah buy
  sub-millisecond pauses with barriers and concurrent CPU. For batch work with no latency
  SLO, Parallel delivers more work per hour.
- `MaxGCPauseMillis` is a target, not a guarantee — and **lowering it can make everything
  worse**: it shrinks the young generation, collections become more frequent, objects get
  less time to die in Eden, and premature promotion rises.
- With a stop-the-world compacting collector, full-GC pause grows with heap size. Large
  heaps with a latency requirement need ZGC or Shenandoah, whose pauses do not depend on
  heap size.
- Full GC should be zero in a healthy production system. `G1 Evacuation Failure` means the
  old generation had no room for evacuees; raising the heap is palliative, the question is
  why old filled up.
- On the JDK 25 baseline, **ZGC is generational by definition** — `-XX:+ZGenerational` no
  longer exists (JEP 490, JDK 24) — and **generational Shenandoah is product** (JEP 521).
  Any collector comparison written before JDK 23 needs redoing.
- **From JDK 27, G1 is the default in every environment (JEP 523).** The JDK 9-era
  ergonomic rule that picked Serial on a small or single-CPU machine is gone — the JVM
  selects G1 unless a collector is named, so Serial must now be requested explicitly.

## References

- [Collector mechanisms](references/collector-mechanisms.md) — the algorithms, regions and
  barriers, and how each collector composes them on the JDK 25 baseline. Read when the
  question is _why_ a collection costs what it costs.
- [Safepoints and Time-To-SafePoint](references/safepoints.md) — what a safepoint is, why
  TTSP is excluded from the reported pause, and the current causes of high TTSP. Read when
  the pause the client felt does not match the pause in the log.
