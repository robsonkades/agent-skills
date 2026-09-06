# Composition recipes

These are policy templates, not copy-paste defaults. Supply operation-specific executors, deadlines
and result types.

Java blocks are partial snippets for an enclosing application class, with
`java.util.concurrent` imports and named application/client types supplied by the project.
Core recipes need Java 17 without preview. Do not infer a particular client library from
placeholder names such as `Cancellable` or `Response`.

## Preserve branch outcomes

Represent partial failure explicitly instead of losing causality in `Optional.empty()`:

```java
sealed interface Outcome<T> {
    record Success<T>(T value) implements Outcome<T> {}
    record Failure<T>(Throwable cause) implements Outcome<T> {}
}

static <T> CompletableFuture<Outcome<T>> outcome(CompletableFuture<T> input) {
    return input.handle((value, failure) -> failure == null
            ? new Outcome.Success<>(value)
            : new Outcome.Failure<>(unwrapKnownWrappers(failure)));
}
```

After `allOf(outcomes...)` completes normally, join each outcome. This retains per-branch failures
and permits a deliberate quorum/partial-response policy.

## Bound graph size and resource use

Submitting every element to a fixed pool bounds running workers, not queued tasks or future objects.
Process a bounded window and launch another item only after one completes. A semaphore can protect a
remote dependency, but acquire it before submitting/starting work when the objective also is bounded
admission.

The helper below is **synchronous**: `action.call()` must not return until the protected
operation is finished. Passing an async-starting action returning `CompletionStage` releases
the permit too early. For an async provider, attach release to its actual completion/cleanup
signal and release on synchronous startup failure too; caller cancellation alone is insufficient.

```java
static <T> T withPermit(Semaphore permits, Callable<T> action) throws Exception {
    permits.acquire();
    try {
        return action.call();
    } finally {
        permits.release();
    }
}
```

Define a timed acquisition or upstream rejection policy; waiting forever merely relocates the queue.
Fair semaphores reduce barging but can reduce throughput. One global semaphore can also create
head-of-line blocking; isolate by dependency or tenant where failure domains differ.

## Apply timeout at all relevant layers

```java
CompletableFuture<Price> visible = operation.copy()
        .orTimeout(remaining.toMillis(), TimeUnit.MILLISECONDS)
        .exceptionallyCompose(failure -> recoverOrPropagate(unwrapKnownWrappers(failure)));
```

This times out a caller-owned copy, preserving the internal `operation`. It does not bound
`visible` if recovery returns an unfinished stage: carry the same absolute deadline into recovery
and apply the remaining budget to the final caller-visible result. Do not reset a full timeout
after each fallback, and do not run blocking recovery inline on a timeout-completing thread.
Neither timeout stops the supplier. Configure the HTTP/JDBC/client request deadline and design
late side effects explicitly. Cancelling the copy also does not cancel `operation`; any such
bridge must follow the operation owner's cancellation policy.

## Adapt a callback with a race-safe contract

This partial adapter requires a nonblocking `client.start` returning its handle before the
public future is exposed. Each successful callback must transfer a **distinct ownership claim**
on its response; `closeLateResponse` consumes that claim, reports close failures and does not
throw. If the client can deliver the same resource object twice without transferring a second
claim, deduplicate callback identity before this adapter: closing it on a failed `complete`
would otherwise invalidate the winner already delivered to the caller.

```java
CompletableFuture<Response> call(Request request) {
    var result = new CompletableFuture<Response>();
    final Cancellable call;
    try {
        call = client.start(request, new Callback() {
            @Override public void success(Response response) {
                if (!result.complete(response)) {
                    closeLateResponse(response); // nonthrowing, ownership-aware cleanup
                }
            }

            @Override public void failure(Throwable failure) {
                result.completeExceptionally(failure);
            }
        });
    } catch (RuntimeException startupFailure) {
        result.completeExceptionally(startupFailure);
        return result;
    }
    result.whenComplete((value, failure) -> {
        if (result.isCancelled()) {
            try {
                call.cancel();
            } catch (RuntimeException cancelFailure) {
                reportCancelFailure(cancelFailure); // bounded, nonthrowing owner-visible hook
            }
        }
    });
    return result;
}
```

Completion may race with timeout, cancellation and duplicate callbacks. `complete` returning `false`
is operationally meaningful: release any response resource whose ownership was not transferred.
Ensure synchronous exceptions thrown by `client.start` are also represented. The example catches
`RuntimeException`; adapt that boundary to the callback API's declared failures without masking
process-integrity `Error`s.

`call.cancel()` must be safe on a completing/cancelling thread; otherwise dispatch cancellation
through an owned executor with explicit rejection handling. This hook handles cancellation,
not `TimeoutException`: an `orTimeout` result is not `isCancelled()`. Wire deadline abort through
the owner separately. Publishing the result before handle registration requires a remembered
cancellation request and an atomic registration protocol; this sketch avoids that publication order.

## Flatten dependencies, combine independence

```java
CompletableFuture<Order> order = findUser(id)
        .thenComposeAsync(user -> createOrder(user), dependencyExecutor);

CompletableFuture<Page> page = userFuture.thenCombineAsync(
        cartFuture, Page::new, renderExecutor);
```

`thenCompose` encodes dependency. Constructing `cartFuture` inside a continuation on `userFuture`
serializes work; start independent operations before combining them. Do not start speculative calls
when their side effects or capacity costs are unacceptable.

## Normalize known wrappers conservatively

```java
static Throwable unwrapKnownWrappers(Throwable failure) {
    Throwable current = failure;
    while ((current instanceof CompletionException || current instanceof ExecutionException)
            && current.getCause() != null) {
        current = current.getCause();
    }
    return current;
}
```

Use this at an integration boundary for type-based policy. Do not globally flatten every cause:
`CompletionException` can itself be a meaningful application exception, and the wrapper/cause chain
is useful evidence. Preserve the original as the logged or rethrown causal chain.

## Test completion-order semantics

Use manually controlled futures to test already-complete and later-complete inputs, both orderings of
two failures, executor rejection, action failure inside `whenComplete`, empty `allOf`/`anyOf`, timeout
races and duplicate callback completion. Tests must assert both the returned outcome and whether
losing work/resources were actually stopped or released.
