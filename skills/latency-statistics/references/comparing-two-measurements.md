# Comparing two latency measurements

Read this when deciding whether a treatment changed latency. Two displayed p99 values are
descriptive estimates; a causal or release decision also needs a defined contrast, independent
experimental units, uncertainty and a practical threshold.

## Define the question before choosing a test

These are different estimands:

- `Q_B(.99) − Q_A(.99)` for the same request population;
- ratio `Q_B(.99) / Q_A(.99)` when proportional change is meaningful;
- `P(T > 300 ms)` or SLO error-budget consumption;
- mean service demand or total latency cost;
- p99 of a **typical process run** versus p99 of all pooled requests;
- non-inferiority: “rule out a regression worse than +15 ms”, not merely “reject equality”.

Fix route/mix, outcome and timeout policy, state (cold/ramp/sustained), load, quantile definition
and observation window. Write the smallest operationally relevant effect and asymmetric error
costs before seeing the result.

## When traffic mix changes

Route, region or payload mix can change a fleet quantile even if every cohort's distribution is
unchanged. For the observed user-experience SLI, retain the actual request weights; a mix-driven
regression is still a change in that SLI. For a comparison at a common population mix, inspect
within-cohort distributions and use declared common weights instead of attributing the fleet
difference directly to the build.

For treatment `t` and cohorts `c`, construct `F_t*(x) = sum_c w_c F_t,c(x)`, with nonnegative
weights summing to one, then query its quantile. Normalize each cohort's empirical CDF or compatible
histogram by its own count before weighting; averaging cohort p99s does not implement this formula.
State the target weights and preserve the experimental design in uncertainty calculations.
If a positive-weight cohort has no observations in one arm, its distribution is unavailable;
collect evidence or label any extrapolation model rather than assigning it zero latency.

Illustrative finite sample: 9,950 requests at 10 ms and 50 at 500 ms have type-1 p99 = 10 ms.
Changing only those counts to 9,800 and 200 makes p99 = 500 ms. The actual fraction at most
300 ms falls from 99.5% to 98%. At common 98%/2% cohort weights, both distributions have p99 =
500 ms; the weighted average of cohort p99s, 19.8 ms, is neither mixture's p99.

Report actual-mix and common-mix results separately. Choose comparison cohorts from suitable
pre-treatment characteristics; silently conditioning on successful outcomes or a treatment-induced
routing change can remove part of the effect being studied. Standardization alone does not remove
other confounding or establish causality.

## Find the experimental unit

Requests are nested in connections, JVMs, hosts, shards, zones and time periods. A million
requests from one JVM run provide fine within-run resolution but do not independently replicate
JIT history, placement, cache state or day-level load. The unit is the smallest entity independently
assigned to A or B; the analysis must preserve clustering above it.

| Assignment/design                                  | What can be estimated                                     | Main threats                                                                   |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Randomise eligible requests within a process/fleet | request-population contrast under that shared environment | treatment interference, cache pollution, sticky sessions, unequal outcome loss |
| Randomise JVM/pod instances                        | instance-level treatment effect                           | few clusters, routing/shard imbalance, shared downstream interference          |
| Block whole A/B runs by host/time                  | sustained benchmark contrast                              | carry-over, warm state, order/period effects                                   |
| Before/after deploy                                | observational temporal contrast                           | traffic, restart, host and dependency changes are confounded with build        |
| One incident window per side                       | descriptive contrast                                      | no independent replication of the event; resampling cannot manufacture it      |

Randomise assignment where possible; block known nuisance dimensions; restart/reset both arms
under the same policy; preserve all planned runs. Deterministic ABAB is only one blocking scheme
and aliases with periodic drift. Pilot data estimates variance for sample-size planning; no fixed
“five runs per side” rule is statistically universal.

## Quantile resolution and rank uncertainty

A sample quantile exists for any nonempty sample under a declared convention. Near the sample
edge it changes in large steps and estimates the population quantile imprecisely. For a continuous
population, `n(1−p)` is the expected number strictly beyond its p-quantile; atoms/ties can make that
count smaller. This is a resolution warning, not a theorem declaring a result defined at 10 and
publishable at 100.

For independent identically distributed observations, binomial order-statistic intervals provide
distribution-free rank bounds for a population quantile. With dependence, replace `n` by neither a
guessed “effective n” nor raw request count: preserve dependence through experimental replication,
cluster/block methods, or a justified time-series model. Quantile definitions and histogram
interpolation add separate value-scale uncertainty.

## Choose an analysis that matches the design

### Randomised or paired experiment

Estimate the predeclared contrast directly. For paired host/time blocks, aggregate within-block
quantile or threshold-fraction differences only when the target is that run-level contrast; name
its summary and weighting (for example, the mean paired difference with equal block weights).
For a pooled-request quantile contrast, recompute each arm's quantile and their difference within
each design-respecting resample, preserving pairing and the target population's weights. Averaging
block quantile differences does not estimate this pooled contrast and can even reverse its sign.
For many randomised requests, a cluster-aware quantile method or hierarchical bootstrap can retain
connection/process/time clustering. A randomisation/permutation test should permute at the level
where treatment was assigned, not individual requests when pods were assigned.

### Replicated whole runs

Use a hierarchical design when run/JVM variance matters:

1. Decide whether the estimand is the typical-run quantile or the pooled-request quantile. They
   differ when run volumes/distributions differ.
2. Randomise/block run order and capture host, JVM, dataset, load and state.
3. Estimate run-level and within-run variation from a pilot; allocate repetition where variance
   lives, following Kalibera–Jones rather than treating requests as replicate JVMs.
4. Bootstrap/resample at every sampled hierarchy level or fit a model whose assumptions and
   diagnostics are explicit.
5. Report the treatment contrast interval against both zero and the practical threshold.

Taking a median of per-run p99s estimates a typical-run summary; pooling histograms estimates the
request-weighted mixture. Neither is universally correct. Name the target population.

### One time series/window per arm

A moving/block bootstrap may estimate within-window sampling variation when the process is
approximately stationary and blocks exceed relevant dependence. Select block length using the
autocorrelation/queue timescale and sensitivity analysis—not “about one second”. Resample
contiguous blocks and keep outcome counts. This does not address treatment confounding, long
seasonality, one-off failover, or host-level variance; label the result descriptive.

Resample raw events when policy permits. HdrHistogram values are quantised counts, not “raw at full
precision”; resampling them preserves their representation error. Classic Prometheus buckets
usually support threshold fractions and interval-censored approximations, not a raw-sample
bootstrap. For a quantile extremely near the observed maximum, ordinary n-out-of-n bootstrap can
behave poorly; use order-statistic bounds, additional data, sensitivity analysis, or a justified
extreme-value model instead of returning a spuriously precise interval.

## What common tests actually answer

| Method                         | Legitimate target                                                              | Common misuse                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Student/Welch t interval       | difference in means for independent units, with robustness/asymptotics checked | applied to request rows when the target is p99 or when one run is the true unit             |
| Mann–Whitney/Wilcoxon rank-sum | probability-of-superiority/rank-distribution contrast under its assumptions    | called a median or tail test when shapes differ; request-level pseudoreplication            |
| Kolmogorov–Smirnov             | supremum difference between two CDFs                                           | used to decide a specific p99/SLO effect; significance driven by an irrelevant region       |
| Marginal confidence intervals  | uncertainty of A and B separately                                              | overlap/non-overlap treated as the interval or test for `B−A`                               |
| Best-run/range comparison      | descriptive extrema of chosen runs                                             | called a confidence procedure; ranges expand with run count and have no fixed confidence    |
| Bootstrap                      | sampling approximation under the resampling scheme                             | individual rows resampled despite clusters, nonstationarity, censoring or assignment by pod |

A small p-value does not measure effect size, production value or probability that the null is
true. A non-significant result does not establish equivalence. For a release gate, an interval
entirely below the allowed regression margin is usually closer to the decision than a test of
exact equality.

## Timeouts, errors and censoring

If latency is recorded only for successful completions, a slower treatment may appear faster by
timing out its worst requests. Reconcile offered/admitted/terminal counts and report outcome rates.
A timeout response's terminal latency is observed. For a different variable—time to an
eventual completion that remains unobserved—stopping observation at `d` gives a lower
bound only if the operation was still unfinished then. Cancellation that prevents completion
also changes the outcome process; do not automatically treat it as independent censoring.
Kaplan–Meier or other survival methods require defensible censoring assumptions;
deadline censoring concentrated at one value cannot identify tail latency beyond that point
without a model. Often the operational estimand should be the timeout/error fraction plus the
successful-latency distribution, not a fabricated completion time.

## Reporting template

Illustrative numbers only; this is not an executed experiment.

```text
Decision:       rule out a mean run-level p99 regression > +15 ms at 800 offered rps
Population:     route=/pay, production-shaped mix; timeouts remain terminal outcomes
Design/unit:    8 paired host/time blocks; JVM run independently restarted; A/B order randomised
Representation: raw monotonic durations; type-1 q(.99); timeout deadline 1 s
Estimate:       mean run-level p99 A 212 ms, B 219 ms; mean paired Δp99 = +7 ms
Uncertainty:    95% interval for paired contrast [−2, +13] ms; hierarchy/block method attached
Guardrails:     offered/completed/error counts, throughput, CPU and timeout rate unchanged
Threats:        shared database interference; one region only
Decision:       passes +15 ms non-inferiority margin; does not prove exact equality
```

## Sources

- [Pishro-Nik, mixed-distribution CDF derivation](https://www.probabilitycourse.com/chapter4/4_3_3_solved4_3.php) — the law of total probability combines cohort CDFs, not quantiles.
- [Stark, comparison, experiments and confounding](https://www.stat.berkeley.edu/~stark/SticiGui/Text/experiments.htm) — observed group differences need not be treatment effects.
- [Kalibera and Jones, _Rigorous Benchmarking in Reasonable Time_ (ISMM 2013)](https://kar.kent.ac.uk/33611/)
- [Kalibera and Jones, _Quantifying Performance Changes with Effect Size Confidence Intervals_](https://arxiv.org/abs/2007.10899)
- [Georges, Buytaert and Eeckhout, _Statistically Rigorous Java Performance Evaluation_ (OOPSLA 2007)](https://doi.org/10.1145/1297027.1297033)
- [Hyndman and Fan, _Sample Quantiles in Statistical Packages_ (1996)](https://robjhyndman.com/publications/quantiles/)
- [NIST/SEMATECH Engineering Statistics Handbook](https://www.itl.nist.gov/div898/handbook/)
- [RFC 2330, Framework for IP Performance Metrics](https://www.rfc-editor.org/rfc/rfc2330)
