# Inputs, Forecast and Cost

## Measurement contract

Capture immutable experiment metadata:

- code/image digest, JDK/JVM/GC flags and dependency versions;
- CPU architecture/node class, Kubernetes requests/limits, cgroup mode and placement;
- heap/native-memory settings, sidecars and observability configuration;
- dataset distribution, cache state, request mix/payload and tenant skew;
- load-generator model, location, offered schedule, time synchronization and client
  headroom;
- run phases, abort criteria and raw artifact locations.

Warmup is a state criterion. Inspect compilation, allocation/GC, cache hit rate,
connection establishment and throughput/latency stability. Preserve cold-start behavior
as a separate scenario.

## Signals

| Plane          | Minimum evidence                                                          |
| -------------- | ------------------------------------------------------------------------- |
| demand         | offered, admitted, rejected/shed, attempted, retried and successful units |
| user outcome   | latency distribution, errors, deadlines, correctness/degradation          |
| queues         | depth, age, in-flight, admission and abandonment by partition/class       |
| JVM/process    | CPU time, runnable delay, allocation, GC, heap/native memory, threads     |
| container/node | throttling, working set/OOM/eviction, network, disk, placement pressure   |
| dependency     | calls, occupancy, latency/errors, quota, pool and partition skew          |

For Prometheus classic histograms, aggregate bucket counters by all desired dimensions and
_le_ before histogram_quantile, with a rate window appropriate to the analysis:

```promql
histogram_quantile(
  0.99,
  sum by (le) (
    rate(http_server_request_duration_seconds_bucket{service="checkout"}[5m])
  )
)
```

Retain histograms/traces or run-level artifacts. A dashboard percentile cannot be safely
re-aggregated across replicas or time.

## Experiment matrix

Vary independently where feasible:

- resource shape and replica count;
- offered-load level and trajectory;
- workload mix, payload/data size and tenant concentration;
- cache/JIT coldness;
- dependency latency/error/quota state;
- rollout and failure topology.

Randomize or block run order to reduce infrastructure drift. Include enough independent
repetitions to estimate uncertainty needed by the decision; there is no universal run
count. Stop or isolate a run when the generator or unrelated infrastructure is the
bottleneck.

## Forecasting demand

### Define the target

Forecast the scenario statistic used for sizing: for example, maximum admitted successful
checkout starts per five-minute interval during the weekly business peak. Daily average
requests cannot size a short seasonal peak.

Distinguish organic baseline/seasonality, known launches and campaigns, tenant/region
concentration, structural changes, and demand censored by rejection, quota or outage.

### Validate as a time-series decision model

Use rolling-origin backtests over representative seasons and events. Compare
seasonal-naive and trend baselines with candidate models. Evaluate interval coverage,
peak bias and downstream exhaustion-date error—not only in-sample fit.

A regression such as

\[
\log y_t=\beta_0+\beta_1t+\text{seasonality}+\epsilon_t
\]

is only a candidate. Residual standard deviation alone is not a prediction interval when
parameters are uncertain, residuals autocorrelate, variance changes or future events are
unknown. Use a model, bootstrap or scenarios carrying relevant sources and disclose
exclusions.

### Convert paths into a trigger

For each forecast path, find the first time required demand exceeds the selected
configuration's feasible envelope. Report a saturation-date distribution. Subtract
procurement, architecture, validation and rollout lead time. Trigger action using the
agreed risk of exhaustion within lead time rather than a point forecast.

## Cost model

Choose a dated pricing basis and currency. Include:

\[
C_{total}=C_{compute}+C_{memory}+C_{nodes}+C_{storage}+C_{network}
+C_{platform}+C_{licence}+C_{observability}+C_{risk}
\]

Represent concrete interruption, replacement, unused commitment and availability
scenarios separately rather than inventing one risk premium.

Compute:

\[
C_{useful}=\frac{C_{total}}{\text{successful useful units}}
\]

Also report cost per admitted unit when shedding matters; the gap exposes retry/failure
waste. Allocate shared cost with an explicit driver and show sensitivity.

For committed or interruptible supply model utilization/term, correlated interruption and
replacement lag, on-demand fallback/quota, required warm standby, egress/locality,
licensing and material operational complexity.

## Sensitivity

Vary inputs capable of changing the decision:

| Input                |            low |     base |           high | Decision impact       |
| -------------------- | -------------: | -------: | -------------: | --------------------- |
| required peak path   |       scenario | scenario |       scenario | replicas/exhaustion   |
| request-mix cost     |       measured | measured |       measured | feasible envelope     |
| cache miss ratio     |       measured | measured |       measured | dependency/CPU demand |
| scale reaction       | observed range | observed | observed range | warm capacity         |
| failed domains       |       declared | declared |       declared | survivorship          |
| price/commitment use |          dated |    dated |          dated | cost ranking          |

Do not combine all uncertainty into undocumented percentage headroom. Some reserves overlap;
others protect different events and must coexist.

## Data quality and security

- Verify counter resets, missing series, histogram schema changes and clock alignment.
- Prevent high-cardinality labels from making measurement the bottleneck.
- Treat tenant identifiers, payload examples and traces as sensitive; minimize, redact and
  apply retention/access controls.
- Keep raw artifacts and transformations sufficient to reproduce the decision without
  exposing production secrets.

## Authoritative references

- [Kubernetes: Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Kubernetes: Resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Google SRE: Production services best practices](https://sre.google/sre-book/service-best-practices/)
- [Prometheus: Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [NIST/SEMATECH: Time series analysis](https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc4.htm)
