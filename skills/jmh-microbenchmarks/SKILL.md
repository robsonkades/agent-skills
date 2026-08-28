---
name: jmh-microbenchmarks
description: >
  Writing microbenchmarks that do not lie: dead-code elimination and constant folding,
  Blackhole and returning results, fork and state scoping, warm-up verification, reading
  Score and Error as a confidence interval, gc.alloc.rate.norm as the most reliable number,
  and converting a bench result into a system prediction via Amdahl. Use when a benchmark is
  being written or reviewed, when @Fork(0) or a hand-rolled timing loop appears, when a
  benchmark discards its result, when two variants are compared with different boundaries,
  when overlapping error intervals are read as "no difference", or when a CI performance
  gate needs a threshold. Does not cover finding what to benchmark (jfr-and-async-profiler,
  flame-graph-analysis), the compilation model itself (jit-compilation), or full-system load
  tests (load-testing). The profilers and variance diagnosis are jmh-advanced, and gating is
  performance-regression-ci.
---

# JMH Microbenchmarks

## Purpose

Produce a benchmark number that can be believed and converted into a prediction. A broken
benchmark does not fail — it lies confidently: dead-code elimination, constant folding,
insufficient warm-up and clock resolution all yield plausible wrong numbers with no error
message.

## Workflow

1. **Do not start here.** The order is profiler → Amdahl → JMH: the profiler says _where_
   (`p`), Amdahl says _whether it is worth it_, JMH says _how much_ (`s`). Starting at JMH
   measures the irrelevant precisely.
2. **Define the boundary** — what goes in `@Setup` and what is inside the measured window.
   For a comparison, both sides must have exactly the same boundary. Write both methods and
   ask "what is inside one and outside the other?"; if the answer is not "nothing", the
   comparison is invalid.
3. **Configure**: `@Fork(≥2)`, explicit `@Warmup`/`@Measurement`, `jvmArgs` with
   `-Xms` = `-Xmx` and a declared collector, mode matched to the question.
4. **Validate before believing any number** — see the checklist in
   `references/validating-a-benchmark.md`. The proportionality test and `-prof comp` catch
   most broken benchmarks in one run each.
5. **Convert to a system prediction** with the profiler's `p`, then validate on the real
   system.
6. **Explain the divergence** between predicted and observed. That divergence is the
   learning — usually about inlining, about the input distribution, or about the bottleneck
   having moved.

## Rules

- Never `@Fork(0)`. The type profile of one benchmark contaminates the next one's
  compilation and the result becomes order-dependent. Its one legitimate use is running
  under a debugger. Even `@Fork(1)` loses between-fork variance, which is a real source of
  uncertainty — JMH forks per benchmark precisely to capture the non-determinism of
  compilation itself.
- Return the result or consume it with a `Blackhole`. The dangerous case is not total
  elimination but **partial** — some work survives, some is removed, the number stays
  plausible, and only the proportionality test exposes it.
- Avoid `@Setup(Level.Invocation)` for short operations: JMH does not subtract setup, and
  invocation-level setup perturbs the pipeline between invocations. Pre-build instances at
  `Level.Trial` and consume them round-robin.
- **Never subtract a baseline.** JMH does not, and neither should you: harness cost is
  neither additive nor independent — it interacts with inlining and the pipeline, and
  subtraction can yield negative or artificially small values. The empty method diagnoses
  the environment; it does not correct the result.
- `Error` is the **half-width of the 99.9% confidence interval**, not a standard deviation.
  Above ~5% of `Score`, diagnose the cause (`-prof comp`, `-prof gc`) before piling on
  iterations.
- Overlapping intervals do not prove equality. Non-overlapping ⇒ significant difference;
  overlapping ⇒ **the experiment does not decide**. Treating "I do not know" as "they are
  the same" is exactly how a CI gate approves a real regression it merely lacked the
  resolution to see.
- Reaching C2 does not end warm-up. An uncommon trap can recompile inside the measured
  window; `-prof comp` is what distinguishes that from a GC pause.
- `gc.alloc.rate.norm` is the most reliable number JMH produces. Bytes per operation is
  deterministic for the same code; time is not. For a CI gate it is the best signal
  available.
- `SampleTime` is the only mode that shows the tail. `Throughput` and `AverageTime` report a
  central value and cannot see a p99 regression.
- On the baseline, `Blackhole` is a compiler intrinsic (JMH 1.34+ on JDK 17+) with
  effectively zero cost. The `Blackhole mode` line in the output states which mechanism is
  active — material written before 2022 describes only the old one.
- Fields that must not be constant-folded must not be `static final`.
- The bench number is not a promise about the system. The conversion requires `p`.

## References

- [Validating a benchmark](references/validating-a-benchmark.md) — the checks that must
  pass before any number is believed, the CI gate design, and the anti-patterns with their
  corrected forms. Read before trusting or publishing a result.
