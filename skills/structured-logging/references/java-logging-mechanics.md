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
disappear first.
