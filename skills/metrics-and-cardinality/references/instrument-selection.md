# Instrument selection, RED and USE

## Which instrument, and what the wrong one does

| Question                              | Instrument                        | Failure when the wrong one is chosen                                      |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| How many of these happened?           | Counter                           | As a gauge: a restart looks like the count fell; no rate function applies |
| What is the level right now?          | Gauge                             | As a counter: the rate of a value that goes down is meaningless           |
| How long / how big, distributed?      | Timer / histogram                 | As a gauge of "last duration": the p99 is unreachable from it             |
| How long, and I need it aggregatable? | Histogram **buckets**             | As precomputed quantiles: cannot be combined across instances or windows  |
| How many are in flight?               | Gauge (or a counter pair up/down) | As a counter: never decreases                                             |
| What happened to this one request?    | Neither — a log or a span         | As a label: cardinality explosion                                         |

Three mistakes that survive review because the dashboard still renders:

- **A counter read as a value.** Counters reset to zero when the process restarts. A panel
  that subtracts consecutive samples shows a large negative spike on every deploy; the
  backend's rate/increase functions are reset-aware and are the only correct reader.
- **A gauge missing everything between scrapes.** A gauge is a sample. A queue that fills to
  10,000 and drains within one 15-second scrape interval reports 0 at every scrape, so the
  saturation that caused the incident is not in the data at all. Export a
  max-since-last-scrape, or a histogram of queue depth at enqueue time.
- **A gauge over a collected object.** Micrometer's gauge registration keeps a weak reference
  to the instrumented object so that instrumentation does not pin it in the heap. Register a
  gauge over a local and the gauge starts reporting NaN as soon as GC runs. Keep a strong
  field for anything a gauge observes.

## Histogram versus precomputed quantiles

```java
// Aggregatable: buckets are summed across instances before the quantile is taken.
Timer.builder("http.server.requests")
     .publishPercentileHistogram()
     .register(registry);

// NOT aggregatable: each instance computes its own p99 and exports the number.
Timer.builder("http.server.requests")
     .publishPercentiles(0.95, 0.99)
     .register(registry);
```

The second form is not merely less accurate — averaging or maxing per-instance quantiles has
an error with no bound and no correction factor. `latency-statistics` owns that argument; the
instrumentation consequence is the rule: **export buckets whenever more than one instance or
more than one time window will ever be looked at together.** Precomputed percentiles are
legitimate only for a single-instance, single-window view, and they cost series too.

Bucket boundaries come from the service's measured range. A default bucket set whose
neighbouring boundaries straddle the service's typical latency puts the p99 inside one wide
bucket, where interpolation error is the bucket width.

## The standard RED set for a JVM HTTP service

RED describes what the caller experiences. Three series families, one label set:

```text
requests_total{method, uri, status}      counter   → rate() gives R and, filtered, E
request_duration_seconds_bucket{...}     histogram → D, aggregatable
```

- **Rate** — `rate(requests_total[5m])`, split by route when routes have different profiles.
- **Errors** — the _ratio_, not the count: server errors over total. A raw error count rises
  with traffic and cannot be alerted on with a static threshold. Decide explicitly whether
  4xx counts as an error (usually not — it is the caller's fault) and whether a 429 or 503
  you emitted under load counts (it is saturation, not breakage — see
  `rate-limiting-and-load-shedding` and `slo-and-alerting`).
- **Duration** — buckets, and read as a percentile, never a mean.

## The standard USE set for a JVM service

USE describes why. For every resource that can be exhausted, three numbers:

| Resource        | Utilisation           | Saturation (**the leading signal**)                   | Errors                  |
| --------------- | --------------------- | ----------------------------------------------------- | ----------------------- |
| Thread pool     | active / max          | queued tasks, time in queue                           | rejected executions     |
| Connection pool | in-use / max          | threads waiting, wait time distribution               | acquisition timeouts    |
| Heap            | used after collection | GC time as a fraction of wall clock; allocation stall | OOM, allocation failure |
| Inbound queue   | consumers busy        | depth, and **age of the oldest item**                 | dead-lettered, expired  |
| CPU             | busy fraction         | run-queue length, throttled periods                   | —                       |

The reason saturation leads: utilisation saturates at 100% and then carries no further
information, while the queue behind it keeps growing and is proportional to the harm. A pool
at 100% utilisation with an empty queue is a well-sized pool. A pool at 70% with a rising wait
time is already failing its callers. If only one of the three is instrumented, make it
saturation.

Age of the oldest queued item is worth singling out: depth alone cannot distinguish a deep
queue draining fast from a shallow one that is stuck.

## Business metrics

The technical metrics are all green and the business has stopped. Instrument the outcome:

```java
Counter.builder("orders.placed")
       .tag("channel", channel.name())            // bounded enum
       .register(registry).increment();

Counter.builder("payments.declined")
       .tag("reason", gatewayCode.name())         // the gateway's enumerated codes only
       .register(registry).increment();
```

Rules that keep these honest:

- Tag values come from an `enum`, never from a `String` returned by a third party. An
  unrecognised gateway code maps to `UNKNOWN`, and the count of `UNKNOWN` is itself a metric
  worth watching.
- Emit the outcome once, at the point the outcome is decided, not at every layer that
  observes it.
- Alert on these against a seasonal expectation rather than a static floor — a nightly trough
  is not an incident. That policy is `slo-and-alerting`.
