# Making traces answer incident questions

## The three-signal shape

Each signal answers one question and only one. The design work is the joins between them.

| Question in an incident                                    | Signal | The join that makes it reachable                           |
| ---------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Is something wrong, and how much?                          | Metric | —                                                          |
| Which requests were affected, and where did their time go? | Trace  | Exemplar: a trace id attached to a histogram bucket sample |
| What exactly happened to this one record?                  | Log    | `trace_id` field on every log event                        |
| Which trace does this log line belong to?                  | Trace  | The same `trace_id`, queried in the backend                |

Two joins to build deliberately:

- **Metric → trace.** An exemplar attaches a trace id to a sample in a latency histogram
  bucket, so clicking the slow bucket lands on a trace that was actually in it. Without
  exemplars the path from "p99 is bad" to "here is a slow request" is a manual search that
  usually finds a fast request.
- **Trace → log and log → trace.** `trace_id` and `span_id` as fields on every log event.
  `structured-logging` owns the field set and the mechanism that carries it; the design
  requirement here is that the id is on **every** event, including the asynchronous paths,
  because those are the ones an investigation reaches last and needs most.

The reverse direction matters too: when a trace was sampled away, the log's `request_id`
is the only surviving handle on that request. Do not let the trace id be the sole
correlation key.

## Attributes that make a trace findable

Findability is a design property, not an emergent one. A backend can only filter on what was
recorded, and the questions asked during an incident are predictable:

| Attribute                                  | The question it answers                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `tenant.id` / `customer.tier`              | "Only this customer is affected" — the most common shape of a reported incident |
| `http.route` (template)                    | "Which endpoint" — and it is the grouping key                                   |
| Outcome / result code                      | "Show me the failures" without relying on status alone                          |
| `service.version` / deployment id          | "Did this start with the deploy?"                                               |
| `retry.attempt`                            | Separates a slow call from a call that was retried three times                  |
| `messaging.destination`, partition, offset | Locates the record in the broker for a consumer trace                           |
| Region / availability zone                 | "Is it one zone?" — otherwise invisible in the trace                            |
| Feature-flag or experiment variant         | "Is it the new code path?"                                                      |

Two rules keep this from becoming attribute sprawl:

- Add an attribute when you can name the query that will use it. "Might be useful" produces
  fifty attributes nobody filters on and a larger export bill.
- Attributes are not a place for personal data or credentials, whatever their diagnostic
  value. Use an opaque id and join outside the tracing system.

## What a trace cannot answer

| Question                                        | Why the trace fails                                                                                                | Use instead                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| How often does this happen?                     | Traces are sampled; any count is biased by the sampling rate, and the bias is not uniform across error and success | Metrics                                          |
| Is this latency normal?                         | One trace is one sample; a distribution needs the population                                                       | Metrics, and `latency-statistics` for reading it |
| What was in this payload?                       | Attributes are a summary the instrumentation chose in advance                                                      | Logs                                             |
| What happened to record 12345?                  | The trace for it was probably not sampled                                                                          | Logs, keyed on the business id                   |
| Where did the time _really_ go inside one span? | A span is an interval, not a stack                                                                                 | A profiler — `continuous-profiling`              |

The honest limitation to state in any runbook: under head-based sampling the interesting
trace is usually the one that was not kept, because the decision was made at the root before
anything became interesting. That decision is `opentelemetry-performance`'s subject; the
design consequence is that a runbook step reading "find the trace for this request" is only
valid if the sampling strategy guarantees the trace exists — tail-based sampling within a
stated window, or an explicit force-sample path for a named class of requests.

## Testing that context survives an async boundary

The failure is silent: two disconnected traces where one was intended, and nothing errors.
Assert on exported spans rather than on a screenshot.

```java
@Test
void consumer_span_links_back_to_the_producer_trace() {
    // InMemorySpanExporter captures what the SDK would have shipped.  // Conceptual
    producer.publish(new OrderCreated("o-1"));
    consumer.pollOnce();

    List<SpanData> spans = exporter.getFinishedSpanItems();
    SpanData publish = spanNamed(spans, "orders.publish");
    SpanData process = spanNamed(spans, "orders.process");

    // A new trace, not a child.
    assertThat(process.getTraceId()).isNotEqualTo(publish.getTraceId());
    assertThat(process.getParentSpanId()).isEqualTo(SpanId.getInvalid());

    // But causally connected.
    assertThat(process.getLinks())
        .anySatisfy(link ->
            assertThat(link.getSpanContext().getTraceId()).isEqualTo(publish.getTraceId()));
}
```

Three assertions, three distinct regressions: a consumer wrongly parented, a consumer with no
link at all (headers not injected or not extracted), and a producer span that was never
created. Run the same shape across every asynchronous hand-off the service has — an executor
submit, a scheduled job, a broker round trip through Testcontainers — because each is
instrumented separately and each breaks separately.
