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

O(1) insertion, constant memory, fixed _relative_ error, against O(n log n) time and
unbounded memory for the naive "keep every sample and sort" approach. Footprint depends on
the range **and its unit**: at three significant digits, 1 µs to 1 h is 188,928 bytes and
1 ns to 1 h is 270,848 bytes (`getEstimatedFootprintInBytes()`, HdrHistogram 2.2.2). The
widely quoted "~185 KB" figure is the microsecond-unit case.

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

## Merging across instances

Every backend merges histograms by adding bucket counts. That is only valid when the bucket
boundaries are the same on every side, which each format guarantees differently:

| Format                               | Merge rule                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HdrHistogram                         | `a.add(b)` throws `ArrayIndexOutOfBoundsException` when `b` holds a value above `a`'s `highestTrackableValue` (verified, 2.2.2). Precision may differ — a 2-digit histogram adds into a 3-digit one. Size the fleet histogram for the largest instance range, or `setAutoResize(true)`.                                                                                                                                      |
| Prometheus classic (`_bucket`, `le`) | `sum by (le)` is only meaningful when every instance exposes the same `le` set. During a rolling deploy that changes buckets, the overlap window mixes two ladders and `histogram_quantile` over it is undefined. Change buckets rarely and read the quantile only after the fleet converges.                                                                                                                                |
| Prometheus native histograms         | Exponential buckets with a per-histogram `schema`; the upper bound of bucket `i` is `(2^(2^-schema))^i`, so schema 3 is a ×2^(1/8) ≈ 1.09 ladder. Merging different schemas downscales to the coarser one, so instances need not agree. Query as `histogram_quantile(0.99, sum(rate(m[5m])))` — no `le`, no `by (le)`. Needs protobuf scrape; stable in Prometheus 3.8, `scrape_native_histograms` from 3.9, default from 4. |
| OpenTelemetry exponential histogram  | Base-2 `scale` with the same downscale-to-merge property; select it with `OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION=base2_exponential_bucket_histogram` (default is `explicit_bucket_histogram`).                                                                                                                                                                                                             |
| Micrometer `publishPercentiles(...)` | One number per instance from a rotating window (2 min, 3 buffers by default). Not mergeable in any backend — the fleet p99 does not exist. `publishPercentileHistogram()` exports buckets instead; the bucket counts per range are in `metrics-and-cardinality`.                                                                                                                                                             |

The rolling-deploy trap also applies to a client-library upgrade that changes the default
bucket set: the exporter, not the code, changed the ladder.

## Prometheus bucket configuration

The client's default buckets are `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5,
10]` seconds. For a service whose typical latency is 200 ms, p99 lands in the
`(0.25, 0.5]` bucket, and linear interpolation inside it has a maximum error equal to the
bucket width — 250 ms, larger than the service's own typical latency.

That default belongs to the Prometheus client libraries. A Micrometer `Timer` with no
distribution configuration exports **no buckets at all** — only `_count`, `_sum` and
`_max` — so `histogram_quantile` against it returns `NaN` rather than a wrong number.

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
