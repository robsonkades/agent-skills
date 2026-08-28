---
name: jmh-advanced
description: >
  JMH beyond the basics: the built-in profilers (`perfasm`, `xperfasm`, `perfnorm`, `gc`,
  `stack`, `jfr`, `async`), `@State` scope and asymmetric benchmarks with
  `@Group`/`@GroupThreads`, `@Param` combinatorics, `@Setup` levels, the real `@Fork`
  attributes, `@CompilerControl`, and diagnosing a benchmark whose variance will not settle.
  Use when `Error` exceeds roughly 10% of `Score`, when `@Fork(1)` is still in place before
  publishing a number, when someone writes `@Fork(jvmVersion = ...)`, when a concurrent
  structure is benchmarked under `Scope.Thread`, when `@Setup(Level.Invocation)` sits on a
  high-frequency benchmark, when `-prof xperfasm` is attempted on Linux, or when `perfasm`
  produces no assembly. Does not cover the introductory rules — forks, `Blackhole`,
  benchmark boundaries and reading `Score` and `Error` (jmh-microbenchmarks) — turning
  results into a build gate (performance-regression-ci), or interpreting the emitted
  assembly in depth (reading-jit-assembly).
---

# JMH Advanced

## Purpose

Make a benchmark measure the scenario that was actually asked about, and make its number
survive being published. A JMH result that is technically flawless can still answer the
wrong question: `@State` scope, not measurement precision, decides which question gets
answered.

The failure this prevents is the plausible number. Nothing errors, nothing looks absurd —
`Scope.Thread` gives each thread its own map so the contention being compared never
happens; `@Fork(1)` hides the inter-JVM variance in exactly the 3–10% band where real
regressions live; `-prof xperfasm` on a Linux host fails while `perfasm` without hsdis
silently returns a number with no annotation.

## Workflow

1. **State the question the benchmark answers** — "what does X cost", not "can the system
   handle Y" — then pick the mode from it: `AverageTime`/`Throughput` for a comparison,
   `SampleTime` for tail latency, `SingleShotTime` for cold or non-repeatable operations.
2. **Choose `Scope` from the real production access pattern**, before writing anything
   else. Shared structure under concurrency → `Scope.Benchmark` with `@Threads(N)`.
   Per-thread or partitioned data → `Scope.Thread`. Asymmetric roles such as producer and
   consumer → `Scope.Group` with `@Group`/`@GroupThreads`.
3. **Set the `@Setup` level from whether the fixture is mutated during measurement.**
   Read-only fixtures belong at `Level.Trial`; `Level.Invocation` on a high-frequency
   benchmark makes setup the dominant cost.
4. **Pin the environment so the measurement is not measuring the environment.**
   `-Xms` equal to `-Xmx`, `-XX:+AlwaysPreTouch`, an isolated machine with the CPU
   governor on performance.
5. **Confirm the profilers exist before a long run.** `java -jar benchmarks.jar -prof list`
   reports what this environment can actually load, which is where a missing hsdis or
   async-profiler shows up cheaply.
6. **Check the number against an analytical expectation** — complexity, cost per
   operation — before accepting it, then read `Error` as a fraction of `Score`.
7. **Restore `@Fork` to 5 (or the default) before comparing or publishing**, with the same
   JDK, same flags and same hardware on both sides of the comparison.

## Rules

- JMH's default without `@Fork` is already **5** forks (`Defaults.MEASUREMENT_FORKS`).
  `@Fork(1)` is always an explicit trade of rigour for iteration speed, never "what
  happens when you configure nothing".
- More iterations never substitutes for more forks. Iterations inside a fork capture
  environment noise (GC, scheduling, cache); separate forks capture the JIT's structural
  variance, which is invisible from inside a single JVM.
- `@Fork` has no `jvmVersion` attribute. Its six attributes are `value`, `warmups`, `jvm`,
  `jvmArgs`, `jvmArgsPrepend`, `jvmArgsAppend`. Pin a JDK with `jvm = "/path/to/bin/java"`,
  or `-jvm <path>` on the command line.
- JMH's reported `Error` is a **99.9%** Student's-t confidence interval, not 95% and not a
  standard deviation. A relatively wide `Error` is not by itself an unstable benchmark.
  Investigate above roughly 10% of `Score`; below roughly 5% is usually stable.
- A benchmark comparing concurrent data structures under `Scope.Thread` measures
  single-threaded access N times over. The `synchronized` never contends and the
  concurrent structure's coordination overhead never pays for itself.
- `@Setup(Level.Invocation)` runs before every single invocation. On a benchmark at
  1M ops/s that is 1M setups per second, and the setup becomes the measurement.
- A `final` field feeding the measured expression invites constant folding — the
  computation can become a literal. Assign the value in `@Setup(Level.Trial)` to a
  non-final field instead.
- Fix the heap with `@Fork(jvmArgsAppend = {"-Xms2g", "-Xmx2g", "-XX:+AlwaysPreTouch"})`
  whenever the benchmark is GC-sensitive. Heap expansion commits and zeroes pages, which
  contaminates precisely the early warmup iterations.
- `@Param` values are run as a full cartesian product, one reported row per combination —
  never averaged. Two parameters of four values each with `@Fork(5)` is 20 complete
  warmup-plus-measurement runs.
- `-prof xperfasm` is the **Windows** profiler, collecting through ETW/Xperf. It is not a
  more detailed `perfasm`; on Linux it fails for lack of Xperf.
- `perfasm`, `xperfasm` and `-XX:+PrintAssembly` all need hsdis, which does not ship with
  the JDK. Its source is `src/utils/hsdis` in `openjdk/jdk` — **not** in
  `AdoptOpenJDK/jitwatch`. A mismatched build loads and produces unreadable or absent
  annotation while the benchmark still prints its number.
- `Throughput` and `AverageTime` are not strict reciprocals — one is a harmonic mean of
  per-operation times, the other arithmetic. A visible divergence is a diagnostic signal
  that per-operation cost has real variance; run `Mode.SampleTime` before reporting a
  single number.
- Apply `@CompilerControl` surgically, only where asymmetric inlining between compared
  variants is actually suspected. Applying it to every helper by default introduces more
  bias than it removes.
- A number that looks impossibly good (1000×, 1,000,000×) is dead-code elimination until
  proven otherwise. Check that first, not last.

## References

- [Profilers, hsdis and the command line](references/profilers-and-hsdis.md) — the
  `-prof` catalogue with platform and prerequisites, hsdis sourcing and failure modes,
  CLI flags with their defaults, and how to read the standard output block. Read before
  running with a profiler or when `perfasm` produced nothing.
- [Configuration recipes and variance diagnosis](references/configuration-recipes.md) —
  the scenario-to-configuration matrix, ready templates, `@Fork` attributes, `@Param`,
  `@State` scopes including `Scope.Group`, `@CompilerControl`, `warmups`, and the checks
  to run when `Error` will not settle. Read when configuring a benchmark or when its
  variance is too high to publish.
