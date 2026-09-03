---
name: performance-methodology
description: >
  The investigation process for performance work: defining an SLO, recording a baseline,
  characterising before diagnosing, falsifiability, fixed-work speedup bounds,
  experimental design, and validating by mechanism rather than by coincidence.
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
3. **Characterise before diagnosing, with a method.** Use RED for the service, USE for
   bounded resources, workload characterisation, and then a drill-down whose clock matches
   the symptom. JFR is one possible instrument, not a mandatory first probe: verify that
   its enabled events, thresholds, duration and overhead can answer this question on this
   workload. Initial suspicions are useful for choosing observations; they become engineering
   hypotheses only after they predict evidence that could refute them. The methods and their
   limits are in `references/methods-and-failure-modes.md`.
4. **Write the hypothesis so it can be wrong.** Name the component, the mechanism and the
   expected impact — then ask what evidence would refute it, and go look for that. A
   hypothesis predicts an observation; a measurement records one with its method. Label
   which is which.
5. **Apply an Amdahl bound before writing code.** With fraction `p` sped up by `s`, the speedup is
   `1 / ((1−p) + p/s)`, ceiling `1/(1−p)`; a 45% frame gives at most 1.82×, which is a
   **45% reduction**, not "82% less time". Use this only for a fixed-work decomposition whose
   parts and clock are comparable. A CPU sample fraction does not bound request-tail latency,
   and percentiles do not add. For tail work, define the slow-request cohort and decompose its
   critical path; treat the result as a bound to validate, not a prediction guaranteed by the
   formula. Let value, risk and uncertainty—not a universal percentage—set the go/no-go bar.
6. **Design the comparison before running it.** Define the estimand, practical effect size,
   sampling unit, load schedule, control, run order, stopping rule and analysis. Randomise or
   block when possible; alternate only when it is the justified blocking scheme. Choose sample
   size from variance and desired precision or power. Use factorial designs for interactions;
   do not hide several changes in one treatment.
7. **Validate by explaining the mechanism.** A graph that improved is not a result until
   you can say why, until the mechanism accounts for the size of the effect, and until
   plausible alternative causes have been challenged. A reversible feature flag can support
   an AB/BA test; otherwise use randomised traffic allocation, a restarted control, bisection,
   or another defensible counterfactual. Do not add a runtime toggle merely to satisfy this
   recipe if the toggle changes the mechanism or raises production risk.
8. **Decide whether to stop.** Stop when the SLO is met with the predeclared margin and
   uncertainty across its evaluation window; when the next measurement costs more than its
   decision value; or when bounded local options, alone and in credible combinations, cannot
   close the gap. The last two are findings, not failed investigations.
9. **Write it down** — hypothesis, evidence, change, before/after, and the findings that
   were not the cause. Performance work that is not recorded gets redone.

## Rules

- Do not collapse a latency distribution into one statistic. Report request count and
  throughput plus the statistics that answer the decision: selected quantiles for an SLO,
  the mean for total work or queueing models when its assumptions fit, error/timeout/censoring
  rates, and uncertainty. Never average per-instance percentiles into a fleet percentile;
  aggregate mergeable histograms or raw observations with compatible boundaries instead.
- A deploy carries side effects — process restart, cache invalidation, connection reset,
  pod rotation. Before crediting a change, enumerate everything that moved with it and
  ask whether each alone would explain the result.
- An investigation often starts when the metric is unusually bad, so regression to the mean
  is a competing explanation. Compare like-for-like periods or contemporaneous controls;
  "over days" is insufficient when seasonality, traffic mix or deployments differ.
- The instances still running are not a sample of the instances that failed. Evidence
  from a degrading instance is captured before its restart, in the order
  `incident-evidence-capture` sets out, or it does not exist.
- A result that changes with the duration of the measurement is not a measurement. It is
  accumulated state impersonating performance.
- A benchmark that improves while the SLO does not is a finding about the benchmark. The
  metric that gates the work is the SLO's, under production-shaped load.
- Observe in production only within an explicit collection budget and data-handling policy;
  profiling, tracing and event-threshold changes can consume CPU, storage and cardinality or
  expose sensitive data. Experiment where blast radius is acceptable. A canary is not
  automatically randomised or isolated: routing bias, shared dependencies and fresh-process
  state can confound it.
- Never measure with `System.currentTimeMillis()` in a loop: dead-code elimination, wrong
  clock, JIT warmup included, GC unisolated, no percentiles. Use JMH.
- Warm-up is a workload- and runtime-dependent state transition, not a fixed clock. Measure
  compilation, cache and resource state; include cold/ramp behaviour when users experience it.
- Staging is not production until data volume, access pattern (hot keys), concurrency and
  process uptime are stated. A benchmark over 1,000 rows can fail over 50,000,000.
- Check the current default before adding any JVM flag. Several widely copied flags have
  been the default for years, and re-enabling one produces the feeling of having acted
  while the real problem stays undiagnosed.
- Check queues and saturation before narrowing to code. In the idealised stationary M/M/1
  model, response time grows as `1/(1−ρ)` and its exponential p99 as
  `−ln(0.01)/(1−ρ)` times mean service time: about 18× at `ρ=.75` and 46× at `.90`.
  Real arrivals, service-time tails, finite pools and backpressure often violate that model.
  Less arrival work, more capacity, or faster service can all lower utilisation; measure the
  actual queue and service demand (`littles-law-and-queueing`).
- Days without a refuted hypothesis is the symptom of a bad investigation, not of a hard
  problem. The symptom-to-fix table is in `references/methods-and-failure-modes.md`.

## References

- [Methods, experiments and failure modes](references/methods-and-failure-modes.md) — which
  method answers which question (USE, RED, workload characterisation, drill-down, Method R,
  with sources), Gregg's anti-methods, the hypothesis → measurement → diagnosis →
  optimisation → validation ladder with what each rung must produce, Amdahl and Gustafson
  stated with their assumptions, experimental units, randomisation/blocking and interaction
  designs, the failure modes of an
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
