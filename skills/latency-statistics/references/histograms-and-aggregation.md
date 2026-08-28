# Histograms, sample adequacy and aggregation

## Why percentiles cannot be averaged

The error has no predictable direction. With the same two latency values, averaging
per-window p99s can overestimate the true p99 by two orders of magnitude or underestimate
it by one, depending only on how the volume was distributed across the windows. There is
no correction factor, because the operation discards the information needed to compute
the answer.

The only valid aggregation is over the source histograms:

```java
// HdrHistogram: combine, then read
Histogram fleet = new Histogram(3);
fleet.add(instanceA);
fleet.add(instanceB);
long p99 = fleet.getValueAtPercentile(99.0);
```

```promql
# Prometheus: sum the buckets first, quantile last
histogram_quantile(0.99, sum(rate(http_server_requests_seconds_bucket[5m])) by (le))
```

## Sample adequacy

A percentile is only defined once enough observations exist above it. A p99 over 200
samples is the second-slowest observation in the set — a single event, not a statistic.
During an incident this bites hardest, because throughput usually collapses at the same
time: 10 req/s for 20 seconds is 200 samples.

```
✅ "During the incident (14:30-14:45): p99 = 500 ms over 9,000 samples"
❌ "p99 = 500 ms during the incident"
```

## HdrHistogram

O(1) insertion, constant memory, fixed _relative_ error — roughly 185 KB for the 1 ns to
1 h range at three significant digits, against O(n log n) time and unbounded memory for
the naive "keep every sample and sort" approach.

```java
DistributionStatisticConfig.builder()
    .percentileHistogram(true)
    .minimumExpectedValue(Duration.ofMillis(1).toNanos())
    .maximumExpectedValue(Duration.ofSeconds(30).toNanos())
    .build();
```

- `numberOfSignificantValueDigits = 3` gives ±0.1% error.
- `highestTrackableValue` must exceed the client timeout, with margin — values above it
  are not recorded truthfully.
- Measure the real cost with `getEstimatedFootprintInBytes()` for the range you chose;
  do not assume.
- **`Histogram` is not thread-safe.** Use `ConcurrentHistogram`, `Recorder` or
  `SingleWriterRecorder` wherever recording is concurrent.

## Prometheus bucket configuration

The client's default buckets are `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
10]` seconds. For a service whose typical latency is 200 ms, p99 lands in the
`(0.25, 0.5]` bucket, and linear interpolation inside it has a maximum error equal to the
bucket width — 250 ms, larger than the service's own typical latency.

Set the bucket range from the service's measured range, or use
`percentileHistogram(true)` with explicit min/max as above.

## Alerting

- The SLO expression uses a percentile, never a mean.
- `for:` of at least 5 minutes, so a single spike does not page.
- A separate p99.9 alert alongside the p99 one — the tail is a different question from
  the typical case.
- Track jitter (`p99 − p50`) separately from the absolute level.
- Test the alert by injecting artificial latency. An alert that has never fired is a
  hypothesis.
