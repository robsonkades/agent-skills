# Calibrating a performance gate

## Start with the decision

Calibration asks whether the experiment can make the required decision at tolerable error
and cost. It does not begin by measuring a range and multiplying it.

For a new or changed gate, record the applicable fields below. Reuse an existing calibration
when its rule, workload and environment still support the requested claim; a narrow formula
or artifact review need not acquire new trials.

```text
metric and direction:
decision-relevant configurations:
smallest practically important regression (MPIR):
absolute guardrail, if required by the decision:
maximum false-block probability:
desired power at a declared effect above MPIR; decision rates at the margin:
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
optimization, or a controlled allocation increase. Verify that the injection changes the
intended mechanism rather than merely sleeping or measuring a timer artifact. Use adequate
deterministic work/counter evidence, or a targeted profiler when that mechanism remains uncertain.
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

Keep the effect, interval and margin on the same scale. For a positive-worse log ratio `l`,
the corresponding relative effect is `expm1(l)` and a relative margin `M` becomes `log1p(M)`.
A 5% throughput loss has inverse-relative margin `1 / 0.95 - 1` and log margin `-log(0.95)`;
neither is the unconverted value `0.05`. These are transformations of the declared effect,
not a license to change the metric's estimand or average incompatible populations.

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

This rule does not achieve high regression-detection probability exactly at M. For example,
under a normal estimate with a central 95% interval and true effect M, the lower bound
exceeds M only in the upper 2.5% tail, regardless of sample size. Greater precision shrinks
the inconclusive region in effect units, but does not turn the boundary into a high-power
alternative. Calibrate at M and at a separately declared larger effect; change the decision
protocol explicitly if the product requires different behavior near the boundary.

The confidence level is part of the policy, but it is not enough by itself. Evaluate power
and actual false-block behavior through calibration. Repeated looks, selecting the worst
benchmark, and rerunning until a preferred result all change those rates.

## What JMH `scoreError` does and does not establish

For AVG aggregation, OpenJDK JMH 1.37 `Result.getScoreError()` delegates to
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
2. Inject or simulate effects at MPIR and larger; estimate all three decision rates at the
   boundary and detection power at the declared above-margin alternative.
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

Promotion must satisfy the trusted policy's evidence and authority requirements; a green
run alone is insufficient. A policy may deliberately accept a changed performance budget
with a recorded decision rather than require the old gate to pass. If every merge becomes
the new baseline, small regressions can compound. Where cumulative degradation matters, use
a champion, absolute budget or other calibrated trend policy alongside recent history.
Retain immutable history and apply the declared baseline validity/review and epoch policy.

## Edge cases

- **Missing counterpart:** classify a new benchmark separately; missing formerly critical
  benchmark is invalid unless its removal was explicitly approved.
- **Unit conversion:** convert only dimensionally equivalent units; record the conversion.
- **Timeout/OOM/crash:** these are outcomes, not samples to discard. Classify against the
  benchmark contract and preserve diagnostics.
- **Zero throughput/no successful operations:** ratio effects are undefined. Use an absolute
  failure guardrail only when a valid executed workload establishes failure; an unstarted or
  broken runner is invalid/inconclusive evidence, not measured zero throughput.
- **Outliers:** investigate and apply only a predeclared robust rule; never delete a slow run
  because it changes the decision.
- **Multiple retries:** keep all attempts and include the retry policy in calibration.

## Calibration checklist

Use this checklist for the calibration being claimed, not as a mandatory new campaign for
every review. Simulation can assess a decision rule; actual trial and pipeline evidence is
needed for claims about injected mechanisms and end-to-end operation.

- [ ] MPIR and any required absolute guardrail trace to a product or operating consequence.
- [ ] Independent unit, blocks, ordering, and carry-over controls are explicit.
- [ ] Null and injected-effect trials exercise the same pipeline used for decisions.
- [ ] False-block rate, power, inconclusive rate, and cost meet declared bounds.
- [ ] Multiplicity and sequential/retry behavior are included in calibration.
- [ ] History retains failures and epoch markers, not only successful summaries.
- [ ] Calibration is repeated after an incompatible environment or methodology change.

## Authoritative references

- [OpenJDK JMH source](https://github.com/openjdk/jmh) — harness implementation and samples.
- [JMH 1.37 `Result` implementation](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/results/Result.java) — reviewed source baseline; inspect the target version for result semantics.
- [NIST/SEMATECH e-Handbook: process/product comparison](https://www.itl.nist.gov/div898/handbook/prc/prc.htm) — experimental comparison and uncertainty methods.
- [NIST/SEMATECH e-Handbook: process monitoring](https://www.itl.nist.gov/div898/handbook/pmc/pmc.htm) — control-chart assumptions and process change detection.
