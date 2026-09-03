# Composition recipes

These are policy templates, not copy-paste defaults. Supply operation-specific executors, deadlines
and result types.

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
CompletableFuture<Price> visible = operation
        .orTimeout(remaining.toMillis(), TimeUnit.MILLISECONDS)
        .exceptionallyCompose(failure -> recoverOrPropagate(unwrapKnownWrappers(failure)));
```

This bounds visibility of `operation`; it does not stop its supplier. Configure the HTTP/JDBC/client
request deadline from the same remaining budget and design late side effects explicitly. Note that
`orTimeout` mutates `operation`; use `copy()` first when a caller must not alter an internally owned
future's completion.

## Adapt a callback with a race-safe contract

```java
CompletableFuture<Response> call(Request request) {
    var result = new CompletableFuture<Response>();
    final Cancellable call;
    try {
        call = client.start(request, new Callback() {
            @Override public void success(Response response) {
                if (!result.complete(response)) {
                    response.close(); // ownership policy for a duplicate/late response
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
        if (result.isCancelled()) call.cancel();
    });
    return result;
}
```

Completion may race with timeout, cancellation and duplicate callbacks. `complete` returning `false`
is operationally meaningful: release any response resource whose ownership was not transferred.
Ensure synchronous exceptions thrown by `client.start` are also represented. The example catches
`RuntimeException`; adapt that boundary to the callback API's declared failures without masking
process-integrity `Error`s.

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
