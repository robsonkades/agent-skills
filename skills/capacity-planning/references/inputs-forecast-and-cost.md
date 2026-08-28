# Inputs, forecast and cost

## Collecting throughput and latency per instance

```promql
# Throughput per pod
sum(rate(http_requests_total[5m])) by (pod)

# CPU per pod — context for a diagnosis, never a substitute for throughput
rate(container_cpu_usage_seconds_total[5m]) by (pod)

# p99 latency — the direct input for p99_at_1_instance_ms when taken on an
# isolated pod under light load
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

## The scaling sweep

```bash
#!/bin/bash
# Requires core == max on the application's internal pool so that "N" is unambiguous,
# and heap plus cgroup quota identical to production.
for N in 1 2 4 8 16 32; do
    kubectl scale deployment myapp --replicas=$N
    sleep 60   # stabilise; JIT warmup needs at least 120s before a measurement counts

    THROUGHPUT=$(kubectl exec prometheus -- promtool query instant \
        'sum(rate(http_requests_total[30s]))' | jq '.data.result[0].value[1]')

    P99_MS=$(kubectl exec prometheus -- promtool query instant \
        'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[30s])) * 1000' \
        | jq '.data.result[0].value[1]')

    if [ -z "$THROUGHPUT" ] || [ "$THROUGHPUT" = "null" ]; then
        echo "ERROR: could not extract throughput for N=$N" >&2
        exit 1
    fi

    echo "$N,$THROUGHPUT,$P99_MS" >> scaling_data.csv
done
```

The abort on an empty result matters more than it looks: writing a silent `0` or `null` into
the CSV corrupts the fit in a way that still produces plausible coefficients.

## Pre-benchmark checklist

- Heap (`-Xmx` / `-Xms`) identical to production.
- cgroup quota and `-XX:ActiveProcessorCount` identical to the production pod.
- `core == max` on the internal `ThreadPoolExecutor`, so the unit being scaled is unambiguous.
- At least 120 s of JIT warmup before the first recorded measurement.
- Real endpoint mix, not only the fastest route; real dependency latency, no mocks.
- `p99_at_1_instance_ms` taken on one instance at utilisation below 0.3.

### Why the baseline p99 needs its own care

It enters the prediction as an **additive** term, so a measurement error propagates
one-for-one at every `N` — a +5 ms error gives a +5 ms error in the answer. That is
predictable, unlike errors in the scalability coefficients, which propagate non-linearly.
The real risk is sampling variance: a single 60 s run at low utilisation contains very few
tail samples. Take the measurement at least three times and use the median.

Measuring it under heavy load instead measures total residence time, folding in the queueing
the model is supposed to add separately — and the scaling fit will still look excellent,
because the two are independent measurements and only one of them was checked.

## Forecasting traffic

Fit growth in log space, then derive an interval from the residuals:

```python
coeffs = np.polyfit(days, np.log(rps_values), 1)
daily_growth = np.exp(coeffs[0]) - 1

residuals = np.log(rps_values) - np.polyval(coeffs, days)
sigma = np.std(residuals)

log_forecast = np.polyval(coeffs, future_day)
p50 = np.exp(log_forecast)
p10 = np.exp(log_forecast - 1.28 * sigma)
p90 = np.exp(log_forecast + 1.28 * sigma)
```

This is a **parametric** interval — the standard deviation of the residuals of a single
regression, with a fixed z-score of 1.28 for the 10th and 90th percentiles. It is not a
bootstrap: nothing is resampled and the regression is never refitted. Labelling it
"bootstrap" in a comment misleads whoever extends the code, and the two methods give
different numbers on non-normal data.

## Three planning horizons

| Horizon | Question it answers                                                | Mechanism                                 |
| ------- | ------------------------------------------------------------------ | ----------------------------------------- |
| 30 days | React to today's peaks                                             | Autoscaler; reaction under 5 minutes      |
| 90 days | Instance type upgrade, reservations                                | The capacity model on real benchmark data |
| 1 year  | Architecture change; when `N_max` forces a refactor; annual budget | Coefficients plus growth forecast         |

## When the model says to stop scaling horizontally

Past `N_max`, adding instances lowers throughput. The cause is shared state under a lock or
O(N^2) inter-instance communication. The action is not more instances:

1. Identify the shared state — a database lock, a shared cache, session affinity.
2. Eliminate or partition it.
3. Refit and confirm coherency actually dropped before scaling further.

Worked example: `kappa = 0.02`, `sigma = 0.05` gives `N_max ≈ 6.9`. Every instance queries a
global configuration table; a local read-through cache with a short TTL takes coherency to
`0.001`, and `N_max` rises to about 30.8.

## Multi-resource ceiling

The application-layer plan is not the system plan.

1. Run the capacity model for the application, giving its instance count and ceiling.
2. Run the same model for the dominant downstream resource — for a database, `N` is
   connections.
3. The system ceiling is the **lower** of the two. Not the sum, not the average.
4. If the application ceiling exceeds the database ceiling, the next investment is the
   database. More application pods make it worse: twenty pods holding twenty connections
   each is 400 against a limit of 300.

## Cost

Hourly cost per instance is a business assumption. Pass it explicitly at every call site;
an implicit default is how one document ends up carrying three different unlabelled cost
bases. Label the assumed rate in the dashboard panel title as well.

A mixed strategy is usually compared three ways for the same instance counts:

- pure on-demand at the peak count;
- reserved for the off-peak base plus on-demand for the burst, charged only for the peak
  hours per day;
- reserved base plus spot for the burst.

Report `cost_per_million_requests` alongside the monthly total — it is the figure that stays
comparable when traffic changes.

## Before the projection drives a decision

- Compare it against a real staging measurement; agreement within 30% is the bar.
- Document the benchmark environment next to the result.
- Have someone other than the person who ran the model review the coefficients and the cost
  assumptions.
