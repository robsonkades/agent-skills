# Ordering, composition and identity

## Reading a stack

```java
PricingClient client =
    new MetricsPricingClient(metrics,
        new CircuitBreakingPricingClient(breaker,
            new RetryingPricingClient(retryPolicy,
                new TimeoutPricingClient(Duration.ofMillis(300),
                    new HttpPricingClient(restClient)))));
```

Outermost first. `Metrics` sees one logical call; `Timeout` sees one HTTP attempt. Everything
between them multiplies or divides that relationship, and each pairing has a meaning worth
stating explicitly.

## Pairwise semantics

**Timeout and Retry.** Timeout inside retry bounds each attempt: worst case is
`attempts × timeout` plus backoff, which is the number that must fit the caller's budget. Timeout
outside retry bounds the whole operation: attempts stop when the budget is gone, which is usually
what a request-scoped service wants. Doing both — an outer deadline and an inner per-attempt
timeout — is the most robust arrangement and the one to prefer when the transport supports it.

```text
attempts=3, per-attempt timeout=300ms, backoff 100/200ms
    → worst case 1200ms before the caller sees a failure
Caller's own deadline is 800ms
    → the caller gives up at 800ms; the third attempt runs anyway,
      consuming a connection and load for a result nobody reads
```

That last line is the failure mode: work continuing after the caller has left. A deadline
propagated into the stack, rather than a fixed timeout, avoids it (`timeouts-and-deadlines`).

**Retry and Circuit breaker.** Breaker outside retry is the normal arrangement: the breaker
observes complete operations, so its error rate reflects what callers experience, and when it is
open no retries happen at all. Breaker inside retry means every attempt consults the breaker —
when it is open, the retry loop simply fails fast three times in a row, which wastes nothing but
also achieves nothing, and distorts the retry metrics.

**Cache and everything else.** Cache belongs outermost, or just under metrics. A hit then costs
nothing and never touches breaker, retry or transport. Cache below retry means each attempt
re-checks a cache that just missed. The one subtlety: with the cache above metrics, hits become
invisible; with it below, hit latency is counted as call latency. Prefer cache below metrics, and
tag hits.

**Logging.** Wherever it sits, it sees only that layer's view. Logging outermost logs one line
per logical call with the total duration — usually what an operator wants. Logging innermost logs
every attempt, which is what a diagnostician wants. Both is fine; using one name for both is not
(`structured-logging`).

**Bulkhead / concurrency limiter.** Outermost of the resilience layers, above the breaker: it
must bound the number of in-flight logical operations, and if it sits below retry, retries
consume permits that the limit was meant to protect (`concurrency-limiting-and-bulkheads`).

## Retry amplification

Retries at more than one layer multiply.

```text
Client SDK      3 attempts
Gateway         3 attempts
Service mesh    2 attempts
                ─────────────
                18 requests reach the failing dependency per user action
```

A dependency degrading to 50% error rates can receive up to the product of nested attempt limits
precisely when it can least handle it—the standard amplification shape of a retry storm
(`cascading-failures`). Rules:

- **Retry at exactly one layer**, chosen deliberately, usually the one closest to the dependency
  that knows whether the operation is idempotent.
- **Every other layer must be able to prove it does not retry**, including the HTTP client
  library's own defaults, the mesh's, and the SDK's.
- **Budget rather than count.** A retry budget (retry only if fewer than X% of recent calls were
  retries) degrades gracefully where a fixed count does not.

## Identity loss

A decorator is a different object of a different class. Everything that identifies the delegate
breaks:

| Broken thing                   | Symptom                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `a == b`                       | The wrapper is never `==` the target                                                |
| `instanceof ConcreteType`      | Fails; downcasts throw `ClassCastException`                                         |
| `equals`/`hashCode`            | Unless forwarded, the wrapper is unequal to the target and to other wrappers        |
| Listener deregistration        | `removeListener(this)` from inside the target does not match the wrapper registered |
| Annotations read reflectively  | The wrapper's class has none of the target's annotations                            |
| `getClass().getName()` in logs | Reports the wrapper, hiding what actually ran                                       |

Java's own answer is an explicit unwrap contract:

```java
public interface Wrapper {                      // java.sql.Wrapper
    <T> T unwrap(Class<T> iface) throws SQLException;
    boolean isWrapperFor(Class<?> iface) throws SQLException;
}
```

Spring's equivalent is `AopUtils.getTargetClass` / `AopProxyUtils.ultimateTargetObject`, which
exists for exactly this reason. If your decorated type may be inspected by identity or by class,
provide an unwrap method, and forward `equals`/`hashCode` only if the delegate's equality is
value-based — forwarding them for an identity-based delegate makes two different wrappers equal,
which breaks sets.

## When the framework already has it

| Concern                        | Framework mechanism                           | Prefer the framework because                          |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------- |
| Request logging, auth, tenancy | Servlet `Filter`, `HandlerInterceptor`        | Ordering, exception translation, tracing already work |
| Method-level cross-cutting     | Spring AOP advice, `@Order`                   | Declarative ordering; visible in actuator             |
| HTTP client retry/timeouts     | `RestClient` builder, Resilience4j decorators | Metrics and tracing propagate automatically           |
| Caching                        | `@Cacheable` / `CacheManager`                 | Key generation, TTL, eviction, stats                  |
| Metrics                        | Micrometer instrumentation on the client      | Consistent naming and tags                            |

The reason is not that hand-rolled decorators are wrong; it is that a hand-rolled chain sits
outside the framework's ordering model and its observability, so operators cannot see it and a
second mechanism can be applied on top without anyone noticing (`rpc-and-api-contracts`,
`caching-strategies`).

Hand-roll when the concern is domain-shaped — an approval step, a tenant-specific transformation,
a business-rule pipeline — because frameworks have no concept of those.

## Functional decorators

For a single-method interface, decoration is function composition and needs no classes:

```java
@FunctionalInterface
interface PriceLookup { Price of(Sku sku); }

static PriceLookup timed(PriceLookup delegate, Timer timer) {
    return sku -> timer.record(() -> delegate.of(sku));
}

static PriceLookup cached(PriceLookup delegate, Cache<Sku, Price> cache) {
    return sku -> cache.get(sku, delegate::of);
}

PriceLookup lookup = timed(cached(httpLookup, cache), timer);
```

Same pattern, same ordering considerations, a fraction of the code. The trade: lambdas have no
useful class names, so stack traces and thread dumps become harder to read — which matters
exactly when a layer misbehaves. Use classes for layers you expect to debug in production,
lambdas for the rest.

## Depth

Beyond four or five layers the stack becomes hard to reason about: a stack trace is dominated by
forwarding frames, and stepping through in a debugger takes several keystrokes per real
statement. When the composition is fixed — always the same five layers in the same order —
consider one class implementing them together, with the decorators kept only for the parts that
genuinely vary per instance.
