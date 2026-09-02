---
name: gc-fundamentals
description: >
  How JVM garbage collectors work, as the mental model behind every GC diagnosis: the
  generational hypothesis and where it fails, mark-sweep versus mark-compact versus copying,
  why collection cost tracks survivors rather than allocation, write barriers, safepoints
  and Time-To-SafePoint, and the JDK 25 collector landscape. Use when explaining why a
  collection is expensive, when the reported pause does not match the latency the client
  feels, when a young pause is long although little survived, when a cache or pool breaks
  the generational assumption, when humongous allocations appear, or when comparing
  collectors written before JDK 23. Does not cover choosing a collector or sizing the heap
  (jvm-gc-tuning), parsing the log (gc-log-analysis), or the non-heap regions
  (jvm-memory-regions). Per-collector internals are g1-internals and zgc-and-shenandoah,
  and the safepoint mechanism is safepoints.
---

# GC Fundamentals

## Purpose

Supply the mechanism behind GC symptoms, so a diagnosis explains rather than describes.
The failure this prevents is tuning a collector to fix something the collector is not
doing — most reported "GC problems" are the collector behaving correctly given how much
live data it is handed.

## Workflow

1. **Separate pause duration from pause frequency.** Duration points at the live set, at
   one phase of the pause, or at the collector. Frequency points _upstream_, at allocation
   rate.
2. **Ask what survived, not what was allocated.** Copying cost is proportional to
   survivors — to the objects visited more than to their bytes. Collecting a large Eden
   with 99% mortality costs about the same as collecting a small one.
3. **Read the phases before the total.** A young pause is root scanning, remembered-set
   scanning, copying and reference processing, and each grows for a different reason.
   `-Xlog:gc+phases=debug` names the one that grew; the mapping from phase to cause is in
   `references/collector-mechanisms.md`.
4. **Check whether the generational hypothesis holds here.** It fails in caches, object
   pools, and any system where high downstream latency keeps many requests in flight.
   Recognising the failure is part of the diagnosis.
5. **Reconcile the reported pause with the observed one.** The GC log's pause does **not**
   include Time-To-SafePoint. If the log says 16 ms and the client felt 200 ms, the
   collector is not the problem — go to `-Xlog:safepoint`. On 25 the causes are bulk
   operations with no poll (a large `arraycopy`, zeroing a large array), native code and
   CPU starvation, not counted loops.
6. **Look upstream before touching a flag.** By `N = λ × R`, slower downstream calls mean
   more requests in flight, which means more live young objects. Expensive GC is
   frequently a symptom of slowness elsewhere.
7. **Match the symptom to a mechanism** with the table in
   `references/diagnosis-and-versions.md`, then hand off to the skill that owns the fix.

## Rules

- The generational hypothesis is an empirical observation, not a theorem. Most objects die
  young — except where your design says otherwise.
- Cost follows survivors, counted in objects. Executed on Temurin 25.0.3: a young pause
  evacuating ten million live 24-byte nodes spent 328 ms in `Evacuate Collection Set`; the
  same list with `-XX:+UseCompactObjectHeaders` (JEP 519, product on 25, off by default)
  was 33% smaller in bytes (230 MB → 154 MB) and its full collection took the same 240 ms.
  Smaller objects buy fewer collections, not shorter ones.
- The three base algorithms are mark-sweep (does not move, fragments), mark-compact
  (compacts, expensive because it moves) and copying (no fragmentation, reserves space).
  Every real collector combines them per region and generation.
- Writing a reference is never just writing a reference: the write barrier maintains the
  card table or remembered set, and G1's scheme (SATB pre-barrier plus a queued
  post-barrier) is substantially more expensive than the classic one through 25 — JEP 522
  (JDK 26) replaces the queue with a second card table. The concurrent collectors are not
  "load barriers instead": generational ZGC and generational Shenandoah carry store
  barriers as well.
- Promotion is a one-way door. An object copied to old stays until a mixed or full
  collection reaches it, and while dead there it keeps every young object it references
  alive through the card table — nepotism. Premature promotion therefore raises the cost of
  every _young_ collection that follows, not only the old one.
- After a concurrent marking cycle the heap is not the live set. SATB marks everything
  allocated during the cycle live, so the post-cycle occupancy overstates retention by the
  allocation of one cycle; judge retention from a full collection or the trend across
  cycles.
- Short pause is a requirement, not a universal virtue. ZGC and Shenandoah buy
  sub-millisecond pauses with barriers, concurrent CPU and heap headroom for the cycle to
  win its race with allocation. For batch work with no latency SLO, Parallel delivers more
  work per hour.
- `MaxGCPauseMillis` is a target, not a guarantee — and **lowering it can make everything
  worse**: it shrinks the young generation, collections become more frequent, objects get
  less time to die in Eden, and premature promotion rises.
- Young pauses do not grow with heap size under any generational collector — they grow
  with survivors and with the old-to-young references that must be scanned. What grows
  with the heap is a stop-the-world full collection, and only ZGC and Shenandoah remove
  that dependency.
- Full GC should be zero in a healthy production system. On 25 G1 logs an evacuation
  failure as `(Evacuation Failure: Allocation)` on the pause line: no free region was left
  to copy into. Old having filled up is the usual reason, humongous fragmentation and the
  `G1ReservePercent` (10) reserve being consumed are the others; raising the heap is
  palliative, the question is why the free list emptied.
- On the JDK 25 baseline, **ZGC is generational by definition** — `-XX:+ZGenerational` no
  longer exists (JEP 490, JDK 24) — and **generational Shenandoah is product** (JEP 521).
  Any collector comparison written before JDK 23 needs redoing.
- **From JDK 27, G1 is the default in every environment (JEP 523).** Through 26 a JVM
  that sees one CPU picks Serial (executed on 25.0.3: `-XX:ActiveProcessorCount=1` logs
  `Using Serial`), so a one-CPU pod runs a stop-the-world collector until the upgrade
  changes it under them.

## References

- [Collector mechanisms](references/collector-mechanisms.md) — the algorithms, the
  tri-colour invariants, generations and promotion, the anatomy of a young pause with the
  25.0.3 phase names, barriers per collector, allocation, humongous objects, reference
  processing, what the concurrent collectors trade, and the landscape table. Read when the
  question is _why_ a collection costs what it costs.
- [Safepoints and Time-To-SafePoint](references/safepoints.md) — what a safepoint is, why
  TTSP is excluded from the reported pause, the 25 log line, and the causes of high TTSP
  with the measurements that rank them. Read when the pause the client felt does not match
  the pause in the log.
- [Diagnosis and versions](references/diagnosis-and-versions.md) — the symptom → mechanism
  → how to distinguish → what to measure → owner table, the JDK 9–28 collector timeline
  with JEP numbers, and the flag lifecycle. Read when a symptom is in hand and the next
  step is unclear, or when a document about GC predates the JDK in production.
