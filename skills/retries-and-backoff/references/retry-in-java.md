# Retry in Java

## When to retry at all

```text
Retry when:
- the contract classifies the failure transient, and the call can land on a different instance
- faults are independent: a low, uncorrelated failure rate, so the second attempt has
  materially different odds from the first
- the operation is idempotent, or ambiguous outcomes are impossible for it (a pure read)
- the remaining deadline still fits one more attempt plus its backoff

Avoid retrying when:
- the class is permanent, or the dependency answered 429 or 503 with a deliberate Retry-After
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
    long shifted = base.toMillis() << Math.min(attempt, 20);       // guard the shift, not the value
    long window  = Math.min(cap.toMillis(), Math.max(shifted, 1));
    return Duration.ofMillis(ThreadLocalRandom.current().nextLong(window + 1));  // [0, window]
}
```

The draw covers the **whole** window. `base × 2^attempt` with ±10% noise leaves every client on
the same schedule, and is the variant that survives review looking correct.

## Classify on a type, then loop against the deadline and the budget

```java
public sealed interface Outcome<T> {
    record Ok<T>(T value) implements Outcome<T> {}
    record Transient<T>(String code, Duration advisedDelay) implements Outcome<T> {}  // ZERO = none
    record Permanent<T>(String code) implements Outcome<T> {}
    record Ambiguous<T>(String code) implements Outcome<T> {}   // may or may not have been applied
}
```

The adapter speaking HTTP or gRPC is the only place that maps a status onto this type, and
everything above it switches exhaustively — so a fifth class becomes a compile error rather
than a silent fall-through into "retry it".

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

        Duration wait = advised.isPositive()          // Retry-After wins over local backoff
                ? advised : fullJitter(attempt, policy.base(), policy.cap());
        if (deadline.remaining().minus(wait).compareTo(policy.expectedCost()) < 0) {
            throw new CallFailed("deadline-would-be-exceeded");   // do not sleep to fail later
        }
        Thread.sleep(wait);   // on a virtual thread this unmounts the carrier rather than blocking it
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

With the dependency fully down there are no successes, so the bucket empties and retries stop
by themselves. An attempt count cannot do that: under a total outage `maxAttempts(3)` sends
three times the normal load exactly while the dependency is trying to come back.

## Resilience4j and Spring Retry

`RetryConfig` carries `maxAttempts`, an `IntervalFunction` for the schedule,
`retryOnException` / `retryOnResult` predicates, and `failAfterMaxAttempts`.

- **The default usually left wrong:** the wait duration defaults to a _fixed_, unjittered
  interval, so every client retries on the same schedule. Replace it with an interval function
  that grows exponentially with randomisation.
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

- `random = true` is the attribute most often omitted; without it `@Backoff` is a deterministic
  schedule shared by every instance.
- `@Retryable` is proxy-based, so a call through `this` is never intercepted — no retry, no
  warning — and a `@Recover` whose signature does not match the thrown and returned types is
  not selected, surfacing the underlying failure instead of the fallback. Test both paths.
- Check whether the advice sits inside or outside `@Transactional`: inside, the backoff sleeps
  with the transaction and its connection held open.
