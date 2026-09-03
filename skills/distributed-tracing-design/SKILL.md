---
name: distributed-tracing-design
description: >
  Designing trace topology and semantics: selecting actionable span boundaries, stable
  operation names, kinds, status and attributes; modelling synchronous, asynchronous,
  messaging, batch, retry and long-running workflows with parentage and links; and making
  traces usable with metrics, logs and profiles during incidents. Use when traces are noisy,
  fragmented, mis-parented, high-cardinality, misleading about errors, or unable to model
  batches and asynchronous causality. Sampling, propagation mechanics and overhead belong to
  opentelemetry-performance; metric cardinality to metrics-and-cardinality.
---

# Distributed Tracing Design

## Purpose

Model causal and temporal work so a trace supports a concrete operational question. Span
trees are not call-stack recordings: parentage expresses one primary causal relationship,
links express additional or cross-trace relationships, and timing comes from each span's
own start/end—not from an assumption that parents must wait for or enclose children.

The design must follow the pinned OpenTelemetry semantic-convention version. Protocol
domains have different stability and migration rules.

## Workflow

### 1. Define questions and units of work

For each journey list protocol operations, application stages, retries, queue residence,
batching and background workflows. Create a span when its latency/failure/cause is
independently actionable or required by a semantic convention. Crossing a process boundary
often earns protocol spans, but automatic instrumentation may already supply them and some
boundaries are intentionally summarized.

Use attributes for properties of a span, events for notable points within it, and logs for
detailed records. Avoid a span for every trivial method or loop item unless per-item timing
is the explicit question and sampling/cost support it.

### 2. Name stable operation classes

Names should identify statistically meaningful operation classes: route templates, RPC
methods, bounded messaging destinations or application stages. Keep request/entity IDs,
raw paths, SQL literals and tenant values out of span names. Attributes can be
high-cardinality relative to metric labels, but still cost storage/indexing and can expose
data; govern them.

### 3. Select kind and semantic conventions

SpanKind describes remote direction and synchronous/deferred style:

- SERVER: inbound request/response;
- CLIENT: outbound request/response;
- PRODUCER: outgoing deferred work;
- CONSUMER: processing externally initiated deferred work;
- INTERNAL: other local work.

Do not infer that every backend builds service maps or RED metrics identically. Correct
kind and stable semantic attributes make such analysis possible; backend behavior must be
verified.

### 4. Model parentage and links deliberately

A span can have one parent and many links. Parent/child spans are causally related but need
not have nested lifetimes. Use a link when there are multiple causes, when representing a
relationship across traces, or when the applicable semantic convention recommends it.

Messaging conventions use links as the generally consistent default because messages can
batch, fan out, redeliver and run inside another ambient context. For a single-message
process span, current conventions permit the message creation context as parent in defined
cases. Therefore “consumer is never a child of producer” is false. Pin and document the
chosen topology.

Add known links/attributes at span creation when sampling decisions need them.

### 5. Model completion and errors

Span duration must correspond to its named operation: enqueue, send acknowledgment,
processing, settlement or end-to-end logical call. Async APIs require completion callbacks,
not a synchronous method return, when the operation continues.

Status and error attributes follow domain conventions plus application knowledge. Recording
an exception does not mean every recovered child failure should make the root ERROR. Equally,
some business failures represented by normal protocol statuses need an outcome attribute.
Do not set status solely to satisfy a backend filter.

### 6. Validate with fixtures

Export in-memory/test spans and assert names, kinds, parent IDs, links, timestamps,
attributes, status and counts for success, error, timeout, cancel, retry, batch, redelivery
and async completion. Test mixed instrumentation versions during migration and confirm the
backend query/service-map behavior relied upon by runbooks.

### 7. Connect signals

Use metrics for population/SLOs, exemplars to reach sampled traces, logs for detailed events
and profiles/JFR for code/runtime inside wide spans. Sampling-aware trace data may support
estimated counts only when inclusion probabilities and policy bias are known; “traces can
never answer how often” is too absolute.

## Span decision framework

Create a span when:

- a remote/protocol operation requires semantic representation;
- work has a distinct actionable failure/latency;
- a hidden wait or expensive stage owns meaningful elapsed time;
- retry attempts or batch stages must be distinguished.

Prefer an attribute/event when:

- the information describes an existing operation;
- individual duration is not actionable;
- a loop can be summarized safely;
- extra spans exceed retrieval and cost budgets.

Prefer a new trace plus link when:

- the workflow is independently operated/retained;
- multiple causes cannot have one parent;
- long-lived steps would be clearer as separate trace units;
- semantic conventions prescribe links.

Prefer same-trace parentage when:

- one primary causal chain should be queried/sampled together;
- protocol conventions support it;
- trace duration/retention and ambient-context trade-offs are acceptable.

## Messaging and batch rules

- Model create/send, receive/process and settle according to the current messaging
  conventions; they are not interchangeable durations.
- One batch span can link to each message creation context and expose bounded batch count.
- Per-record process spans are justified when individual latency/error/retry matters.
- A hybrid batch span with record work must define whether children belong to the batch
  trace and how producer links are retained.
- Propagated context does not prove delivery, order, uniqueness or causation integrity.
  Validate untrusted carriers.
- Redelivery creates another attempt; preserve message/logical-work identity without using
  it as a metric label or span name.

## Failure modes

| Symptom                                   | Likely modeling issue                            | Response                                   |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| operation view has one row per request    | ID/raw path in span name                         | stable template name                       |
| duplicate HTTP/DB spans                   | manual plus automatic instrumentation            | suppress one owner                         |
| missing service edge                      | absent/wrong kind or semantic attributes         | fixture-test pinned instrumentation        |
| consumer attached to unrelated batch item | arbitrary single parent                          | links to all creation contexts             |
| send span ends before broker callback     | synchronous boundary on async operation          | end on defined completion                  |
| root green despite failed journey         | outcome/status not propagated at boundary        | model logical outcome explicitly           |
| all roots ERROR after recovered retries   | child status copied mechanically                 | distinguish attempt from call outcome      |
| trace too large/unreadable                | per-loop/item spans or recursive instrumentation | stage aggregation and sampling             |
| linked trace not retained                 | link added late or sampler ignores it            | add at creation and verify sampling policy |

## Anti-patterns

**Parent must enclose and await child:** not required by the trace model. Use timing fields
for duration and choose parentage from semantics.

**Always new trace for asynchronous work:** async work can remain in one trace; messaging
conventions allow several structures. Choose based on causal query, batching, ambient
context and retention.

**Always record exception and ERROR:** expected/recovered outcomes and domain conventions
need different treatment.

**Attributes are cheap and IDs are fine:** span attributes can create backend index,
storage/privacy and sampling costs. Minimize and govern.

**Trace ID on every log is guaranteed:** context can be absent or unsampled. Include valid
trace/span IDs when available and retain business/request correlation appropriate to logs.

## Cross-skill routing

- [span modelling](references/span-modelling.md)
- [semantic conventions](references/semantic-conventions.md)
- [traces in incidents](references/traces-in-incidents.md)
- opentelemetry-performance for sampling, propagation and cost.
- structured-logging for event/correlation fields.
- metrics-and-cardinality for aggregate schemas.
- continuous-profiling for code ownership within spans.

## Authoritative references

- [OpenTelemetry Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [HTTP spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)
- [Messaging spans](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/)
- [Recording errors](https://opentelemetry.io/docs/specs/semconv/general/recording-errors/)
