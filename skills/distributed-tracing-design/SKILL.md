---
name: distributed-tracing-design
description: >
  Span modelling as a design decision: what earns a span and what does not, span names as
  low-cardinality operation names with the detail in attributes, recording errors so a
  failed trace is findable, and span links versus parent-child for asynchronous and batch
  work. Use when a trace carries hundreds of spans per request, when a span name contains an
  order id or a raw path, when a queue consumer is made a child of a producer span from an
  hour ago, when one poll returns records from many traces and the batch is parented to
  whichever arrived first, when a background job stretches its caller's trace, or when a
  failed request shows a green root span. Does not cover sampling, context propagation
  mechanics, Baggage or agent overhead (opentelemetry-performance), the log event itself
  (structured-logging), label counting (metrics-and-cardinality), percentile correctness
  (latency-statistics), the messaging architecture (event-driven-architecture,
  kafka-consumers-in-java), or alerting (slo-and-alerting).
---

# Distributed Tracing Design

## Purpose

Decide what a system's traces are shaped like, so that a trace answers a question during an
incident rather than merely existing. Two design decisions dominate: which units of work earn
a span, and how work that is _caused by_ a request but not _awaited by_ it is attached to the
trace.

The failure this prevents is the trace that is present and useless. Four hundred spans per
request that no UI renders and no human reads; a span name containing an id, so every trace is
its own unique operation and the "slowest operations" view is empty; a consumer parented to a
producer an hour upstream, producing an hour-long root span that the backend assembled after
it had already decided about the trace. Every one of those compiles, exports and looks
plausible on a screenshot.

The **cost and plumbing** of tracing — head versus tail sampling, `Context` propagation across
executors and virtual threads, Baggage, agent overhead, the `end()`-in-`finally` lifecycle —
is `opentelemetry-performance`. This skill assumes those are handled and asks what to model.

## Workflow

1. **List the units of work in one request and mark which cross a boundary.** Process, host,
   broker, database, cache, external API. Those are the spans that are not negotiable.
2. **Apply the span test to everything else**: would you ever act on this duration
   _separately_ from its parent's? If not, it is an attribute, a span event, or nothing.
   See `references/span-modelling.md`.
3. **Fix the name as an operation, not an instance.** A bounded set of names, the same
   discipline `metrics-and-cardinality` applies to labels, for the same reason: the backend
   groups by name.
4. **Decide parent-child versus link for every asynchronous hand-off.** Child means the parent
   waits and bounds the child's lifetime. Anything the parent does not wait for — a broker
   message, a scheduled job, fire-and-forget work — is a new trace with a link.
5. **Model batch consumption explicitly.** One poll returning records from N producers has no
   single parent; choose per-record spans with links, or one batch span with N links, from
   whether per-record latency is a question you will ask.
6. **Add the attributes that make a trace findable**, then check that the trace id is on every
   log event (`structured-logging`) so the three signals join. See
   `references/traces-in-incidents.md`.
7. **Test that context survives one async boundary**, because that is the failure that
   silently produces two disconnected traces instead of one.

## Decision block

```text
Create a span when:
- the work crosses a process boundary: HTTP, RPC, a database or cache call, a broker
  publish or consume
- the work has its own failure mode and its own latency that you would act on separately
  (a retry attempt, a batch stage, an expensive in-process computation)
- the work is where the time goes and no existing span attributes it
Do not create a span when:
- it wraps a method whose duration is a fixed fraction of its parent's
- it is inside a loop; emit one span for the loop with a count attribute instead
- the information is a property of work already spanned — that is an attribute
Use parent-child when:
- the parent is still running and its completion depends on the child's. The parent's
  duration is a correct enclosing bound for the child's
Use a link and a new trace when:
- the causing operation has already finished, or will finish first: a broker message, a
  scheduled or deferred job, fire-and-forget background work, a retry of a whole request
- the consumed work batches items whose causes belong to different traces
Prefer a log event instead when:
- the question is about the content of one record rather than where its time went
```

## Rules

- A span costs export bandwidth, backend storage and human attention, and the third is the
  binding constraint. A trace nobody can read has the same value as no trace.
- **Span names must be a bounded set.** `GET /orders/{id}`, `SELECT orders`, `orders.publish`.
  An id, a raw path or a tenant name in the name makes every trace a distinct operation and
  destroys aggregate views over span names. The id belongs in an attribute.
- **Instrument the loop, not the iteration.** N spans for N iterations is the most common
  route to a 400-span trace. One span with `batch.size` and, when a failure needs locating,
  a span event per failure.
- A child span's error status does not by itself make the request findable — most backends
  filter traces on the **root** span's status. Decide deliberately: a failure the caller
  recovered from leaves the root OK with an ERROR child; a failure the caller returns must set
  the root to ERROR too.
- Record the exception **and** set the status. A span carrying only a message is not matched by
  any "show me failed traces" query; the API mechanics are `opentelemetry-performance`.
  Status follows the semantic conventions, not intuition: a `SERVER` span leaves 4xx
  `Unset` and a `CLIENT` span sets 4xx to `Error`, and `Ok` is reserved for application
  code — instrumentation libraries "SHOULD NOT" set it.
- **`SpanKind` is data, not decoration.** The service map is built from `CLIENT`→`SERVER`
  and `PRODUCER`→`CONSUMER` pairs and RED metrics from `SERVER`/`CONSUMER` spans; an
  outbound call spanned `INTERNAL` is a missing edge, and an in-process stage spanned
  `SERVER` doubles the request rate. Set the kind from the table in
  `references/semantic-conventions.md`.
- Links added after span creation are invisible to head sampling. Extract the producer's
  context first and pass the link to the span builder; `addLink()` later keeps the
  relationship in the data and loses it in the sampling decision.
- **A consumer is not a child of its producer.** Parent-child asserts the parent's duration
  encloses the child's; a message consumed an hour after publication makes the root span an
  hour long, distorts every duration aggregate over that operation, and arrives after the
  backend has already assembled and decided about that trace. Start a new trace, link to the
  producer's span context.
- **A batch of N records from N traces cannot have one parent.** Parenting the batch to
  whichever record arrived first attributes the whole batch's work to one unrelated upstream
  request. One span per record, each linked, or one batch span with N links — nothing else.
- A link is a **reference to a span context, not a delivery or ordering guarantee**. It
  survives only if the producer injected the context into the message and the consumer
  extracted it; a record published before instrumentation, or through a broker whose headers
  were dropped, produces an unlinked trace and no backend reconstructs the relationship.
- Attributes are cheap relative to metric labels — they live on a span already being exported
  — but they are **not free and not private**. High-cardinality identifiers are fine; personal
  data and credentials are not, and the redaction discipline is `structured-logging`'s.
- A trace answers _where the time went_ and _what called what_. It cannot answer _how often_
  — it is sampled, so any count from traces is biased by the sampling rate — and it cannot
  answer _what exactly happened to this record_, which is a log.
- Do not design an incident workflow whose first step is "open the trace for this request id".
  Under head-based sampling the interesting trace is usually the one that was not kept; that
  is a property of the sampling decision, which `opentelemetry-performance` owns. Either the
  workflow starts from logs, or sampling is tail-based within a stated window.

## References

- [Span modelling](references/span-modelling.md) — the span test applied to concrete cases,
  naming and attribute conventions with the cardinality rule, error recording and root status,
  and the asynchronous model: links versus parent-child, batch consumption worked through, and
  long-running or fire-and-forget work. Read when instrumenting a new flow, reviewing a
  noisy trace, or modelling a consumer.
- [Semantic conventions as design constraints](references/semantic-conventions.md) — the
  stable/development status per domain, span-name forms by kind (HTTP, database,
  messaging, in-process), the `SpanKind` table and what each kind lets the backend
  compute, the status rules per kind, the messaging operation types and the batch model in
  the conventions' own terms, link timing under head sampling, and a symptom-to-cause
  table. Read when naming a span, choosing its kind or status, or when an aggregate view
  in the backend is empty or wrong.
- [Traces in an incident](references/traces-in-incidents.md) — the three-signal correlation
  shape, the attribute set that makes a trace findable, what a trace cannot answer and which
  signal to use instead, and a test that asserts context survives an async boundary. Read when
  traces exist but are not helping, or before relying on tracing in a runbook.
