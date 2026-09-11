# Stress, soak and fault injection

Partial JUnit Jupiter snippets with application-owned `Account`, service and resource fixtures;
the virtual-thread executor requires Java 21+. Import the shown Java concurrency/collection
types and existing assertion library. Pin the target build and retain all worker results.

## The stress harness

```java
@RepeatedTest(20)                       // more sampled executions, not exhaustive coverage
@Timeout(30)
void balanceConservesSuccessfulWithdrawalsAfterWorkersFinish() throws Exception {
    Account account = new Account(10_000);
    int threads = 32, opsPerThread = 1_000;

    CyclicBarrier start = new CyclicBarrier(threads);
    AtomicInteger succeeded = new AtomicInteger();
    AtomicInteger refused = new AtomicInteger();

    var exec = Executors.newVirtualThreadPerTaskExecutor();
    List<Future<?>> tasks = new ArrayList<>();
    try {
        for (int t = 0; t < threads; t++) {
            tasks.add(exec.submit(() -> {
                start.await(5, TimeUnit.SECONDS);      // overlap without an unbounded barrier
                for (int i = 0; i < opsPerThread; i++) {
                    if (account.withdraw(10)) succeeded.incrementAndGet();
                    else refused.incrementAndGet();
                }
                return null;
            }));
        }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        for (Future<?> task : tasks) {
            task.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        }
    } finally {
        tasks.forEach(task -> task.cancel(true));
        exec.shutdownNow();
        assertTrue(exec.awaitTermination(2, TimeUnit.SECONDS));
    }

    // Invariants, not schedules:
    assertTrue(account.balance() >= 0);
    assertEquals(10_000 - succeeded.get() * 10, account.balance());       // conservation
    assertEquals(threads * opsPerThread, succeeded.get() + refused.get()); // accounting
}
```

The barrier makes workers eligible together, not simultaneous. Observing every Future exposes
worker assertions/exceptions. The final balance assertions check quiescent conservation; they
do not prove the balance was never negative transiently. For that stronger contract, record
the relevant transitions/history and check it against the operation's specification without
adding synchronization that accidentally fixes the race.

## Choosing the invariant

The invariant is the whole design of the test. Good ones:

| Kind         | Example                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------- |
| Conservation | After physical termination, submissions match disjoint success/failure/cancel/reject outcomes |
| Bound        | `observedConcurrency <= limit` (sampled by the code under test)                               |
| Monotonicity | a sequence number never decreases; a version never goes backwards                             |
| Idempotence  | replaying the same message N times leaves one effect                                          |
| Recovery     | after the run, permits and connections equal their starting values                            |

A sequential model can be a sound oracle when it admits the legal operation orders and required
real-time constraints. Do not demand one arbitrarily chosen serial order when several are legal,
or assert an ordering the API never promised. Quiescent conservation alone does not validate the
entire operation history.

## Varying what the scheduler does

A stress test that always runs the same way finds the same nothing. Vary deliberately:

```text
Thread count      1, 2, cores, 4 × cores        contention shape changes at each
Work size         tiny (maximises contention), realistic
Thread type       platform and virtual           different unmount points
Scheduler         -Djdk.virtualThreadScheduler.parallelism=1 for one run
Machine           CI agents are usually smaller than laptops — that is a feature
```

Use the configuration matrix to explore different contention shapes within a measured CI budget.
Do not assign a coverage multiplier: the harness does not enumerate the reachable schedules.

## What a green stress run is worth

It reports no observed forbidden outcome for those runs, checks, hardware and JDK. Without a
justified sampling/independence model it does not establish a numeric or even uniformly low
probability of missing the defect under another schedule.

For a specific ordering claim — "this field is safely published", "this lock-free queue is
linearisable" — use `jcstress` outcome tests alongside a correctness argument; it samples
executions under stress and classifies observed outcomes, not exhaustively enumerates schedules.
For full operation-history linearizability, use a model/history checker appropriate to the API.
See `java-memory-model` and
`varhandles-and-memory-ordering`; a stress test is not a substitute for it and cannot become
one by running longer.

## Soak: finding leaks

Focused tests can catch individual leaks; soak exposes accumulation across mixed paths. Warm
the workload and caches first, then compare repeated quiescent samples. A request for GC does
not guarantee a full collection or a return to the initial heap size.

```java
@Test
@Timeout(600)
@Tag("soak")                                   // nightly, not on every commit
void nothingLeaksOverTenThousandRequests() {
    int permitsBefore = limiter.availablePermits();
    long heapBefore = retainedHeapAfterObservedCollection(); // warmed, isolated fixture

    for (int i = 0; i < 10_000; i++) {
        try { service.handle(request(i)); } catch (ExpectedFailure ignored) { }
    }

    awaitOwnedWorkTerminationWithinBudget();
    assertEquals(permitsBefore, limiter.availablePermits());          // permit leak
    assertEquals(0, pool.getActiveConnections());                     // connection leak
    assertThat(retainedHeapAfterObservedCollection() - heapBefore)
            .isLessThanOrEqualTo(allowedRetainedGrowthBytes); // justified fixture budget
}
```

Include the failure paths in the loop — most leaks are on the exception path, which is exactly
what a happy-path soak never executes. That single detail is the difference between a soak
test that finds leaks and one that runs for ten minutes and finds nothing.

## Fault injection

Load alone exercises the happy path faster. Faults exercise the paths that decide what happens
in an incident.

| Injected fault               | What it should prove                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| Dependency slow (p99 → 10 s) | caller timeout plus the specified stop or bounded residual-work policy      |
| Dependency failing           | declared failure or fallback outcome, counted with original failure visible |
| Dependency intermittent      | retries are bounded and do not amplify                                      |
| Saturation at the limit      | the designed rejection, with its metric                                     |
| Connection dropped mid-call  | the connection is discarded, not returned poisoned to the pool              |
| Slow consumer                | backpressure or a bounded buffer, not unbounded growth                      |

Toxiproxy, WireMock delays and a controllable fake dependency all work. What matters is that
the fault is injected _below_ the code under test, so the real timeout, retry and limit code
runs — mocking the client under test removes the mechanism being verified.

## CI budgets

An illustrative allocation, not a requirement to add every test category: use the smallest
existing or new checks that cover the material risk within the project's CI budget.

```text
Every commit   deterministic tests + a short stress run (< 60 s total)
Nightly        full stress matrix, soak, fault injection
Pre-release    the above on a machine sized like production
```

Use framework-level timeouts plus bounded waits, teardown and an external deadline for the
test process. A JUnit timeout can interrupt its test thread but cannot force an uncooperative
worker or executor close to finish. Preserve a dump on external timeout before terminating
the isolated process.

## Reading a failure

A stress test that fails once in fifty runs has found something. Before touching the test:

1. Capture the seed, the thread count and the machine — reproduction usually needs all three.
2. Take a thread dump if it hung rather than failed (`concurrency-diagnostics`).
3. Re-run with the same configuration and a higher repeat count to estimate the rate.
4. Only then reason about the interleaving that could produce the observed value.

Increasing a timeout, lowering the thread count or adding a retry moves the failure rate below
the observation threshold. It does not move the bug.

## Sources

- [OpenJDK jcstress: experimental concurrency stress harness](https://github.com/openjdk/jcstress)
- [JUnit 5.11.4 timeouts and thread modes](https://docs.junit.org/5.11.4/user-guide/index.html#writing-tests-declarative-timeouts)
- [Herlihy and Wing: Linearizability](https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf) — legal sequential histories and real-time ordering constraints
