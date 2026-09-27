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

With a throwing rejection handler, rejection can be synchronous at a factory/submission boundary
(`supplyAsync`) or appear as exceptional completion of a dependent stage when its action is
scheduled. Test already-complete and delayed sources; do not assume one catch around graph
construction observes both paths.

### A scheduled stage needs a terminal outcome

`ThreadPoolExecutor.DiscardPolicy` silently drops rejected tasks; `DiscardOldestPolicy` can drop
an earlier queued task. A dropped CompletableFuture action need never run or fail its future.
An `exceptionally` stage and terminal observer then remain waiting too. Prefer a throwing policy
such as `AbortPolicy` for result-bearing work unless an owned task-to-result protocol explicitly
settles every rejected or evicted result. Logging a drop alone is insufficient.

`CallerRunsPolicy` executes on the submitting thread under saturation but silently discards after
shutdown. Therefore test both states: an overload policy that appears to work in a load test may
strand stages during deployment. On an event-loop submitter, running the action inline can also
violate the execution contract. These policies are documented by
[Java 17 ThreadPoolExecutor](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
and [CallerRunsPolicy](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.CallerRunsPolicy.html).

Registering `source.thenApplyAsync(action, executor)` does not submit `action` until its input is
ready. An orderly shutdown after registration can reject that later submission. Keep the owned
executor alive through required graph completion and cleanup, or explicitly abort the graph's
results under a coordinated shutdown policy. Do not shut down a borrowed/shared executor.
`shutdownNow()` returns queued work that did not start; it does not promise to complete associated
CompletableFutures. Track public results separately from executor task wrappers and resource exit.
The [ExecutorService shutdown contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ExecutorService.html)
does not make pool termination evidence that every graph result reached a terminal state.

For a broader lifecycle fix, pass graph ownership, delayed submissions, rejection policy and
shutdown ordering to `executors-and-task-lifecycle`; expect an admission/drain/abort protocol with
observable result completion. If unavailable, use the existing executor's contract and test those
transitions locally before making a termination guarantee. Keep a diagnosis or findings-only
review within its requested scope.

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
`join()` reports ordinary exceptional completion with `CompletionException`, whereas `get()` uses
checked `ExecutionException`. Both throw `CancellationException` directly for a cancelled future.
By contrast, cancellation propagated into a normal dependent such as `thenApply` produces
exceptional completion with a `CompletionException` cause chain; that dependent need not report
`isCancelled()`. Cancelling a base dependent does not automatically cancel its source or siblings.
Assert the actual graph edge, cause and retrieval surface; inspect provider-specific propagation
separately. See the [Java 17 CompletableFuture cancellation contract](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletableFuture.html#cancel(boolean)>).

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

## Decision exercises

These are visible teaching cases, not evidence of measured agent improvement. For each, report
the responsible graph edge, evidence needed, proposed decision and a controlled-order test.

| Request and context                                                                                                                                                                     | Expected decision                                                                                                                                                                                                                  | Failure condition                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Java 17: an upstream future completes after its executor has shut down. Case A uses AbortPolicy; case B changes only the handler to DiscardPolicy. Why does the terminal fallback hang? | A: observe dependent exceptional completion from rejected scheduling. B: identify the silently dropped action; its future remains pending, so fallback cannot run. Retain executor lifetime or explicitly terminate owned results. | Claims both policies throw, or treats attaching `exceptionally` as enough for B.               |
| The same CallerRunsPolicy pool works under saturation but requests hang during shutdown.                                                                                                | Inspect both lifecycle states; caller-runs is inline under saturation and drops after shutdown. Verify thread affinity and result completion independently.                                                                        | Recommends caller-runs universally as backpressure, or assumes it runs after shutdown.         |
| A cancelled source feeds `thenApply`; the dependent's `isCancelled()` is false. Is cancellation lost?                                                                                   | Inspect exceptional completion and the cause chain. Distinguish direct retrieval of the cancelled source from propagated cancellation, and result state from stopping work.                                                        | Uses only `isCancelled()` to infer success or claims `get()` always throws ExecutionException. |
| One of two caller views over a shared request times out. Cancel the shared request to release its permit; the client cleanup signal is undocumented.                                    | Preserve the other caller's ownership. Inspect provider cancellation/resource completion, keep release tied to the protected lifetime, and leave the stop guarantee conditional.                                                   | Cancels shared work unconditionally or releases the permit merely because a view is done.      |
| Two independent lookups need both values; an early failure must be reported after every branch is accounted for.                                                                        | Start the independent lookups before combining; retain allOf plus explicit branch outcomes when every failure matters.                                                                                                             | Serializes independent work unnecessarily or changes the requirement to first completion.      |
| Java 17: replace a straightforward blocking call with Java 25 StructuredTaskScope, without an approved upgrade.                                                                         | Keep compatible control flow if no graph is needed; route lexical concurrency design with the actual Java baseline and ownership requirements.                                                                                     | Enables preview/upgrades Java, or constructs a graph solely to demonstrate the technique.      |

## Authoritative references

- [Java 25 `CompletionStage`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletionStage.html)
- [Java 25 `CompletableFuture`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [OpenJDK 21 `CompletableFuture`: low-parallelism fallback](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/util/concurrent/CompletableFuture.java)
- [OpenJDK 25 `CompletableFuture`: default executor and copying](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/CompletableFuture.java)
- [OpenJDK 25 `ForkJoinPool`: async common-pool initialization](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/ForkJoinPool.java)
- [Java 25 `StructuredTaskScope.Joiner` (preview)](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.Joiner.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
