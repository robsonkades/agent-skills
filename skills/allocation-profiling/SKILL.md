---
name: allocation-profiling
description: >
  Attribute Java heap allocation to code and validate reductions in bytes per operation.
  Use when allocation or GC frequency regresses, JFR allocation events are empty or disagree
  with counters, large buffers trigger G1 humongous collections or ZGC stalls, or pooling,
  TLAB tuning, or assumed JIT elimination is proposed without measurements. Covers sampling
  semantics and allocation-specific triage; general capture selection belongs to
  jfr-and-async-profiler, retention diagnosis to heap-dump-analysis, and scalar replacement
  mechanisms to jit-inlining-and-escape-analysis.
---

# Allocation Profiling

Find which code produces heap bytes, decide whether those bytes are avoidable, and test
whether reducing them improves the reported problem. Allocation is neither retained heap
nor GC cost. A large allocation site is a candidate, not automatically the cause of latency.

The reference baseline is OpenJDK 25 GA and async-profiler 4.1, not a minimum target
version. Before version-sensitive advice, inspect Maven/Gradle release and toolchain
settings, resolved logging/profiler dependencies, CI/runtime images and actual JVM flags.
Keep the project's Java and dependency versions; using this skill does not authorize
upgrades or enabling preview/experimental features. HotSpot-specific events and flags
are not portable Java guarantees.

## Workflow

1. **Define the comparison.** Record the JDK build, collector, heap and relevant flags,
   profiler version, workload/payload mix, concurrency, warm-up state, affected time window,
   and target metric. Request missing facts that change the tool or decision. With source
   alone, provide a hypothesis and collection plan; do not invent a rate or confirmed fix.
2. **Establish the rate and denominator.** Prefer existing counters or a recording from the
   affected window. Report bytes/s and bytes/completed operation when that denominator is
   meaningful; account for background work and failed requests. Compare like workloads.
   GC-log Eden consumption is only an estimate of young allocation and can miss direct-old
   allocation. Read [allocation tools](references/allocation-tools.md) before collecting or
   interpreting events, counters, empty profiles, or virtual-thread data.
3. **Attribute bytes under representative load.** Use weighted allocation stacks to rank
   sites, preserving the sample population, interval/throttle, filters and window. Verify
   events and stacks are present and the target path ran. Reconcile totals with independent
   counters where available. A missing site may be undersampled or filtered; it does not
   prove that the JIT eliminated it. First-instrument and general capture planning belong
   to `jfr-and-async-profiler`.
4. **Test the connection to the symptom.** Separate allocation churn from survival and
   retention. Neither a live-allocation profile nor an old-object sample measures promotion
   rate. Correlate latency windows with GC/stall timelines; coincidence supports a hypothesis,
   not exclusive causality. Read [collector symptoms](references/symptoms-and-collector-behaviour.md)
   for humongous allocation, stalls, TLAB attribution, or conflicting measurements. Route
   retention/root questions to `heap-dump-analysis`.
5. **Choose one falsifiable change.** State the site, estimated contribution, mechanism and
   expected effect. Read [reducing allocation](references/reducing-allocation.md) before
   proposing code, reuse or flags. Preserve behavior; a semantic shortcut is not an
   allocation fix. Use `jit-inlining-and-escape-analysis` when the decision needs C2
   inlining or scalar-replacement analysis.
6. **Validate both bytes and outcome.** Repeat a matched, warmed workload with comparable
   instrumentation; compare site bytes, total bytes/op, throughput, CPU, retained heap and
   the original latency/GC metric. Repeat enough to distinguish the effect from variation.
   A smaller percentage alone is insufficient, and moving bytes to another site is not a
   reduction. JMH `-prof gc` can test an isolated mechanism; it does not establish a service
   latency improvement. Report inconclusive results and the next discriminating measurement.

## Minimum result

For each actionable finding, give the evidence artifact/window and measurement semantics,
the observation, the hypothesis and why it remains uncertain, the proposed adjustment,
and the measurement that would confirm or refute it. A short paragraph or table row is
enough. State separately what was executed and what remains a plan; do not label a
source-based prediction as a measured result.

## Capture constraints

Start with a bounded capture on a representative canary and an explicit CPU/latency/disk
budget; shorten or stop it if that budget is exceeded. Recording defaults are not proof
that an event is enabled in an existing capture. Do not bypass attach/container controls
when collection fails; report the error and use an available recording or a controlled
reproduction. Profiles may expose class, method and thread names and other JFR context;
store and retain them according to the service's telemetry policy.

When reviewing this skill or practicing its ambiguous decisions, use
[validation cases](references/validation-cases.md). These are behavioral evaluation inputs,
not evidence that the skill has already improved an agent's performance.
