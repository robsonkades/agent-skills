---
name: performance-methodology
description: >
  The investigation process for performance work: defining an SLO, recording a baseline,
  observing before hypothesising, falsifiability, Amdahl's Law as a go/no-go filter,
  changing one variable at a time, and validating by mechanism rather than by coincidence.
  Use when starting a performance investigation, when a fix is credited to a deploy that
  also restarted the process, when an optimisation is proposed without a measurement, when a
  benchmark result changes with the duration of the run, or when "it's fine in staging" is
  the explanation. Does not cover which tool to run (jfr-and-async-profiler), the statistics
  of the numbers (latency-statistics), or microbenchmark construction (jmh-microbenchmarks).
---

# Performance Methodology

## Purpose

Run a performance investigation as an experiment rather than a search for something to
change. The failure modes this prevents are the optimisation with no measurement behind
it, the fix credited by temporal coincidence, and the conclusion reached by confirmation
bias after the first plausible finding.

Every rule below exists because skipping the corresponding step multiplies the cost of
the investigation, not because the process is virtuous.

## Workflow

1. **State the SLO numerically, with load context.** Metric, threshold, and the load it
   holds at (req/s, duration, hardware). "It's slow" cannot be falsified and cannot be
   fixed.
2. **Record the baseline** before touching anything: p50/p90/p99/p99.9, throughput, CPU,
   heap, GC, plus the JDK version and effective flags
   (`java -XX:+PrintFlagsFinal -version`).
3. **Observe before hypothesising.** Two minutes of JFR at `settings=profile` usually
   names the bottleneck. A hypothesis formed before data is folklore, and folklore turns
   hours of work into days.
4. **Write the hypothesis so it can be wrong.** Name the component, the mechanism and the
   expected impact — then ask what evidence would refute it, and go look for that.
5. **Apply Amdahl before writing code.** If the identified hot path is fraction `p` of
   the time, the ceiling is `1/(1−p)`; a 45% frame gives 1.82× speedup, which is a **45%
   reduction**, not "82% faster". Below ~5%, the work rarely pays.
6. **Change one variable, re-measure with the method that produced the baseline.**
7. **Validate by explaining the mechanism.** A graph that improved is not a result until
   you can say why, and until every other thing that changed at the same time has been
   ruled out.
8. **Write it down** — hypothesis, evidence, change, before/after. Performance work that
   is not recorded gets redone.

## Rules

- Never conclude from average latency. Percentiles or nothing.
- A deploy carries side effects — process restart, cache invalidation, connection reset,
  pod rotation. Before crediting a change, enumerate everything that moved with it and
  ask whether each alone would explain the result.
- A result that changes with the duration of the measurement is not a measurement. It is
  accumulated state impersonating performance.
- Never measure with `System.currentTimeMillis()` in a loop: dead-code elimination, wrong
  clock, JIT warmup included, GC unisolated, no percentiles. Use JMH.
- Warm-up is a rate, not a clock. "Two minutes" is a rule about time for a phenomenon
  governed by invocation count.
- Staging is not production until data volume, access pattern (hot keys), concurrency and
  process uptime are stated. A benchmark over 1,000 rows can fail over 50,000,000.
- Check the current default before adding any JVM flag. Several widely copied flags have
  been the default for years, and re-enabling one produces the feeling of having acted
  while the real problem stays undiagnosed.
- Utilisation above ~75% invalidates a latency SLO by queueing alone, before any code is
  examined.

## References

- [Performance folklore versus the JDK 25 baseline](references/folklore.md) — the claims
  that are still repeated and what is actually true now. Read when an optimisation is
  justified by a general rule rather than by a measurement.
- [Investigation checklist](references/investigation-checklist.md) — what to have ready
  before starting, during observation, at hypothesis time, while measuring and when
  validating. Read at the start of an investigation and again before declaring it closed.
- [Reporting a finding](references/reporting-a-finding.md) — the five things a result must
  carry, a worked before-and-after, the refusals that are also findings, and what not to put
  in. Read when the investigation is finished and someone has to act on it.
