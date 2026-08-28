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
  allocation profiling and leak hunting (jit-inlining-and-escape-analysis). Deriving G1 flag
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

1. **Confirm GC is on the critical path.** Pause times must line up with the latency
   percentile that regressed. If they do not, stop here and go back to `java-performance`.
2. **Separate pause duration from pause frequency** in the log. Duration points at the
   collector or the heap size — this skill. Frequency points at allocation rate — a
   different investigation, and usually the real one.
3. **Reconcile the logged pause with the pause the client felt.** If they disagree, the
   collector is not the cost; `gc-fundamentals` covers Time-To-SafePoint and
   `linux-for-jvm` covers throttling and page faults.
4. **Check upstream before touching a flag.** By `N = λ × R`, slower dependencies keep more
   requests in flight and more objects alive. Expensive GC is frequently a symptom of
   slowness elsewhere, and tuning the collector masks the cause.
5. **Size the heap explicitly**, `-Xms` equal to `-Xmx`, with the non-heap budget accounted
   for.
6. **Change the collector only** when the workload's requirement genuinely does not match
   the default's design point.
7. **Re-measure with the method that produced the baseline.** A flag change that does not
   move the pause distribution gets reverted, not kept "just in case".

## Rules

- Never set GC flags copied from a blog post without the log that justified them.
- Changing collector is a bigger lever than tuning one, and a smaller lever than reducing
  allocation rate. Try them in that reverse order.
- `-Xmx` is not the container limit. Metaspace, code cache, thread stacks and direct
  buffers live outside it and still count against the cgroup.
- Never run a variable heap in production. A heap that grows pauses while it grows, GC
  behaviour changes as it grows, and in a fixed-size container there is nothing to hand the
  memory back to.
- `MaxGCPauseMillis` is a target, not a guarantee — and lowering it shrinks the young
  generation, raising collection frequency and premature promotion. For throughput under
  G1, the adjustment is usually to **raise** the target.
- A rising live set is a leak or a cache with no eviction. No collector fixes that.
- Full GC should be zero in healthy production. `G1 Evacuation Failure` means the old
  generation had no room; raising the heap is palliative, and the question is why old
  filled up.
- Prefer fewer flags. Every flag is a decision the JVM's own heuristics can no longer adapt.
- Do not carry over pre-JDK-23 collector comparisons: ZGC is generational by definition
  (`-XX:+ZGenerational` no longer exists, JEP 490) and generational Shenandoah is product
  (JEP 521), though not the default until JEP 535 lands in JDK 28 (Targeted). An inherited
  `-XX:+ZGenerational` is an upgrade blocker rather than a no-op: Temurin 25.0.4 warns and
  starts, Temurin 26.0.2 **refuses to start** (both executed).

## References

- [Collector selection and heap sizing](references/collector-and-heap.md) — the choice
  table, sizing rules, and the container headroom calculation. Read once step 1 has
  confirmed GC is on the critical path.
