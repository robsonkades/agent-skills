---
name: jit-compilation
description: >
  HotSpot JIT compilation and warm-up: tiered policy, C1/C2 queues and profiling, OSR,
  deoptimization, code-cache pressure, compiler resources in containers, and warm-up as a
  workload-dependent curve rather than a clock delay. Use when
  p99 is bad for the first minutes after a deploy, when performance degrades permanently
  until a restart, when "CodeCache is full" appears, when a startup probe or traffic gate
  needs a warm-up criterion, when -XX:-TieredCompilation or -Xcomp is proposed, when scaling
  out a low-traffic service makes latency worse, when a 1-2 CPU pod warms up far slower than
  a workstation, or when an autoscaler keeps adding cold replicas. Does not cover inlining
  and escape analysis (jit-inlining-and-escape-analysis), microbenchmarks
  (jmh-microbenchmarks), or the code cache in the memory budget (jvm-memory-regions).
  Reading the compiler output is compilation-and-inlining-logs, recompilation is
  deoptimization, and per-segment exhaustion is code-cache-segments.
---

# JIT Compilation

## Purpose

Explain why a Java application's performance is a function of elapsed execution, and turn
warm-up from folklore into a measurable quantity. The failures this prevents are the
benchmark that measured the interpreter, the "degradation" that is really an exhausted
code cache, the startup probe sized by guesswork, and the one-CPU pod tuned with threshold
flags when its problem is a single C2 thread.

## Workflow

1. **Classify the symptom against the JIT's failure shapes.**
   - Bad only in the first minutes after deploy → decompose JIT/class loading, application and
     dependency caches, connection establishment, rollout traffic, CPU throttling, and GC; do not
     label the whole interval “JIT warm-up”.
   - Degraded and recovers after restart → check code-cache pressure, compiler state,
     deoptimization, changed traffic/dependencies, GC, and host throttling. Repeated GCs tagged
     `CodeCache GC Threshold` make code-cache churn a strong candidate; an isolated one does not.
   - Degraded and recurring on the same method → repeated deoptimisation, unstable
     profile.
   - Tier 2 in the compilation log, or methods parked at tier 2/3 through a startup burst →
     inspect the C2 queue, load-feedback scaling, compile failures/directives, and CPU/code-cache
     constraints before touching thresholds.
   - Continued tier-4 compilation → correlate its rate with latency, traffic novelty, class
     loading, and deoptimization; it can be ongoing warm-up or ordinary adaptation.
2. **Model the curve rather than guessing a delay.** Invocation and back-edge rates influence
   policy thresholds, while queueing, CPU quota, code-cache availability, method mix, class
   loading, application caches, and dependency initialization influence observed readiness.
3. **Check the code cache** before anything else on a no-recovery symptom: `jcmd <pid>
Compiler.codecache` for `full_count` and the `Compilation:` line, `fullCount` in
   `jdk.CodeCacheStatistics`, `CodeCache is full` in the log.
4. **Read the compiler's CPU budget off the container, not the flag.** 1-3 CPUs means one
   C1 and one C2 thread (`CICompilerCount=2`), and a CPU limit is shared between compiling
   and serving. See `references/tiered-compilation-model.md`.
5. **Verify defaults before adding a flag** (`-XX:+PrintFlagsFinal`). Several widely
   copied flags have been default for years.
6. **Gate traffic on service behavior, not a sleep.** Use correct responses plus latency/error
   acceptance under representative self-training or ramped traffic. Compiler-statistics deltas,
   queue depth, and code-cache state explain convergence but are not sufficient readiness
   criteria. `jdk.Compilation` event thresholds are configuration- and version-specific.

## Rules

- The tiered pipeline is a policy graph, not a mandatory ladder. `0→3→4` is common on the
  examined server HotSpot build; trivial or C2-ineligible methods can end at level 1, and queue
  pressure can route work through level 2. Interpret levels with the selected compiler, runtime,
  flags, and successor compilations.
- Tier 2 is C1 with limited profiling and is commonly used when the C2 queue delays full-profile
  tier 3 work. Its presence is evidence to inspect queue/policy state, not proof that one exact
  threshold fired. The 1-versus-24-CPU counts in the reference are one JDK 25 reproduction.
- Tier 3 carries fuller profiling instrumentation than tier 1. That adds runtime work to collect
  data C2 can use, but “tier 3 is always slower” is not a workload-level guarantee.
- `-XX:-TieredCompilation` does **not** mean interpreted-only; on the standard server HotSpot it
  selects non-tiered high-tier compilation. `-Xint` disables JIT. On the examined JDK 25 build,
  disabling tiered compilation or stopping at level 1 also changed code-cache ergonomics from
  240 MB segmented to 48 MB unsegmented; verify effective flags on every runtime.
- Under tiered compilation `-XX:CompileThreshold` is accepted and ignored. The ladder moves
  with `-XX:CompileThresholdScaling`, globally or per method through `CompileCommand`.
- `CICompilerCount` is a cap, not a head-count: threads are added while a queue is long and
  memory allows, and retired when idle (`UseDynamicNumberOfCompilerThreads`, default).
  Raising it on a one-CPU pod adds no CPU; the quota is the lever. Under tiered compilation
  the minimum is 2 — `CICompilerCount (1) must be at least 2` refuses to start.
- Code-cache pressure can trigger unloading/GC and recompilation churn; allocation failure can
  stop compilation until the JVM later restarts it or space becomes available. Treat a rising
  `fullCount`, compiler stop/restart counts, per-heap free/contiguous space, and recurring
  code-cache-triggered GC as incident evidence, not an automatic root cause.
- `-Xcomp` belongs in controlled compiler experiments, not routine production tuning. It requests
  compilation before ordinary execution for reached, compilable methods and uses blocking policy;
  on the examined tiered JDK 25 build those methods went through tier 3 and tier 4
  (`Tier4InvocationThreshold=0`, `BackgroundCompilation=false`) before it runs, from a
  profile that saw almost nothing. Start-up gets much slower, and the compiler loses the
  information that justifies its existence.
- Scaling out can dilute per-instance profiles while improving queueing headroom and availability.
  Model both effects. Use slow start/readiness, rollout limits, minimum warm capacity, and an HPA
  signal/stabilization policy that distinguishes startup CPU from sustained demand.
- The AOT cache (JEP 515) caches **profiles, not compiled code**. It shortens the profiling
  phase; the compilations still run on compiler threads under the same CPU quota. Expect it to
  shorten only the covered parts of the curve and measure `jdk.CompilerStatistics.totalTimeSpent`.
- Benchmark the lifecycle the decision concerns. Measure cold start/first requests when users pay
  them, and measure a separately defined steady state for peak comparisons. Label the compilation
  and application-cache state rather than discarding cold behavior.
- Graal as a JIT left the JDK with JEP 410 (JDK 17). JVMCI remains as the interface; using
  Graal today requires the GraalVM distribution.

## References

- [Tiered compilation model](references/tiered-compilation-model.md) — the five levels and
  the transitions that actually occur, the threshold predicate and its load scaling, tier 2
  and `Tier3DelayOn`, the modes (`TieredStopAtLevel`, `CompilationMode`, `-Xcomp`, `-Xint`)
  with their side effects, compiler thread ergonomics per CPU count, compile CPU and memory,
  OSR, the JFR events with their real thresholds, small-container and autoscaling behaviour,
  and the symptom-to-cause table. Read when a compilation log or a container looks wrong.
- [Warm-up and cold start](references/warmup-and-cold-start.md) — computing warm-up time,
  the observable readiness criterion and the JFR event that measures it, deployment gating,
  autoscaled fleets, and what the AOT cache (JEP 483/514/515) does and does not accelerate.
  Read when latency is bad after a deploy or when sizing a startup probe.
- [Code cache](references/code-cache.md) — the two exhaustion shapes on JDK 25, the
  `Compiler.codecache` fields and JFR events that confirm them, mode-dependent sizing, and
  the flags that are already default. Read when performance degraded permanently, or when
  reviewing monitoring for a long-lived JVM.
- [Project Leyden status](https://openjdk.org/projects/leyden/)
- [JDK 25 `java` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
