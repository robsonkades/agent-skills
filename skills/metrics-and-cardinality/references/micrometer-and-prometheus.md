# Micrometer and Prometheus specifics

Read when the instrumentation is Micrometer exported to Prometheus: choosing between
`Timer`, `DistributionSummary` and `LongTaskTimer`, deciding what a distribution exports and
what it costs, and capping cardinality at runtime with a `MeterFilter` when the label cannot
be fixed at the source. Measurements below are from Micrometer 1.17.1.

## Which instrument

| Need                                                  | Instrument                          | What decides it                                                                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration of a completed operation                     | `Timer`                             | Records in the registry's base time unit; exports `_seconds_count`, `_seconds_sum`, `_seconds_max` to Prometheus. Default expected range **1 ms–30 s** — the histogram ladder is cut to it.         |
| Size of something — bytes, batch size, items per page | `DistributionSummary`               | Same machinery, no time unit; set `baseUnit`. It has **no default range** (1 to ∞), so `publishPercentileHistogram()` on an unbounded summary emits the full 276-bucket ladder unless you bound it. |
| Something long-running that is **in progress** now    | `LongTaskTimer`                     | Exports active count and the duration of tasks still running. A `Timer` records only on completion, so a stuck batch job is invisible to it until it finishes — the omission problem, in a metric.  |
| A count or duration already maintained by a library   | `FunctionCounter` / `FunctionTimer` | Reads a monotonic source (pool statistics, a driver's counters) at scrape time instead of double-counting.                                                                                          |
| The level of something right now                      | `Gauge`                             | Weak reference to the observed object — keep a strong field.                                                                                                                                        |

`_max` is a **windowed** maximum (the same rotating window as the percentiles below), not
the all-time maximum; it decays to the max of the last window.

## What each distribution option exports, and what it costs

| Configuration                                 | Series per meter (Prometheus)          | Mergeable across instances | Measured bucket count                                                                |
| --------------------------------------------- | -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| none                                          | `_count`, `_sum`, `_max` — 3           | count and sum, yes         | 0 — `histogram_quantile` returns `NaN`                                               |
| `publishPercentiles(0.95, 0.99)`              | + one `quantile="…"` series each       | **no**                     | 0 — computed per instance over a 2-minute, 3-slot ring                               |
| `publishPercentileHistogram()`                | + one `_bucket` per boundary, + `+Inf` | yes                        | Timer default 1 ms–30 s: **66**; 1 ms–5 s: 55; 10 ms–2 s: 34; unbounded summary: 276 |
| `serviceLevelObjectives(100ms, 250ms, 500ms)` | + one `_bucket` per SLO, + `+Inf`      | yes                        | exactly the SLOs — 3 here                                                            |
| both                                          | ladder plus the SLO boundaries         | yes                        | the ladder, with the SLO values inserted                                             |

The ladder is base-2 with four steps per octave (1.048576 ms, 1.398 ms, 1.748 ms,
2.097 ms, …), so every bucket has the same _relative_ width: interpolation error is
bounded at ~33% of the value anywhere in the range, against the client-default set whose
`(0.25, 0.5]` bucket has 100% relative width at 250 ms.

Two consequences for the budget:

- **`minimumExpectedValue` / `maximumExpectedValue` are the bucket-count lever.** Cutting the
  Timer range from the 1 ms–30 s default to the service's measured 10 ms–2 s halves the
  buckets (66 → 34) and therefore halves the metric's series count, with no loss of
  resolution inside the range. Values outside the range still land in the edge buckets.
- **SLO buckets answer the SLO question exactly.** With a boundary at the threshold,
  `sum(rate(..._bucket{le="0.25"}[5m])) / sum(rate(..._count[5m]))` is the fraction within
  250 ms with zero interpolation error. A service whose only latency question is "within
  SLO or not" needs the SLO buckets and nothing else — 3–6 series instead of 68.

Spring Boot exposes the same options as properties, matched by meter-name prefix:
`management.metrics.distribution.percentiles-histogram.<name>=true`,
`management.metrics.distribution.slo.<name>=100ms,250ms,500ms`,
`management.metrics.distribution.minimum-expected-value.<name>` and
`maximum-expected-value.<name>`. Setting `percentiles.<name>` re-creates the non-mergeable
per-instance quantile; leave it unset when more than one instance exists.

## The `uri` tag on the client side

`http.server.requests` takes `uri` from the matched handler pattern and collapses unmatched
requests. `http.client.requests` can only do the same when the client was given the
**template**:

```java
restClient.get().uri("/orders/{id}", id)     // uri="/orders/{id}"  — bounded
restClient.get().uri("/orders/" + id)        // uri="/orders/12345" — one series per order
```

The second form is the most common client-side explosion, and it is invisible in review
because the string is built three lines earlier.

## Capping cardinality at runtime

A `MeterFilter` runs at meter registration, so it can refuse or rewrite a series before the
backend ever sees it. It is the guard for labels whose value set is _meant_ to be bounded but
is produced by code you do not control — a library's tag, a gateway's error code, a tenant
id whose growth outran the budget.

```java
registry.config()
    // After 100 distinct uri values on http.client.requests.*, deny further ones
    .meterFilter(MeterFilter.maximumAllowableTags(
        "http.client.requests", "uri", 100, MeterFilter.deny()))
    // Or collapse the overflow into one series instead of dropping the meter
    .meterFilter(MeterFilter.maximumAllowableTags(
        "payments", "reason", 50,
        MeterFilter.replaceTagValues("reason", v -> "OVERFLOW")))
    // Global ceiling on unique name+tag permutations — the last line of defence
    .meterFilter(MeterFilter.maximumAllowableMetrics(5_000))
    // Rewrite before it becomes a series; "/" is exempt from the function
    .meterFilter(MeterFilter.replaceTagValues("uri",
        u -> u.startsWith("/orders/") ? "/orders/{id}" : u, "/"))
    .meterFilter(MeterFilter.ignoreTags("pod"))
    .meterFilter(MeterFilter.denyNameStartsWith("jvm.buffer"));
```

Semantics that matter when reviewing one:

- `maximumAllowableTags(prefix, tagKey, max, onMaxReached)` counts distinct values of
  `tagKey` seen on meters whose name starts with `prefix`; once `max` is reached, meters
  carrying a **new** value go through `onMaxReached`. `deny()` drops that meter entirely,
  which loses the request from the count as well as the tag — prefer a `replaceTagValues`
  overflow when the count still matters.
- `maximumAllowableMetrics(n)` refuses every new meter after `n` unique name/tag
  permutations. Micrometer's own documentation says it does not discriminate between
  critical and trivial metrics; it is a cost cap, not a policy. Set it above the computed
  budget, and alert on approaching it.
- Filters apply **in registration order** and only to meters registered after the filter.
  Add filters before any meter is created — in Spring Boot, as `MeterFilter` beans, which are
  applied to the auto-configured registry before instrumentation starts. A filter added late
  leaves every already-registered series in place.
- `management.metrics.enable.<prefix>=false` is a deny filter by property; it is the
  reversible first step when a metric family is found to be unqueried.

A runtime cap is a backstop for the design-time budget in `cardinality-budget.md`, not a
substitute: the deny fires after the first `max` values have already become series for the
retention period.

## Exemplars

The Prometheus registry attaches the current trace id as an exemplar to counter and
histogram samples when a tracing bridge is present. That is the sanctioned path from an
aggregate to one occurrence — the reason a request id belongs on the span and never on a
label.
