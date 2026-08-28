# Stress, soak and fault injection

## The stress harness

```java
@RepeatedTest(20)                       // one run proves very little; twenty proves a bit more
@Timeout(30)
void balanceIsNeverNegativeUnderConcurrentWithdrawals() throws Exception {
    Account account = new Account(10_000);
    int threads = 32, opsPerThread = 1_000;

    CyclicBarrier start = new CyclicBarrier(threads);
    AtomicInteger succeeded = new AtomicInteger();
    AtomicInteger refused = new AtomicInteger();

    try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
        for (int t = 0; t < threads; t++) {
            exec.submit(() -> {
                start.await();                        // maximise overlap
                for (int i = 0; i < opsPerThread; i++) {
                    if (account.withdraw(10)) succeeded.incrementAndGet();
                    else refused.incrementAndGet();
                }
                return null;
            });
        }
    }                                                 // close() waits for all of them

    // Invariants, not schedules:
    assertTrue(account.balance() >= 0);
    assertEquals(10_000 - succeeded.get() * 10, account.balance());       // conservation
    assertEquals(threads * opsPerThread, succeeded.get() + refused.get()); // accounting
}
```

Three properties make this a test rather than a load generator: every thread starts at the
same moment, the assertions are conservation laws that must hold under every interleaving, and
it repeats.

## Choosing the invariant

The invariant is the whole design of the test. Good ones:

| Kind         | Example                                                            |
| ------------ | ------------------------------------------------------------------ |
| Conservation | `submitted == completed + failed + rejected`                       |
| Bound        | `observedConcurrency <= limit` (sampled by the code under test)    |
| Monotonicity | a sequence number never decreases; a version never goes backwards  |
| Idempotence  | replaying the same message N times leaves one effect               |
| Recovery     | after the run, permits and connections equal their starting values |

Bad ones: "the result equals what one thread would produce" for genuinely concurrent
operations, anything about ordering that the design does not actually promise, and anything
whose expected value depends on how the scheduler ran.

## Varying what the scheduler does

A stress test that always runs the same way finds the same nothing. Vary deliberately:

```text
Thread count      1, 2, cores, 4 × cores        contention shape changes at each
Work size         tiny (maximises contention), realistic
Thread type       platform and virtual           different unmount points
Scheduler         -Djdk.virtualThreadScheduler.parallelism=1 for one run
Machine           CI agents are usually smaller than laptops — that is a feature
```

Running one configuration in CI and a different one nightly costs nothing and roughly doubles
the interleaving coverage.

## What a green stress run is worth

It is evidence that the bug, if present, has a low per-run probability at this thread count,
on this hardware, with this JDK. That is genuinely useful and it is not proof.

For a specific ordering claim — "this field is safely published", "this lock-free queue is
linearisable" — the right tool is `jcstress`, which enumerates interleavings and classifies
outcomes as acceptable, forbidden or interesting. See `java-memory-model` and
`varhandles-and-memory-ordering`; a stress test is not a substitute for it and cannot become
one by running longer.

## Soak: finding leaks

Leaks are invisible to unit tests by construction — they need iterations and time.

```java
@Test
@Timeout(600)
@Tag("soak")                                   // nightly, not on every commit
void nothingLeaksOverTenThousandRequests() {
    int permitsBefore = limiter.availablePermits();
    long heapBefore = usedHeapAfterFullGc();

    for (int i = 0; i < 10_000; i++) {
        try { service.handle(request(i)); } catch (ExpectedFailure ignored) { }
    }

    assertEquals(permitsBefore, limiter.availablePermits());          // permit leak
    assertEquals(0, pool.getActiveConnections());                     // connection leak
    assertThat(usedHeapAfterFullGc()).isLessThan(heapBefore * 1.1);   // retention
}
```

Include the failure paths in the loop — most leaks are on the exception path, which is exactly
what a happy-path soak never executes. That single detail is the difference between a soak
test that finds leaks and one that runs for ten minutes and finds nothing.

## Fault injection

Load alone exercises the happy path faster. Faults exercise the paths that decide what happens
in an incident.

| Injected fault               | What it should prove                                           |
| ---------------------------- | -------------------------------------------------------------- |
| Dependency slow (p99 → 10 s) | the timeout fires, the caller is released, the work is stopped |
| Dependency failing           | the fallback runs, is counted, and is not silent               |
| Dependency intermittent      | retries are bounded and do not amplify                         |
| Saturation at the limit      | the designed rejection, with its metric                        |
| Connection dropped mid-call  | the connection is discarded, not returned poisoned to the pool |
| Slow consumer                | backpressure or a bounded buffer, not unbounded growth         |

Toxiproxy, WireMock delays and a controllable fake dependency all work. What matters is that
the fault is injected _below_ the code under test, so the real timeout, retry and limit code
runs — mocking the client under test removes the mechanism being verified.

## CI budgets

```text
Every commit   deterministic tests + a short stress run (< 60 s total)
Nightly        full stress matrix, soak, fault injection
Pre-release    the above on a machine sized like production
```

Every concurrency test needs a `@Timeout`. Without it, the first deadlock you write blocks a
CI agent until someone notices, and the failure mode of the test suite becomes indistinguishable
from an infrastructure problem.

## Reading a failure

A stress test that fails once in fifty runs has found something. Before touching the test:

1. Capture the seed, the thread count and the machine — reproduction usually needs all three.
2. Take a thread dump if it hung rather than failed (`concurrency-diagnostics`).
3. Re-run with the same configuration and a higher repeat count to estimate the rate.
4. Only then reason about the interleaving that could produce the observed value.

Increasing a timeout, lowering the thread count or adding a retry moves the failure rate below
the observation threshold. It does not move the bug.
