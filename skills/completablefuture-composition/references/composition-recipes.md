# Composition recipes

Every recipe here passes an explicit executor. That is not stylistic: the no-executor
overloads pick `ForkJoinPool.commonPool()`, or a thread per stage when the pool's
parallelism is below 2.

## Fan-out with typed results

`allOf` returns `Void`, so the results come from joining the inputs after it settles — safe
precisely because they are all complete at that point.

```java
List<CompletableFuture<Quote>> futures = suppliers.stream()
        .map(s -> CompletableFuture.supplyAsync(() -> quote(s), ioPool))
        .toList();

CompletableFuture<List<Quote>> all =
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
                .thenApply(ignored -> futures.stream()
                        .map(CompletableFuture::join)      // all complete: join cannot block
                        .toList());
```

`allOf` does not fail fast. If one supplier fails at 10 ms and another takes 5 s, this waits
5 s and then reports the failure. When "abandon the rest on first failure" is the
requirement, that is `StructuredTaskScope`, not `CompletableFuture`.

## Fan-out that tolerates partial failure

```java
List<CompletableFuture<Optional<Quote>>> futures = suppliers.stream()
        .map(s -> CompletableFuture.supplyAsync(() -> quote(s), ioPool)
                .orTimeout(500, TimeUnit.MILLISECONDS)
                .<Optional<Quote>>thenApply(Optional::of)
                .exceptionally(t -> {                       // per-branch terminal
                    log.warn("supplier {} degraded", s.id(), unwrap(t));
                    degraded.increment();
                    return Optional.empty();
                }))
        .toList();
```

Each branch now terminates in a value, so `allOf` can never fail and the aggregate is a
partial result by design. Count the degradations — a silent fallback that fires on every
request is an outage nobody has noticed.

## Bounded fan-out

`CompletableFuture` has no notion of a concurrency limit. The bound is whatever you give it.

```java
// The executor is the bound.
ExecutorService ioPool = new ThreadPoolExecutor(
        16, 16, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(200),
        new ThreadPoolExecutor.AbortPolicy());

// Or, on virtual threads, where the executor cannot bound anything:
Semaphore permits = new Semaphore(16);

CompletableFuture<Quote> guarded = CompletableFuture.supplyAsync(() -> {
    permits.acquireUninterruptibly();        // see cancellation-and-interruption before choosing this
    try {
        return quote(s);
    } finally {
        permits.release();                   // finally, always: a leaked permit never comes back
    }
}, vtExecutor);
```

## Timeout with a fallback

```java
CompletableFuture<Price> price = CompletableFuture
        .supplyAsync(() -> pricing.lookup(sku), ioPool)
        .orTimeout(300, TimeUnit.MILLISECONDS)     // bounds the CALLER
        .exceptionally(t -> cached.get(sku));      // and gives the caller something
```

`orTimeout` completes the future exceptionally with `TimeoutException` and leaves
`pricing.lookup` running. Pair it with a bound on the call itself — an HTTP request timeout,
a JDBC query timeout — or the load simply accumulates behind a caller that thinks it
recovered.

## Sequential composition, and the flattening mistake

```java
// Wrong: a future of a future. It completes when the OUTER stage does — before the order exists.
CompletableFuture<CompletableFuture<Order>> wrong =
        findUser(id).thenApply(user -> createOrder(user));

// Right
CompletableFuture<Order> right =
        findUser(id).thenComposeAsync(user -> createOrder(user), ioPool);
```

`thenCompose` is flatMap. If the lambda returns a `CompletionStage`, it is always
`thenCompose`.

## Combining two independent stages

```java
CompletableFuture<User> user  = supplyAsync(() -> users.find(id), ioPool);
CompletableFuture<Cart> cart  = supplyAsync(() -> carts.find(id), ioPool);

CompletableFuture<Page> page = user.thenCombineAsync(cart, Page::new, cpuPool);
```

Both start at construction; `thenCombine` only joins them. Building `cart` _inside_ a
`thenCompose` on `user` would serialise two calls that had no dependency — the most common
accidental latency doubling in async code.

## Wrapping a callback API

This is the case `CompletableFuture` exists for, and the one virtual threads do not remove.

```java
CompletableFuture<Response> call(Request req) {
    CompletableFuture<Response> cf = new CompletableFuture<>();
    client.enqueue(req, new Callback() {
        @Override public void onSuccess(Response r) { cf.complete(r); }
        @Override public void onFailure(Throwable t) { cf.completeExceptionally(t); }
    });
    return cf;
}
```

Two obligations follow: the callback must complete the future on **every** path — an
uncompleted future is a thread waiting forever — and the stage after it should be
`*Async` with your executor, because otherwise the continuation runs on the client's I/O
thread.

## The unwrap helper you will need everywhere

```java
static Throwable unwrap(Throwable t) {
    return (t instanceof CompletionException || t instanceof ExecutionException)
            && t.getCause() != null ? t.getCause() : t;
}

// Without it, this never matches, and the fallback silently never runs:
//   .exceptionally(t -> t instanceof TimeoutException ? fallback() : rethrow(t))
```

## Handing a chain to a virtual-thread executor

```java
// Hold one executor for the application's lifetime.
private final ExecutorService vt = Executors.newVirtualThreadPerTaskExecutor();

// Not this — a new executor per call, whose close() blocks and whose threads are unbounded:
//   supplyAsync(this::work, Executors.newVirtualThreadPerTaskExecutor());
```

A virtual-thread executor makes blocking inside a stage harmless to other stages. It does
not give the fan-out a bound, does not make cancellation work, and does not make the chain
easier to read — those are the reasons to reach for structured concurrency instead.
