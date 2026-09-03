# Burn-Rate Rules and Templates

## Derivation

For objective \(S\), error budget \(e_b=1-S\). A burn threshold \(b\) corresponds to
observed bad ratio:

\[
e_{threshold}=b(1-S)
\]

Budget fraction consumed over long window \(w\) in period \(T\):

\[
f=bw/T
\]

For a 30-day period, \(b=14.4\) over one hour represents 2% of budget; \(b=6\) over six
hours represents 5%. These factors do not depend on the target S, but the bad-ratio
threshold does.

## Recording rule semantics

Example availability ratio; adapt outcome classification and labels to the SLI contract:

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

For a threshold-latency SLI using classic histograms, configure a bucket exactly at the
objective threshold and aggregate buckets by le plus SLO dimensions:

```promql
1 -
(
  sum by (job) (rate(http_duration_seconds_bucket{job="checkout",le="0.3"}[5m]))
  /
  sum by (job) (rate(http_duration_seconds_count{job="checkout"}[5m]))
)
```

Verify selectors match. If other labels require aggregation, include le in the bucket sum
before division. Native-histogram syntax differs; pin the Prometheus version and test.

## Alert expression

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

A Prometheus for clause is not categorically forbidden. The window pair already supplies
duration semantics, so an added for changes detection/recall and must be justified and
replay-tested. Likewise, keep_firing_for changes resolution behavior and version
requirements.

## Verification

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
- [Prometheus query operators](https://prometheus.io/docs/prometheus/latest/querying/operators/)
