# Burn-Rate Rules and Templates

## Derivation

For ratio objective \(0<S<1\), error budget \(e_b=1-S\). A burn threshold \(b\) corresponds to
observed bad ratio:

\[
e_{threshold}=b(1-S)
\]

For a window inside the reporting period, actual consumed budget share is
\(f_{observed}=b_{observed}V_w/V_T\), where observed burn comes from the measured bad ratio.
The alert threshold \(b\) instead corresponds to the share \(bV_w/V_T\); crossing it does
not mean consumption equals that threshold. Approximating event share by time share gives
the threshold's corresponding fraction:

\[
f\approx bw/T
\]

With approximately stable event rate over a 30-day period, \(b=14.4\) over one hour
corresponds to 2% of budget; \(b=6\) over six hours corresponds to 5%. These factors do not
depend on target S, but the bad-ratio threshold does. Under bursty traffic the same burn/time
can spend a different event-budget share. For example, if one hour contains 1% of the period's
valid events, burn 14.4 spends 14.4% of its budget, not 2%. Future full-period traffic and
time-to-exhaustion are forecasts, not observations. For a strict `>` comparison, a bad-ratio
threshold at or above 1 cannot fire on valid ratios.

## Recording rule semantics

Partial rule-list fragment: place it under a rule group's `rules:` in a real Prometheus file.
Adapt outcome classification and labels to the SLI contract:

```yaml
- record: job:slo_bad_logical_operations:ratio_rate5m
  expr: |
    sum by (job) (
      rate(logical_operations_total{job="checkout", slo_class="bad"}[5m])
    )
    /
    sum by (job) (
      rate(logical_operations_total{job="checkout", slo_class=~"good|bad"}[5m])
    )
```

Both numerator and denominator must select the same valid population. Aggregate away
instance/pod before fleet alerting, but retain cohort labels required by separate SLOs.
Guard zero/absent denominators according to the no-traffic policy; do not blindly coerce
missing data to zero.

This expression assumes good and bad counters are initialized/exported for every expected
target, even before the first event. A lazily absent bad series produces no numerator rather
than zero. Prefer explicit zero counters; a fallback derived from known healthy denominator
series is valid only if instrumentation guarantees absence means zero. Partial target loss can
bias both sums while leaving a plausible ratio, so validate expected-target/telemetry coverage
independently. Rate extrapolation is an estimate, not an exact event audit count.

For a threshold-latency SLI using classic histograms, configure a bucket exactly at the
objective threshold. For this single selected bucket, aggregate both sides to the same SLO labels:

```promql
1 -
(
  sum by (job) (rate(http_duration_seconds_bucket{job="checkout",le="0.3"}[5m]))
  /
  sum by (job) (rate(http_duration_seconds_count{job="checkout"}[5m]))
)
```

The bucket is inclusive: this measures duration >0.3 seconds among recorded observations. It
does not count missing completions, requests that never reached the instrumentation, or fast
failures as latency failures. If the contract promises successful completion within D, define
joint good-event counters and a complete valid-event denominator; do not add overlapping error
and slow counts. Verify selectors and observation boundaries match.

Retain cohort labels identically on numerator and denominator. Keeping `le` only on the
numerator makes ordinary vector division fail to match; `le` retention is needed when combining
multiple buckets for operations such as `histogram_quantile`, not for this fixed-bucket ratio.
Native-histogram syntax differs; pin the Prometheus version and test.

## Alert expression

Another rule-list fragment. It requires recording rules for **1h, 5m, 6h and 30m**, with the
same population, aggregation labels and missing-data contract; only the 5m definition is shown
above. Configure their evaluation order/intervals and test startup/warm-up and recording lag.

```yaml
- alert: CheckoutFastBudgetBurn
  expr: |
    (
      job:slo_bad_logical_operations:ratio_rate1h{job="checkout"} > 14.4 * 0.001
      and
      job:slo_bad_logical_operations:ratio_rate5m{job="checkout"} > 14.4 * 0.001
    )
    or
    (
      job:slo_bad_logical_operations:ratio_rate6h{job="checkout"} > 6 * 0.001
      and
      job:slo_bad_logical_operations:ratio_rate30m{job="checkout"} > 6 * 0.001
    )
  labels:
    severity: page
  annotations:
    runbook: https://runbooks.example/checkout/budget-burn
```

The 0.001 term is the budget for a 99.9% objective. Label matching for and/or operators
must be tested: inconsistent retained labels can make a rule silently fail or combine the
wrong cohorts.

A Prometheus `for` clause is not categorically forbidden. The window pair already supplies
duration semantics; an added `for` requires the same resulting alert label set to stay active
across evaluations for that duration before firing. A nonmatching evaluation while pending
resets that wait. Check the added detection delay and missed short incidents against the policy.

`keep_firing_for` holds an already firing alert after its condition stops matching; it does
not delay initial firing or prove current impact. In the Prometheus 3.2.1 implementation,
the hold starts at the first nonmatching evaluation, resets if the condition returns, and
ends at an evaluation when that absence has lasted at least the configured duration.
For example, with one-minute evaluations, `for: 2m`, `keep_firing_for: 3m`, true at minutes
0–2 and false thereafter: firing starts at minute 2, persists through minute 5 and clears
at minute 6. Pin the actual evaluator and test its timing; notification grouping/delivery
and evaluator restarts are separate concerns.

## Verification

Select checks for the changed rule or claimed guarantee, using applicable existing results.
Do not require a new full campaign for an arithmetic explanation or an adequate unchanged rule:

- unit-test recording/alert rules with promtool or the deployed equivalent;
- fixture-test counter resets, missing series, zero traffic and label changes;
- replay partial and total outages at known rates;
- verify firing and clearing times empirically;
- test one target missing versus the entire telemetry pipeline missing;
- compare alert population with the SLO report;
- verify routing, inhibition, deduplication and runbook access;
- version rules and record the target/period/budget-fraction derivation.

## References

- [Google SRE Workbook: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Prometheus recording rules](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Prometheus alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Prometheus 3.2.1 alert evaluation implementation](https://github.com/prometheus/prometheus/blob/v3.2.1/rules/alerting.go)
- [Prometheus query operators](https://prometheus.io/docs/prometheus/latest/querying/operators/)
- [Prometheus histogram ratios and quantiles](https://prometheus.io/docs/practices/histograms/)
- [Prometheus rule unit tests](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)
