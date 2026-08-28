# Deadline propagation

## The arithmetic

A chain of per-hop timeouts is an upper bound nobody chose: three hops at 5 s each is a 15 s
worst case. A gets its failure at 5 s and stops waiting, but B and C never hear about it, so
the work continues underneath. Under a deadline the same chain reads:

```
A sets budget = 3 s at t0
A→B  sends remaining 3000 ms, times out at min(3000, local max)
B    at t0+40 ms has 2960 ms; reserves 50 ms for its reply; sends 2910 ms to C
C    at t0+900 ms has 2100 ms; C's own query costs p50 = 2400 ms → refuses, fails fast
```

C never starts a query it cannot finish. The remaining budget is monotonically decreasing by
construction: each hop can only subtract.

Two measured constants carry the design. The **return reserve** is time withheld at each hop
so the response or the failure can travel back before the caller gives up — one RTT plus
serialisation. **Minimum useful work** is the operation's own p50; below it, starting is a
donation of capacity to a request that will be abandoned.

## Carrying it: duration on the wire, instant in the process

```java
/// A deadline for one request, expressed against THIS process's monotonic clock.
public record Deadline(long atNanos) {

    public static Deadline in(Duration budget) {
        return new Deadline(System.nanoTime() + budget.toNanos());
    }

    /** Remaining budget; zero or negative once spent. */
    public Duration remaining() {
        return Duration.ofNanos(atNanos - System.nanoTime());
    }

    public boolean expired() {                     // Duration.isPositive() since JDK 18
        return !remaining().isPositive();
    }

    /** What the next hop may have: what is left, less the reply reserve. */
    public Duration forNextHop(Duration returnReserve) {
        Duration left = remaining().minus(returnReserve);
        return left.isPositive() ? left : Duration.ZERO;
    }
}
```

An absolute instant on the wire needs the two hosts' wall clocks to agree; a remaining duration
needs no clock agreement and costs one transit-time error term. `grpc-timeout` carries a
duration for this reason, and gRPC exposes the converted deadline through `Context`, so a
server can check it without the application passing anything. Inbound, two rules make it safe:

```java
static final String DEADLINE_HEADER = "X-Request-Timeout-Ms";   // remaining ms, not an instant

static Deadline inherit(String headerValue, Duration localMax) {
    if (headerValue == null) {
        return Deadline.in(localMax);          // absent means "no inherited budget", not "unlimited"
    }
    long ms = Long.parseLong(headerValue);
    return Deadline.in(Duration.ofMillis(Math.min(ms, localMax.toMillis())));  // clamp: a caller
}                                                                              // must not buy an hour
```

Outbound, with the refuse-to-start check:

```java
// Conceptual: no error mapping, no instrumentation.
<T> T call(Deadline deadline, Duration expectedCost, URI uri, ...) throws Exception {
    Duration budget = deadline.forNextHop(RETURN_RESERVE);
    if (budget.compareTo(expectedCost) < 0) {
        throw new DeadlineExceededException(uri, budget);   // never opened a connection
    }
    HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(budget)                                       // the local bound
            .header(DEADLINE_HEADER, Long.toString(budget.toMillis()))  // the inherited one
            .GET().build();
    return send(request);
}
```

The two lines must agree. Setting the header without the request timeout leaves the caller
waiting past its own deadline; setting the timeout without the header leaves the callee
working past it. Inside the process the `Deadline` is per-request state: a `ScopedValue`
(final in JDK 25, JEP 506) suits a deep chain, an explicit parameter is more obvious in a
shallow one, and a plain `ThreadLocal` is the shape that silently loses the value at the
first handoff to another thread.

## When a propagated deadline earns its cost

```text
Use a propagated deadline when:
- the request crosses three or more hops, or any hop fans out to several dependencies
- the sum of the configured per-hop timeouts already exceeds the caller's SLA
- the callee's unit of work is expensive enough that starting it with 20 ms left is a
  measurable loss of capacity
- the same dependency is called from paths with materially different budgets

Avoid a propagated deadline when:
- the graph is one hop deep and one team owns both ends
- the handoff is asynchronous — the deadline then bounds the enqueue, not the work
- the header would be trusted unvalidated across an organisational boundary; clamp it to a
  local maximum or do not accept it

Prefer a fixed per-hop timeout instead when:
- the hop is a leaf with a measured, narrow distribution and no downstream of its own
- the protocol is a third-party API where no header may be added
```

## Testing it

- **The arithmetic, without a network.** Assert over the real configuration that
  `attempts × per-attempt timeout + Σ backoff ≤ budget` for every declared client.
- **Monotonic shrink.** A two-hop integration test where the middle service records the
  header it received and the header it sent. Assert `sent < received` and
  `sent ≥ received − (elapsed + reserve)`. This catches a hop that regenerates the budget
  from its own default instead of inheriting.
- **Refuse-to-start.** Drive the caller with a deadline shorter than the declared minimum
  useful work and assert the downstream received **zero** requests, not a fast failure.
- **Cancellation, by observation.** With a proxy that holds the response (Testcontainers plus
  a latency or blackhole toxic), let the caller time out and assert the callee's in-flight
  gauge returns to zero within one reserve. If it stays elevated, the timeout bounds the wait
  only, and load under failure will exceed load under health. For unit tests, construct
  expiry directly with `new Deadline(System.nanoTime() - 1)`.
