# Deterministic tests

Partial test snippets: supply the enclosing test class, application fixtures and imports from
`java.util`, `java.util.concurrent`, `java.util.concurrent.atomic`, `java.time` and JUnit Jupiter. Awaitility
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
which must come from the contract or an explicitly calibrated test budget. It does not prove a
two-second production bound. `Thread.sleep(2000)` alone cannot establish that the effect happened.
Keep coordination outside accesses whose missing ordering is under test: a latch between a
payload write and read can add the very happens-before edge the product lacks.

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
    CountDownLatch entered = worker.holdAtInterruptibleOperation();
    AtomicBoolean finished = new AtomicBoolean();
    AtomicReference<Throwable> workerFailure = new AtomicReference<>();

    Thread t = Thread.ofVirtual().uncaughtExceptionHandler((thread, error) ->
            workerFailure.set(error)).start(() -> {
        try {
            worker.runUntilInterrupted();
        } finally {
            finished.set(true);
        }
    });

    assertAll("interruption and teardown",
        () -> {
            try {
                assertTrue(entered.await(2, SECONDS));
                t.interrupt();
                assertTrue(t.join(Duration.ofSeconds(2)));
                assertNull(workerFailure.get(), "unexpected worker failure");
                assertTrue(finished.get());
                worker.assertInterruptionObserved();
            } finally {
                worker.abortForTeardown(); // independent, bounded, nonthrowing fixture release
                t.interrupt();
            }
        },
        () -> assertTrue(t.join(Duration.ofSeconds(2)), "worker survived teardown"));
}
```

The fixture signals entry to the targeted operation, not merely thread startup. A checkpoint
before a blocking call also permits interrupt-before-block; testing an already blocked provider
needs provider-specific evidence. Joining a thread proves termination, not successful handling:
uncaught assertions and exceptions must reach the test. This worker's terminal contract handles
interruption and returns normally; assert a different expected outcome when its API propagates it.
The separate teardown assertion preserves the original failure through JUnit's `assertAll`;
an assertion thrown from `finally` would replace it. Aggregation handles ordinary test failures,
not recovery from fatal VM errors.

For a boundary whose contract translates interruption to an unchecked exception while preserving
the caller's status, test that specific policy:

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

Run this on an isolated test thread with a known initial status; clearing belongs to that fixture's
cleanup. A terminal owner may deliberately consume interruption, so restoration is not universal.

## Timeout and its cancellation

This example requires a client whose contract stops a dispatched operation on timeout; its
configured deadline fits within the five-second Future wait. The held dependency is below the real
timeout mechanism. When an injectable clock/timer exists, advance it after dispatch to avoid a
race between slow test setup and expiry. For accepted durable jobs or a provider that cannot stop,
assert the documented residual-work ownership/budget and recovery instead of inventing cancellation.

```java
@Test
@Timeout(10)
void timeoutReleasesTheCallerAndStopsTheWork() throws Exception {
    CountDownLatch entered = dependency.holdNextRequest(); // records actual dispatch
    Future<?> call = executor.submit(() -> client.fetch(id));
    try {
        assertTrue(entered.await(2, SECONDS));             // positive execution control
        ExecutionException failure = assertThrows(ExecutionException.class,
                () -> call.get(5, SECONDS));              // harness timeout must fail too
        assertInstanceOf(TimeoutException.class, failure.getCause());
        dependency.assertOperationTerminatesWithin(Duration.ofSeconds(2));
        assertEquals(0, dependency.inFlightRequests());
    } finally {
        dependency.releaseOrAbortHeldRequest();           // independent of client timeout
        call.cancel(true);
    }
}
```

For this client's stop contract, the observed operation-termination and resource assertions
detect residual work after timeout. The caller outcome alone cannot verify cleanup.

## The limit at its boundary

```java
@Test
void rejectsWithTheDesignedResponseWhenSaturated() throws Exception {
    int before = limiter.availablePermits();
    assertEquals(LIMIT, before);                          // isolated, initially idle limiter
    var rejected = meterRegistry.counter("limit.rejected", "dep", "pricing");
    double rejectedBefore = rejected.count();
    CountDownLatch acquired = dependency.holdCallsAfterPermitAcquisition(LIMIT);
    List<Future<?>> holders = new ArrayList<>();
    assertAll("rejection and holder completion",
        () -> {
            try {
                for (int i = 0; i < LIMIT; i++) holders.add(executor.submit(() -> client.price(sku)));
                assertTrue(acquired.await(2, SECONDS));   // real permits, not just task starts
                assertEquals(0, limiter.availablePermits());
                DependencyOverloadedException e =
                        assertThrows(DependencyOverloadedException.class, () -> client.price(sku));
                assertEquals("pricing", e.dependency());
                assertEquals(rejectedBefore + 1, rejected.count());
            } finally {
                dependency.releaseAllHeldCalls();         // bounded, nonthrowing fixture release
            }
        },
        () -> {                                         // also runs when rejection assertions fail
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            assertAll("holder outcomes", holders.stream().map(task -> () ->
                    task.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS)));
        });
    assertEquals(before, limiter.availablePermits());
}
```

The enclosing fixture still owns bounded executor teardown, including when a worker does not
terminate after release. Preserve the original assertion alongside any cleanup failure in its
test report. Assert the _designed_ rejection, and assert it was counted. A limit whose rejection path has
never run in a test is a 500 with extra steps.

## A structured scope

```java
@Test
@Timeout(10)
void scopeCancelsSiblingsAndReturnsPromptly() {
    AtomicBoolean siblingStopped = new AtomicBoolean();
    CountDownLatch siblingEntered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    IllegalStateException expectedFailure = new IllegalStateException("boom");
    long start = System.nanoTime();

    var failure = assertThrows(StructuredTaskScope.FailedException.class, () -> {
        try (var scope = StructuredTaskScope.open()) {
            scope.fork(() -> {
                siblingEntered.countDown();
                try { release.await(); }
                catch (InterruptedException e) { siblingStopped.set(true); throw e; }
                return null;
            });
            scope.fork(() -> {
                if (!siblingEntered.await(2, SECONDS)) throw new AssertionError("sibling absent");
                throw expectedFailure;
            });
            scope.join();
        } finally {
            release.countDown();
        }
    });

    assertSame(expectedFailure, failure.getCause());
    assertTrue(siblingStopped.get());
    assertTrue(System.nanoTime() - start < TimeUnit.SECONDS.toNanos(5));
}
```

The sibling-entry handshake prevents failure cancelling the scope before that sibling starts.
Checking the cause ensures an unintended fixture or sibling failure cannot satisfy the oracle.
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
    assertAll("client calls and teardown",
        () -> {
            try {
                for (int i = 0; i < 20; i++) tasks.add(exec.submit(() -> client.call()));
                long deadline = start + TimeUnit.SECONDS.toNanos(10);
                assertAll("call outcomes", tasks.stream().map(task -> () ->
                        task.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS)));
            } finally {
                client.abortForTeardown(); // bounded, nonthrowing fixture release
                tasks.forEach(task -> task.cancel(true));
                exec.shutdownNow();
            }
        },
        () -> assertTrue(exec.awaitTermination(2, SECONDS), "executor survived teardown"));
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

## Sources

- [JUnit 5.11.4 grouped assertions](<https://docs.junit.org/5.11.4/api/org.junit.jupiter.api/org/junit/jupiter/api/Assertions.html#assertAll(java.lang.String,java.util.stream.Stream)>) — ordinary failures are aggregated while remaining assertions run
- [JLS 25 try-finally completion](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.20.2) — abrupt cleanup can discard the original failure
- [Java 25 StructuredTaskScope](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html) — default joiner, failure cause and closing behavior; preview API
- [Java 25 Thread termination and uncaught exceptions](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Thread.html)
- [Java 25 Future result, failure and cancellation contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html)
- [Java 25 CountDownLatch memory effects](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CountDownLatch.html)
