---
name: performance-methodology
description: >
  The investigation process for performance work: defining an SLO, recording a baseline,
  observing before hypothesising, falsifiability, Amdahl's Law as a go/no-go filter,
  changing one variable at a time, and validating by mechanism rather than by coincidence.
  Use when starting a performance investigation, when a fix is credited to a deploy that
  also restarted the process, when an optimisation is proposed without a measurement, when a
  benchmark result changes with the duration of the run, when an investigation has run for
  days without refuting a hypothesis, or when "it's fine in staging" is the explanation.
  Does not cover which tool to run (jfr-and-async-profiler), the statistics of the numbers
  (latency-statistics), or microbenchmark construction (jmh-microbenchmarks).
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

1. **State the SLO numerically, with load context.** Metric, percentile, threshold, window,
   and the load it holds at (req/s, duration, hardware). "It's slow" cannot be falsified
   and cannot be fixed. The indicator's definition is `slo-and-alerting`.
2. **Record the baseline and its workload** before touching anything: p50/p90/p99/p99.9,
   throughput, CPU, heap, GC, the JDK version and effective flags
   (`java -XX:+PrintFlagsFinal -version`), and the request mix, data volume and uptime
   that produced them. A baseline without its workload cannot be reproduced.
3. **Observe before hypothesising, with a method.** USE for every resource (utilisation,
   saturation, errors), RED for the service, then drill down; then two minutes of JFR at
   `settings=profile` on the clock the symptom names. A hypothesis formed before data is
   folklore, and folklore turns hours of work into days. The methods, and the question
   each answers, are in `references/methods-and-failure-modes.md`.
4. **Write the hypothesis so it can be wrong.** Name the component, the mechanism and the
   expected impact — then ask what evidence would refute it, and go look for that. A
   hypothesis predicts an observation; a measurement records one with its method. Label
   which is which.
5. **Apply Amdahl before writing code.** With fraction `p` sped up by `s`, the speedup is
   `1 / ((1−p) + p/s)`, ceiling `1/(1−p)`; a 45% frame gives at most 1.82×, which is a
   **45% reduction**, not "82% faster". Below ~5%, the work rarely pays. Take `p` on the
   SLO's clock and percentile — a CPU fraction says nothing about a wall-clock tail.
6. **Change one variable, re-measure with the method that produced the baseline.** Three
   runs per arm, alternated, run count fixed in advance. Two knobs suspected of
   interacting are a designed factorial run, not two changes at once.
7. **Validate by explaining the mechanism.** A graph that improved is not a result until
   you can say why, until the mechanism accounts for the size of the effect, and until
   every other thing that changed at the same time has been ruled out — including by
   switching the fix off and on without redeploying.
8. **Decide whether to stop.** Stop when the SLO is met with margin across a full period
   of the metric, or when no component's `p` can close the remaining gap — that second
   case is an architectural finding, not a failed investigation.
9. **Write it down** — hypothesis, evidence, change, before/after, and the findings that
   were not the cause. Performance work that is not recorded gets redone.

## Rules

- Never conclude from average latency. Percentiles or nothing. The same applies to averages
  over time and over instances: a 70% utilisation over five minutes is consistent with
  three and a half minutes at 100%, and a fleet figure hides one bad pod.
- A deploy carries side effects — process restart, cache invalidation, connection reset,
  pod rotation. Before crediting a change, enumerate everything that moved with it and
  ask whether each alone would explain the result.
- An investigation starts when the metric is at its worst, and the worst is followed by
  the ordinary whatever is done. Compare against the baseline over days, not against the
  incident window.
- The instances still running are not a sample of the instances that failed. Evidence
  from a degrading instance is captured before its restart, in the order
  `incident-evidence-capture` sets out, or it does not exist.
- A result that changes with the duration of the measurement is not a measurement. It is
  accumulated state impersonating performance.
- A benchmark that improves while the SLO does not is a finding about the benchmark. The
  metric that gates the work is the SLO's, under production-shaped load.
- Observe in production, where the observation is passive and the healthy neighbour is a
  free control; experiment in staging, with the differences stated. A canary is a
  production experiment whose control is a pod restarted at the same time.
- Never measure with `System.currentTimeMillis()` in a loop: dead-code elimination, wrong
  clock, JIT warmup included, GC unisolated, no percentiles. Use JMH.
- Warm-up is a rate, not a clock. "Two minutes" is a rule about time for a phenomenon
  governed by invocation count.
- Staging is not production until data volume, access pattern (hot keys), concurrency and
  process uptime are stated. A benchmark over 1,000 rows can fail over 50,000,000.
- Check the current default before adding any JVM flag. Several widely copied flags have
  been the default for years, and re-enabling one produces the feeling of having acted
  while the real problem stays undiagnosed.
- Check utilisation against the SLO before examining code: at 75% an M/M/1 queue's mean
  response is already 4× the service time and its p99 about 18×, at 90% 10× and 46×.
  Faster code lowers the service time; only capacity or less work lowers the utilisation
  (`littles-law-and-queueing`).
- Days without a refuted hypothesis is the symptom of a bad investigation, not of a hard
  problem. The symptom-to-fix table is in `references/methods-and-failure-modes.md`.

## References

- [Methods, experiments and failure modes](references/methods-and-failure-modes.md) — which
  method answers which question (USE, RED, workload characterisation, drill-down, Method R,
  with sources), Gregg's anti-methods, the hypothesis → measurement → diagnosis →
  optimisation → validation ladder with what each rung must produce, Amdahl and Gustafson
  stated correctly, the minimum of experimental design, the failure modes of an
  investigation (confounds, regression to the mean, survivorship, optimising the
  benchmark), production versus staging, and when to stop. Read at step 3, and whenever an
  investigation has stalled.
- [Performance folklore versus the JDK 25 baseline](references/folklore.md) — the claims
  that are still repeated and what is actually true now. Read when an optimisation is
  justified by a general rule rather than by a measurement.
- [Investigation checklist](references/investigation-checklist.md) — what to have ready
  before starting, during observation, at hypothesis time, while measuring and when
  validating. Read at the start of an investigation and again before declaring it closed.
- [Reporting a finding](references/reporting-a-finding.md) — the five things a result must
  carry, a worked before-and-after, the refusals that are also findings, and what not to put
  in. Read when the investigation is finished and someone has to act on it.
