# Micrometer and Prometheus

## Verify versions and exposition

Micrometer registries and Prometheus versions evolve, particularly native-histogram support,
bucket generation and naming conventions. Pin versions and inspect one real scrape. Do not
hardcode remembered counts such as “66 default buckets” into a durable design rule.

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

A cap is a containment layer, not the cardinality design. Denial can make SLI denominators
incorrect.

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

## Schema migration

When changing tags, units or bucket representation:

1. introduce a versioned/new metric when populations cannot safely mix;
2. dual-publish briefly and compare queries/cost;
3. update recording rules, alerts, dashboards and autoscalers;
4. roll out without aggregating incompatible schemas;
5. remove old publication after consumer/retention review.

## References

- [Micrometer meters](https://docs.micrometer.io/micrometer/reference/concepts/meters.html)
- [Micrometer histograms and percentiles](https://docs.micrometer.io/micrometer/reference/concepts/histogram-quantiles.html)
- [Micrometer meter filters](https://docs.micrometer.io/micrometer/reference/concepts/meter-filters.html)
- [Prometheus histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus metric types](https://prometheus.io/docs/concepts/metric_types/)
