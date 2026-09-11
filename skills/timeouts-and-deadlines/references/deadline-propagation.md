# Deadline propagation

## The arithmetic

Without an outer bound, sequential per-hop maxima can add. With A's 5 s request timeout, A may
return at 5 s while B and C continue after abandonment; user latency is 5 s but resource occupancy
can last much longer. Under an honored deadline the same chain reads:

```
A sets budget = 3 s at t0
A→B  sends remaining 3000 ms, times out at min(3000, local max)
B    receives 3000 ms; spends 40 ms locally, reserves 50 ms, sends 2910 ms to C
C    receives 2910 ms; spends 810 ms locally → 2100 ms before its own reserve
C    policy judges remaining chance/value insufficient → refuses, fails fast
```

C refuses because its admission policy judges the chance/value of completion below the cost. The
forwarded budget decreases only when every hop subtracts its own elapsed time/reserve and never
regenerates a default.

Two evidence-based policy inputs carry the design. The **return reserve** is time withheld at each hop
so the response or failure can travel back before the caller gives up, including serialization
and cleanup measured for that boundary. It is not universally one RTT. **Minimum useful budget** comes from the conditional duration distribution,
current queue state, business value, partial-work reuse and cancellation cost—not mechanically
p50.

## Carrying it: duration on the wire, instant in the process

Java 11+ complete helper (`Deadline.java`); integration snippets below remain partial.
The one-year cap is an illustrative arithmetic horizon, not a service timeout recommendation.

```java
import java.time.Duration;
import java.util.Objects;
import java.util.function.LongSupplier;

public final class Deadline {
    private static final Duration MAX_LOCAL_BUDGET = Duration.ofDays(365);
    private final long startedAt;
    private final long budgetNanos;
    private final LongSupplier clock;

    private Deadline(Duration budget, LongSupplier clock) {
        Objects.requireNonNull(budget, "budget");
        if (budget.isNegative()) throw new IllegalArgumentException("negative budget");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.budgetNanos = (budget.compareTo(MAX_LOCAL_BUDGET) > 0
                ? MAX_LOCAL_BUDGET : budget).toNanos();
        this.startedAt = clock.getAsLong();
    }

    public static Deadline in(Duration budget) {
        return new Deadline(budget, System::nanoTime);
    }

    // Test seam: supply a monotonic clock with the same wrap semantics as nanoTime.
    static Deadline in(Duration budget, LongSupplier clock) {
        return new Deadline(budget, clock);
    }

    public Duration remaining() {
        long elapsed = clock.getAsLong() - startedAt;
        // Valid for request lifetimes below 2^63 ns; fail closed on a regressing test clock.
        if (elapsed < 0 || elapsed >= budgetNanos) return Duration.ZERO;
        return Duration.ofNanos(budgetNanos - elapsed);
    }

    public boolean expired() {
        return remaining().isZero();
    }

    public Duration forNextHop(Duration returnReserve) {
        Objects.requireNonNull(returnReserve, "returnReserve");
        if (returnReserve.isNegative()) throw new IllegalArgumentException("negative reserve");
        Duration left = remaining();
        return returnReserve.compareTo(left) >= 0 ? Duration.ZERO : left.minus(returnReserve);
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
    Objects.requireNonNull(localMax, "localMax");
    if (localMax.isNegative()) throw new IllegalArgumentException("negative local maximum");
    if (headerValue == null) {
        return Deadline.in(localMax);          // absent means "no inherited budget", not "unlimited"
    }
    final long ms;
    try {
        ms = Long.parseLong(headerValue);
    } catch (NumberFormatException invalid) {
        throw new BadRequestException("invalid timeout");
    }
    if (ms < 0) throw new BadRequestException("negative timeout");
    Duration inherited = Duration.ofMillis(ms);  // safe for any nonnegative long millis
    return Deadline.in(inherited.compareTo(localMax) > 0 ? localMax : inherited);
}
```

Outbound, with the refuse-to-start check:

```java
// Conceptual: no error mapping, no instrumentation.
<T> T call(Deadline deadline, Duration minimumUsefulBudget, URI uri, ...) throws Exception {
    Duration budget = deadline.forNextHop(RETURN_RESERVE);
    if (minimumUsefulBudget.isNegative()) throw new IllegalArgumentException("negative minimum");
    long wireMillis = budget.toMillis(); // bounded helper result; floor deliberately
    if (wireMillis == 0 || budget.compareTo(minimumUsefulBudget) < 0) {
        throw new DeadlineExceededException(uri, budget);   // never opened a connection
    }
    HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(budget)                                       // the local bound
            .header(DEADLINE_HEADER, Long.toString(wireMillis))  // the inherited one
            .GET().build();
    return send(request);
}
```

This header contract defines zero as expired, not unlimited. Positive sub-millisecond budgets
are refused because they cannot be represented conservatively in whole milliseconds. Validate
units and zero/infinite sentinels for every target API; do not copy this rule blindly to gRPC's
encoding. Refresh the budget after any intervening queue/wait before sending.

The two lines must agree within the documented rounding, but the request knob may not bound body
consumption on the target JDK; the Java timeout surface explains the additional lifetime control.
The header alone does not bound caller wait, and the local timeout alone does not establish a
callee work bound. Inside the process the `Deadline` is per-request state: a `ScopedValue` is final
in JDK 25 (JEP 506) and suits a deeply nested synchronous call tree; an explicit parameter makes
ownership obvious and works across asynchronous messages. `ThreadLocal` does not automatically
follow arbitrary executor/reactive handoffs and must not leak into a reused pooled thread.

Keep budget and elapsed lifetime below 2^63 nanoseconds; subtraction handles signed nanoTime
wrap within that interval. Never serialize local clock readings or retain this request helper
for centuries. Huge reserves return zero by comparison before subtraction, not overflowing.

## When a propagated deadline earns its cost

```text
Use a propagated deadline when:
- the request crosses multiple independently owned hops, or any hop fans out
- the sum of the configured per-hop timeouts already exceeds the caller's SLA
- the callee's unit of work is expensive enough that starting it with 20 ms left is a
  measurable loss of capacity
- the same dependency is called from paths with materially different budgets

An existing fixed policy may be adequate when:
- the graph is one hop deep, its local bounds already fit the caller's budget, and callee work
  has an acceptable bounded lifetime; one-team ownership alone is not a reason to omit propagation

Use a distinct contract when:
- the asynchronous acceptance contract deliberately separates enqueue timeout from job expiry;
  if queued work has a business deadline, carry that separately with its own clock/trust policy
- the header would be trusted unvalidated across an organisational boundary; clamp it to a
  local maximum or do not accept it

When a third-party API cannot accept a deadline header:
- still clip the local call/body/cancellation budget to the caller's remaining time
- document the unbounded or independently bounded remote work; a fixed local maximum can be
  useful for a leaf, but it must not reset a smaller inherited budget
```

## Testing it

- **The arithmetic, without a network.** For sequential policies, assert overflow-safely that
  phase/attempt maxima and backoff are clipped by the budget. Separately bound hedge concurrency.
- **Monotonic shrink.** A two-hop integration test where the middle service records the
  header it received and the header it sent. With controlled time, compute
  `expected = max(0, min(inherited, localMax, helperCap) - localElapsed - reserve)` and apply
  the documented wire rounding. Assert equality to that value, not strict shrink when elapsed
  and reserve are zero. Unknown transit time cannot be subtracted as if observed.
- **Refuse-to-start.** Drive the caller with a deadline shorter than the declared minimum
  useful work and assert the downstream received **zero** requests, not a fast failure.
- **Cancellation, by observation.** With a proxy that holds the response (Testcontainers plus
  a latency or blackhole toxic), let the caller time out and assert the callee's in-flight
  gauge returns to its expected bound within a measured cancellation SLO. If it stays elevated,
  the timeout bounds the wait only. Also inject completion racing expiry and an effect committed
  before a lost response; the outcome then remains unknown. For unit tests, construct
  a fake monotonic clock and advance it through expiry and signed wrap; test negative/huge
  budgets, oversized reserves, local clamps and sub-millisecond wire values.

## Primary references

- [System.nanoTime](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/System.html#nanoTime()>) — local elapsed-time subtraction and overflow horizon.
- [Duration](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Duration.html) — unit conversion and arithmetic overflow.
