# Retry in Java

## When to retry at all

```text
Retry when:
- contract evidence says another attempt can succeed (possibly after delay/state refresh),
  whether or not routing selects a different instance
- faults are independent: a low, uncorrelated failure rate, so the second attempt has
  materially different odds from the first
- the operation is idempotent, or ambiguous outcomes are impossible for it (a pure read)
- the remaining deadline still fits one more attempt plus its backoff

Avoid retrying now when:
- the outcome is terminal, or a valid 429/503 `Retry-After` cannot fit the remaining deadline
- the operation is a non-idempotent write and no idempotency key exists
- another layer in the same call path already retries this call
- most attempts are already failing: retries are then a constant multiplier on a bottleneck

Prefer instead when:
- failures are correlated and sustained → a circuit breaker plus a fallback
  (circuit-breakers): retrying a down dependency has zero success probability
- the problem is a slow tail rather than an error → a hedged request to a second replica at
  about p95, cancelled when either returns (tail-latency-analysis)
- the work need not be synchronous → enqueue it, and let the consumer retry on its own budget
```

## Full jitter, computed correctly

```java
static Duration fullJitter(int attempt, Duration base, Duration cap) {
    if (attempt < 0 || base.isNegative() || base.isZero()
            || cap.isNegative() || cap.isZero()) {
        throw new IllegalArgumentException("positive base/cap and non-negative attempt required");
    }
    long baseMs = Math.max(1, base.toMillis());
    long capMs = Math.max(1, cap.toMillis());
    int shift = Math.min(attempt, 62);
    long exponential = baseMs > (Long.MAX_VALUE >> shift)
            ? Long.MAX_VALUE : baseMs << shift;
    long window = Math.min(capMs, exponential);
    return Duration.ofMillis(ThreadLocalRandom.current().nextLong(window)); // [0, window)
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

```java
// Conceptual: no metrics, no per-endpoint budget scoping.
<T> T execute(Op<T> op, Policy policy, Deadline deadline, boolean idempotent)
        throws InterruptedException {
    for (int attempt = 0; ; attempt++) {
        Outcome<T> outcome = op.call(deadline);
        Duration advised = Duration.ZERO;
        switch (outcome) {
            case Outcome.Ok<T>(T value) -> { budget.recordSuccess(); return value; }
            case Outcome.Permanent<T> p -> throw new CallFailed(p.code());
            case Outcome.Ambiguous<T> a -> {
                if (!idempotent) throw new CallFailed(a.code());  // may already have been applied
            }
            case Outcome.Transient<T> t -> advised = t.advisedDelay();
        }
        if (attempt + 1 >= policy.maxAttempts()) throw new CallFailed("attempts-exhausted");
        if (!budget.tryAcquire())                throw new CallFailed("retry-budget-exhausted");

        Duration local = fullJitter(attempt, policy.base(), policy.cap());
        Duration wait = advised.compareTo(local) > 0 ? advised : local;
        if (deadline.remaining().minus(wait).compareTo(policy.expectedCost()) < 0) {
            throw new CallFailed("deadline-would-be-exceeded");   // do not sleep to fail later
        }
        TimeUnit.NANOSECONDS.sleep(wait.toNanos()); // Java 17 API; virtual threads unmount on Java 21+
    }
}
```

`InterruptedException` propagates deliberately: cancelling the caller must abandon the loop,
not swallow the interrupt and start another attempt.

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

## Resilience4j and Spring Retry

`RetryConfig` carries `maxAttempts`, an `IntervalFunction` for the schedule,
`retryOnException` / `retryOnResult` predicates, and `failAfterMaxAttempts`.

- Inspect library/version defaults; fixed unjittered schedules synchronize clients. Configure
  and test the interval function implementing the intended jitter distribution.
- `retryExceptions(Exception.class)` retries permanent failures too — use an explicit predicate
  over your own retryable property. And the module bounds attempts per call site with no notion
  of retries as a fraction of traffic, so a budget must come from the mesh, the proxy, or code.
- Retry normally sits **outside** the circuit breaker, so that attempts stop as soon as it opens;
  the cost is that the breaker counts every attempt rather than every logical call
  (circuit-breakers has the arithmetic). In the Spring Boot starter the aspect order is a
  configuration property, so read it rather than assuming it matches your intent.

```java
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
