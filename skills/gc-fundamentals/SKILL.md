---
name: gc-fundamentals
description: >
  How JVM garbage collectors work, as the mental model behind every GC diagnosis: the
  generational hypothesis and where it fails, mark-sweep versus mark-compact versus copying,
  how survivors, allocation and roots affect collection cost, write barriers, safepoints
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

1. **Identify the target, then separate pause duration from frequency.** Inspect the exact
   Java build, collector/mode, effective heap/CPU limits and flags. Duration can reflect
   live data, phase work or scheduling; frequency can reflect allocation, young capacity,
   triggers or changed ergonomics. Compare like-for-like windows before choosing a cause.
2. **Ask what survived, then inspect the non-copy work.** The evacuation component tracks
   surviving objects (and their shape) much more closely than allocated bytes. A large
   mostly-dead Eden can therefore be cheap to reclaim, but root scanning, remembered-set
   work, reference processing, worker imbalance and page effects can still dominate; do
   not infer total pause time from mortality alone.
3. **Read the phases before the total.** A young pause is root scanning, remembered-set
   scanning, copying and reference processing, and each grows for a different reason.
   `-Xlog:gc+phases=debug` names the one that grew; the mapping from phase to cause is in
   `references/collector-mechanisms.md`.
4. **Check survival in this workload.** Caches, pools and retained requests can increase
   survival, but their presence alone does not establish failure of the generational hypothesis.
5. **Reconcile the reported pause with the observed one.** The GC log's pause does **not**
   include Time-To-SafePoint. If the log says 16 ms and the client felt 200 ms, the
   GC event alone does not explain the observation — correlate `-Xlog:safepoint`, request
   traces and host scheduling. On 25, bulk operations with sparse polls (a large
   `arraycopy` or array zeroing), VM transitions and CPU starvation remain relevant;
   counted-loop polling depends on collector/compiler flags, not Java version alone.
6. **Look upstream before touching a flag.** Under stable throughput and bounded steady-state
   conditions, `N = λ × R` relates average requests in flight to mean residence time. Slower
   downstream calls can retain more objects, unless admission/cancellation changes throughput.
7. **Match the symptom to a mechanism** with the table in
   `references/diagnosis-and-versions.md`, then hand off to the skill that owns the fix.

## Rules

- The generational hypothesis is an empirical observation, not a theorem. Most objects die
  young — except where your design says otherwise.
- Evacuation depends on surviving object count, bytes, reference shape, bandwidth and workers.
  Smaller objects can reduce frequency and copy/cache costs without reducing traversal count.
  Compare the same collector phase under the same workload before attributing a change to
  object layout; a Full GC timing does not establish young-evacuation cost.
- The three base algorithms are mark-sweep (does not move and can fragment), mark-compact
  (relocates to reduce fragmentation) and copying (compacts its destination, reserves space).
  Real tracing collectors select or combine them; Epsilon deliberately does not collect.
- Reference stores may execute write barriers that maintain the
  card table or remembered set. Through 25, G1 uses an SATB pre-barrier plus a filtered,
  queued post-barrier; its cost relative to a simple card mark depends on the workload and
  must be measured. JEP 522 (JDK 26) replaces the queue with a second card table. The
  concurrent collectors are not
  "load barriers instead": generational ZGC and generational Shenandoah carry store
  barriers as well.
- Promoted objects remain in old until that collector's old-space reclamation reaches them.
  Remembered old-to-young edges can keep young referents alive even when the old source is
  dead (nepotism); not every old object adds work to every young collection.
- Post-mark occupancy is not exact live data. SATB can retain objects that died after the
  snapshot and treats newly allocated areas conservatively, but intervening young collections
  and staged reclamation matter. Floating garbage is not equal to one cycle's allocations.
  Compare equivalent post-reclamation points; do not force a production Full GC just to sample.
- Short pause is a requirement, not a universal virtue. ZGC and Shenandoah move much GC
  work out of the stop-the-world path in exchange for barriers, concurrent CPU and heap
  headroom for the cycle to outrun allocation. For batch work with no latency SLO,
  Parallel is a candidate because its stop-the-world design can maximize throughput; only
  a representative run establishes which collector delivers more useful work per hour.
- `MaxGCPauseMillis` is a target, not a guarantee — and **lowering it can make everything
  worse**: under G1 adaptive sizing it can shrink young capacity, increase frequency and
  promotion pressure. Verify the effect rather than treating it as an inevitable chain.
- A generational young collection need not scan the whole heap, but its pause is not
  independent of heap size: ergonomics may enlarge the young generation, root and
  remembered-set structures can grow, and more survivors or old-to-young edges add work.
  Full-heap stop-the-world work has a stronger live-set/heap dependency. ZGC and
  Shenandoah reduce that dependency for normal concurrent cycles. ZGC can stall allocating
  mutators; Shenandoah can degenerate or fall back to Full GC. These are different mechanisms.
- Unplanned Full GC should be absent from the steady-state latency budget of an online
  service; an explicit maintenance or batch collection may be acceptable if it is outside
  the SLO and measured. On 25 G1 logs an evacuation
  failure as `(Evacuation Failure: Allocation)` when evacuation could not obtain destination
  space. Distinguish destination demand, usable reserve, allocation restrictions and pinned
  regions; do not infer zero free regions or humongous contiguity failure from the label alone.
- On the JDK 25 baseline, **ZGC is generational by definition** — `-XX:+ZGenerational` no
  longer selects a mode (obsolete and ignored with a warning on 25; JEP 490) — and
  **generational Shenandoah is product** (JEP 521).
  Any collector comparison written before JDK 23 needs redoing.
- **Separate delivered changes from targets and local validation.** As of 2026-09-05,
  [JEP 523](https://openjdk.org/jeps/523) is Closed/Delivered for JDK 27, changing G1's
  default selection in constrained environments. The tested JDK 25 build still picks Serial
  with one CPU. [JEP 535](https://openjdk.org/jeps/535) targets JDK 28 for Shenandoah's
  generational default; it is not delivered. Verify the actual vendor build and flags.

## Output

Report the observed collector phase/symptom, supported candidate mechanism, competing cause,
next discriminating measurement and owning skill. State when logs or workload evidence are
missing; do not infer causation from a phase name or run an intrusive diagnostic automatically.

## References

- [Collector mechanisms](references/collector-mechanisms.md) — the algorithms, the
  tri-colour invariants, generations and promotion, the anatomy of a young pause with the
  25.0.3 phase names, barriers per collector, allocation, humongous objects, reference
  processing, what the concurrent collectors trade, and the landscape table. Read when the
  question is _why_ a collection costs what it costs.
- [Safepoints and Time-To-SafePoint](references/safepoints.md) — what a safepoint is, why
  TTSP is excluded from the reported pause, the 25 log line, and the causes of high TTSP
  with measurements that distinguish them. Read when the pause the client felt does not match
  the pause in the log.
- [Diagnosis and versions](references/diagnosis-and-versions.md) — the symptom → mechanism
  → how to distinguish → what to measure → owner table, the integrated JDK 9–27 collector
  timeline plus explicitly labelled proposals
  with JEP numbers, and the flag lifecycle. Read when a symptom is in hand and the next
  step is unclear, or when a document about GC predates the JDK in production.
