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

    Instant start = Instant.now();
    assertThatThrownBy(() -> gateway.fetch("42"))
            .isInstanceOf(GatewayTimeoutException.class);

    assertThat(Duration.between(start, Instant.now()))
            .isLessThan(Duration.ofSeconds(3));                 // the assertion that matters
}
```

Without the duration assertion the test passes with a 60-second timeout, which is the
configuration that causes the outage.

**Test both timeouts.** A connect timeout governs reaching the host; a read timeout governs
waiting for the response. A blackholed address (a routable IP that never answers, e.g. in a
`TEST-NET` range) exercises the connect timeout; the delayed stub above exercises the read
timeout. Systems commonly configure one and leave the other at the library's default, which
is frequently infinite (`timeouts-and-deadlines`).

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

Before testing behaviour, check the arithmetic — a large share of configured breakers cannot
open:

```text
Breaker opens after:      10 consecutive failures
Each failure takes:       the read timeout, 5 s
Time to open:             50 s
Caller's own timeout:     10 s

→ the caller gives up at 10 s, every time. The breaker never opens,
  and its metrics show it as permanently closed and healthy.
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

    try (var scope = Executors.newVirtualThreadPerTaskExecutor()) {
        var barrier = new CyclicBarrier(2);
        Runnable deliver = () -> { await(barrier); consumer.handle(message); };
        scope.submit(deliver);
        scope.submit(deliver);
    }

    assertThat(orders.findAll()).hasSize(1);
}
```

The sequential test passes with a `SELECT`-then-`INSERT` check. The concurrent one fails
unless a unique constraint or an upsert enforces it — and the concurrent case is what a
consumer group rebalance produces in production (`idempotency`, `delivery-semantics`).

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
shutdown hooks. Use a real container and stop it without grace. This is the test that proves
an outbox works, and the test that finds an "idempotent" consumer that only deduplicates
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

Everything above is deterministic: a fixed fault, at a fixed point, with a fixed assertion.
That is what makes it a regression test rather than an experiment, and it is why these belong
in CI while randomised chaos does not.

Randomised and exploratory fault injection has its place — it finds the combination nobody
thought to write down — but its output is a _finding_, and the finding's value is realised by
turning it into one of the deterministic tests above (`references/chaos-experiments.md`).
