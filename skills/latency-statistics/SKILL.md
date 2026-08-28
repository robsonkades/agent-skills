---
name: latency-statistics
description: >
  The statistics of latency measurement: percentiles versus averages, histogram aggregation,
  sample-size adequacy, distribution shape, and coordinated omission. Use when an SLO or
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

Make latency numbers mean something. The failure this skill prevents is the confident
wrong number: an SLO met on paper for two years while a fraction of users time out,
because the metric was a mean; or a "fleet p99" computed by averaging per-instance p99s,
where the error is unbounded in **both** directions with the same data.

Latency is a distribution. Every rule here follows from that one fact.

## Workflow

1. **Ask what the number describes.** A single latency figure is only interpretable
   alongside the percentile, the time window, and the sample count over that window.
2. **Check sample adequacy before reading the value.** A p99 over 200 samples is the
   second-slowest observation, not a percentile. Report `n` with every percentile.
3. **Look at the shape, not one point.** `p99 = 310 ms` is bimodal (two code paths) or
   unimodal-with-queue (one path plus waiting). Different root cause, different fix; a
   single number cannot tell them apart. Read the histogram.
4. **Aggregate by combining histograms, never by arithmetic on percentiles.**
   HdrHistogram `.add()`, or `sum(rate(..._bucket)) by (le)` before `histogram_quantile`.
5. **Check for coordinated omission** whenever the number came from a load generator or
   a fixed-rate producer. See `references/coordinated-omission.md`.
6. **Decide whether the difference is real.** Overlapping intervals mean the experiment
   did not decide — not that the two are equal.

## Rules

- Never report a mean latency as an SLO metric. Report p50, p90, p99 and p99.9.
- If the mean exceeds the p99, there is a tail nobody is looking at. That is the only
  situation where the mean carries information: that it is useless.
- Never do arithmetic on percentiles — no averaging across windows, instances or
  weighted by volume. Combine the source histograms.
- Never use the maximum as an SLO metric. It is dominated by single events and never
  recovers. Use p99.9 or p99.99.
- Drop standard deviation from latency dashboards. It presumes a Gaussian distribution
  that latency does not have.
- Always publish the sample count next to the percentile. Without it the percentile is
  unfalsifiable.
- Investigate the **temporal pattern** before the amplitude: a p99.9 spike every 30
  minutes points at a cache TTL, every hour at a scheduled job, at deploy time at a
  regression. The period names a constant in the code.
- Chained services amplify: three services at 1% slow each produce ~3% composite.
  Internal SLOs must be tighter than the external one.

## References

- [Histograms and aggregation](references/histograms-and-aggregation.md) — HdrHistogram
  sizing and thread safety, Micrometer and Prometheus bucket configuration, and the
  correct aggregation query. Read when configuring metrics or when a dashboard's
  percentile is suspect.
- [Coordinated omission](references/coordinated-omission.md) — what it is, why it
  misleads in two directions at once, and how to detect and correct it. Read when the
  number came from a load generator or a fixed-rate producer.
