# Structured logging mechanics in Java

## The event, not the sentence

```java
private static final Logger log = LoggerFactory.getLogger(OrderService.class);

// Interpolated prose: one string, parsed later with a regex that breaks on rewording.
log.info("Order {} failed for customer {}", orderId, customerId);

// A record with fields: queryable as order_id / customer_id / reason.
log.atInfo()
   .addKeyValue("order_id", orderId)
   .addKeyValue("customer_id", customerId)
   .addKeyValue("reason", rejection.code())     // a bounded enum, not free text
   .setMessage("order rejected")
   .log();
```

The message stays **constant** — it is the event type, and a constant message is what makes
"count of order rejected" possible without parsing. Everything variable is a field.

Two independent decisions: how the call site names values (the fluent API, or MDC) and how the
appender serialises them (a JSON encoder, or a pattern). Key-value pairs reach the collector as
fields **only if the encoder renders them as fields** — a pattern encoder appends them to the
line, which looks like it worked. Assert the shape in a test, not on the console.

## MDC lifecycle: the two failure modes

`MDC` is backed by a `ThreadLocal`. That gives exactly two defects, and they look nothing
alike:

```java
// 1. Loss across a hand-off. The task runs on another thread; its MDC is empty,
//    so events inside it carry no trace_id and look like a traffic gap.
executor.submit(() -> shipmentService.dispatch(order));   // context gone

// Fix: capture before, restore inside, clear after.
Map<String, String> context = MDC.getCopyOfContextMap();
executor.submit(() -> {
    if (context != null) MDC.setContextMap(context);
    try {
        shipmentService.dispatch(order);
    } finally {
        MDC.clear();          // the pooled thread is about to serve someone else
    }
});

// 2. Leak on a pooled thread. Without the finally, request B inherits request A's
//    request_id and every query that joins on it is now wrong — silently.
public void doFilter(...) {
    MDC.put("request_id", requestId);
    MDC.put("trace_id", tracing.currentTraceId());
    try {
        chain.doFilter(request, response);
    } finally {
        MDC.clear();          // not remove() per key; a partial clear is the same bug
    }
}
```

`MDC.putCloseable(...)` in try-with-resources expresses the same discipline through the type
system, and is preferable where only one or two keys are set.

With a thread per request — including a virtual thread per request — a per-request MDC is
correct and cannot leak, because the thread ends with the request. The **hand-off** loss is
unchanged: a virtual thread started from inside the request is a new thread with an empty MDC.
The mechanism for carrying context immutably is `scoped-values`; the logging requirement is
that whatever carries it is re-bound into MDC before the first event on the new thread.

## What "MDC does not cross threads" actually means

Logback's MDC adapter is a plain `ThreadLocal`, and a plain `ThreadLocal` crosses nothing —
the Logback manual: "a child thread does not automatically inherit a copy of the mapped
diagnostic context of its parent". Log4j2's `ThreadContext` is the same by default and
becomes an `InheritableThreadLocal` only with `log4j2.isThreadContextMapInheritable=true`
(default `false`). Inheritance is not the fix it looks like, because of what
`InheritableThreadLocal` does: it copies the parent's value **into every thread created
after the value was set**, once, at creation. Measured on JDK 25 with a hand-rolled
`InheritableThreadLocal`:

| Boundary                                                   | Plain `ThreadLocal` | `InheritableThreadLocal`                                        |
| ---------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| `Thread.ofVirtual().start(...)`                            | empty               | parent's value                                                  |
| `Thread.ofVirtual().inheritInheritableThreadLocals(false)` | empty               | empty                                                           |
| `Executors.newVirtualThreadPerTaskExecutor().submit(...)`  | empty               | **submitter's value** — the thread is created at submit time    |
| Fixed pool, first task on a lazily created worker          | empty               | submitter's value at that moment                                |
| Fixed pool, every later task on that worker                | empty               | the **stale snapshot** from whichever thread created the worker |
| Child mutates an inherited mutable map                     | —                   | visible in the parent, unless `childValue` copies               |

So inheritance "works" in a test that submits one task to a fresh pool and fails in
production where the pool is warm; it carries a request's context into unrelated
per-task virtual threads; and with a shared map it lets a child corrupt the parent. It is
a snapshot mechanism, and it is also a per-thread copy — under a virtual thread per task
that copy is paid per task. Carry the context explicitly (capture and restore, or a
`ScopedValue` re-bound into MDC at the boundary) and treat inheritance as absent. The
same reasoning is why `opentelemetry-performance` carries trace context through executors
with wrapping rather than relying on thread creation.

## Which key carries the trace id

Three conventions are in circulation, and a service that assumes one while its
instrumentation writes another emits events with the trace id present under a name no
query looks for:

| Producer                                                                                        | MDC / field keys                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| OpenTelemetry Java agent MDC instrumentation (`logback-mdc`, `log4j-context-data`, `log4j-mdc`) | `trace_id`, `span_id`, `trace_flags` — injected only while "the current `Span`" is valid                               |
| Spring Boot with Micrometer Tracing                                                             | `traceId`, `spanId`; the default console correlation is `[traceId-spanId]`, `logging.pattern.correlation` overrides it |
| ECS (Boot `logging.structured.format.*=ecs`, Log4j2 `EcsLayout.json`)                           | `trace.id`, `span.id` are the schema's names; what lands there depends on what populated the MDC                       |

The practical rule: pick the wire name once (`trace_id` or ECS `trace.id`), and make every
service emit it under that name — a pattern `%X{trace_id}` with Micrometer's `traceId` in
the MDC prints nothing, and vice versa. Boot's `logging.structured.json.rename` exists for
exactly this reconciliation. The OpenTelemetry agent can be told to disable its MDC
injection per framework (`otel.instrumentation.logback-mdc.enabled=false`) when the
application already sets the keys, so the two do not disagree on one event. Check the
emitted field name on a real event before writing the dashboard query.

Sampling does not remove the id: an unsampled request still has a trace context, so the
log carries a `trace_id` for which no trace exists. That is expected and is why
`request_id` is a separate field.

## Logging an exception

```java
catch (PaymentDeclinedException e) {
    log.error("payment failed: " + e.getMessage());   // type, stack and cause chain gone
    log.error("payment failed", e);                   // throwable trailing, no {} for it
}
```

The fluent equivalent is `atError().setCause(e)`, which lets the same call carry fields.
If this catch block retries and the retry succeeds, the level is WARN, not ERROR. If it
rethrows, do not log here at all — the layer that finally handles it will, and two logs for
one failure double the ERROR count that alerting reads.

## Redaction at the encoder

Two mechanisms, both applied once. **A deny-list of field names** (`password`,
`authorization`, `card_number`, `cpf`, `ssn`) checked by the encoder, replacing the value
with a fixed token — auditable in one place, and a new call site reusing the field name is
covered automatically. And **a marker type** whose `toString` returns `[REDACTED]`, for
values that are sensitive regardless of which field they land in.

The encoder is also where a maximum field length belongs, so an accidental full body is
truncated rather than shipped. A call-site helper (`log.info("card {}", mask(card))`) fails
for the reason all call-site policies fail: it is only as good as the review of the next
call site, and there are hundreds of next call sites.

The concrete mechanisms, by stack:

- logstash-logback-encoder: `<jsonGeneratorDecorator class="net.logstash.logback.mask.MaskingJsonGeneratorDecorator">`
  with `<path>` masks by field name (absolute `/authorization`, partial, `*` wildcards) and
  `<value>` masks by regex — the README notes value masks cost more than path masks —
  and `<defaultMask>` (default `****`). Path masks are the deny-list; a value mask for a
  card-number pattern is the backstop for a secret that reached an unexpected field.
- Spring Boot structured logging: `logging.structured.json.exclude` drops a member by
  path; a `StructuredLoggingJsonMembersCustomizer` (`logging.structured.json.customizer`)
  rewrites values.
- Log4j2 `JsonTemplateLayout`: `maxStringLength` bounds every string; a masking resolver
  is custom code, so the deny-list lives in the template.
- Logback's own `JsonEncoder` has no masking; a redaction requirement rules it out.

The marker type (`toString()` returning `[REDACTED]`) is the one call-site mechanism that
is safe, because it is the type, not the call site, that carries the policy.

## Newlines and log injection

A pattern layout writes the message verbatim, so user-controlled text containing `\n`
followed by `2026-09-02 10:15:00 INFO ...` forges an event that no reader can tell from a
real one, and a multi-line value splits one event into several for a line-oriented
collector. A JSON encoder escapes the newline inside the string and the problem does not
exist; that is a real reason to prefer JSON over a pattern even on a console. Where a
pattern must stay, Logback's `%replace(%msg){'[\r\n]', ''}` and Log4j2's `%enc{%m}{CRLF}`
neutralise it. Never build the message by concatenation — a parameterised message keeps
the user's text as an argument, which is what lets the encoder treat it as a value.

## Testing the contract

One test asserting the schema at a boundary, so it fails when a new call site forgets a
field:

```java
@Test
void every_event_at_the_boundary_carries_correlation_fields() {
    ListAppender<ILoggingEvent> appender = attachAppenderTo(OrderController.class);

    controller.place(validOrderRequest());

    assertThat(appender.list).isNotEmpty();
    assertThat(appender.list).allSatisfy(event -> {
        assertThat(event.getMDCPropertyMap()).containsKeys("request_id", "trace_id");
        assertThat(event.getFormattedMessage()).doesNotContain(SECRET_TOKEN);
    });
}
```

Two assertions, two different decays: a missing correlation field, and a credential reaching
an appender. Run it against the async path too — that is where the correlation fields
disappear first. `ILoggingEvent.getKeyValuePairs()` exposes the fluent pairs the same way,
so the test can also assert that a value is a field and not text inside the message — the
decay that a pattern encoder introduces without any test failing.
