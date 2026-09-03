# Deadline propagation

## The arithmetic

Without an outer bound, sequential per-hop maxima can add. With A's 5 s request timeout, A may
return at 5 s while B and C continue after abandonment; user latency is 5 s but resource occupancy
can last much longer. Under an honored deadline the same chain reads:

```
A sets budget = 3 s at t0
A→B  sends remaining 3000 ms, times out at min(3000, local max)
B    at t0+40 ms has 2960 ms; reserves 50 ms for its reply; sends 2910 ms to C
C    at t0+900 ms has 2100 ms; C's own query costs p50 = 2400 ms → refuses, fails fast
```

C refuses because its admission policy judges the chance/value of completion below the cost. The
forwarded budget decreases only when every hop subtracts its own elapsed time/reserve and never
regenerates a default.

Two measured constants carry the design. The **return reserve** is time withheld at each hop
so the response or the failure can travel back before the caller gives up — one RTT plus
serialisation. **Minimum useful budget** comes from the conditional duration distribution,
current queue state, business value, partial-work reuse and cancellation cost—not mechanically
p50.

## Carrying it: duration on the wire, instant in the process

```java
/// A deadline for one request, expressed against THIS process's monotonic clock.
public record Deadline(long atNanos) {
    private static final Duration MAX_LOCAL_BUDGET = Duration.ofDays(365);

    public static Deadline in(Duration budget) {
        if (budget.isNegative() || budget.isZero()) {
            return new Deadline(System.nanoTime());
        }
        Duration capped = budget.compareTo(MAX_LOCAL_BUDGET) > 0
                ? MAX_LOCAL_BUDGET : budget;
        return new Deadline(System.nanoTime() + capped.toNanos());
    }

    /** Remaining budget; zero or negative once spent. */
    public Duration remaining() {
        return Duration.ofNanos(atNanos - System.nanoTime());
    }

    public boolean expired() {
        return atNanos - System.nanoTime() <= 0;
    }

    /** What the next hop may have: what is left, less the reply reserve. */
    public Duration forNextHop(Duration returnReserve) {
        Duration left = remaining().minus(returnReserve);
        return left.isNegative() || left.isZero() ? Duration.ZERO : left;
    }
}
```

An absolute wall-clock instant needs clock agreement. A remaining duration avoids skew, but the
receiver cannot know time spent in transit; each onward caller must subtract locally elapsed time
and reserve. gRPC performs timeout conversion with elapsed time deducted and exposes the local
deadline through `Context`. Inbound, validate and clamp before arithmetic:

```java
static final String DEADLINE_HEADER = "X-Request-Timeout-Ms";   // remaining ms, not an instant

static Deadline inherit(String headerValue, Duration localMax) {
    if (headerValue == null) {
        return Deadline.in(localMax);          // absent means "no inherited budget", not "unlimited"
    }
    final long ms;
    try {
        ms = Long.parseLong(headerValue);
    } catch (NumberFormatException invalid) {
        throw new BadRequestException("invalid timeout");
    }
    if (ms <= 0) return Deadline.in(Duration.ZERO);
    return Deadline.in(Duration.ofMillis(Math.min(ms, localMax.toMillis())));
}
```

Outbound, with the refuse-to-start check:

```java
// Conceptual: no error mapping, no instrumentation.
<T> T call(Deadline deadline, Duration minimumUsefulBudget, URI uri, ...) throws Exception {
    Duration budget = deadline.forNextHop(RETURN_RESERVE);
    if (budget.compareTo(minimumUsefulBudget) < 0) {
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
working past it. Inside the process the `Deadline` is per-request state: a `ScopedValue` is final
in JDK 25 (JEP 506) and suits a deeply nested synchronous call tree; an explicit parameter makes
ownership obvious and works across asynchronous messages. `ThreadLocal` does not automatically
follow arbitrary executor/reactive handoffs and must not leak into a reused pooled thread.

Production code must cap `Duration.toNanos()` conversion to a horizon below half the
`System.nanoTime()` wrap interval and use subtraction-based comparisons. Do not serialize
`atNanos`: it is meaningful only inside the creating JVM.

## When a propagated deadline earns its cost

```text
Use a propagated deadline when:
- the request crosses multiple independently owned hops, or any hop fans out
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

- **The arithmetic, without a network.** For sequential policies, assert overflow-safely that
  phase/attempt maxima and backoff are clipped by the budget. Separately bound hedge concurrency.
- **Monotonic shrink.** A two-hop integration test where the middle service records the
  header it received and the header it sent. Assert `sent < received` and
  `sent ≥ received − (elapsed + reserve)`. This catches a hop that regenerates the budget
  from its own default instead of inheriting.
- **Refuse-to-start.** Drive the caller with a deadline shorter than the declared minimum
  useful work and assert the downstream received **zero** requests, not a fast failure.
- **Cancellation, by observation.** With a proxy that holds the response (Testcontainers plus
  a latency or blackhole toxic), let the caller time out and assert the callee's in-flight
  gauge returns to its expected bound within a measured cancellation SLO. If it stays elevated,
  the timeout bounds the wait only. Also inject completion racing expiry and an effect committed
  before a lost response; the outcome then remains unknown. For unit tests, construct
  expiry directly with `new Deadline(System.nanoTime() - 1)`.
