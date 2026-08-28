---
name: jit-compilation
description: >
  HotSpot JIT compilation and warm-up: the tiered pipeline 0→3→4 and why tier 1 is terminal,
  profiling cost at tier 3, deoptimisation, code cache exhaustion, and warm-up as a function
  of invocation rate rather than clock time. Use when p99 is bad for the first minutes after
  a deploy, when performance degrades permanently until a restart, when "CodeCache is full"
  appears, when a startup probe or traffic gate needs a warm-up criterion, when
  -XX:-TieredCompilation or -Xcomp is proposed, or when scaling out a low-traffic service
  makes latency worse. Does not cover inlining and escape analysis
  (jit-inlining-and-escape-analysis), microbenchmark construction (jmh-microbenchmarks), or
  the code cache's share of the memory budget (jvm-memory-regions). Reading the compiler
  output is compilation-and-inlining-logs, recompilation is deoptimization, and per-segment
  exhaustion is code-cache-segments.
---

# JIT Compilation

## Purpose

Explain why a Java application's performance is a function of elapsed execution, and turn
warm-up from folklore into a measurable quantity. The failures this prevents are the
benchmark that measured the interpreter, the "degradation" that is really an exhausted
code cache, and the startup probe sized by guesswork.

## Workflow

1. **Classify the symptom against the JIT's three failure shapes.**
   - Bad only in the first minutes after deploy → warm-up.
   - Degraded and never recovers without a restart → code cache exhaustion, first
     hypothesis.
   - Degraded and recurring on the same method → repeated deoptimisation, unstable
     profile.
   - Still compiling at tier 4 in steady state → still warming up, not degrading.
2. **Compute the warm-up time rather than guessing it**: invocations required divided by
   invocation rate. A low-traffic service warms slowly, and no clock-based rule captures
   that.
3. **Check the code cache** before anything else on a no-recovery symptom: occupancy per
   segment, `jdk.CodeCacheFull` in JFR, `CodeCache is full` in the log.
4. **Verify defaults before adding a flag** (`-XX:+PrintFlagsFinal`). Several widely
   copied flags have been default for years.
5. **Gate traffic on a warm-up criterion that is observable** — stable throughput across
   two consecutive windows with new-compilation rate on a plateau — not on a `sleep`.

## Rules

- The tiered pipeline is not a ladder. The common path is `0→3→4`; **tier 1 is terminal**,
  the destination of trivial methods not worth profiling. A method at tier 1 collects no
  profile and will never be promoted to 4 — and that is correct. Looking for getters at
  tier 4 leads to "tuning" something that is not broken.
- **Tier 3 is the slower C1, not the faster one**, because it carries full profiling
  instrumentation. It is an investment: run slower for a while to run much faster later.
- `-XX:-TieredCompilation` does **not** disable compilation — it sends everything straight
  to C2. To measure the interpreter you need `-Xint`. Confusing the two produces a
  plausible number and a wrong conclusion.
- Code cache exhaustion is the JIT's most treacherous failure: no exception, no alert, no
  recovery. Already-compiled methods stay fast, new methods run interpreted, and the
  degradation is permanent until restart. Treat `jdk.CodeCacheFull` as an incident.
- `-Xcomp` belongs in controlled experiments, never in production. It forces immediate
  compilation with no profile, so the compiler loses the very information that justifies
  its existence, and startup gets much slower.
- Do not scale out a service that does not warm up. Splitting the same load across more
  replicas lowers per-instance invocation rate and **delays** tier 4 everywhere. Fewer,
  hotter instances can deliver better latency than many cold ones.
- Never benchmark cold code. Without warm-up you are measuring the interpreter or an
  intermediate tier — the origin of most cross-language comparisons that put Java at a
  large disadvantage.
- Graal as a JIT left the JDK with JEP 410 (JDK 17). JVMCI remains as the interface; using
  Graal today requires the GraalVM distribution.

## References

- [Warm-up and cold start](references/warmup-and-cold-start.md) — computing warm-up time,
  observable readiness criteria, deployment gating, and what the AOT cache (JEP 483/514/515)
  does and does not accelerate. Read when latency is bad after a deploy or when sizing a
  startup probe.
- [Code cache](references/code-cache.md) — segments, sizing, monitoring and the
  exhaustion signature. Read when performance degraded permanently, or when reviewing
  monitoring for a long-lived JVM.
