# Calibrating a performance gate

## Start with the decision

Calibration asks whether the experiment can make the required decision at tolerable error
and cost. It does not begin by measuring a range and multiplying it.

Record:

```text
metric and direction:
decision-relevant configurations:
smallest practically important regression (MPIR):
absolute guardrail:
maximum false-block probability:
desired power at MPIR:
maximum inconclusive rate:
time and compute budget:
```

An MPIR may come from an SLO budget, CPU/cloud cost, capacity headroom, or a cumulative
regression budget. Translate a percentage into the user or operating consequence. Different
benchmarks can legitimately have different MPIRs.

## Build calibration data

### Null runs

Run the same immutable artifact under the production gate procedure across independent
sessions, host allocations, and relevant times. Preserve all attempts, including failed and
outlying ones. This estimates the pipeline's false-block behavior and reveals variance
components; it is not proof that future environments are stationary.

### Injected effects

Create known perturbations around the MPIR: for example deterministic extra work, a disabled
optimization, or a controlled allocation increase. Verify with a profiler that the injection
changes the intended mechanism rather than merely sleeping or measuring a timer artifact.
These runs estimate detection power and exercise the complete workflow.

### Experimental blocks

Where practical, build baseline and candidate artifacts first, then execute randomized
`A/B` or `B/A` pairs on the same host allocation:

```text
block 1: A then B
block 2: B then A
block 3: B then A
block 4: A then B
```

Analyze the within-block log ratio or another declared directional effect. Blocking removes
host/day effects only when the versions experience comparable conditions; it does not cure
carry-over, thermal drift, or shared external contention. Add washout/restart or independent
blocks when those mechanisms matter.

## Choose the independent unit

Ask what can vary independently after randomization. Common units are a fresh fork, a runner
allocation, or a deployment/load-test trial. Invocations within one JMH iteration are
observations of work, not independent version assignments. Iterations in one JVM share
state. Pooling them as if they were independent is pseudoreplication.

For a hierarchical design, retain at least:

```text
epoch -> host/session -> version order -> fork -> iteration -> aggregate measurement
```

Bootstrap or model at the highest relevant assignment/block level. Do not apply a flat
Mann–Whitney test to every iteration merely because JMH JSON exposes `rawData`; that discards
the dependency structure and may produce unjustifiably small p-values.

## Decision-rule options

| Rule                          | Appropriate when                                   | Main caveat                                            |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Paired interval on log ratios | A/B blocks are valid; positive metrics             | Carry-over/order must be controlled                    |
| Independent interval/model    | Versions use independent sessions                  | Host heterogeneity needs modeling/stratification       |
| Bootstrap by block            | Distribution is awkward; enough independent blocks | Resample whole blocks, not nested iterations           |
| Tolerance/control limits      | Detecting departure from stable trunk process      | Process must be monitored for drift/change points      |
| Sequential design             | Early stopping materially saves cost               | Boundaries and maximum sample size must be predeclared |
| Bayesian decision             | Losses and priors can be defended                  | Report sensitivity; probability is model-conditional   |

For positive scores, log ratios are often convenient: they model multiplicative effects and
map back to percentages. For metrics that can be zero/negative or have censored/timeout
values, use a domain model rather than adding an arbitrary epsilon.

### Non-inferiority interpretation

Let `d` be normalized so positive is worse and let `[L, U]` be the declared uncertainty
interval. With MPIR `M > 0`:

```text
U < M      -> exclude a regression of M or greater: pass
L >= M     -> evidence of a material regression: regression
otherwise  -> inconclusive
```

If the objective also includes proving a meaningful improvement, define a separate margin
and direction. Do not infer improvement merely from a negative point estimate.

The confidence level is part of the policy, but it is not enough by itself. Evaluate power
and actual false-block behavior through calibration. Repeated looks, selecting the worst
benchmark, and rerunning until a preferred result all change those rates.

## What JMH `scoreError` does and does not establish

For AVG aggregation, current OpenJDK JMH `Result.getScoreError()` delegates to
`statistics.getMeanErrorAt(0.999)`; `getScoreConfidence()` uses the corresponding 0.999
confidence interval. Other aggregation policies can return `NaN` for score error. Verify the
source for the pinned JMH release rather than encoding “99.9% forever” as a platform law.

This field summarizes one aggregated benchmark result under JMH's statistical machinery. It
does not encode:

- covariance in paired baseline/candidate blocks;
- host/session variance across workflow runs;
- multiplicity across benchmarks and parameters;
- environment drift or incompatibility;
- the product's MPIR;
- a valid general two-version hypothesis test.

Therefore neither interval non-overlap nor `(errorA + errorB) / baseline` is a principled
universal comparator. Retain observations at the chosen experimental-unit level and compute
the comparison specified by the experimental design.

## Power, repetitions, and cost

Use pilot data to simulate the intended gate:

1. Resample complete independent blocks under no effect; estimate false blocks.
2. Inject or simulate effects at MPIR and larger; estimate detection power.
3. Reproduce the exact multiplicity, retry, missing-data, and baseline-selection policy.
4. Vary the number of blocks and plot power, inconclusive rate, and CI duration/cost.
5. Select the smallest design meeting the declared operating constraints.

Ten runs is neither required nor sufficient. A low-variance benchmark may need fewer; a
heterogeneous or small-effect decision may need many more or a different environment.

## Multiplicity

Define the family before looking at results. Options include Holm-style family-wise control
for a small merge-blocking suite, false-discovery-rate control for diagnostics, or one global
hierarchical decision followed by labeled exploratory drill-down. Parameter combinations are
tests too.

Keep a short critical suite. More metrics can improve diagnosis while reducing decision
quality if each independently blocks without correction.

## Drift and baseline policy

Plot compatible results over time with epoch markers for JDK, image, host, dependency,
dataset, and harness changes. Watch for:

- a step change after infrastructure rollout;
- gradual ratcheting under a moving baseline;
- widening dispersion before mean movement;
- host-specific clusters;
- survivor bias when failed/timeout runs disappear from history.

A green trunk run is necessary but not sufficient for promotion: if every merge becomes the
new baseline, small regressions can compound. Keep immutable history and either a champion
baseline or absolute guardrail alongside recent-history comparison. Expire baselines by
policy and start a recorded calibration epoch after incompatible changes.

## Edge cases

- **Missing counterpart:** classify a new benchmark separately; missing formerly critical
  benchmark is invalid unless its removal was explicitly approved.
- **Unit conversion:** convert only dimensionally equivalent units; record the conversion.
- **Timeout/OOM/crash:** these are outcomes, not samples to discard. Classify against the
  benchmark contract and preserve diagnostics.
- **Zero throughput/no successful operations:** ratio effects are undefined; use an absolute
  failure guardrail.
- **Outliers:** investigate and apply only a predeclared robust rule; never delete a slow run
  because it changes the decision.
- **Multiple retries:** keep all attempts and include the retry policy in calibration.

## Calibration checklist

- [ ] MPIR and absolute guardrail trace to a product or operating consequence.
- [ ] Independent unit, blocks, ordering, and carry-over controls are explicit.
- [ ] Null and injected-effect trials exercise the same pipeline used for decisions.
- [ ] False-block rate, power, inconclusive rate, and cost meet declared bounds.
- [ ] Multiplicity and sequential/retry behavior are included in calibration.
- [ ] History retains failures and epoch markers, not only successful summaries.
- [ ] Calibration is repeated after an incompatible environment or methodology change.

## Authoritative references

- [OpenJDK JMH source](https://github.com/openjdk/jmh) — harness implementation and samples.
- [JMH `Result` implementation](https://github.com/openjdk/jmh/blob/master/jmh-core/src/main/java/org/openjdk/jmh/results/Result.java) — inspect the pinned tag for result semantics.
- [NIST/SEMATECH e-Handbook: process/product comparison](https://www.itl.nist.gov/div898/handbook/prc/prc.htm) — experimental comparison and uncertainty methods.
- [NIST/SEMATECH e-Handbook: process monitoring](https://www.itl.nist.gov/div898/handbook/pmc/pmc.htm) — control-chart assumptions and process change detection.
