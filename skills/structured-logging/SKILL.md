---
name: structured-logging
description: >
  Logs as queryable events rather than prose: named fields instead of a sentence with values
  interpolated in, the correlation ids every event must carry and the MDC lifecycle behind
  them, log levels as a contract with the on-call, redaction at the encoder, and volume as a
  cost. Use when finding something in the logs needs a regex, when MDC is empty on a
  handed-off thread or stale on a pooled one, when a handled-and-retried failure is logged
  at ERROR, when e.getMessage() is concatenated into a message and the stack trace is gone,
  when one failure is logged at every layer it passes through, or when a request body or a
  token reaches an appender. Not aggregate counting and label cardinality
  (metrics-and-cardinality), causality across services (distributed-tracing-design), trace
  propagation cost (opentelemetry-performance), the exception hierarchy
  (java-exception-design), context mechanics (scoped-values), thread cost
  (thread-sizing-and-virtual-threads), or alerting policy (slo-and-alerting).
---

# Structured Logging

## Purpose

Decide what a service emits so that a question nobody anticipated can still be answered.
A log line is a **record with fields**, not a sentence. `log.info("Order {} failed for
customer {}", id, cust)` produces a string that a future investigation must parse with a
regex that breaks the day someone rewords the message; an event carrying `order_id` and
`customer_id` as fields is queryable, joinable and aggregatable without touching the code.

Logs earn their cost by answering the three questions metrics and traces cannot: **the
specific** (what happened to this one order), **the rare** (the single occurrence that no
counter was incremented for), and **the unanticipated** (the question invented during an
incident, against data written before anyone thought to ask). A metric needs its dimension
chosen at write time and a trace is usually sampled away; the log is the only signal that
retains the detail of one instance. Everything that follows is about keeping that property
without paying for prose.

## Workflow

1. **Fix the event schema before the first appender.** Decide the field set every event
   carries — timestamp, level, logger, service, version, environment, `trace_id`,
   `span_id`, `request_id` — and the naming convention (one case style, one name per
   concept, identical across services). See `references/fields-and-levels.md`.
2. **Choose the emission surface by what the collector needs**, not by taste: the SLF4J 2.x
   fluent API (`atInfo().addKeyValue(...)`) keeps fields typed in the call, a JSON encoder
   on the appender decides the wire format. They are complementary — key-value pairs only
   become fields if the encoder renders them; a plain pattern encoder appends them to the
   message and you are back to regex.
3. **Establish correlation at the edge and carry it deliberately.** Accept or mint a
   request id at the ingress filter, bind the trace id from the tracing context, and put
   both on every event. MDC is a `ThreadLocal`: it does not cross an executor hand-off and
   it outlives a task on a pooled thread. See `references/java-logging-mechanics.md`.
4. **Assign levels against the on-call contract, not against how bad it felt.** ERROR means
   a human should look. Walk every existing ERROR call site and demote the ones that are
   already handled.
5. **Put redaction in the encoder.** A deny-list of field names and a marker type applied
   once at serialisation is auditable; a `maskCpf(...)` call at each site is not, and every
   new call site defaults to unsafe.
6. **Budget the volume.** Events per request × request rate × bytes per event is the bill
   and the ingestion rate limit. Sample INFO by the trace decision so the retained subset
   is coherent; never sample WARN, ERROR or audit events.
7. **Test the boundary.** One test that captures emitted events at an entry point and
   asserts the required fields are present on all of them — otherwise the schema decays
   silently, one new call site at a time.

## Decision block

```text
Emit a log event when:
- the question it answers is about one specific occurrence, identified by a business key
- the occurrence is rare enough that its volume is bounded by failures, not by traffic
- the detail needed is unbounded or not known in advance (a payload fragment, a
  downstream error body, the branch a decision took)
Prefer a metric instead when:
- the question is "how many" or "how fast" over a bounded set of dimensions; a log line
  per request parsed into a count is a metric implemented badly and priced by the byte
Prefer a span or span attribute instead when:
- the question is where the time went, or what called what, within one request
Do not log at all when:
- the line restates what the next line already says, or narrates control flow that a
  stack trace would give you for free on failure
- the value is a credential, a token, a full request or response body, or a personal
  identifier that no query will ever legitimately filter on
```

## Rules

- Every event carries `trace_id` and a request id, or the three signals cannot be joined
  and the trace becomes unusable for the "what exactly happened here" question.
- Log the **exception object**, never `e.getMessage()` concatenated into the message.
  `getMessage()` discards the type, the stack and the cause chain — the three things that
  identify the failure. Pass the throwable as the trailing argument with no placeholder for
  it (`log.error("payment rejected", e)`), or `setCause(e)` on the fluent builder.
- **Log a failure once, where it is handled.** Log-and-rethrow at every layer produces one
  failure as N stack traces with N different messages, and the count of ERROR events stops
  meaning anything. If a layer adds context, add it to the exception (`java-exception-design`)
  rather than to a second log line.
- ERROR is a request for human attention. A failure that was caught, retried and succeeded
  is at most WARN — logging it at ERROR is the most common real defect in this area, because
  it trains the on-call to ignore ERROR, and the training holds during the incident that
  matters.
- **Clear MDC in a `finally`, always.** On a pooled thread an uncleared MDC is attributed to
  the _next_ request — a correlation id that points at someone else's data is worse than
  none. With a thread per request this cannot leak, but the hand-off loss still applies.
- MDC does not cross a thread boundary by itself. Capture the context map before submitting
  and restore it inside the task, or carry the context as a value. The mechanism choice is
  `scoped-values` and `thread-sizing-and-virtual-threads`; the logging consequence is that
  an un-carried context produces events with the correlation fields simply absent, which
  looks like a gap in traffic rather than a defect.
- Never log a full request or response body. It is unbounded in size, it is the most common
  route for credentials and personal data into a log store, and the useful part is a handful
  of fields you can name.
- Redaction lives at the encoder, applied to field names and to a marker type. A call-site
  masking helper is unenforceable: the review that catches the one new unmasked call site
  does not exist.
- A field name is a schema. Once `order_id` is queried by a dashboard or an alert, renaming
  it to `orderId` breaks them silently — nothing errors, results just become empty.
- Do not log at INFO once per request as a matter of course at high request rates. It is the
  dominant line item in most log bills and the usual cause of hitting a collector's ingestion
  limit, at which point events are dropped — including the errors.
- Sampling must be **coherent**: decide once per request and apply to every event of that
  request. Independently sampled events give you a third of a story and no way to tell that
  the rest existed.

## References

- [Java logging mechanics](references/java-logging-mechanics.md) — the fluent key-value API
  and what an encoder must do with it, the MDC lifecycle with the executor and pooled-thread
  traps and the clear-in-finally shape, exception logging done correctly, redaction at the
  encoder, and a test that asserts the required fields on every event at a boundary. Read
  when writing or reviewing logging code, or when correlation fields are missing.
- [Fields, levels and volume](references/fields-and-levels.md) — the standard field set,
  naming consistency as a queryability requirement, level semantics as a contract with the
  on-call, what must never be logged, sampling strategy, and a review checklist. Read when
  defining a logging convention or auditing an existing one.
