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

Determine **whether GC contributes to the reported constraint**, then **whether the
collector or heap policy should change**. Allocation, retained state, collector policy
and resource pressure are competing explanations; none is the default diagnosis. For a
new service, choose an initial policy and the measurements needed to validate it.

## Workflow

Inspect the project's runtime vendor/update, image, effective flags and resource limits.
The HotSpot JDK 25 observations below are an authoring baseline, not portable Java
guarantees or authorization to upgrade the target. Integrated or targeted JEPs do not
establish availability in a deployed GA build. Reuse available artifacts; when measurements
are missing, state the hypothesis and smallest discriminating capture or experiment.

1. **Define the objective and test GC's contribution.** For latency, align GC/safepoint
   intervals with affected requests, queue depth, CPU and throughput. Temporal overlap
   routes the investigation; matched unaffected windows and recovery behavior help
   establish causality. For throughput or footprint, examine GC CPU/cycles or heap
   occupancy and residency. New-service sizing remains provisional until measured.
2. **Separate duration, frequency and concurrent cost.** Duration decomposes into roots,
   remembered sets, copying, reference processing, scheduling and collector phases.
   Frequency depends on allocation, young sizing and triggers. Concurrent CPU/barriers can
   reduce throughput without a long pause.
3. **Reconcile the logged pause with the pause the client felt.** A discrepancy means the
   event alone is insufficient; `gc-fundamentals` covers Time-To-SafePoint and
   `linux-for-jvm` covers throttling and page faults.
4. **Compare allocation, retention and capacity explanations.** At comparable arrival
   rates in a stable system, `N = λ × R` predicts more in-flight requests as residence
   time rises. Check whether retained request state rose with dependency delay; the
   relationship alone does not identify the cause. Choose the lever that addresses the
   observed mechanism, distinguishing immediate mitigation from an ownership or code fix.
5. **Size the heap and container explicitly**, choosing fixed versus elastic initial heap
   from startup, residency, density and SLO evidence, with non-heap/untracked margin.
6. **Compare collector candidates only when justified** by the workload's objective and
   constraints. Include retaining the current collector; its measured costs and change
   risk matter more than a default designation.
7. **Re-measure with the method that produced the baseline.** Judge the declared objective
   (pauses, concurrent CPU, useful throughput or footprint) and its guardrails. Revert a
   change that misses its prediction or causes a material regression.

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
  (`-XX:ActiveProcessorCount=1`). As checked on 2026-09-05, JEP 523 is Closed/Delivered for
  JDK 27 (updated 2026-08-19), making G1 the default in all environments in that release.
  This integration status does not prove a deployed GA build includes it.
  Verify the exact vendor/build with startup logs or
  `VM.flags`; explicitly name a collector when fleet-wide intent must not depend on ergonomics.
- `MaxGCPauseMillis` is a target, not a guarantee. Lowering it often selects less young/CSet
  work and increases frequency; promotion changes only if lifetime/survivor policy makes it
  so. Raising it is a throughput candidate, not a rule—validate tails, pause share and CPU.
- A rising post-reclamation floor means more retained state under those conditions. It may
  be a leak, cache, workload/cardinality change or legitimate working set; name the ownership
  contract before declaring a defect. No collector removes strongly reachable state.
- Unplanned G1 Full GC on a latency-sensitive path warrants investigation. Acceptance
  depends on the declared deadline, frequency and recovery budget; Parallel/Serial full
  collections may be normal for a batch workload. An evacuation failure means objects
  could not be moved as planned; inspect the logged reason, usable to-space, live set,
  promotion spike, pinning, humongous topology and reserve before choosing heap growth.
- Prefer fewer tuning overrides: they may constrain adaptive policy or create maintenance
  assumptions. Diagnostic flags and adaptive targets do not all disable heuristics.
- Do not carry old collector comparisons across releases without checking mode: ZGC became
  generational by default in JDK 23 and exclusively generational in JDK 24 (JEP 490).
  Generational Shenandoah is product in JDK 25 (JEP 521). JEP 535 (JDK-8379682) is
  Targeted for JDK 28 as checked on 2026-09-05; its proposed generational default does not
  describe earlier or arbitrary vendor builds. An inherited
  `-XX:+ZGenerational` can become an upgrade blocker: Temurin 25.0.4 warns and
  starts, Temurin 26.0.2 **refuses to start** (both executed).

## Output

Return the objective and target environment, observed evidence versus remaining hypotheses,
the justified change or no-change decision, and its validation result or next experiment.
For a sizing proposal, include the heap policy and non-heap margin; for a measured change,
include effective flags, relevant before/after metrics and rollback criteria. Keep a simple
triage answer to the finding and next discriminating check.

## References

- [Collector selection and heap sizing](references/collector-and-heap.md) — the choice
  table by heap size, CPU count, latency requirement and throughput, the GC-thread
  ergonomics measured on JDK 25, sizing the heap from a measured live set, and the
  container headroom calculation. Read when GC pause, frequency or concurrent cost is
  implicated, when comparing collectors, or when choosing a heap size for a new service.
