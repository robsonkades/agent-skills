# Instrumentation Patterns

## Span lifecycle

```java
Span span = tracer.spanBuilder("order.validate").startSpan();
try (Scope ignored = span.makeCurrent()) {
    return validate(order);
} catch (Throwable t) {
    span.recordException(t);
    span.setStatus(StatusCode.ERROR);
    throw t;
} finally {
    span.end();
}
```

Use low-cardinality, stable span names; put bounded/queryable detail in governed attributes.
Do not copy order or tenant IDs into metric labels. Decide whether exception recording may
expose messages/stack data.

## Explicit async propagation

Use this only after verifying automatic instrumentation does not already propagate:

```java
Context submitted = Context.current();
executor.execute(
    submitted.wrap(() -> {
        Span child = tracer.spanBuilder("reprice").startSpan();
        try (Scope ignored = child.makeCurrent()) {
            reprice();
        } finally {
            child.end();
        }
    }));
```

Context capture belongs at submission because execution-time Context may be unrelated.
OpenTelemetry Java also exposes wrappers for Runnable, Callable, Executor and functions.
Test cancellation, rejection, delayed execution and executor reuse. A scope leak can attach
later unrelated tasks to the wrong trace.

## CompletableFuture and virtual threads

Agent versions instrument supported concurrency libraries, so behavior cannot be inferred
from ThreadLocal storage alone. Integration-test:

1. parent span current at submission/start;
2. child created inside callback/thread;
3. expected parent ID;
4. two interleaved requests do not cross-contaminate;
5. exceptional/cancelled paths close scopes/spans.

For StructuredTaskScope or virtual-thread APIs, pin JDK and instrumentation version. Avoid
wrapping a callback already wrapped by the agent until duplicate behavior is understood.

## Messaging

Producer and consumer semantics depend on broker instrumentation and semantic-convention
version. Model:

- create/send/enqueue completion;
- propagation carrier injection/extraction;
- receive versus process spans;
- batch messages and links to multiple parents;
- redelivery and settlement/acknowledgment;
- async send callback and failure.

Do not assume a consumer process span is always a child of one producer: queues can delay,
batch and redeliver, and links may better represent causality. Use the current messaging
semantic conventions and existing agent instrumentation.

## Metrics and exemplars

Create instruments once per logical instrumentation scope when practical. Attribute sets
must be bounded according to metrics-and-cardinality. Exemplars link selected metric
observations to trace context without making trace IDs metric labels; support/reservoir
behavior depends on SDK/exporter/backend.

## Correlation with runtime events

Do not read process-wide GC/CPU counters before and after each request and label the delta
as request ownership. Instead:

- preserve span start/end timestamps and process/instance identity;
- record JFR/GC/OS events on the same clock;
- join intervals offline;
- compare unaffected concurrent requests and instances;
- use profiles for aggregate CPU/allocation ownership.

Overlap is evidence, not proof of causation.
