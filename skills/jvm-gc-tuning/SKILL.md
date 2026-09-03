---
name: jvm-gc-tuning
description: >
  Deciding whether GC is the actual bottleneck, then choosing a collector and sizing the
  heap. Use when GC pauses appear on the critical path of a latency profile, when full
  collections show up, when the heap grows toward its limit, when sizing a JVM for a
  container, or when a collector change is being proposed. Start from java-performance
  instead when the symptom is latency or CPU and GC has not been confirmed as the cause.
  Does not cover how collectors work internally (gc-fundamentals), configuring and reading
  the GC log (gc-log-analysis), the non-heap memory budget (jvm-memory-regions), or
  allocation profiling (allocation-profiling) or leak hunting
  (java-reference-types-and-leaks). Deriving G1 flag
  values from an SLO is g1-tuning-for-slo and operating the concurrent collectors is
  zgc-and-shenandoah.
---

# JVM GC Tuning

## Purpose

Make two decisions and only two: **is GC the bottleneck**, and if so, **which collector and
what heap size**. Most reported "GC problems" are allocation problems wearing a costume —
the collector is behaving correctly given how much garbage it is handed — so the first
decision is the one that saves the most time.

## Workflow

1. **Confirm GC is on the critical path.** Align GC/safepoint intervals with affected
   requests, queue depth, CPU and throughput. Temporal overlap routes the investigation;
   matched unaffected windows and recovery behavior help establish causality.
2. **Separate duration, frequency and concurrent cost.** Duration decomposes into roots,
   remembered sets, copying, reference processing, scheduling and collector phases.
   Frequency depends on allocation, young sizing and triggers. Concurrent CPU/barriers can
   reduce throughput without a long pause.
3. **Reconcile the logged pause with the pause the client felt.** A discrepancy means the
   event alone is insufficient; `gc-fundamentals` covers Time-To-SafePoint and
   `linux-for-jvm` covers throttling and page faults.
4. **Check upstream before touching a flag.** By `N = λ × R`, slower dependencies keep more
   requests in flight and more objects alive. Expensive GC is frequently a symptom of
   slowness elsewhere, and tuning the collector masks the cause.
5. **Size the heap and container explicitly**, choosing fixed versus elastic initial heap
   from startup, residency, density and SLO evidence, with non-heap/untracked margin.
6. **Change the collector only** when the workload's requirement genuinely does not match
   the default's design point.
7. **Re-measure with the method that produced the baseline.** A flag change that does not
   move the pause distribution gets reverted, not kept "just in case".

## Rules

- Never set GC flags copied from a blog post without the log that justified them.
- Choose the least risky lever that addresses the measured mechanism. Allocation/lifetime
  changes can be architecturally larger than a collector switch, while one flag can be more
  dangerous than either; there is no universal order by “size.”
- `-Xmx` is not the container limit. Metaspace, code cache, thread stacks and direct
  buffers live outside it and still count against the cgroup.
- In a container, fixed `-Xms = -Xmx` trades predictable heap ergonomics/no growth for
  earlier commitment and usually higher residency pressure; variable heap trades warm-up
  variability for footprint elasticity. Container memory can still serve page cache,
  sidecars and node density. `AlwaysPreTouch` moves page population to startup and can
  expose an undersized cgroup early, but raises startup/RSS and does not prevent swap or
  later faults. Measure the selected policy; do not combine these flags by ritual.
- On the verified JDK 25 build, one visible CPU selected Serial
  (`-XX:ActiveProcessorCount=1`). JDK 27 EA documentation says G1 is the default, while JEP
  523 remains Candidate as of 2026-09-03. Verify the exact vendor/build with startup logs or
  `VM.flags`; explicitly name a collector when fleet-wide intent must not depend on ergonomics.
- `MaxGCPauseMillis` is a target, not a guarantee. Lowering it often selects less young/CSet
  work and increases frequency; promotion changes only if lifetime/survivor policy makes it
  so. Raising it is a throughput candidate, not a rule—validate tails, pause share and CPU.
- A rising post-reclamation floor means more retained state under those conditions. It may
  be a leak, cache, workload/cardinality change or legitimate working set; name the ownership
  contract before declaring a defect. No collector removes strongly reachable state.
- Unplanned Full GC should be outside an online service's steady-state SLO. An evacuation
  failure means usable to-space was unavailable, not simply “old had no room”; inspect live
  set, promotion spike, pinning, humongous topology and reserve before choosing heap growth.
- Prefer fewer flags. Every flag is a decision the JVM's own heuristics can no longer adapt.
- Do not carry over pre-JDK-23 collector comparisons: ZGC is generational by definition
  (`-XX:+ZGenerational` no longer exists, JEP 490) and generational Shenandoah is product
  (JEP 521). Its mode remains explicit/default-build-dependent; a 2026 draft JDK-8379682
  proposes changing the default but has no JEP number or target. An inherited
  `-XX:+ZGenerational` is an upgrade blocker rather than a no-op: Temurin 25.0.4 warns and
  starts, Temurin 26.0.2 **refuses to start** (both executed).

## References

- [Collector selection and heap sizing](references/collector-and-heap.md) — the choice
  table by heap size, CPU count, latency requirement and throughput, the GC-thread
  ergonomics measured on JDK 25, sizing the heap from a measured live set, and the
  container headroom calculation. Read once step 1 has confirmed GC is on the critical
  path, or when a heap size is being chosen for a new service.
