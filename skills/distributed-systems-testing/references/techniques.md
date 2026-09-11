# Techniques, what each checks, and what it costs

| Technique                      | Can check                                                | Cannot establish                               | Cost            |
| ------------------------------ | -------------------------------------------------------- | ---------------------------------------------- | --------------- |
| Unit test with mocks           | branching, mapping, modeled policy/time in one process   | actual remote/store integration                | seconds         |
| Testcontainers integration     | real broker, database and driver behaviour under failure | fleet-scale effects, production data shapes    | tens of seconds |
| Proxy fault injection          | timeout, retry, breaker and fallback paths execute       | that the fault is the one production produces  | minutes         |
| Container kill / process pause | crash-recovery and lease behaviour under a stall         | correlated multi-node failure                  | minutes         |
| Barrier race test              | the concurrent-duplicate case against the real store     | absence of races in general                    | seconds         |
| Property-based order shuffle   | an invariant holds under many orders                     | it holds under all orders                      | seconds         |
| Deterministic simulation       | invariants over explored modeled interleavings           | omitted model behavior or unexplored schedules | a design cost   |
| Chaos experiment               | behavior of the observed cohort under the injected fault | other conditions or general causal proof       | risk            |

Each row is conditional on the actual assertion, injected fault and coverage. Costs are rough
planning categories, not measurements. A finite run does not prove all distributed executions.

## Real infrastructure instead of mocks

A mock returns the failures its author thought of. The ones that cause incidents are the ones
nobody thought of: a rebalance mid-batch, a unique-constraint violation from a concurrent
insert, a lock wait exceeded, a reset after the request bytes were written, a driver that
reconnects and retries under you. A real component permits tests of those behaviors, but provisioning
it does not trigger the fault or establish production fidelity: match relevant versions/configuration
and verify the intended event. Testcontainers is one way to provision that fixture.

```java
@Testcontainers
class OutboxRelayTest {
    @Container
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16");
    // After relays run and restart, every committed event is eventually published.
    // Publish-before-mark crashes may redeliver; the consumer applies each effect once.
}
```

Reuse a container where state isolation/reset is reliable. Observe durable outcomes and any
meaningful interaction budget; final state alone can hide repeated remote effects or extra attempts.

## Injecting latency, resets and partitions

A proxy between the application and the dependency lets a test add delay, cut connections or
sever the route. Toxiproxy is the usual one, and Testcontainers ships a `ToxiproxyContainer`
that runs it on the test network: the application is pointed at the proxy rather than the
dependency, and the test enables a _toxic_ — latency, limited bandwidth, a connection cut — in
the upstream or downstream direction. The API for adding toxics has changed between
Testcontainers versions; check it against the version in your build rather than copying a
snippet.

What to assert, in order:

1. **The injection took effect** — call duration rose, or the error was actually raised.
2. The behaviour under test: the timeout fired, the breaker opened, the fallback ran.
3. The invariant: no duplicate side effect, no lost message, a legal final state.

The same shape works with a stub HTTP server for status codes, and with the container's own
lifecycle for hard failures: Docker stop normally sends a graceful signal before a forced
kill after its timeout. Use an explicit hard kill to test missing shutdown hooks; pause/resume
tests a stalled holder. Rehearse cleanup for the specific platform.

## The barrier race

A sequential loop proves the code can run twice. A race needs the copies to be in flight
simultaneously, against the real shared store.

```java
int threads = 16;
var barrier = new CyclicBarrier(threads);
var outcomes = new ConcurrentLinkedQueue<String>();

var pool = Executors.newFixedThreadPool(threads);
var futures = new ArrayList<Future<?>>();
try {
    for (int i = 0; i < threads; i++) {
        futures.add(pool.submit(() -> {
            barrier.await(5, TimeUnit.SECONDS); // released together
            outcomes.add(service.charge(ORDER_ID, IDEMPOTENCY_KEY));
            return null;
        }));
    }
    for (Future<?> future : futures) future.get(5, TimeUnit.SECONDS);
} finally {
    for (Future<?> future : futures) future.cancel(true);
    pool.shutdownNow();
    assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
}

assertEquals(1, payments.countByIdempotencyKey(IDEMPOTENCY_KEY)); // the invariant
assertEquals(threads, outcomes.size());                          // no silent failed callers
assertEquals(1, Set.copyOf(outcomes).size());                     // all callers saw one answer
```

Repeat it — `@RepeatedTest`, or a loop with a fresh key — because one run samples one
interleaving. The in-JVM patterns behind this are `concurrency-testing`; what matters here is
that the contended resource is the real store, since that is where check-then-act usually lives.
The fragment uses JDK concurrency imports, fixture services and JUnit assertions; its enclosing
method propagates checked exceptions. Each wait is bounded, not one total deadline for all waits.
Configure bounded database/client waits and a forked test watchdog for uncooperative work.
If the contract permits an in-progress/conflict response to duplicates, assert that explicit
contract instead of requiring every caller to receive an identical successful result.

## Property-based order shuffling

For any handler whose input order is not guaranteed, the property is "the final state is the
same whatever the order" — or "the final state is one of these legal states".

```java
// Conceptual: a seeded shuffle makes a failure reproducible.
var events = List.of(created, priced, discounted, confirmed);
for (long seed = 0; seed < 200; seed++) {
    var shuffled = new ArrayList<>(events);
    Collections.shuffle(shuffled, new Random(seed));
    var state = replay(shuffled);
    assertEquals(EXPECTED, state, "failed with seed " + seed);
}
```

Retain the seed, generated input and trace. A seed reproduces only the randomness and scheduling
the harness controls. A property-based library can generate and shrink cases when that capability
is useful; a small fixed set may already cover the relevant ordering contract.

## Controlling time

Inject `java.time.Clock` wherever the component reads the current instant, and advance it in
the test. `Clock.fixed` pins an instant and `Clock.offset(base, duration)` moves it; for code
observing several instants, a small mutable test clock is clearer than either.

```java
final class TestClock extends Clock {
    private final java.util.concurrent.atomic.AtomicReference<Instant> now;
    private final ZoneId zone;
    TestClock(Instant start) {
        this(new java.util.concurrent.atomic.AtomicReference<>(java.util.Objects.requireNonNull(start)), ZoneOffset.UTC);
    }
    private TestClock(java.util.concurrent.atomic.AtomicReference<Instant> now, ZoneId zone) {
        this.now = now;
        this.zone = java.util.Objects.requireNonNull(zone);
    }
    void advance(Duration d) { now.updateAndGet(value -> value.plus(d)); }
    @Override public Instant instant() { return now.get(); }
    @Override public ZoneId getZone() { return zone; }
    @Override public Clock withZone(ZoneId zone) { return new TestClock(now, zone); }
}
```

This complete helper needs `java.time.*` imports; zone views share the advancing instant and
updates are atomic. It controls consumers that actually use this Clock. It does not advance
`System.nanoTime`, scheduled executors, sleeps or a resilience library's separate ticker.
Those need their own time/scheduler seam. It also does **not**
control a TTL enforced by an external store — Redis expiry, a broker's visibility timeout, a
database's lock timeout — which stays real time; those need a very short configured value, or
the state driven directly for a model-level check. Direct state mutation does not validate the
store's real expiry mechanism; shortened values also change the tested timing conditions.

## Sources

- [Clock contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Clock.html) — zone views and thread safety.
- [Docker stop](https://docs.docker.com/reference/cli/docker/container/stop/) — graceful signal and timeout before forced termination.
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) — relay redelivery and idempotent consumers.
