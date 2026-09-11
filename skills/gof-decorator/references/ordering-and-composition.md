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

**Timeout and Retry.** With effective per-attempt enforcement, `attempts × timeout` plus backoff
is a useful budget calculation, not a wall-clock bound that includes queueing, scheduling and cleanup. Timeout
outside retry bounds the observer's wait only unless inner work cooperates: stop attempts and
propagate the remaining budget/cancellation through backoff and transport, which is usually
what a request-scoped service wants. Doing both — an outer deadline and an inner per-attempt
timeout — can protect different boundaries; retain equivalent existing enforcement rather than
adding layers solely to match the diagram.

```text
attempts=3, per-attempt timeout=300ms, backoff 100/200ms
    → illustrative full-attempt timeline: 1200ms, excluding other delays
Caller's own deadline is 800ms
    → if only the caller's wait ends and retries keep running,
      attempt 3 starts at 900ms despite that expired budget
```

That last line is the failure mode: work continuing after the caller has left. A deadline
propagated and enforced by the stack limits it; a timeout alone does not prove remote work stopped
(`timeouts-and-deadlines`).

**Retry and Circuit breaker.** Breaker outside retry serves operation-level protection: it
observes complete operations, so its error rate reflects what callers experience, and when it is
open no attempts reach retry below it. Breaker inside retry means every attempt consults the breaker;
exclude open-breaker rejection from retry eligibility. Repeated rejected attempts depend on that
policy, not on nesting alone, and may waste backoff time and distort metrics.

**Cache and everything else.** Cache often belongs just under metrics, provided hits preserve
required authorization, freshness and tenant/currency key scope. A hit then costs
lookup/validation cost and need not touch breaker, retry or transport. Cache below retry means each
attempt rechecks it; concurrent population can change a miss into a hit. Failure caching is an
explicit cache policy, not determined by layer order. With the cache above metrics, hits become
invisible; with it below, hit latency is counted as call latency. Prefer cache below metrics, and
tag hits.

**Logging.** Wherever it sits, it sees only that layer's view. Logging outermost logs one line
per logical call with the total duration — usually what an operator wants. Logging innermost logs
every attempt, which is what a diagnostician wants. Both is fine; using one name for both is not
(`structured-logging`).

**Bulkhead / concurrency limiter.** Above retry it bounds logical operations, holding permits
during backoff; below retry it bounds active attempts and releases permits between them. Choose
the protected resource explicitly, possibly using both bounds, and test acquisition deadlines and
release on failure/cancellation (`concurrency-limiting-and-bulkheads`).
For asynchronous attempts, release only when the protected resource is no longer in use;
a timeout-completed observer future is insufficient evidence of that release.

## Retry amplification

Nested retries can multiply when earlier attempts fail and all layers permit another attempt.

```text
Client SDK      3 attempts
Gateway         3 attempts
Service mesh    2 attempts
                ─────────────
                at most 18 dependency requests under these attempt limits
```

A failure percentage alone does not determine that realized multiplier; retry eligibility,
correlation, deadlines and breaker state do. The product illustrates a possible retry storm
(`cascading-failures`). Rules:

- **Prefer one retry owner per failure domain.** If several layers are necessary, share a bounded
  attempt/deadline budget and demonstrate the resulting amplification limit.
- **Inspect other layers' actual policies**, including HTTP, mesh and SDK defaults.
- **Use complementary bounds.** Per-call attempt/deadline limits and an aggregate retry budget
  protect different scopes. Define the budget's population, accounting and enforcement rather
  than assuming a percentage threshold alone prevents overload (`retries-and-backoff`).

## Identity loss

A decorator is a different object. Identify which uses actually depend on concrete identity:

| Broken thing                   | Symptom                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `a == b`                       | The wrapper is never `==` the target                                                |
| `instanceof ConcreteType`      | Delegating wrappers usually fail; subclass-based forms may still match              |
| `equals`/`hashCode`            | Equality depends on both objects' contracts; forwarding can violate symmetry        |
| Listener deregistration        | `removeListener(this)` from inside the target does not match the wrapper registered |
| Annotations read reflectively  | Visibility depends on wrapper/subclass shape, inheritance and lookup rules          |
| `getClass().getName()` in logs | Reports the wrapper, hiding what actually ran                                       |

Java's own answer is an explicit unwrap contract:

```java
public interface Wrapper {                      // java.sql.Wrapper
    <T> T unwrap(Class<T> iface) throws SQLException;
    boolean isWrapperFor(Class<?> iface) throws SQLException;
}
```

Spring's `AopUtils.getTargetClass` and `AopProxyUtils.ultimateTargetClass` inspect classes, not a
general target-object unwrap. `getSingletonTarget` has narrower singleton-target semantics. Avoid
unwrapping in normal business paths where it bypasses wrapper policy. Blindly forwarding equals
can violate reflexivity or symmetry even for a value-based delegate; use identity or an explicit
wrapper equality policy tested in both directions and consistent with hashCode.

## Resource ownership

A wrapper must state whether it owns the delegate or only borrows it. Forwarding `close` is correct
only under that ownership contract; pooled handles and application-wide clients may differ. Check
flush/close failure, initialization failure before the outer wrapper is returned, and whether
registering both layers for cleanup would double-close a non-idempotent resource
(`java-resource-management`). A lazy result or asynchronous operation may retain the delegate
after the method returns: transfer ownership or retain it until actual use ends, with explicit
cancellation and cleanup responsibility (`cancellation-and-interruption`). Neither a same-interface
wrapper nor a completed caller future proves these lifetime guarantees.

## When the framework already has it

| Concern                        | Framework mechanism                           | Prefer the framework because                           |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| Request logging, auth, tenancy | Servlet `Filter`, `HandlerInterceptor`        | Integration hooks with explicit ordering and coverage  |
| Method-level cross-cutting     | Spring AOP advice, `@Order`                   | Advice ordering model; verify proxy interception       |
| HTTP client retry/timeouts     | `RestClient` builder, Resilience4j decorators | Transport and resilience hooks; verify instrumentation |
| Caching                        | `@Cacheable` / `CacheManager`                 | Key/eviction hooks; provider-dependent TTL and stats   |
| Metrics                        | Micrometer instrumentation on the client      | Shared conventions when configured consistently        |

These are integration capabilities to verify, not automatic guarantees. Cache TTL/eviction depends
on the provider; HTTP pooling depends on the request factory; observations require configured
registries and tracing bridges. Inspect effective configuration and exercise a representative call.

Custom chains need explicit integration with ordering and observability. Otherwise their behavior
may be invisible to operators and a second mechanism may duplicate it (`rpc-and-api-contracts`,
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

Same pattern and ordering considerations. Named classes can improve diagnostics when anonymous
composition hides a layer, but named factory methods and existing tracing may already make a
functional wrapper clear. Choose by the actual diagnostic and ownership needs. The illustrative
`Timer`/`Cache` APIs above assume the required observation and cache contracts; inspect the actual
library's failure behavior rather than assuming a lambda makes instrumentation harmless.

## Depth

Depth alone does not establish a problem. If traces, debugging or ownership obscure behavior,
make the composition visible and test it. When the composition is fixed and its policies inseparable,
consider one class implementing them together, with the decorators kept only for the parts that
genuinely vary per instance.

Sources: [Spring AopProxyUtils](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/aop/framework/AopProxyUtils.html)
and [Object equality contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html).
