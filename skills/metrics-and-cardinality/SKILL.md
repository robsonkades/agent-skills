---
name: metrics-and-cardinality
description: >
  What to count and what not to label: RED for services and USE for resources, counter
  versus gauge versus histogram and each mis-selection's failure, label cardinality as a
  computed budget, path templating, and business outcomes that detect what a health check
  misses. Use when a label carries a user id, a request id, a raw URL path or an exception
  message, when series count grows without matching traffic, when a scrape fails after a
  deploy that added a tag, when a dashboard averages per-instance quantiles, when a gauge
  reports NaN or misses everything between scrapes, when histogram_quantile returns NaN
  because a Timer exports no buckets, when a label must be capped with a MeterFilter because
  its source cannot be fixed, when a counter is read as a value rather than a rate, or when
  saturation has no metric at all. Does not cover percentiles (latency-statistics), the tail
  (tail-latency-analysis), exporter cost (opentelemetry-performance), alerting
  (slo-and-alerting), or single events (structured-logging).
---

# Metrics And Cardinality

## Purpose

Decide what a service counts, and bound what it costs. A metric answers "how many" and "how
fast" over a bounded set of dimensions, cheaply and at 100% coverage — which is exactly why
it cannot answer "what happened to this one order" (`structured-logging`) or "what called
what" (`distributed-tracing-design`).

The failure this prevents is a **cardinality explosion**: one label carrying an unbounded
value multiplies one metric into millions of time series, and the metrics backend runs out of
memory or starts refusing writes. It is an outage of your ability to see, and it is triggered
by the traffic pattern that made you want to look — a new tenant, an attack, an error whose
message contains an id. The rules below exist so the number of series is computed before the
code ships, not discovered from the backend's own alerts.

## Workflow

1. **Pick the frame from what the metric describes.** Request-driven work gets **RED** —
   rate, errors, duration — which is what the caller experiences. A resource (thread pool,
   connection pool, queue, disk, CPU) gets **USE** — utilisation, saturation, errors — which
   is why. They are complementary: RED tells you the service is bad, USE tells you which
   resource made it bad.
2. **Choose the instrument from the question**, not from convenience: counter for a monotonic
   count read as a rate, gauge for a value that goes up and down and is sampled, histogram
   for a distribution. See `references/instrument-selection.md`.
3. **List every label with its value set, and check each is bounded and enumerable at design
   time.** If you cannot write down the complete list of values, it is not a label.
4. **Compute the series budget before shipping**: multiply the label cardinalities, multiply
   by instances, and for a histogram multiply again by buckets plus two. See
   `references/cardinality-budget.md`.
5. **Template every path and identifier out of the label value.** `/orders/{id}`, not
   `/orders/12345`; a bounded error class, not the exception message.
6. **Add the business outcomes.** Orders placed, payments declined by bounded reason,
   messages published — these detect the incident that leaves every technical metric green.
7. **Prune.** Every metric should be named by a dashboard panel, an alert rule or a recording
   rule. One that is queried by nothing is storage, scrape time and series count for no
   return.

## Decision block

```text
Use a counter when:
- the quantity only ever increases within a process lifetime, and the question is a rate
  or a ratio over a window (requests, errors, retries, messages published)
Use a gauge when:
- the value can go down, and its instantaneous level is meaningful at scrape time
  (queue depth, pool in-use, heap after collection, in-flight requests)
Use a histogram when:
- the question is about a distribution, and the answer must be aggregatable across
  instances and windows (latency, payload size, batch size)
Avoid a label when:
- its value set is not enumerable at design time, or grows with users, requests, time,
  URLs, error text, or anything a caller controls
Prefer an exemplar, a span attribute or a log field instead when:
- the value is high-cardinality but you need it to reach one specific occurrence. Metrics
  are for the aggregate; the identifier belongs on the trace or the event
Prefer a precomputed quantile only when:
- there is one instance and one window, forever. Otherwise export buckets
```

## Rules

- **A metric's cost is the product of its label cardinalities**, and every distinct
  combination that has ever appeared is a series the backend keeps for its retention period.
  Deleting the label does not immediately delete the series.
- A label value set must be **bounded and enumerable at design time**. HTTP method, status
  class, outcome, region, a templated route, a bounded reason code — yes. User id, request
  id, trace id, email, session id, raw path, full URL, SQL text, exception message, hostname
  in an autoscaled fleet — no.
- **Template the path.** A route label must be the handler's pattern (`/orders/{id}`), never
  the concrete path. Spring Boot's `http.server.requests` already uses the matched pattern
  for its `uri` tag, and deliberately collapses unmatched requests to a placeholder rather
  than emitting the raw path — a hand-rolled filter that tags the raw path reintroduces the
  explosion the framework avoided. `http.client.requests` can only do the same when the
  client is given the template: `uri("/orders/{id}", id)` yields `uri="/orders/{id}"`, while
  `uri("/orders/" + id)` yields one series per order. See
  `references/micrometer-and-prometheus.md`.
- **An error label must be a bounded class, not a message.** `error="timeout"`,
  `error="upstream_5xx"`, `error="validation"`. An exception message contains ids, values
  and, once, someone's whole request body.
- Compute the budget **before** shipping: `series = Π(label cardinalities) × instances ×
(buckets + 2 for a histogram)`. Write it into the change. A change that adds a tag is a
  change to the series count, and it should be reviewed as one. When the label's source
  cannot be fixed — a library's tag, a gateway's code — cap it at registration with a
  `MeterFilter` (`maximumAllowableTags`, `maximumAllowableMetrics`), added before any meter
  is created; it is a backstop for the budget, not a substitute, since the first `max`
  values are already series. See `references/micrometer-and-prometheus.md`.
- **A counter is read as a rate, never as a value.** It resets to zero on restart, so a
  dashboard panel that subtracts two raw samples reports a large negative number on every
  deploy. Use the backend's rate/increase function, which is reset-aware.
- **A gauge is sampled at scrape time and everything between scrapes is invisible.** A queue
  that fills and drains inside one scrape interval shows as zero, forever. If the peak
  matters, export a max-since-last-scrape or a histogram, not a gauge.
- A Micrometer gauge holds a **weak reference** to the object it observes. If the only strong
  reference was the local at registration, the object is collected and the gauge reports NaN.
- **Export histogram buckets, not precomputed quantiles.** A `Timer` publishing percentiles
  computes them per instance, and per-instance quantiles cannot be combined afterwards —
  `latency-statistics` owns why. Buckets sum across instances before the quantile is taken,
  which is the only correct order. Without `publishPercentileHistogram()` or
  `serviceLevelObjectives(...)` a `Timer` exports no buckets and `histogram_quantile`
  returns NaN; with them, `minimumExpectedValue`/`maximumExpectedValue` set the bucket count
  (the 1 ms–30 s default is 66 buckets, 10 ms–2 s is 34), and SLO buckets alone answer
  "within SLO or not" in 3–6 series. See `references/micrometer-and-prometheus.md`.
- **Saturation is the leading indicator; utilisation is the lagging one.** A pool at 100%
  utilisation with an empty wait queue is fully used, not failing; a pool at 70% with a
  growing queue is already failing. If only utilisation is instrumented, every incident is
  detected late. Instrument queue depth and time-in-queue.
- Instrument **business outcomes**, not only technical ones. `orders_placed_total`,
  `payments_declined_total{reason}` with `reason` bounded to the gateway's enumerated codes.
  A deploy that breaks a validation rule shows 200 OK on every technical metric and a cliff
  on exactly one business counter.
- A metric nobody queries is cost with no return. Audit metric names against the set named by
  dashboards and alert rules, and drop the remainder at the scrape layer first — reversible —
  before removing the instrumentation.

## References

- [Cardinality budget](references/cardinality-budget.md) — the arithmetic worked through, the
  label allow and deny catalogue with the reason each is safe or fatal, path templating,
  detection before and during an explosion, the scrape-side guards, and a pre-ship budget
  worksheet. Read before adding a label, when series count is rising, or during a metrics
  backend incident.
- [Instrument selection, RED and USE](references/instrument-selection.md) — which instrument
  answers which question and the failure each mis-selection produces, the histogram versus
  precomputed quantile rule and its aggregation consequence, the standard RED and USE sets
  for a JVM HTTP service, and business metrics. Read when instrumenting a new service or
  reviewing an existing metric set.
- [Micrometer and Prometheus specifics](references/micrometer-and-prometheus.md) — `Timer`
  versus `DistributionSummary` versus `LongTaskTimer`, what each distribution option exports
  and its measured bucket count, the expected-range and SLO-bucket levers, the client-side
  `uri` template, `MeterFilter` semantics for capping cardinality at runtime, and exemplars.
  Read when the instrumentation is Micrometer exported to Prometheus, when
  `histogram_quantile` returns NaN, or when a label must be capped in code you do not
  control.
