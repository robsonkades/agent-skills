# Micrometer and Prometheus

## Verify versions and exposition

Micrometer registries and Prometheus versions evolve, particularly native-histogram support,
bucket generation and naming conventions. Pin versions and inspect one real scrape. Do not
hardcode remembered counts such as “66 default buckets” into a durable design rule.

Inspect the project's Java baseline and resolved registry/client dependencies; a reference to
native histograms is not authorization to upgrade. Validate producer, exposition negotiation,
scraper, remote storage and query engine together, including any simultaneous classic export.

Micrometer's Prometheus registry requires the same meter type and tag-key set for each
exported metric name; this is a client registration constraint, not a universal rule that
Prometheus series must all carry identical labels. Registering `checkout.requests` with
`outcome` on success but `outcome,reason` on failure can reject the failure cohort. Keep a
consistent key set with a bounded `none`/`unknown` value when that preserves the quantity's
meaning, or separate genuinely different quantities into different families. Inspect the
name and keys after naming conventions and filters as well as at the call site.

Verify registration-failure signals and the actual scrape for both paths; a returned meter
handle is insufficient. In focused tests, a registry's `throwExceptionOnRegistrationFailure()`
can expose a missing cohort immediately; do not make production request failure the default
telemetry policy. This behavior is pinned to
[Micrometer 1.15.5 PrometheusMeterRegistry](https://github.com/micrometer-metrics/micrometer/blob/v1.15.5/implementations/micrometer-registry-prometheus/src/main/java/io/micrometer/prometheusmetrics/PrometheusMeterRegistry.java)
(`applyToCollector`); verify the resolved client version.

## Micrometer distribution options

- A Timer records completed durations and count/total time; pair it with active/age metrics
  for stuck work.
- DistributionSummary records non-time amounts and needs a meaningful base unit/range.
- LongTaskTimer observes active long tasks and their elapsed duration.
- publishPercentiles creates client-calculated quantiles for each meter identity; they
  cannot form a fleet quantile.
- publishPercentileHistogram exports backend-aggregatable distribution data for supported
  registries.
- serviceLevelObjectives adds boundaries useful for exact threshold ratios.
- minimum/maximum expected values influence histogram range/buckets and memory/series cost.

Confirm what the configured registry actually exports: names, units, buckets, +Inf,
sum/count/max, temporality and native/classic form.

## Gauge lifecycle

Micrometer documents weak-reference behavior for common gauge registration forms. Keep the
observed object strongly owned for the intended meter lifecycle and avoid repeatedly
registering equal meter IDs with different objects. Callback exceptions, NaN and object
collection must be observable/tested.

A filter that removes or replaces tags can map different gauges to the same meter ID.
The first registration remains; their observed objects are not automatically summed.
For example, dropping `queue` from two queue-depth gauges loses a source, even though series
count falls. Use one lifecycle-owned aggregate callback/state when a combined depth is the
intended quantity, and exercise changes in both source queues in the test.

## URI templates

Use matched route templates for server metrics and template-aware client APIs where
available. A resolved URI with entity IDs is high-cardinality. Unmatched/unknown routes must
collapse to a bounded value before labels are produced.

Framework behavior changes across instrumentations; assert tag values in an integration
test rather than assuming Spring/Micrometer always normalizes a custom filter/client.

## MeterFilter boundaries

Micrometer provides maximum-allowable-tag and metric filters, denial and tag replacement.
Install filters before affected meters register. Verify:

- prefix/key matching;
- whether overflow denies the full measurement or maps it to OTHER;
- ordering with other filters;
- visibility of overflow;
- behavior after reload/registry recreation.

`MeterFilterReply.ACCEPT` short-circuits later **accept/deny** decisions. A broad
`acceptNameStartsWith("http")` before a tag cap can therefore bypass that cap. Put required
deny/cap decisions before such an accept, or use `NEUTRAL` when later checks must still run.
With fresh registries, register more distinct values than the limit and assert the intended
overflow and retained totals; checking that the filter was configured does not test containment.

A cap is a containment layer, not the cardinality design. Denial can make SLI denominators
incorrect.

`maximumAllowableTags` limits distinct values of a particular tag among matching meter names,
not the Cartesian product across all tags or fleet-wide series. Choose `onMaxReached`
deliberately (for example denial), test first-seen-value behavior, and record overflow through
a separate bounded meter outside the rejected family. Normalize before registration where
preserving totals is required; do not retain every raw input in an unbounded normalization cache.

## Prometheus distributions

Classic histogram query:

```promql
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

Keep all desired cohort labels plus le in the aggregation. Compatible bucket schemas are
required during aggregation. Native histograms use histogram samples and different PromQL,
for example aggregating rate of the base histogram without le. Follow the deployed
Prometheus documentation.

Threshold ratios with a classic SLO bucket avoid percentile interpolation:

```promql
sum(rate(http_request_duration_seconds_bucket{le="0.3"}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

Selectors/populations must match. Missing bucket series usually yields an empty expression,
label mismatch or schema issue—not universally NaN.

This ratio estimates the fraction of **recorded observations at or below 0.3 seconds** over
the rate window; it is not an exact event count at arbitrary window edges. The bucket avoids
quantile interpolation, not scrape/rate estimation. Confirm every selected target exports
that boundary: a bucket missing from only some targets can silently bias the aggregate.
Define zero-traffic/zero-denominator behavior, and account for required rejected, timed-out
or unfinished operations absent from the histogram rather than declaring a healthy SLI.

## Schema migration

First assess the affected consumer/population contract. A compatible new metric or label
value within an existing contract can need only focused compatibility and budget checks;
do not force dual publication or a fresh load campaign for unchanged populations.

When units, label semantics or bucket representation cannot safely mix during rollout:

1. introduce a versioned/new metric when populations cannot safely mix;
2. use bounded dual publication when needed to compare queries/cost and transition consumers;
3. update recording rules, alerts, dashboards and autoscalers;
4. roll out without aggregating incompatible schemas;
5. remove old publication after consumer/retention review.

Plan staged consumer updates and verify schema selection at each stage; do not assume
dashboards, alerts, autoscalers and external consumers can all change atomically.

## References

- [Micrometer meters](https://docs.micrometer.io/micrometer/reference/concepts/meters.html)
- [Micrometer gauge lifecycle and filter collisions](https://docs.micrometer.io/micrometer/reference/concepts/gauges.html)
- [Micrometer histograms and percentiles](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)
- [Micrometer meter filters](https://docs.micrometer.io/micrometer/reference/concepts/meter-filters.html)
- [Prometheus histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus metric types](https://prometheus.io/docs/concepts/metric_types/)
