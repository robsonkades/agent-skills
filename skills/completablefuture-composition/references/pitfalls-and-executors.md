# Executors, failures and context

## Thread attribution without folklore

For non-async dependent actions, the `CompletableFuture` contract permits the completing thread or
another caller of a completion method. An already-completed source often runs inline in the attaching
caller, but code must not depend on that implementation outcome. Instrument thread name, executor
identity and operation at stage boundaries when diagnosing affinity.

For async methods without an executor, inspect `defaultExecutor()` on the actual stage class. The
base Java 17/21 class uses `ForkJoinPool.commonPool()` when it supports more than one parallel
thread and otherwise a thread-per-task fallback, even when that common pool is explicitly passed
to an async method. OpenJDK 25 instead uses the common pool and can override configured zero
parallelism for intrinsically asynchronous work. Its class-level API text and implementation
reflect this change; the `defaultExecutor()` method detail still describes the older fallback.
A subclass can override the default facility. Inspect the exact build and effective pool state.

An explicit executor can execute inline, serialize work, reject, or queue without limit. The
`CompletionStage` API deliberately does not promise concurrent execution merely because an executor
argument exists.

Rejection can be synchronous at a factory/submission boundary (`supplyAsync`) or appear as
exceptional completion of a dependent stage when its action is scheduled. Test already-complete
and delayed sources; do not assume one catch around graph construction observes both paths.

## Failure matrix

| Operation              | Source success         | Source failure         | If action throws                                                      |
| ---------------------- | ---------------------- | ---------------------- | --------------------------------------------------------------------- |
| `thenApply`            | maps value             | propagates failure     | returned stage fails                                                  |
| `exceptionally`        | passes value           | maps failure to value  | returned stage fails                                                  |
| `exceptionallyCompose` | passes value           | maps failure to stage  | returned stage follows returned stage or fails                        |
| `handle`               | maps `(value, null)`   | maps `(null, failure)` | returned stage fails                                                  |
| `whenComplete`         | observes and preserves | observes and preserves | replaces success; source failure has precedence over observer failure |

Handlers can see the exception with which their triggering stage completed. A direct
`completeExceptionally(cause)` need not look like failure propagated through dependent stages.
`join()` reports exceptional completion with `CompletionException` (except cancellation), whereas
`get()` uses checked `ExecutionException`. Assert the surface you actually expose.

Do not catch `Throwable` merely to turn every event into fallback. `Error` often represents a process
integrity problem, and a fallback that masks it can leave the service corrupted. Define which
exception classes are recoverable at the operation boundary.

Observe the stage returned by `whenComplete` when observer failure matters. Discarding it can
hide logging/cleanup failures even though the source future remains successful. A terminal
observer intended never to throw must have its own bounded error-reporting contract.

## Aggregation policy

`allOf` is a completion barrier, not a result collector, quorum, failure accumulator or cancellation
scope. It completes after all inputs. On failure, record branch outcomes yourself if every cause is
required; the API does not promise an aggregate of all exceptions.

`anyOf` returns `Object`, completes on exceptional as well as normal completion, and leaves other
inputs running. A hedge must specify first completion versus first success, loser cancellation,
late-response resource release and side-effect safety.

`applyToEither` is typed, but does not repair the first-success policy. The
[Java 17 CompletionStage contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletionStage.html)
does not guarantee normal completion when one either-input fails and the other succeeds.
An early failure can therefore finish the dependent stage before the other input succeeds.
For first success, explicitly coordinate outcomes: preserve a success even after another
branch failed, finish exceptionally only when every candidate has failed, and define the
empty-input, deadline, losing-result cleanup and cancellation policies. Test failure-then-success,
success-then-failure, all-failed and already-completed inputs; do not infer the policy from a
method's name or from only the all-success case.

Java 25 preview `StructuredTaskScope.Joiner.anySuccessfulResultOrThrow()` provides first-success
scope policy and cancels the scope when a result is available. Cancellation interrupts unfinished
subtask threads but remains cooperative; it is still not proof that remote work stopped.

## Context transfer

Capture immutable context at submission and restore it only for the dynamic extent of the action:

The following partial snippet assumes the project's OpenTelemetry `Context`/`Scope` and SLF4J
`MDC`, appropriate imports and an executor. Verify the resolved versions and instrumentation
wrappers; these are library types, not Java SE APIs.

```java
Context captured = Context.current();
Map<String, String> mdc = MDC.getCopyOfContextMap();

CompletableFuture.supplyAsync(() -> {
    Map<String, String> previous = MDC.getCopyOfContextMap();
    try (Scope ignored = captured.makeCurrent()) {
        if (mdc == null) MDC.clear(); else MDC.setContextMap(mdc);
        return work();
    } finally {
        if (previous == null) MDC.clear(); else MDC.setContextMap(previous);
    }
}, executor);
```

Restoring the previous MDC is safer than unconditional clearing for direct/inline executors. Prefer
OpenTelemetry's supported task wrapping and the logging framework's scoped APIs where available.
Never copy secrets unnecessarily, and never let request authentication state leak into later work on
a reused worker.

`ScopedValue` is bound for a dynamic scope and is not a general context carrier for an arbitrary
stage that may run after that scope ends. Structured child threads inherit scoped bindings according
to their API contract; unrelated executor tasks do not.

## Anti-patterns

### Fire-and-forget branch

- **Why it happens:** the caller only needs the main result.
- **Symptoms:** exceptional completion is never observed; deploy/shutdown loses work.
- **Better:** give the branch a durable queue, explicit owner/terminal observer, or keep it inside the
  request's structured lifetime.
- **Acceptable:** only for explicitly lossy telemetry with quantified loss and non-blocking shutdown.

### Timeout as cancellation

- **Why it happens:** the future returned to the caller is done.
- **Symptoms:** active requests and connections rise after timeout rate rises.
- **Better:** provider deadline, cooperative cancellation and resource-local admission bound.

### Pool as backpressure

- **Why it happens:** worker count appears bounded.
- **Symptoms:** executor queue/live futures grow while dependency is saturated.
- **Better:** bounded admission with rejection/deadline plus bounded construction windows.

### Blanket recovery

- **Why it happens:** a terminal `exceptionally` keeps the endpoint available.
- **Symptoms:** fallback becomes the normal path; defects and authorization failures are hidden.
- **Better:** recover only classified failures, expose degradation metrics, and preserve cause.

## Evidence checklist

- Capture a thread dump and executor state during the symptom, not only after recovery.
- Correlate stage latency with client pool/connection and downstream concurrency.
- Count timeouts separately from confirmed cancellation and late completion.
- Log the original causal chain once at its owning boundary; avoid duplicate logs at every stage.
- Reproduce completion order with controlled futures rather than timing sleeps.

## Authoritative references

- [Java 25 `CompletionStage`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [Java 25 `CompletableFuture`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [OpenJDK 21 `CompletableFuture`: low-parallelism fallback](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/util/concurrent/CompletableFuture.java)
- [OpenJDK 25 `CompletableFuture`: default executor and copying](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/CompletableFuture.java)
- [OpenJDK 25 `ForkJoinPool`: async common-pool initialization](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/ForkJoinPool.java)
- [Java 25 `StructuredTaskScope.Joiner` (preview)](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.Joiner.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
