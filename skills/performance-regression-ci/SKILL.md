---
name: performance-regression-ci
description: >
  Designing trustworthy performance-regression gates: defining the decision and
  smallest important regression, preserving independent experimental units, calibrating
  noise and power, comparing compatible JMH results, handling multiplicity and drift,
  separating screening from confirmation, and operating secure baseline promotion. Use
  when performance results should influence merge, when a threshold or statistical test
  lacks an empirical error budget, when JMH scoreError is treated as a two-build test,
  when repeated iterations are mistaken for independent runs, when CI infrastructure
  changes contaminate comparisons, or when a pipeline can lose a comparator exit status.
  Does not teach benchmark construction (jmh-advanced), full-system workload design
  (load-testing), or general latency inference (latency-statistics).
---

# Performance Regression CI

## Purpose

A performance gate is a decision system, not a percentage comparison. It must state what
change matters, acquire evidence capable of detecting it, distinguish code effects from
environment drift, and produce `pass`, `regression`, or `inconclusive` without silently
turning missing evidence into success.

The objective is not zero alerts. It is a known operating characteristic: acceptable false
block probability, useful power against the smallest regression the product cares about,
bounded cost, and an auditable baseline. A green gate with weak power is not evidence of
equivalence.

## Ownership boundary

This skill owns the automated **decision protocol** around performance evidence. Delegate:

- benchmark validity, JVM forks, warm-up, profilers, and JMH mechanics to
  `jmh-microbenchmarks` and `jmh-advanced`;
- effect sizes, confidence intervals, quantiles, dependence, and hypothesis design to
  `latency-statistics`;
- workload representativeness and coordinated omission to `load-testing` and
  `coordinated-omission`;
- investigation after a signal to `performance-methodology`.

## Gate contract

Write this contract before implementing the comparator:

| Field         | Required decision                                                        |
| ------------- | ------------------------------------------------------------------------ |
| Decision      | What merge, release, or investigation action follows each status?        |
| Metric        | Exact JMH result/parameter tuple, unit, mode, direction, and aggregation |
| Scope         | Critical benchmarks that block; diagnostic benchmarks that only report   |
| MPIR          | Smallest practically important regression, in product-relevant units     |
| Guardrail     | Absolute budget or SLO proxy that must not be crossed                    |
| Evidence      | Independent unit, repetitions, pairing/blocking, interval or test        |
| Errors        | Target false-block rate, desired detection power, multiplicity policy    |
| Compatibility | Code, data, JDK, JVM flags, host, and harness fields that must match     |
| Baseline      | Selection, retention, provenance, expiry, and promotion authority        |
| Failure       | Meanings and exit codes for pass, regression, inconclusive, invalid      |

`MPIR` is a product/architecture decision, not the observed noise multiplied by a constant.
Noise determines whether the available design can resolve that MPIR. If it cannot, improve
the design, use a controlled confirmation environment, or admit that the gate is only a
coarse screen.

## Decision model

Prefer a three-zone decision based on an uncertainty interval for the directional effect:

```text
effect = signed relative change, normalized so positive means worse
M = smallest practically important regression

upper bound < M                 -> no material regression detected
lower bound >= M                -> material regression detected
otherwise                       -> inconclusive
absolute guardrail breached     -> regression, independently of relative baseline
```

This is a non-inferiority-style framing. It prevents “not statistically significant” from
being translated into “the versions are equivalent.” A team may instead use a calibrated
tolerance interval, control chart, Bayesian decision rule, or sequential test; document its
assumptions and simulate its error behavior before enabling merge blocking.

For a lower-is-better metric:

```text
signedRelativeChange = current / baseline - 1
```

For a higher-is-better metric:

```text
signedRelativeChange = baseline / current - 1
```

The ratio form keeps positive = worse, but it requires positive scores. For zero, negative,
or transformed scores, define an absolute effect or a domain-specific transformation.
Never compare values until benchmark identity, parameter tuple, score unit, mode, and
direction are compatible.

## Experimental design

### Preserve the experimental unit

The independent unit is normally a fresh process/fork or a separately scheduled runner
session, not an invocation and not automatically a JMH measurement iteration. Iterations
within one fork share compilation history, heap state, host conditions, and often temporal
autocorrelation. Treating them as independent inflates the sample size and confidence.

Use one of these designs:

- **Paired/interleaved A/B:** run baseline and candidate in randomized order on the same
  host block. Analyze within-block effects. This cancels much host and time drift and is the
  preferred confirmation design when both commits can be built safely.
- **Independent controlled runs:** allocate independent forks/sessions to each version and
  compare at that level. Use when pairing would introduce carry-over or cannot be deployed.
- **Historical screen:** compare against a compatible distribution from trusted trunk runs.
  Cheap, but vulnerable to drift and selection bias; confirm borderline or blocking results.

Randomize order, retain block/run identifiers, and separate warm-up from measurement. If
thermal state, CPU quota, noisy neighbors, power policy, or clock behavior dominate the
effect, more iterations inside the same contaminated run do not repair the design.

### Calibrate capability, not folklore thresholds

Collect unchanged-code runs across the times, hosts, and restart boundaries the gate will
experience. Then inject representative regressions near the MPIR. Estimate:

- false-block rate under no change;
- power at the MPIR and at larger effects;
- inconclusive frequency and retry cost;
- host/day/JDK variance and outlier behavior;
- sensitivity to order, warm-up, thermal state, and dependency drift.

Choose repetition count and rule by simulation, bootstrap at the independent-unit level, or
a model that represents the blocking structure. `max/min` over ten runs is an unstable range,
not a reusable noise estimate. “Two times the noise” and “four times the noise” do not define
a false-positive rate or power.

## Environment compatibility

Capture an environment/configuration fingerprint with every result:

- benchmark artifact and source commits, dependency lock/checksum, dataset checksum;
- JMH version, benchmark mode, unit, parameters, threads, forks, warm-up and measurement;
- complete Java runtime identity and effective JVM arguments;
- OS/kernel, CPU model/topology, cgroup/quota/cpuset, memory limit, host/runner pool;
- collector, heap policy, power/frequency policy, and relevant services or agents.

Pin values only when the experiment intends to hold them constant. Fixed heap sizes,
`AlwaysPreTouch`, a collector, or CPU affinity can improve repeatability, but can also make
the gate unlike production or remove the phenomenon under test. Maintain separate
“controlled microbenchmark” and “target-like system” profiles when both questions matter.

Compatibility is a policy, not exact string equality for every field. Classify changes as:

- comparable;
- comparable after a proven conversion or model adjustment;
- new calibration epoch;
- invalid comparison.

A JDK, hardware, collector, dependency, harness, or dataset change usually starts a new
epoch. Do not label that discontinuity a code regression.

## Multi-benchmark decisions

Parameter points should cover decision-relevant operating regions, not mechanically
“small, medium, large” for every benchmark. Scaling claims require enough sizes and a model;
one changed point alone does not prove a complexity-class change.

Testing many benchmarks, parameters, and metrics increases the chance of a false alert.
Choose one explicitly:

- a small predeclared critical set with family-wise control;
- false-discovery-rate control for a broader diagnostic suite;
- a hierarchical/global screen followed by corrected drill-down;
- per-benchmark guardrails whose joint false-block behavior was calibrated empirically.

Never hide multiplicity by reporting only the worst delta. Preserve all results and disclose
selection rules.

## Baseline lifecycle

Treat a baseline as a versioned release artifact, not a mutable cache entry. It needs commit,
fingerprint, calibration epoch, creation workflow, retention, digest, and promotion record.

Useful policies:

- **Champion baseline:** compare to a manually or automatically promoted trusted trunk
  revision; stable but can become stale.
- **Recent compatible distribution:** detects deviations from current trunk; handles ordinary
  evolution but can ratchet gradual degradation.
- **Both:** block against an absolute guardrail and compare with both champion and recent
  history; usually the most informative production policy.

Only a trusted workflow may promote. Untrusted pull-request code may read an explicitly
non-secret baseline but must not overwrite it, publish a trusted result, or execute with
privileged credentials. A missing, expired, malformed, or incompatible baseline yields
`inconclusive`/`invalid`, never a fabricated first-run pass.

## Pipeline architecture

```text
cheap PR screen
  -> pass: report evidence
  -> clear regression: controlled confirmation
  -> inconclusive: controlled confirmation or explicit human policy

controlled confirmation
  -> pass / regression / inconclusive
  -> immutable result + provenance + diagnostics

trusted trunk workflow
  -> validate compatibility and health
  -> promote baseline according to policy
```

This two-stage design keeps feedback affordable without pretending a noisy executor can
resolve small effects. A blocking gate needs a bounded policy for infrastructure failure and
inconclusive results; silently retrying until green introduces optional-stopping bias.

## Failure protocol

Use distinct machine-readable statuses and stable exit codes, for example:

| Status       | Example code | Meaning                                                               |
| ------------ | -----------: | --------------------------------------------------------------------- |
| pass         |            0 | Valid evidence excludes a material regression under the declared rule |
| regression   |            1 | Material relative effect or absolute guardrail breach                 |
| invalid      |            2 | Missing/malformed/incompatible input or comparator defect             |
| inconclusive |            3 | Valid evidence is insufficient for a decision                         |

Always emit a report artifact before returning the code. If output is piped through `tee`
under Bash, temporarily disable `errexit`, run the pipeline, immediately capture
`PIPESTATUS[0]`, restore `errexit`, publish the status, and exit explicitly. `${PIPESTATUS[0]}`
alone cannot execute after a failed pipeline when the shell was launched with `-e` and
`pipefail`.

## Troubleshooting

| Symptom                           | Distinguish                                                       | Likely action                                                              |
| --------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Alerts disappear on rerun         | host/block effects, order, thermal state, optional stopping       | Pair/interleave; expose retries; move confirmation to controlled pool      |
| Every result is inconclusive      | interval width versus MPIR, number of independent units           | Increase independent repetitions or relax only the product MPIR explicitly |
| Step fails without report         | Bash `-e`/`pipefail`, missing `always()`, output written too late | Capture status safely; upload/report with unconditional step               |
| Sudden fleet-wide shift           | JDK, image, runner, kernel, harness, dependency epoch             | Stop comparison; recalibrate and retain the discontinuity                  |
| Slow monotonic degradation passes | moving baseline ratchet                                           | Compare champion/absolute guardrail and inspect trend/change points        |
| One parameter blocks repeatedly   | real operating region, multiplicity, benchmark validity           | Reproduce under paired control; diagnose before suppressing                |
| PR can alter baseline             | workflow trigger, token scope, cache/artifact trust               | Separate untrusted measurement from trusted promotion                      |

## Anti-patterns

**Anti-pattern: threshold from a customary percentage.** It happens because a single number
is easy to implement. It is dangerous because neither practical importance nor error rates
are known. Detect it by the absence of MPIR, calibration data, and power. Replace it with a
predeclared decision plus empirical operating-characteristic study.

**Anti-pattern: non-overlapping JMH `scoreError` intervals as a two-version test.** It happens
because JSON exposes `scoreError`. That field describes JMH's aggregate estimate (for AVG,
current JMH source uses a 99.9% mean-error calculation); interval overlap is not a general
paired or independent two-sample test and ignores run blocking. Keep the field for reporting,
but analyze retained independent-unit observations using the declared design.

**Anti-pattern: retry until green.** It converts noisy evidence into selection bias and
makes false passes likely. Bound retries in advance, retain every attempt, and return
inconclusive when the evidence budget is exhausted.

**Anti-pattern: always use dedicated hardware.** Dedicated hosts can reduce variance but may
still drift and may not be needed for coarse regressions. Measure resolution and cost. Use a
shared screen plus controlled confirmation when that meets the decision need.

## Review checklist

- [ ] Metric, direction, unit, parameters, MPIR, and absolute guardrail are explicit.
- [ ] Independent experimental unit and pairing/blocking are explicit.
- [ ] False-block rate, power, inconclusive rate, and runtime were calibrated.
- [ ] Comparator rejects incompatible fingerprints and missing entries.
- [ ] Multiplicity and retries have predeclared policies.
- [ ] Baselines are immutable, attributable, epoch-aware, and promoted only by trust.
- [ ] Pipeline preserves report artifacts and exact comparator status on every path.
- [ ] Injected regressions, no-change controls, malformed input, missing baseline, and
      infrastructure failure were tested end to end.
- [ ] A green result is worded as bounded evidence, not proof of equal performance.

## References

- [Calibrating the gate](references/calibrating-the-gate.md) — experimental design,
  calibration, inference choices, and baseline drift.
- [Pipeline construction](references/ci-pipeline.md) — result contract, safe shell status
  capture, workflow trust boundaries, and end-to-end tests.
- [OpenJDK JMH project](https://github.com/openjdk/jmh) — authoritative harness source and
  samples; pin the version used by the repository.
- [JMH `Result` source](https://github.com/openjdk/jmh/blob/master/jmh-core/src/main/java/org/openjdk/jmh/results/Result.java) — current definitions of score,
  `scoreError`, confidence, and sample count; verify against the pinned JMH tag.
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — documented shell invocation and fail-fast behavior.
- [GitHub Actions dependency-cache reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) — cache scope and low-trust security model.
