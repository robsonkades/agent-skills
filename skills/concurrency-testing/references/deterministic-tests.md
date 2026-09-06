# Deterministic tests

Partial test snippets: supply the enclosing test class, application fixtures and imports from
`java.util.concurrent`, `java.util.concurrent.atomic`, `java.time` and JUnit Jupiter. Awaitility
examples require the project's existing Awaitility dependency. Ordinary virtual-thread examples
require Java 21+; the structured-scope section specifically requires Java 25 preview.
Every blocking fixture needs independent release/abort in teardown, including assertion failures.
`@Timeout` requests termination according to its thread mode; it cannot forcibly stop a task,
and `ExecutorService.close()` can still wait indefinitely. Use an external process deadline for
deliberately uncooperative cases.

## Inject the executor, then most tests stop being concurrent

```java
class OrderService {
    private final Executor executor;                      // injected, not created
    OrderService(Executor executor) { this.executor = executor; }
}

// Unit test: no scheduling, no timing, no flakiness
new OrderService(Runnable::run);

// Concurrency test: the real thing, only where concurrency is the subject
// Retain the executor in the fixture and shut it down in bounded teardown.
ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
new OrderService(workers);
```

An internally created executor makes controlled execution and cleanup harder. Prefer injection
where useful, while testing the real asynchronous boundary separately: a direct executor can
hide races, reentrancy differences and thread-local propagation defects.

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

try {
    assertTrue(started.await(2, SECONDS)); // reached this checkpoint, not necessarily await()
    // … do the thing under test while it is in flight …
} finally {
    release.countDown();
}
f.get(2, SECONDS);                        // expose worker failure, not just start
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
@Timeout(10)                                          // supplement bounded waits/teardown
void cancellationReleasesThePermit() throws Exception {
    int before = limiter.availablePermits();
    // Fixture signals only AFTER the real limiter has acquired its permit and entered I/O.
    CountDownLatch acquired = client.holdNextCallAfterPermitAcquisition();

    Future<?> f = executor.submit(() -> {
        return client.slowCall();                     // blocked in an interruptible call
    });
    try {
        assertTrue(acquired.await(2, SECONDS));
        assertEquals(before - 1, limiter.availablePermits()); // positive acquisition control
        assertTrue(f.cancel(true));
        await().atMost(Duration.ofSeconds(2))
               .until(() -> limiter.availablePermits() == before);
        client.assertOperationTerminatesWithin(Duration.ofSeconds(2)); // physical work signal
    } finally {
        client.releaseOrAbortHeldCall(); // independent teardown even when cancel fails
        f.cancel(true);
    }
}
```

Write the same test for each scarce resource on the path: the connection, the permit, the
file handle, the downstream request. A successful `cancel()` assertion is useful setup evidence,
but never substitutes for observed termination and release.

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

    try {
        assertTrue(started.await(2, SECONDS));
        t.interrupt();
        assertTrue(t.join(Duration.ofSeconds(2)));
        assertTrue(finished.get());
    } finally {
        worker.abortForTeardown(); // independent fixture release, bounded and nonthrowing
        t.interrupt();
        assertTrue(t.join(Duration.ofSeconds(2)));
    }
}
```

And the complementary test that catches a swallowed exception — that the interrupt status
survives:

```java
@Test
void interruptStatusIsRestoredRatherThanSwallowed() {
    try {
        Thread.currentThread().interrupt();
        assertThrows(SomeExpectedException.class, () -> service.doWork());
        assertTrue(Thread.currentThread().isInterrupted());
    } finally {
        Thread.interrupted(); // clear even when an assertion fails; isolated test thread
    }
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
    CountDownLatch siblingEntered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    long start = System.nanoTime();

    assertThrows(StructuredTaskScope.FailedException.class, () -> {
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> {
                siblingEntered.countDown();
                try { release.await(); }
                catch (InterruptedException e) { siblingStopped.set(true); throw e; }
                return null;
            });
            scope.fork(() -> {
                if (!siblingEntered.await(2, SECONDS)) throw new AssertionError("sibling absent");
                throw new IllegalStateException("boom");
            });
            scope.join();
        } finally {
            release.countDown();
        }
    });

    assertTrue(siblingStopped.get());
    assertTrue(System.nanoTime() - start < TimeUnit.SECONDS.toNanos(5));
}
```

The sibling-entry handshake prevents failure cancelling the scope before that sibling starts.
The elapsed assertion only runs after `close()` returns; it cannot rescue a hang in close.
This example's latch wait is interruptible. Test an uninterruptible provider in a forked
process with an external deadline and an independent abort path.

Requires JDK 25 `javac --enable-preview --release 25` and `java --enable-preview`.

## Screening for carrier capture

```java
// Dedicated test class, run with:
//   -Djdk.virtualThreadScheduler.parallelism=1 -Djdk.virtualThreadScheduler.maxPoolSize=1
@Test
@Timeout(30)
void clientDoesNotHoldTheCarrier() throws Exception {
    long start = System.nanoTime();
    var exec = Executors.newVirtualThreadPerTaskExecutor();
    List<Future<?>> tasks = new ArrayList<>();
    try {
        for (int i = 0; i < 20; i++) tasks.add(exec.submit(() -> client.call()));
        long deadline = start + TimeUnit.SECONDS.toNanos(10);
        for (Future<?> task : tasks) {
            task.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        }
    } finally {
        client.abortForTeardown();
        tasks.forEach(task -> task.cancel(true));
        exec.shutdownNow();
        assertTrue(exec.awaitTermination(2, SECONDS));
    }
    assertTrue(System.nanoTime() - start < allowedElapsedNanos); // calibrated fixture bound
}
```

Run in a separate JVM so scheduler properties take effect before scheduler initialization.
Use a controlled dependency and a known unmounting positive control; account for CPU quota,
client connection limits and service latency before attributing serialization to carrier capture.
Elapsed time is a screening signal, not proof of pinning. Corroborate with JFR/stacks; JDK 24+
removed monitor-induced pinning, while native/foreign behavior remains version-sensitive.

## Anti-patterns

- `Thread.sleep` anywhere in a test as a synchronisation mechanism
- Asserting incidental thread names or pool sizes that the API contract does not promise
- `@Disabled("flaky")` on a concurrency test
- A test that catches `InterruptedException` and ignores it — the test now can no longer fail
  for the reason it exists
- Retrying a failed concurrency test automatically in CI
- Shared static mutable state between tests, which makes parallel test execution a race in
  the suite itself
