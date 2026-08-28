# Deterministic tests

## Inject the executor, then most tests stop being concurrent

```java
class OrderService {
    private final Executor executor;                      // injected, not created
    OrderService(Executor executor) { this.executor = executor; }
}

// Unit test: no scheduling, no timing, no flakiness
new OrderService(Runnable::run);

// Concurrency test: the real thing, only where concurrency is the subject
new OrderService(Executors.newVirtualThreadPerTaskExecutor());
```

A class that calls `Executors.newFixedThreadPool(...)` in its constructor is a class whose
concurrency cannot be tested and whose logic cannot be tested without it. Injecting the
executor is the single highest-value testability change in concurrent code.

## Synchronisation points instead of sleeps

```java
// "Wait until it has started" — a latch, not a sleep
CountDownLatch started = new CountDownLatch(1);
CountDownLatch release = new CountDownLatch(1);

Future<?> f = executor.submit(() -> {
    started.countDown();
    release.await();                       // held open until the test decides
    return null;
});

assertTrue(started.await(2, SECONDS));     // deterministic: the task is definitely running
// … do the thing under test while it is in flight …
release.countDown();
```

```java
// "Start together" — a barrier, to maximise the chance of the interleaving you want
CyclicBarrier start = new CyclicBarrier(THREADS);
// each thread: start.await(); then the contended operation
```

```java
// "The effect eventually happened" — a bounded poll, not a fixed wait
await().atMost(Duration.ofSeconds(2))
       .untilAsserted(() -> assertEquals(expected, repository.count()));
```

The bound is part of the assertion: `atMost(2s)` says "this must happen within two seconds",
which is a real requirement. `Thread.sleep(2000)` says "I hope two seconds is enough", which
is not.

## Cancellation

```java
@Test
@Timeout(10)                                          // a deadlock fails; it does not hang CI
void cancellationReleasesThePermit() throws Exception {
    int before = limiter.availablePermits();
    CountDownLatch started = new CountDownLatch(1);

    Future<?> f = executor.submit(() -> {
        started.countDown();
        return client.slowCall();                     // blocked in an interruptible call
    });
    assertTrue(started.await(2, SECONDS));

    assertTrue(f.cancel(true));

    await().atMost(Duration.ofSeconds(2))
           .until(() -> limiter.availablePermits() == before);   // the EFFECT, not the flag
}
```

Write the same test for each scarce resource on the path: the connection, the permit, the
file handle, the downstream request. `cancel()` returning `true` is not one of the
assertions.

## Interruption

```java
@Test
@Timeout(10)
void taskStopsPromptlyWhenInterrupted() throws Exception {
    CountDownLatch started = new CountDownLatch(1);
    AtomicBoolean finished = new AtomicBoolean();

    Thread t = Thread.ofVirtual().start(() -> {
        started.countDown();
        try {
            worker.runUntilInterrupted();
        } finally {
            finished.set(true);
        }
    });

    assertTrue(started.await(2, SECONDS));
    t.interrupt();
    t.join(Duration.ofSeconds(2));                   // the bound IS the requirement

    assertFalse(t.isAlive());
    assertTrue(finished.get());
}
```

And the complementary test that catches a swallowed exception — that the interrupt status
survives:

```java
@Test
void interruptStatusIsRestoredRatherThanSwallowed() {
    Thread.currentThread().interrupt();
    assertThrows(SomeExpectedException.class, () -> service.doWork());
    assertTrue(Thread.currentThread().isInterrupted());   // fails if the code swallowed it
    Thread.interrupted();                                  // clear it for the next test
}
```

## Timeout and its cancellation

```java
@Test
@Timeout(10)
void timeoutReleasesTheCallerAndStopsTheWork() {
    dependency.respondAfter(Duration.ofSeconds(30));       // a controllable fake or WireMock

    assertThrows(TimeoutException.class, () -> client.fetch(id));

    // The half everybody forgets: did the work actually stop?
    await().atMost(Duration.ofSeconds(2))
           .until(() -> dependency.inFlightRequests() == 0);
}
```

Without the second assertion this test passes on a system that leaks an in-flight request per
timeout — which is exactly the system that falls over during the next dependency slowdown.

## The limit at its boundary

```java
@Test
void rejectsWithTheDesignedResponseWhenSaturated() throws Exception {
    // Fill every permit and hold them
    for (int i = 0; i < LIMIT; i++) executor.submit(this::blockUntilReleased);
    awaitAllStarted();

    DependencyOverloadedException e =
            assertThrows(DependencyOverloadedException.class, () -> client.price(sku));

    assertEquals("pricing", e.dependency());
    assertEquals(1, meterRegistry.counter("limit.rejected", "dep", "pricing").count());
}
```

Assert the _designed_ rejection, and assert it was counted. A limit whose rejection path has
never run in a test is a 500 with extra steps.

## A structured scope

```java
@Test
@Timeout(10)
void scopeCancelsSiblingsAndReturnsPromptly() {
    AtomicBoolean siblingStopped = new AtomicBoolean();
    Instant start = Instant.now();

    assertThrows(StructuredTaskScope.FailedException.class, () -> {
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> { throw new IllegalStateException("boom"); });
            scope.fork(() -> {
                try { Thread.sleep(Duration.ofSeconds(30)); }
                catch (InterruptedException e) { siblingStopped.set(true); throw e; }
                return null;
            });
            scope.join();
        }
    });

    assertTrue(siblingStopped.get());
    assertTrue(Duration.between(start, Instant.now()).toSeconds() < 5);   // close did not hang
}
```

The duration assertion is the one that catches an uninterruptible subtask, which is the
failure mode that makes structured concurrency _look_ broken in production.

Requires `--enable-preview` in the test JVM.

## Screening for carrier capture

```java
// Dedicated test class, run with:
//   -Djdk.virtualThreadScheduler.parallelism=1 -Djdk.virtualThreadScheduler.maxPoolSize=1
@Test
@Timeout(30)
void clientDoesNotHoldTheCarrier() throws Exception {
    Instant start = Instant.now();
    try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
        for (int i = 0; i < 20; i++) exec.submit(() -> client.call());   // each ~200 ms
    }
    // Unmounts → about 200 ms. Captures or pins the single carrier → about 4 s.
    assertTrue(Duration.between(start, Instant.now()).toMillis() < 2_000);
}
```

With no compensation available, capture and pinning both serialise, which makes this a cheap
regression test against a dependency upgrade that introduces a native transport.

## Anti-patterns

- `Thread.sleep` anywhere in a test as a synchronisation mechanism
- Asserting on thread names, `getPoolSize()`, or "exactly 8 threads ran"
- `@Disabled("flaky")` on a concurrency test
- A test that catches `InterruptedException` and ignores it — the test now can no longer fail
  for the reason it exists
- Retrying a failed concurrency test automatically in CI
- Shared static mutable state between tests, which makes parallel test execution a race in
  the suite itself
