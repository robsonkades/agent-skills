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
terminal outcomes. A histogram that cannot represent the deadline must not be used to prove the
deadline was met.

## Why quantiles cannot be averaged

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

## Sample quantiles and resolution

A sample quantile is an estimator based on order statistics. Multiple interpolation conventions
exist (Hyndman–Fan enumerate nine), so small-sample results can differ across tools. For empirical
CDF/type-1 semantics, p99 over 200 observations is near the second-largest observation: it is a
valid sample statistic, but a noisy estimate of a population tail.

`n(1-p)` is the expected count beyond population quantile `p`, useful as a resolution warning—not
a pass/fail threshold. Report:

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
- Plain `Histogram` has a single-writer contract. Use `Recorder`, `SingleWriterRecorder` or a
  concurrent variant according to ownership, and obtain interval histograms without racing reset.
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

For classic histograms, place boundaries at decision thresholds (for example, exactly 300 ms) so
the compliant fraction is a bucket-count ratio without quantile interpolation. Add boundaries
around expected quantiles only when the storage/cardinality cost is justified. A rolling deploy
that changes classic bucket sets creates a mixed population whose cumulative buckets no longer
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

Separate three uncertainties:

1. **Sampling/process variation** — which requests, runs, hosts and time windows occurred.
2. **Representation error** — quantisation, bucket interpolation, range truncation and export.
3. **Causal uncertainty** — whether treatment rather than traffic, placement or restart caused
   the difference.

More samples reduce only the first, and only under the sampling/dependence assumptions.

## SLOs and alerting

When the objective is “99% under 300 ms”, alert on the count fraction above/below a bucket at
300 ms and on burn rate, not on an interpolated p99 if avoidable. Include errors and timeouts in
the SLI's denominator according to its contract. Choose evaluation windows and `for`/burn-rate
logic from detection and recovery objectives; no universal five-minute rule exists. Validate
queries with synthetic boundary values, counter resets, absent series, mixed schemas and a known
slow/error cohort.

## Sources

- [Prometheus: Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus native histogram specification](https://prometheus.io/docs/specs/native_histograms/)
- [Micrometer: Histograms and percentiles](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)
- [HdrHistogram project and Java API notes](https://github.com/HdrHistogram/HdrHistogram)
- [OpenTelemetry exponential histogram data model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#exponentialhistogram)
- [Hyndman and Fan, “Sample Quantiles in Statistical Packages” (1996)](https://robjhyndman.com/publications/quantiles/)
