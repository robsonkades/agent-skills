# Techniques, what each proves, and what it costs

| Technique                      | Proves                                                   | Cannot prove                                  | Cost            |
| ------------------------------ | -------------------------------------------------------- | --------------------------------------------- | --------------- |
| Unit test with mocks           | branching, mapping, arithmetic in one process            | concurrency, partial failure, ordering, time  | seconds         |
| Testcontainers integration     | real broker, database and driver behaviour under failure | fleet-scale effects, production data shapes   | tens of seconds |
| Proxy fault injection          | timeout, retry, breaker and fallback paths execute       | that the fault is the one production produces | minutes         |
| Container kill / process pause | crash-recovery and lease behaviour under a stall         | correlated multi-node failure                 | minutes         |
| Barrier race test              | the concurrent-duplicate case against the real store     | absence of races in general                   | seconds         |
| Property-based order shuffle   | an invariant holds under many orders                     | it holds under all orders                     | seconds         |
| Deterministic simulation       | invariants across enumerable interleavings, reproducibly | anything the abstraction did not model        | a design cost   |
| Chaos experiment               | the system behaves as hypothesised in production         | anything, if there was no hypothesis          | risk            |

## Real infrastructure instead of mocks

A mock returns the failures its author thought of. The ones that cause incidents are the ones
nobody thought of: a rebalance mid-batch, a unique-constraint violation from a concurrent
insert, a lock wait exceeded, a reset after the request bytes were written, a driver that
reconnects and retries under you. Testcontainers reproduces these because the component is real.

```java
@Testcontainers
class OutboxRelayTest {
    @Container
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16");
    // Assert the invariant, not the interaction: after two relays run concurrently, each
    // outbox row was published once and the outbox is empty.
}
```

Two rules keep this cheap: share one container per class or suite rather than per test, and
never assert on an interaction where the real store can be queried for the resulting state.

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
lifecycle for hard failures: stopping a container is a crash, pausing it through the Docker
API is a stall — the more interesting of the two.

## The barrier race

A sequential loop proves the code can run twice. A race needs the copies to be in flight
simultaneously, against the real shared store.

```java
int threads = 16;
var barrier = new CyclicBarrier(threads);
var outcomes = new ConcurrentLinkedQueue<String>();

try (var pool = Executors.newFixedThreadPool(threads)) { // ExecutorService is AutoCloseable
    for (int i = 0; i < threads; i++) {
        pool.submit(() -> {
            barrier.await();                    // released together
            outcomes.add(service.charge(ORDER_ID, IDEMPOTENCY_KEY));
            return null;
        });
    }
} // close() waits for termination

assertEquals(1, payments.countByIdempotencyKey(IDEMPOTENCY_KEY)); // the invariant
assertEquals(1, Set.copyOf(outcomes).size());                     // all callers saw one answer
```

Repeat it — `@RepeatedTest`, or a loop with a fresh key — because one run samples one
interleaving. The in-JVM patterns behind this are `concurrency-testing`; what matters here is
that the contended resource is the real store, since that is where check-then-act usually lives.

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

Print the seed in the failure message; without it the failure is not reproducible and the test
is a rumour. A property-based library (jqwik and similar) generates and shrinks these cases,
which earns its cost once the input space is larger than a list of four.

## Controlling time

Inject `java.time.Clock` wherever the component reads the current instant, and advance it in
the test. `Clock.fixed` pins an instant and `Clock.offset(base, duration)` moves it; for code
observing several instants, a small mutable test clock is clearer than either.

```java
final class TestClock extends Clock {
    private Instant now;
    TestClock(Instant start) { this.now = start; }
    void advance(Duration d) { now = now.plus(d); }
    @Override public Instant instant() { return now; }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
}
```

This makes TTL, lease, window and deadline behaviour testable in milliseconds. It does **not**
control a TTL enforced by an external store — Redis expiry, a broker's visibility timeout, a
database's lock timeout — which stays real time; those need a very short configured value, or
the state driven directly.
