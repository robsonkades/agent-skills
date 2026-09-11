# Instrumentation Patterns

## Span lifecycle

Partial OpenTelemetry Java API snippets: imports, tracer acquisition and application methods
are omitted. API/Context behavior below is referenced against OpenTelemetry Java 1.62.0;
compile against the project's resolved API/Context and JDK versions. These
examples assume synchronous `validate`/`reprice`; a returned future is not operation completion.

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

Use explicit propagation when the affected boundary needs it; verify automatic coverage
before adding or removing wrappers:

```java
Context submitted = Context.current();
executor.execute(
    submitted.wrap(() -> {
        Span child = tracer.spanBuilder("reprice").startSpan();
        try (Scope ignored = child.makeCurrent()) {
            reprice();
        } catch (RuntimeException | Error failure) {
            child.recordException(failure);
            child.setStatus(StatusCode.ERROR);
            throw failure;
        } finally {
            child.end();
        }
    }));
```

Context capture belongs at submission because execution-time Context may be unrelated.
For completion callbacks, capture at registration in the originating operation, not in
an unrelated thread that later completes the future. Keep Context as data across threads;
open and close each Scope on its own executing thread.
OpenTelemetry Java also exposes wrappers for Runnable, Callable, Executor and functions.
For a changed async boundary, select relevant cancellation, rejection, delayed-execution
and executor-reuse checks; adequate existing tests can suffice. A scope leak can attach
later unrelated tasks to the wrong trace.

## CompletableFuture and virtual threads

Agent versions instrument supported concurrency libraries, so behavior cannot be inferred
from ThreadLocal storage alone. When propagation across one of these boundaries is the
claim under review, inspect existing integration evidence or test:

1. parent span current at submission/start;
2. child created inside callback/thread;
3. expected parent ID;
4. two interleaved requests do not cross-contaminate;
5. exceptional/cancelled paths close scopes/spans.

For StructuredTaskScope or virtual-thread APIs, pin JDK and instrumentation version.
`Context.wrap` itself opens/restores a Scope; it does not start spans. Two wrappers do not
by themselves prove duplicate spans. Verify captured parentage and overhead before changing
an existing wrapper. The Java 1.62.0 [`Context` source](https://github.com/open-telemetry/opentelemetry-java/blob/v1.62.0/context/src/main/java/io/opentelemetry/context/Context.java)
defines capture/wrapping behavior; [`Scope`](https://github.com/open-telemetry/opentelemetry-java/blob/v1.62.0/context/src/main/java/io/opentelemetry/context/Scope.java)
defines restoration. Wrapper overloads and supported agent integrations remain version-specific.

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
Tail sampling or export loss can leave an exemplar pointing to a trace the backend never
retained. Test end-to-end lookup; exemplars do not guarantee tail retention or replace the
metric population. Filter/aggregate bounded attributes at the SDK source as appropriate;
dropping labels only after export cannot bound the application's aggregation state.

## Correlation with runtime events

Do not read process-wide GC/CPU counters before and after each request and label the delta
as request ownership. Instead:

- preserve span start/end timestamps and process/instance identity;
- record JFR/GC/OS events on the same clock;
- join intervals offline;
- compare unaffected concurrent requests and instances;
- use profiles for aggregate CPU/allocation ownership.

Overlap is evidence, not proof of causation.
