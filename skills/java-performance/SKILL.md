---
name: java-performance
description: >
  Java performance engineering on the JVM: JIT compilation, garbage collection,
  allocation pressure, and profiling methodology. Use when diagnosing a latency
  regression, high CPU with normal GC, suspected GC pauses, memory growth that is
  not a leak, or slow startup and warmup. Covers how to measure before changing
  anything, and hands off to jvm-gc-tuning once GC is confirmed as the cause. Does
  not cover SQL or query tuning, framework configuration, or distributed tracing
  setup.
---

# Java Performance Engineering

## Purpose

Diagnose and fix performance problems in JVM applications by measuring first and
changing second. The failure mode this skill exists to prevent is tuning flags on a
hypothesis — adding `-XX:+UseG1GC` to a service whose problem is a lock, or raising
heap on a service whose problem is allocation rate.

Not covered: database and query tuning, framework-level configuration, and tracing
infrastructure. Those are different skills with different evidence.

## Workflow

1. **Establish the symptom precisely.** Latency at which percentile? Throughput at
   which concurrency? Startup, steady state, or under a specific load shape? A symptom
   stated as "it's slow" cannot be falsified and cannot be fixed.

2. **Collect evidence before forming a theory.**
   - GC behaviour: `-Xlog:gc*` and pause distribution, not just average pause
   - CPU: a sampling profiler with wall-clock _and_ CPU modes; compare them
   - Allocation: allocation profiling, in bytes per operation
   - Locks and waits: thread dumps under load, or a lock profiler

3. **Classify before optimising.** Almost every JVM performance problem is one of:
   allocation pressure, lock contention, an algorithmic problem, I/O waiting, or
   warmup. The class determines the fix; the symptom rarely does.

4. **Change one thing and re-measure** with the same method that produced the
   baseline. A change that cannot be shown to help gets reverted.

5. **Record the result** — the measurement, the change, the delta. Performance work
   that is not written down gets redone.

## Rules

- Never conclude from average latency. Look at p99 and the maximum; averages hide
  exactly the pauses users notice.
- Never profile with `jstack` in a loop. It samples only at safepoints, which biases
  results toward code that polls them and hides the code that does not.
- Treat a microbenchmark without JMH as unreliable. Dead-code elimination and
  constant folding will silently measure nothing.
- A GC flag change is a last resort, after allocation rate has been examined. Most
  "GC problems" are allocation problems.
- Warmup matters: measure steady state separately from the first minutes after
  deploy, and treat a cold-start regression as its own problem.
- Once GC is confirmed as the bottleneck, the jvm-gc-tuning skill takes over. Collector
  choice, heap sizing and log interpretation live there, not here.

## References

- [Profiling recipes](references/profiling.md) — concrete commands for async-profiler
  and JFR, including running them inside a container. Read once the symptom is precise
  enough to know which profile to take.
- [Worked example: a p99 regression](references/latency-regression.md) — read when pause
  frequency changed but pause duration did not, or when a regression followed a deploy
  with no obvious cause.
