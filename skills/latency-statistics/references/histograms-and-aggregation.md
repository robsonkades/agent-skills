# Histograms, quantile resolution and aggregation

## Start with the representation contract

A histogram is a lossy distribution representation. Before trusting a derived quantile, record:

| Property                                | Failure when omitted                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Value unit and clock endpoints          | nanoseconds merged as milliseconds; client and server durations compared as if identical      |
| Lowest/highest trackable value          | underflow, clamping, exception, saturation or dropped observations masquerades as a good tail |
| Bucket boundaries or exponential schema | interpolation error is larger than the regression being discussed                             |
| Significant digits/resolution           | quantisation is mistaken for workload stability                                               |
| Window and reset semantics              | cumulative lifetime data, rotating client windows and range-vector deltas are compared        |
| Outcome policy                          | errors and timeouts disappear from the “successful request” distribution                      |
| Library/backend/version                 | defaults and native-histogram support change independently of application code                |

Inspect overflow/error counters and reconcile histogram `_count` with the independently counted
terminal outcomes. Unaccounted overflow, clamping or dropped observations invalidate deadline
compliance claims. A complete finite bucket at or below an inclusive deadline gives a conservative
lower bound on the compliant fraction, which can suffice for a decision even without an exact
deadline bucket. A bucket spanning the deadline cannot resolve the exact compliant fraction.

## Why averaging quantiles does not recover the union's quantile

A quantile is nonlinear. Per-instance/window p99 values and their traffic weights do not contain
enough information to recover the union's p99; averaging them can err in either direction. Merge
compatible observations or histogram counts first, then query the combined distribution.

```java
// Target range and precision must cover every source.
Histogram fleet = new Histogram(highestTrackableNanos, 3);
fleet.add(instanceA);
fleet.add(instanceB);
long p99Nanos = fleet.getValueAtPercentile(99.0);
```

```promql
# Classic cumulative buckets: rate first, preserve `le` while aggregating, quantile last.
histogram_quantile(
  0.99,
  sum by (le) (rate(http_server_request_duration_seconds_bucket[5m]))
)
```

```promql
# Native histogram samples: no `le` label.
histogram_quantile(
  0.99,
  sum(rate(http_server_request_duration_seconds[5m]))
)
```

Filter/group by dimensions required by the decision (`route`, `region`, outcome policy) before
removing labels. Do not merge populations with different clocks or semantics merely because their
metric names match.

## Query estimates are not event samples

Before using `n` in rank or binomial confidence bounds, follow the query and recording rules to
their counter samples, timestamps, resets and observation window. Prometheus `rate` estimates a
per-second rate; `increase` extrapolates to the range boundaries and can return fractional counts.
An integer result is not proof of an observed sample size. Scrape/query timestamps are not request
replications either.

For example, a six-minute range `(0, 360]` contains counter samples at 30, 90, 150, 210, 270 and
330 seconds, with values 1,000, 1,050, 1,100, 1,150, 1,200 and 1,250. Prometheus 3.8 extrapolates
the 250 observed increments over 300 seconds to an `increase` of 300. It has not observed the
events in both boundary gaps. Matching bucket and total estimates of 300 therefore do not
establish 300 successful trials for an exact confidence calculation.

Keep rate-based histogram queries and SLI ratios for monitoring. Count-based inference requires
actual counts for the declared cohort/window, with reset and coverage accounting and the proper
dependence unit; complete interval counts can suffice without retaining individual payloads.
Do not round extrapolated counts or fabricate request rows for resampling. If coverage cannot
be recovered, report the descriptive estimate or an explicit observation model and its uncertainty,
not exact binomial/rank coverage. Using only the observed subinterval also changes the population.

## Sample quantiles and resolution

A sample quantile is an estimator based on order statistics. Multiple interpolation conventions
exist (Hyndman–Fan enumerate nine), so small-sample results can differ across tools. For empirical
CDF/type-1 semantics, p99 over 200 observations is order statistic `ceil(200 × .99) = 198`,
the third-largest when values are distinct: it is a
valid sample statistic, but a noisy estimate of a population tail.

For a continuous population, `n(1-p)` is the expected count strictly beyond its p-quantile;
atoms/ties can make that count smaller. Use it as a resolution warning, not a pass/fail threshold.
Report:

- total and terminal-outcome counts, plus the quantile convention;
- distribution-free order-statistic rank bounds or an interval justified for the sampling design;
- dependence and effective experimental unit, not only request count;
- censoring/timeouts and the histogram's representation error.

If the required tail lies beyond available resolution, prefer a threshold fraction such as
`P(T ≤ 300 ms)`, collect a longer valid window, pool exchangeable windows, or explicitly report
the bound. Do not rename a maximum or bucket edge “p99.99”.

## HdrHistogram engineering

HdrHistogram uses a fixed relative-precision bucket structure with bounded memory and effectively
constant-time recording over a configured range. Its quantisation is intentional; it does not
preserve raw values.

```java
Timer timer = Timer.builder("http.server.duration")
    .publishPercentileHistogram()
    .minimumExpectedValue(Duration.ofMillis(1))
    .maximumExpectedValue(Duration.ofSeconds(30))
    .register(registry);
```

- Three significant decimal digits provide roughly 0.1% value resolution across the configured
  dynamic range; confirm the exact equivalent-value bounds for the library version.
- Range, unit and precision jointly determine footprint. Use
  `getEstimatedFootprintInBytes()` on the actual configuration rather than copying a universal
  kilobyte figure.
- Plain `Histogram` is unsynchronized: a single writer alone does not make concurrent reads,
  merging or reset safe. Use `Recorder`, `SingleWriterRecorder` or a concurrent variant
  according to ownership, and obtain stable interval snapshots without racing reset or reuse.
- Adding can fail or lose the intended precision when the destination cannot represent a source
  value/configuration. Pre-size the destination, test merge compatibility, and count failures;
  auto-resize trades bounded memory for resilience.
- Values beyond range, negative values and unit mistakes need tests at the instrumentation edge.

Micrometer's `publishPercentiles(...)` exports client-computed quantiles with a local rotating
window. Those values are not aggregable. `publishPercentileHistogram()` exports a mergeable
histogram where supported. Expiry, buffer length, bucket defaults and base units depend on meter,
registry and Micrometer version; inspect effective configuration rather than assuming “2 minutes”.

## Classic, native and exponential histograms

| Representation                       | Decision properties                                           | Migration/production hazards                                                                                    |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Raw observations                     | Maximum analytical freedom                                    | high volume/privacy/storage; sampling can bias tails                                                            |
| HdrHistogram                         | known range/relative precision; cheap local recording         | configured range, unit, concurrency and reset/merge ownership                                                   |
| Prometheus classic histogram         | aggregable fixed cumulative buckets                           | one series per label-set/bucket; linear interpolation; all sources must expose compatible boundaries            |
| Prometheus summary/client quantiles  | local quantile accuracy chosen at instrumentation             | quantiles and windows fixed client-side and not aggregable                                                      |
| Prometheus native standard histogram | mergeable exponential schemas, adaptive sparse representation | scrape/remote-write enablement and backend/library support are version-specific; downscaling reduces resolution |
| OpenTelemetry exponential histogram  | mergeable base-2 scales with downscaling                      | aggregation temporality, collector/backend translation and scale limits must be verified end-to-end             |

For classic histograms, place boundaries at inclusive decision thresholds (for example, at most
300 ms) so the compliant fraction is a bucket-count ratio without quantile interpolation. Add
boundaries around expected quantiles only when the storage/cardinality cost is justified. A rolling
deploy that changes classic bucket sets creates a mixed population whose cumulative buckets no longer
describe one common ladder; dual-publish a new metric/schema or wait for convergence before
comparing.

Prometheus native histograms became stable in Prometheus 3.8, but scraping remains explicitly
configured in v3; the specification says scrape and remote-write defaults change in v4. Verify
the deployed server, ingestion protocol, remote-write receiver and query path. Standard schemas
can downscale to merge; custom-boundary native histograms generally require compatible boundaries.

## Interpolation and error budget

`histogram_quantile` estimates within the bucket containing the requested quantile. Classic
histograms generally interpolate linearly; standard native exponential buckets use exponential
interpolation for nonzero buckets. The result's resolution cannot be better than its bucket model.
If a proposed 10 ms improvement lies inside a 250 ms classic bucket, the dashboard cannot decide
the regression even when request count is enormous.

Check edge behavior before interpreting a plateau. For classic Prometheus histograms, a quantile
in the `+Inf` bucket returns the last finite bucket's upper bound. If cumulative counts are 980 at
30 s and 1,000 at `+Inf`, the displayed p99 is 30 s even though only 98% of observations were at
most 30 s. This identifies an unresolved tail above 30 s, not a measured p99 of 30 s. Extend the
finite range for future quantile estimates or obtain suitable raw observations; the existing
30 s count fraction can still answer that threshold's compliance question.

With zero observations, `histogram_quantile` returns `NaN`. A missing `+Inf` bucket or fewer than
two classic buckets also yields `NaN`; inspect counts, schema and query inputs before calling
that result “no traffic”. Preserve the distinction between no observations and broken telemetry.

Separate three uncertainties:

1. **Sampling/process variation** — which requests, runs, hosts and time windows occurred.
2. **Representation error** — quantisation, bucket interpolation, range truncation and export.
3. **Causal uncertainty** — whether treatment rather than traffic, placement or restart caused
   the difference.

More samples reduce only the first, and only under the sampling/dependence assumptions.

## SLOs and alerting

When the objective is “99% at most 300 ms”, use the `le="0.3"` bucket fraction and burn rate,
not an interpolated p99 if avoidable. `le` includes observations exactly at the boundary. A strict
`T < 300 ms` fraction needs evidence excluding or separately counting ties; the `T ≤ 300 ms`
bucket alone does not generally identify that strict fraction. Include errors and timeouts in the SLI's
denominator according to its contract. Choose evaluation windows and `for`/burn-rate
logic from detection and recovery objectives; no universal five-minute rule exists. Validate
queries with synthetic boundary values, counter resets, absent series, mixed schemas and a known
slow/error cohort.

## Sources

- [Prometheus: Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus rate and increase semantics](https://prometheus.io/docs/prometheus/latest/querying/functions/#increase) and [Prometheus 3.8 extrapolatedRate implementation](https://github.com/prometheus/prometheus/blob/v3.8.0/promql/functions.go) — estimated interval counts are not recovered event samples.
- [NIST binomial confidence intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) — the count-based construction uses successes/failures from an observed sample.
- [Prometheus histogram_quantile edge cases](https://prometheus.io/docs/prometheus/latest/querying/functions/#histogram_quantile) and [Prometheus 3.8 BucketQuantile implementation](https://github.com/prometheus/prometheus/blob/v3.8.0/promql/quantile.go) — empty/invalid histograms and the highest-bucket fallback.
- [Prometheus native histogram specification](https://prometheus.io/docs/specs/native_histograms/)
- [Micrometer: Histograms and percentiles](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)
- [HdrHistogram project and Java API notes](https://github.com/HdrHistogram/HdrHistogram)
- [OpenTelemetry exponential histogram data model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#exponentialhistogram)
- [Hyndman and Fan, “Sample Quantiles in Statistical Packages” (1996)](https://robjhyndman.com/publications/quantiles/)
