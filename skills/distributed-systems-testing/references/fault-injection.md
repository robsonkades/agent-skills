# Injecting Failure in a Java System

## The tooling ladder

Each rung produces failures the rung below cannot, and costs more to run. Start at the top and
descend only when the claim genuinely requires it.

| Level                           | Produces                                                            | Cannot produce                                 | Cost            |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | --------------- |
| Pure policy unit test           | Every classification and state transition                           | Anything involving a socket                    | Microseconds    |
| Stub HTTP server                | Delays, error codes, malformed bodies, connection reset             | TCP-level faults, partitions, bandwidth limits | Milliseconds    |
| TCP proxy between real parties  | Latency, jitter, bandwidth caps, cut connections, one-way blackhole | Node death, scheduler behaviour                | Seconds         |
| Container/pod manipulation      | Process death, restarts, rolling updates, probe failures            | Cross-region partitions                        | Tens of seconds |
| Mesh / platform fault injection | Per-route delays and aborts, partitions between real services       | Nothing above, but needs a real environment    | Minutes         |

The two most valuable rungs are the second and third, and they are the ones usually skipped in
favour of a mock.

**Why a mock is not on this ladder.** A mocked client throwing `SocketTimeoutException` proves
that your `catch` block compiles. It does not exercise the connection pool, the socket
timeout, the read timeout, connection release on failure, or what happens to the thread that
was waiting — which is the entire subject.

## Timeouts

The claim: _a dependency that stops responding causes a bounded failure, within the configured
time._

Use a stub that hangs rather than one that errors, and assert the elapsed time.

```java
@Test
void slowGatewayFailsWithinTheReadTimeout() {
    stub.stubFor(get("/payments/42")
            .willReturn(aResponse().withFixedDelay(30_000)));   // hangs, does not fail

    long start = System.nanoTime();
    assertThatThrownBy(() -> gateway.fetch("42"))
            .isInstanceOf(GatewayTimeoutException.class);

    assertThat(Duration.ofNanos(System.nanoTime() - start))
            .isLessThan(Duration.ofSeconds(3));                 // the assertion that matters
}
```

Without the duration assertion the test passes with a 60-second timeout, which is the
configuration that causes the outage.

**Test both timeouts.** A connect timeout governs reaching the host; a read timeout governs
waiting for response data according to the client contract. Use a controlled DROP rule or
network fixture for a connection blackhole; TEST-NET addresses may be rejected immediately
or routed differently and are not a reliable test. Also distinguish DNS, TLS, pool acquisition,
read-idle and end-to-end deadlines. Verify the delayed request actually reached the stub,
reset its journal between tests, and bound the test process independently of the client timeout.

## Retries and the budget

The claim: _retries are bounded, backed off, and only applied to retryable failures._

Count the calls. This is the assertion that catches an accidental multiplication.

```java
@Test
void permanentFailureIsNotRetried() {
    stub.stubFor(post("/payments").willReturn(aResponse().withStatus(409)));

    assertThatThrownBy(() -> gateway.pay(request))
            .isInstanceOf(DuplicatePaymentException.class);

    stub.verify(exactly(1), postRequestedFor(urlEqualTo("/payments")));
}

@Test
void transientFailureIsRetriedWithinBudget() {
    stub.stubFor(post("/payments").willReturn(aResponse().withStatus(503)));

    assertThatThrownBy(() -> gateway.pay(request));

    stub.verify(exactly(3), postRequestedFor(urlEqualTo("/payments")));
}
```

**Retrying a non-idempotent request is the defect these tests exist to catch.** A retried
`POST /payments` after a timeout may double-charge: the first request might have succeeded and
only the response was lost. The correct design carries an idempotency key; the test asserts
that the retry carries the _same_ key.

```java
@Test
void retriesReuseTheIdempotencyKey() {
    stub.stubFor(post("/payments")
            .inScenario("flaky").whenScenarioStateIs(STARTED)
            .willReturn(aResponse().withStatus(503))
            .willSetStateTo("second"));
    stub.stubFor(post("/payments")
            .inScenario("flaky").whenScenarioStateIs("second")
            .willReturn(okJson("{\"status\":\"OK\"}")));

    gateway.pay(request);

    List<LoggedRequest> sent = stub.findAll(postRequestedFor(urlEqualTo("/payments")));
    assertThat(sent).hasSize(2);
    assertThat(sent.get(0).getHeader("Idempotency-Key"))
            .isNotBlank()
            .isEqualTo(sent.get(1).getHeader("Idempotency-Key"));
}
```

### The budget across hops

Per-service tests cannot see the multiplication. Assert it where the chain is assembled:

```text
Gateway (3 attempts) → Orders (3 attempts) → Payments (3 attempts)
                                        = up to 27 calls to Payments
                                          for one user request
```

Either write an integration test that counts calls at the last hop, or — more practically —
adopt the rule that **only one layer retries**, and add an architecture test that no gateway
below that layer configures a retry policy (`retries-and-backoff`, `cascading-failures`).

## Circuit breakers

Before testing behavior, identify whether the breaker persists across logical calls, which
outcomes count, and its window/minimum-call rules. For example:

```text
Breaker opens after:      10 consecutive failures
Each failure takes:       the read timeout, 5 s
Serial failure time:      about 50 s for ten recorded failures
Caller's own timeout:     10 s

→ one request may finish before the threshold, while a shared breaker
  still accumulates failures from later requests. Ten concurrent 5 s
  failures can reach the threshold in about 5 s, not 50 s.
```

Then test the transitions, using time you control rather than sleeps. A breaker whose state
depends on wall-clock sleeps produces slow, flaky tests; inject a `Clock` or use the library's
test support.

```java
@Test
void breakerOpensAndThenProbes() {
    stub.stubFor(get("/quotes").willReturn(aResponse().withStatus(503)));

    for (int i = 0; i < threshold; i++) {
        assertThatThrownBy(() -> quotes.fetch());
    }
    // Open: the downstream is no longer called at all.
    int callsBeforeOpen = stub.findAll(getRequestedFor(urlEqualTo("/quotes"))).size();
    assertThatThrownBy(() -> quotes.fetch()).isInstanceOf(CircuitOpenException.class);
    stub.verify(exactly(callsBeforeOpen), getRequestedFor(urlEqualTo("/quotes")));

    clock.advance(openDuration.plusSeconds(1));
    stub.stubFor(get("/quotes").willReturn(okJson("{}")));

    assertThat(quotes.fetch()).isNotNull();          // half-open probe succeeded
}
```

The load-bearing assertion is the middle one: **while open, the downstream is not called.** A
breaker that opens but still forwards is a metric, not a protection (`circuit-breakers`).

## Slow-dependency behaviour under load

The single most valuable test in this document, and the rarest. It is the combination that
causes cascading failure: not a failing dependency, and not high load, but **a slow dependency
while under load**.

```text
1. Drive the system at its normal rate.
2. Inject 2 s of latency into ONE dependency (proxy or mesh rule).
3. Watch: thread pool occupancy, connection pool waiters, queue depth,
   the caller's p99, and whether unrelated endpoints degrade.
```

What this finds, and nothing else does:

- Unbounded queues in front of a bounded pool — latency grows without limit while throughput
  collapses (`littles-law-and-queueing`).
- One slow dependency taking down endpoints that never call it, because they share a pool
  (`concurrency-limiting-and-bulkheads`).
- A readiness probe that starts failing because it shares the exhausted pool, so healthy pods
  are removed from the load balancer and the survivors get more traffic
  (`kubernetes-service-lifecycle`).

The last one is the classic self-inflicted outage, and it is only reproducible with latency
plus load together.

## Duplicate delivery

The claim: _the consumer is idempotent._ Test it by delivering twice — sequentially and
concurrently, because they fail differently.

```java
@Test
void duplicateMessageAppliesOnce() {
    Envelope message = orderPlaced("order-1", "msg-1");

    consumer.handle(message);
    consumer.handle(message);                       // exact redelivery

    assertThat(orders.findAll()).hasSize(1);
}

@Test
void concurrentDuplicatesApplyOnce() throws Exception {
    Envelope message = orderPlaced("order-2", "msg-2");

    var scope = Executors.newVirtualThreadPerTaskExecutor();
    List<Future<?>> deliveries = new ArrayList<>();
    try {
        var barrier = new CyclicBarrier(2);
        Callable<Void> deliver = () -> {
            barrier.await(5, TimeUnit.SECONDS);
            consumer.handle(message);
            return null;
        };
        deliveries.add(scope.submit(deliver));
        deliveries.add(scope.submit(deliver));
        for (Future<?> delivery : deliveries) delivery.get(5, TimeUnit.SECONDS);
    } finally {
        for (Future<?> delivery : deliveries) delivery.cancel(true);
        scope.shutdownNow();
        assertThat(scope.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
    }

    assertThat(orders.findAll()).hasSize(1);
}
```

The sequential test can pass with a racy `SELECT`-then-`INSERT`; simultaneous starts increase
exposure but do not force both reads before either write. Use a controlled seam at that race
when needed and verify a deliberately broken implementation is detected. Observe every Future:
one successful insert and one hidden task exception must not count as two successful deliveries.
Validate the expected duplicate response/ack contract and business effects, not just row count.
Bound client I/O as well; a forked test watchdog contains code that ignores interruption.

Run these against the real database. An in-memory one may not enforce the constraint the same
way, which is the entire subject of the test (`architecture-testing`).

## Death mid-flight

The claim: _work is not lost or duplicated if the process dies between the write and the
acknowledgement._

```text
1. Start consuming a message.
2. Let the database write commit.
3. Kill -9 the process before the acknowledgement.
4. Restart. Assert: the message is redelivered AND the effect is
   applied exactly once.
```

This cannot be simulated with a mock, because the point is that the JVM does not run its
shutdown hooks. Use an explicit hard-kill in an isolated container. This tests consumer crash
recovery; an outbox additionally needs producer commit and relay publish/mark crash tests.
It can find an "idempotent" consumer that only deduplicates
in-memory (`distributed-transactions-and-sagas`).

A related pair worth running on the same harness:

- **Graceful shutdown**: does `SIGTERM` drain in-flight requests before the pod exits, and is
  the grace period longer than the longest request?
- **Startup**: does the instance accept traffic before its dependencies and caches are ready?

## Partitions

A partition is not "the dependency is down". Both sides are alive and each believes the other
has failed — which is what produces two leaders, two holders of the same lock, and divergent
state.

Application-level stubs cannot produce this; it needs a fault at the network level between two
real instances. What to assert:

- **Lock and lease behaviour** — after a lease expires on one side, does the other acquire it,
  and does the first stop acting when it cannot renew? A holder that keeps working after
  losing its lease is the defect (`distributed-locks-and-leases`).
- **Leader election** — exactly one leader after the partition heals, and no writes accepted
  by the demoted one (`leader-election`).
- **Client-visible consistency** — what a reader sees on the minority side
  (`consistency-models`).

## A note on determinism

Fixed injection points reduce variation, but real threads and networks still have scheduling
nondeterminism. Use bounded waits, observable synchronization and reproducible traces. Seeded
random tests can belong in CI when cost and cleanup are bounded.

Randomised and exploratory fault injection has its place — it finds the combination nobody
thought to write down — but its output is a _finding_, and the finding's value is realised by
turning it into one of the deterministic tests above (`references/chaos-experiments.md`).

## Source

- [Resilience4j circuit breaker](https://resilience4j.readme.io/docs/circuitbreaker) — shared sliding-window history, minimum recorded calls and concurrent execution; verify the installed library.
