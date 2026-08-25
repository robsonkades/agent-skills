---
name: jvm-gc-tuning
description: >
  JVM garbage collection: choosing between G1, ZGC, Parallel and Serial, sizing the
  heap, reading GC logs, and deciding whether a problem is actually a GC problem.
  Use when GC pauses appear in a latency profile, when full collections show up in
  logs, when heap grows toward the limit, or when sizing a JVM for a container.
  Start from java-performance instead when the symptom is latency or CPU and GC has
  not yet been confirmed as the cause. Does not cover allocation profiling or leak
  hunting.
---

# JVM GC Tuning

## Purpose

Decide whether garbage collection is the actual bottleneck, and if it is, change the
right thing. Most reported "GC problems" are allocation problems wearing a costume:
the collector is behaving correctly given how much garbage it is handed.

## Workflow

1. Confirm GC is on the critical path — pause times must line up with the latency
   percentile that regressed. If they do not, stop here.
2. Read the log before touching a flag: `-Xlog:gc*:file=gc.log:time,uptime,level,tags`.
3. Separate pause _duration_ from pause _frequency_. Duration points at the collector
   or heap size; frequency points at allocation rate.
4. Size the heap explicitly, `-Xms` equal to `-Xmx` in a container.
5. Change the collector only when the workload's requirement genuinely does not match
   the default's design point.
6. Re-measure with the method that produced the baseline. A flag change that does not
   move the pause distribution gets reverted, not kept "just in case".

## Rules

- Never set GC flags copied from a blog post without the log that justified them.
- `-Xmx` is not the container limit. Metaspace, code cache, thread stacks and direct
  buffers live outside it and still count against the cgroup.
- A rising live set is a leak or a cache without eviction. No collector fixes that.
- Prefer fewer flags. Every flag is a decision the JVM's own heuristics can no longer
  adapt.

## References

- [Collector selection and heap sizing](references/collector-and-heap.md) — the choice
  table, what each log pattern means, and container sizing. Read once step 1 has
  confirmed GC is on the critical path.
