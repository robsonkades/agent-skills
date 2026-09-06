# Retry in Java

## When to retry at all

```text
Retry when:
- contract evidence says another attempt can succeed (possibly after delay/state refresh),
  whether or not routing selects a different instance
- faults are independent: a low, uncorrelated failure rate, so the second attempt has
  materially different odds from the first
- replay is safe for this intent (a pure read can still time out with an unknown response)
- the remaining deadline still fits one more attempt plus its backoff

Avoid retrying now when:
- the outcome is terminal, or a valid 429/503 `Retry-After` cannot fit the remaining deadline
- the operation is a non-idempotent write and no idempotency key exists
- another layer retries without a coordinated total attempt/deadline budget
- most attempts are already failing: retries are then a constant multiplier on a bottleneck

Prefer instead when:
- failures are correlated and sustained → a circuit breaker plus a fallback
  (circuit-breakers): continued attempts can spend capacity without useful recovery odds
- the problem is a slow tail rather than an error → a hedged request to a second replica at
  a measured delay, with replay safety, extra-work budget and loser cleanup; cancellation is
  not proof the loser stopped (tail-latency-analysis)
- the work need not be synchronous → enqueue it, and let the consumer retry on its own budget
```

## Full jitter, computed correctly

Standalone helper: Java 17, imports `java.time.Duration` and
`java.util.concurrent.ThreadLocalRandom`. Durations must fit positive signed nanoseconds.
Attempt zero is the first retry delay. This is full jitter over a discrete half-open window.

```java
static Duration fullJitter(int attempt, Duration base, Duration cap) {
    if (attempt < 0 || base.isNegative() || base.isZero()
            || cap.isNegative() || cap.isZero()) {
        throw new IllegalArgumentException("positive base/cap and non-negative attempt required");
    }
    long baseNanos = base.toNanos(); // ArithmeticException rejects an unrepresentable policy
    long capNanos = cap.toNanos();
    long exponential = attempt >= 63 || baseNanos > (Long.MAX_VALUE >> attempt)
            ? Long.MAX_VALUE : baseNanos << attempt;
    long window = Math.min(capNanos, exponential);
    return Duration.ofNanos(ThreadLocalRandom.current().nextLong(window)); // [0, window)
}
```

The draw covers the **whole** window. `base × 2^attempt` with ±10% noise leaves every client on
the same schedule, and is the variant that survives review looking correct.

## Classify on a type, then loop against the deadline and the budget

```java
// Record patterns in the switch below require Java 21; use instanceof/visitor on Java 17.
public sealed interface Outcome<T> {
    record Ok<T>(T value) implements Outcome<T> {}
    record Transient<T>(String code, Duration advisedDelay) implements Outcome<T> {}  // ZERO = none
    record Permanent<T>(String code) implements Outcome<T> {}
    record Ambiguous<T>(String code) implements Outcome<T> {}   // may or may not have been applied
}
```

The HTTP/gRPC adapter combines transport evidence with the operation contract when mapping to
this type. Everything above switches exhaustively, so a new class becomes a compile error
rather than silently falling through to retry.
`Transient` must certify replay safety, not merely that failure might clear. Validate nonnegative
advice and bounded policy durations/counts before the loop. `Op`, `Policy`, `Deadline`, budget
and exception types below are integration placeholders, not a complete retry library.
The adapter/operation owner records ambiguous state against the stable intent ID before returning
it; a local boolean is not durable storage. `maxAttempts` includes the first call and must be >= 1.

```java
// Conceptual: no metrics, no per-endpoint budget scoping.
<T> T execute(Op<T> op, Policy policy, Deadline deadline, boolean idempotent)
        throws InterruptedException {
    boolean unresolved = false;
    for (int attempt = 0; ; attempt++) {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        Duration remaining = deadline.remaining();
        if (remaining.isNegative() || remaining.isZero()
                || remaining.compareTo(policy.expectedCost()) < 0) {
            throw stopped("deadline-exhausted", unresolved);
        }
        Outcome<T> outcome = op.call(deadline);
        Duration advised = Duration.ZERO;
        switch (outcome) {
            case Outcome.Ok<T>(T value) -> { budget.recordSuccess(); return value; }
            case Outcome.Permanent<T> p -> throw stopped(p.code(), unresolved);
            case Outcome.Ambiguous<T> a -> {
                unresolved = true;
                if (!idempotent) throw stopped(a.code(), true); // pending/unknown, not definite failure
            }
            case Outcome.Transient<T> t -> advised = t.advisedDelay();
        }
        if (attempt + 1 >= policy.maxAttempts()) throw stopped("attempts-exhausted", unresolved);

        Duration local = fullJitter(attempt, policy.base(), policy.cap());
        Duration wait = advised.compareTo(local) > 0 ? advised : local;
        if (deadline.remaining().minus(wait).compareTo(policy.expectedCost()) < 0) {
            throw stopped("deadline-would-be-exceeded", unresolved);
        }
        long waitNanos = wait.toNanos(); // validate conversion before reserving retry budget
        if (!budget.tryAcquire()) throw stopped("retry-budget-exhausted", unresolved);
        TimeUnit.NANOSECONDS.sleep(waitNanos); // Java 17 API; virtual threads unmount on Java 21+
    }
}
```

`InterruptedException` propagates deliberately: cancelling the caller must abandon the loop,
not swallow the interrupt and start another attempt.
`stopped(reason, unresolved)` must preserve a durable unknown outcome when any prior attempt
may have applied. The operation owner must preserve that state on interruption/transport throws
too. The sketch's expected-cost check is admission evidence, not a hard timeout: `op.call` must
apply a per-attempt timeout within the remaining total deadline, with cleanup/response reserve.
Recheck after waking; timer oversleep cannot authorize a late attempt. Deadline implementations
use elapsed `nanoTime` differences (bounded below 2^63 ns), never assume absolute values positive.

Taking `max(localJitter, serverMinimum)` preserves the server minimum but concentrates clients
at it. When synchronization matters, add bounded nonnegative jitter after that minimum, then
recheck the total deadline. Validate `wait.toNanos()` representability before acquiring a token.

## The retry budget

```java
// Conceptual: no time decay, one bucket per dependency.
final class RetryBudget {
    private final double ratio;      // retries permitted per success, e.g. 0.10
    private final double maxTokens;  // burst allowance
    private double tokens;
    synchronized void recordSuccess() { tokens = Math.min(maxTokens, tokens + ratio); }
    synchronized boolean tryAcquire() {
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    }
}
```

With the dependency fully down there are no successes, so after any initial tokens the bucket
empties. In steady state, ratio `r` earns at most roughly `r × successes` retries plus the
configured burst. Define startup tokens, time decay and scope; otherwise a cold client cannot
retry or accumulated burst lands during recovery. Attempt count remains a per-call safety cap,
while the budget limits aggregate retries.
This synchronized bucket is process-local, not fleet-wide. Specify distributed grant/refill
semantics or aggregate the per-instance allowances, including restart bursts. Validate finite
nonnegative ratio/tokens and capacity; NaN must not turn the comparison into unlimited grants.

## Resilience4j and Spring Retry

`RetryConfig` carries `maxAttempts`, an `IntervalFunction` for the schedule,
`retryOnException` / `retryOnResult` predicates, and `failAfterMaxAttempts`.

- Inspect library/version defaults; fixed unjittered schedules synchronize clients. Configure
  and test the interval function implementing the intended jitter distribution.
- `retryExceptions(Exception.class)` retries permanent failures too — use an explicit predicate
  over your own retryable property. And the module bounds attempts per call site with no notion
  of retries as a fraction of traffic, so a budget must come from the mesh, the proxy, or code.
- Verify how predicates, retry-class lists and ignore lists combine in the deployed version;
  do not assume adding a narrow predicate makes a broad class list a whitelist. Test unrelated
  exceptions, interruption, breaker-open and ambiguous writes explicitly.
- Retry normally sits **outside** the circuit breaker, so that attempts stop as soon as it opens;
  the cost is that the breaker counts every attempt rather than every logical call
  (circuit-breakers has the arithmetic). In the Spring Boot starter the aspect order is a
  configuration property, so read it rather than assuming it matches your intent.

```java
// Partial Spring Retry 2.x example (retryFor verified in 2.0.12); stable intent ID/replay safety required.
@Retryable(
    retryFor = TransientDependencyException.class,     // never Exception.class
    maxAttempts = 4,
    backoff = @Backoff(delay = 100, multiplier = 2, maxDelay = 2000, random = true))
public PaymentReceipt authorise(PaymentCommand command) { ... }
```

- `random = true` randomizes Spring Retry's multiplier according to its documented version; do
  not assume it implements AWS-style full jitter. Use a custom policy when distribution
  matters and test sampled bounds rather than annotation presence.
- `@Retryable` is proxy-based, so a call through `this` is never intercepted — no retry, no
  warning — and a `@Recover` whose signature does not match the thrown and returned types is
  not selected, surfacing the underlying failure instead of the fallback. Test both paths.
- Check whether the advice sits inside or outside `@Transactional`: inside, the backoff sleeps
  with the transaction and its connection held open.
  Outside advice still joins an ambient transaction with REQUIRED propagation. Ensure each attempt
  gets the intended fresh transaction/context; inspect callers, proxy invocation and propagation,
  rather than assuming annotation order alone guarantees it.

## Timeout and attempt allocation

Do not give every attempt the entire remaining deadline. Reserve time for backoff, cleanup and
caller response, and choose a per-attempt timeout from latency distribution and endpoint
selection. An attempt that cannot plausibly finish within the remaining time should not start.
Retries after partial request-body/stream transmission need protocol evidence; reconnecting
does not prove the peer failed to apply a write.

## Primary references

- [RFC 9110 §9.2.2: idempotent methods and automatic retry](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)
- [AWS Architecture Blog: exponential backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [gRPC retry design](https://github.com/grpc/proposal/blob/master/A6-client-retries.md)
- [Spring Retry `@Backoff` API](https://docs.spring.io/spring-retry/docs/current/apidocs/org/springframework/retry/annotation/Backoff.html)
- [Spring Retry 2.0.12 `@Retryable`](https://docs.spring.io/spring-retry/docs/2.0.12/apidocs/org/springframework/retry/annotation/Retryable.html)
- [Resilience4j Retry configuration](https://resilience4j.readme.io/docs/retry)
- [Java Duration conversions](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Duration.html)
