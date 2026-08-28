# Instrumentation patterns

## Tracer, Meter and instruments — created once

```java
private static final Tracer TRACER =
    GlobalOpenTelemetry.getTracer("com.example.OrderService", "1.0.0");

private static final Meter METER =
    GlobalOpenTelemetry.getMeter("com.example.OrderService");

private static final LongCounter ORDERS_PROCESSED = METER
    .counterBuilder("orders.processed")
    .setDescription("Total orders processed")
    .setUnit("{orders}")
    .build();

private static final LongHistogram PROCESSING_TIME = METER
    .histogramBuilder("orders.processing.time")
    .setUnit("ms")
    .ofLongs()
    .build();

// Returns ObservableLongGauge — there is no ObservableGauge<Long>.
private static final ObservableLongGauge QUEUE_DEPTH = METER
    .gaugeBuilder("orders.queue.depth")
    .ofLongs()
    .buildWithCallback(m -> m.record(getQueueDepth(), Attributes.empty()));
```

## Span lifecycle

```java
Span span = TRACER.spanBuilder("order.process")
    .setSpanKind(SpanKind.INTERNAL)
    // Business attributes follow your own naming convention — they are not
    // OpenTelemetry Semantic Conventions.
    .setAttribute("order.id", order.getId())
    .setAttribute("order.tenant", order.getTenantId())
    .setAttribute("order.items.count", order.getItems().size())
    .startSpan();

long start = System.currentTimeMillis();
try (Scope scope = span.makeCurrent()) {
    OrderResult result = doProcessOrder(order);
    span.setAttribute("order.status", result.getStatus().name());
    ORDERS_PROCESSED.add(1, Attributes.of(
        AttributeKey.stringKey("tenant"), order.getTenantId(),
        AttributeKey.stringKey("status"), result.getStatus().name()));
    return result;
} catch (Exception e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR, e.getMessage());
    throw e;
} finally {
    PROCESSING_TIME.record(System.currentTimeMillis() - start,
        Attributes.of(AttributeKey.stringKey("tenant"), order.getTenantId()));
    span.end();     // always runs, including on the exception path
}
```

`span.end()` written inside the `try` after the work does not run when the work throws.

## Crossing a thread boundary

The pattern is identical for every boundary: capture outside, restore inside.

```java
// Virtual thread
Span span = TRACER.spanBuilder("virtual-thread-work").startSpan();
try (Scope scope = span.makeCurrent()) {
    Context ctx = Context.current();                  // capture BEFORE the boundary
    Thread.ofVirtual().start(() -> {
        try (Scope vt = ctx.makeCurrent()) {          // restore INSIDE
            Span child = TRACER.spanBuilder("child").startSpan();
            try (Scope s = child.makeCurrent()) {
                doWork();
            } finally { child.end(); }
        }
    }).join();
} finally {
    span.end();
}

// CompletableFuture / raw executor — same shape
Context ctx = Context.current();
CompletableFuture.runAsync(() -> {
    try (Scope scope = ctx.makeCurrent()) {
        Span child = TRACER.spanBuilder("event.publish").startSpan();
        try (Scope s = child.makeCurrent()) {
            kafkaProducer.send(event);
        } finally { child.end(); }
    }
}, asyncExecutor);
```

Without the capture-and-restore, `Context.current()` inside the new thread is
`Context.root()`, `Span.current()` is `Span.getInvalid()`, and the child becomes a
disconnected root. Nothing throws.

## Resource identity

```java
Resource resource = Resource.getDefault().merge(
    Resource.create(Attributes.of(
        AttributeKey.stringKey("service.name"), "orders-api",
        AttributeKey.stringKey("service.version"), "1.0.0")));

SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
    .setResource(resource)
    .addSpanProcessor(SimpleSpanProcessor.create(LoggingSpanExporter.create()))
    .build();
```

Without it every backend shows `unknown_service:java`, useless with more than one service
in the environment.

## Kafka: PRODUCER and CONSUMER

Messaging shares no memory, so the context has to be serialised into message headers.

```java
W3CTraceContextPropagator propagator = W3CTraceContextPropagator.getInstance();

// ---- PRODUCER ----
TextMapSetter<ProducerRecord<?, ?>> setter =
    (record, key, value) -> record.headers().add(key, value.getBytes());

Span producerSpan = TRACER.spanBuilder("orders publish")
    .setSpanKind(SpanKind.PRODUCER)
    .setAttribute("messaging.system", "kafka")
    .setAttribute("messaging.destination.name", "orders")
    .startSpan();
try (Scope scope = producerSpan.makeCurrent()) {
    ProducerRecord<String, String> record = new ProducerRecord<>("orders", key, value);
    propagator.inject(Context.current(), record, setter);   // writes the traceparent header
    kafkaProducer.send(record);
} catch (Exception e) {
    producerSpan.recordException(e);
    producerSpan.setStatus(StatusCode.ERROR, e.getMessage());
    throw e;
} finally {
    producerSpan.end();
}

// ---- CONSUMER ----
TextMapGetter<ConsumerRecord<?, ?>> getter = new TextMapGetter<>() {
    @Override public Iterable<String> keys(ConsumerRecord<?, ?> r) {
        return StreamSupport.stream(r.headers().spliterator(), false)
            .map(Header::key).collect(Collectors.toList());
    }
    @Override public String get(ConsumerRecord<?, ?> r, String key) {
        Header h = r.headers().lastHeader(key);
        return h != null ? new String(h.value()) : null;
    }
};

Context extracted = propagator.extract(Context.root(), record, getter);
try (Scope scope = extracted.makeCurrent()) {
    Span consumerSpan = TRACER.spanBuilder("orders process")
        .setSpanKind(SpanKind.CONSUMER)
        .setAttribute("messaging.system", "kafka")
        .setAttribute("messaging.destination.name", "orders")
        .startSpan();                                       // child of the PRODUCER span
    try (Scope s = consumerSpan.makeCurrent()) {
        processMessage(record);
    } finally { consumerSpan.end(); }
}
```

Dropping the `PRODUCER` span still leaves `inject` working — it depends only on
`Context.current()` — but the trace no longer shows how long publishing took or that
`send()` failed.

## Baggage

```java
Baggage baggage = Baggage.builder()
    .put("tenant.id", tenantId)
    .put("feature.new_pricing", "true")
    .build();

try (Scope scope = baggage.storeInContext(Context.current()).makeCurrent()) {
    String tenant = Baggage.current().getEntryValue("tenant.id");
}
```

Every entry travels in the headers of every downstream request, to services you may not
control. No PII, no secrets.

## Correlating a span with GC

`GarbageCollectorMXBean.getCollectionTime()` is a cumulative counter, so the difference
across a span is enough for a coarse "did GC happen during this request" check. A per-phase
answer needs a different instrument.

```java
static long totalGCTime() {
    return ManagementFactory.getGarbageCollectorMXBeans()
        .stream().mapToLong(GarbageCollectorMXBean::getCollectionTime).sum();
}

public static <T> T withGCAwareSpan(String name, Supplier<T> operation) {
    long gcBefore = totalGCTime();
    Span span = TRACER.spanBuilder(name).startSpan();
    try (Scope scope = span.makeCurrent()) {
        T result = operation.get();
        long gcDuring = totalGCTime() - gcBefore;
        if (gcDuring > 0) {
            span.setAttribute("jvm.gc.time_during_span_ms", gcDuring);
            span.addEvent("gc-occurred",
                Attributes.of(AttributeKey.longKey("gc_time_ms"), gcDuring));
        }
        return result;
    } finally {
        span.end();
    }
}
```

GC counters as metrics, per collector:

```java
for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
    METER.counterBuilder("jvm.gc.collections")
        .setUnit("{collections}")
        .buildWithCallback(m -> m.record(gc.getCollectionCount(),
            Attributes.of(AttributeKey.stringKey("gc.name"), gc.getName())));
}
```
