---
name: latency-statistics
description: >
  The statistics of latency measurement: estimands, means and quantiles, histogram aggregation,
  uncertainty, censoring, dependence, and coordinated omission. Use when an SLO or
  dashboard reports mean latency, when p99 values are averaged across instances or time
  windows, when a percentile is quoted without its sample count, when Prometheus buckets are
  the default set, or when deciding whether two measurements actually differ. Does not cover
  generating the load (load-testing), sizing systems from throughput
  (littles-law-and-queueing), or the investigation process itself (performance-methodology).
  The deep treatment of coordinated omission is coordinated-omission, and tail decomposition
  is tail-latency-analysis.
---

# Latency Statistics

## Purpose

Make latency numbers answer a stated decision. This skill prevents a confident but
underidentified result: timeouts omitted from a “successful-request p99”, a fleet quantile
fabricated by averaging instance quantiles, or millions of correlated requests presented as
millions of independent replications.

Latency is a distribution. Every rule here follows from that one fact.

## Workflow

1. **Define the estimand.** Name population/cohort, start and end clock, success/error/timeout
   treatment, quantile definition, observation window and grouping. “Endpoint p99” is
   incomplete until these are fixed.
2. **Preserve denominator and missingness.** Report offered, admitted, completed, failed,
   cancelled, timed-out and dropped counts. A timeout is right-censored at its deadline unless
   the eventual completion is observed; excluding it biases the distribution toward success.
3. **Select statistics by decision.** Quantiles answer threshold/tail questions; the mean
   answers expected latency and aggregate service demand; threshold fractions directly answer
   “what proportion met 300 ms?”. Include counts and uncertainty. Do not prescribe the same
   p50/p90/p99 set for every decision.
4. **Inspect distribution and time.** Use histograms or empirical CDFs plus a time view. A
   single p99 cannot distinguish modes, queue growth, a periodic pause or a small failed cohort.
5. **Check representational error.** Record units, range, bucket layout, overflow/saturation,
   quantisation and rolling-window semantics. A statistically precise estimate of a coarse or
   truncated histogram is still wrong.
6. **Aggregate mergeable distributions before querying.** Add compatible histogram counts or
   raw observations, then compute the quantile. Never average instance/window quantiles.
7. **Audit the observation process.** For load generators, compare scheduled/offered/started/
   completed work and inspect generator saturation; determine whether response completion
   controls future issue times. See `references/coordinated-omission.md`.
8. **Compare treatments at the independent level.** Define practical effect, experimental
   unit and pairing/blocking; estimate the treatment contrast with uncertainty. Requests inside
   one run are not automatically independent replications. See
   `references/comparing-two-measurements.md`.

## Rules

- A sample quantile exists even for small `n`, but may be almost entirely determined by the
  largest observations and have wide population-quantile uncertainty. Record `n`, the
  estimator/interpolation rule, and an interval or rank bounds; never relabel it “undefined”.
- `n(1−p)` is a useful tail-resolution diagnostic, not a universal minimum. Required sample
  size depends on desired value/rank precision, local density, dependence, censoring and the
  decision's error costs.
- A mean can exceed p99 when fewer than 1% of observations are extremely large. That is useful
  evidence about total cost and an unreported extreme tail—not evidence that means are useless.
- Standard deviation does not assume normality. It may be unstable or hard to interpret for a
  heavy tail, so accompany it with robust/distributional summaries; do not discard it by dogma.
- A maximum is meaningful for bounded-window forensics and safety limits but is highly
  sample-size-dependent. Do not substitute a more extreme quantile without enough resolution;
  state the operational question and estimator.
- A test of means does not test quantiles. Normality is not the central defect; wrong estimand,
  dependence, hierarchy, nonstationarity and informative missingness are. Choose analysis from
  the contrast, not from a blanket ban on a named test.
- Investigate the **temporal pattern** before the amplitude: a p99.9 spike every 30
  minutes suggests a periodic mechanism, but does not identify one. Correlate event-level
  evidence; cache TTLs, jobs, traffic and metric windows can share the same period.
- Fan-out tail probability depends on correlation, retries, hedging and which branches lie on
  the critical path. `1−(1−q)^k` applies only to independent branches with identical slow-event
  probability `q`; union bounds and measured joint behaviour are safer than “three times 1%”.

## Required decision artifact

```text
Population/cohort:  route, region, outcome policy, offered/admitted/completed counts
Clock:              start event → terminal event; monotonic clock and units
Window/state:       cold/ramp/sustained; exact interval and load
Representation:     raw/HDR/classic/native; range, buckets, precision, overflow
Estimand:           mean / q(p) / P(T≤x) / censored-time model; quantile definition
Dependence unit:    request, connection, process run, host, shard, time block
Estimate:           absolute values and treatment contrast
Uncertainty:        method, assumptions, interval; practical threshold
Threats:            censoring, omission, routing bias, resets, schema/version changes
Decision:           ship, reject, collect more evidence; guardrails and rollback
```

## References

- [Histograms and aggregation](references/histograms-and-aggregation.md) — HdrHistogram
  sizing and thread safety, Micrometer and Prometheus bucket configuration, and the
  correct aggregation query. Read when configuring metrics or when a dashboard's
  percentile is suspect.
- [Comparing two measurements](references/comparing-two-measurements.md) — tail resolution,
  experimental units, hierarchical replication, paired contrasts, resampling and how to report the
  difference. Read at step 6, whenever two p99s are about to be called different or equal.
- [Coordinated omission](references/coordinated-omission.md) — what it is, why it
  misleads in two directions at once, and how to detect and correct it. Read when the
  number came from a load generator or a fixed-rate producer.
