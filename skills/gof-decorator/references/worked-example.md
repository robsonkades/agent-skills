# Worked example: an outbound pricing client

`PriceLookup` fetches a price from a supplier's API. It needs metrics, a circuit breaker, retry,
a per-attempt timeout and a short cache. Every one of those is a separate concern, several are
optional per environment, and their order determines behaviour.
Java 17 partial teaching example: domain, deadline, policy and wrapper types are illustrative;
Spring/JUnit/AssertJ snippets require the project's actual dependencies. The `RestClient` wiring requires
Spring Framework 6.1+; on older stacks, retain a supported client behind `PriceLookup` instead of
upgrading to copy this example. `Deadline` uses a monotonic clock.
`sleepBefore` must cap waiting to the remaining budget and propagate interruption as cancellation,
not as `PricingUnavailable`. The transport must enforce remaining time for each attempt.
This sample assumes an eligible cached price in one supplier/currency/access scope; a broader
deployment needs a key and validation policy covering its actual scope. Layers are requirements
of this example, not a checklist to add to every client.

## The interface, and one layer

```java
public interface PriceLookup {
    Price of(Sku sku, Deadline deadline);
}

public final class RetryingPriceLookup implements PriceLookup {
    private final PriceLookup delegate;
    private final RetryPolicy policy;

    public RetryingPriceLookup(PriceLookup delegate, RetryPolicy policy) {
        this.delegate = java.util.Objects.requireNonNull(delegate);
        this.policy = java.util.Objects.requireNonNull(policy);
        if (policy.maxAttempts() < 1) throw new IllegalArgumentException("maxAttempts");
    }

    @Override
    public Price of(Sku sku, Deadline deadline) {
        int maxAttempts = policy.maxAttempts(); // policy is immutable for this instance
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            if (deadline.hasExpired()) throw new PricingDeadlineExceeded(sku, attempt - 1);
            try {
                return delegate.of(sku, deadline);
            } catch (PricingUnavailable e) {        // transient only
                if (attempt == maxAttempts) throw e; // no sleep after the last failure
                policy.sleepBefore(attempt + 1, deadline);
            }
        }
        throw new AssertionError("validated attempt limit");
    }
}
```

Two properties this layer must have and hand-written retries usually lack. It retries **only the
transient exception** — a `PriceRejected` (unknown SKU) is permanent and is not caught. And it
checks the **deadline** before each attempt. Total-call enforcement additionally depends on
budget-aware backoff/transport and cancellation; this loop alone cannot bound an arbitrary delegate.
The illustrative exception hierarchy must keep permanent rejection, open-breaker rejection,
deadline expiry and cancellation outside `PricingUnavailable`; a transport must not translate
an ambiguous side effect into safe retry merely by using that name.

## The wiring, with its order justified

```java
@Bean
PriceLookup priceLookup(RestClient restClient, MeterRegistry meters,
                        CircuitBreaker breaker, Cache<Sku, Price> cache) {
    // Order, outermost first, and why:
    //  metrics  — measures what the caller experiences, retries included
    //  cache    — a hit costs nothing below this point
    //  breaker  — opens on logical operations, not on individual attempts
    //  retry    — one retry layer in the whole path; the mesh has retries disabled
    //  timeout  — bounds ONE attempt; the deadline bounds the whole call
    return new MetricsPriceLookup(meters,
             new CachingPriceLookup(cache,
               new CircuitBreakingPriceLookup(breaker,
                 new RetryingPriceLookup(
                   new TimeoutPriceLookup(Duration.ofMillis(300),
                     new HttpPriceLookup(restClient)), RetryPolicy.exponential(3)))));
}
```

The comment is not decoration. Nothing in the type system records the order, the class names do
not imply it, and the next person to add a layer will insert it wherever the formatting looks
tidiest.

## The budget arithmetic

```text
Caller deadline                       800 ms
Per-attempt timeout                   300 ms
Backoff                          100 + 200 ms
Full-attempt arithmetic               1200 ms  → exceeds the caller's budget

With deadline-aware sleep and transport as well as the pre-attempt check:
  attempt 1 at   0 ms  (fails at 300)
  attempt 2 at 400 ms  (fails at 700)
  second backoff has only 100ms remaining → no attempt 3 after expiry
  failure is observed near the 800ms budget, subject to scheduling/cleanup delay
```

This is a conditional timeline, not a measured upper bound; queueing, scheduling, cleanup and
the actual transport can change it. If only the caller stops waiting and no equivalent deadline
or cancellation enforcement stops retries, the third attempt starts after expiry. Check both
observed completion and remaining work; the pre-attempt test alone cannot prove either bound.

## Testing each layer

```java
@Test
void retries_transient_failures_until_success() {
    var attempts = new AtomicInteger();
    PriceLookup flaky = (sku, deadline) -> {
        if (attempts.incrementAndGet() < 3) throw new PricingUnavailable(sku);
        return Price.of("9.99", EUR);
    };
    var lookup = new RetryingPriceLookup(flaky, RetryPolicy.fixed(3));

    assertThat(lookup.of(SKU, Deadline.in(ofSeconds(5)))).isEqualTo(Price.of("9.99", EUR));
    assertThat(attempts).hasValue(3);
}

@Test
void persistent_transient_failure_stops_at_the_policy_limit() {
    var attempts = new AtomicInteger();
    var failure = new PricingUnavailable(SKU);
    PriceLookup unavailable = (sku, deadline) -> {
        attempts.incrementAndGet();
        throw failure;
    };

    assertThatThrownBy(() -> new RetryingPriceLookup(unavailable, RetryPolicy.fixed(3))
            .of(SKU, Deadline.in(ofSeconds(5))))
        .isSameAs(failure);
    assertThat(attempts).hasValue(3);
}

@Test
void does_not_retry_a_permanent_rejection() {
    var attempts = new AtomicInteger();
    PriceLookup rejecting = (sku, deadline) -> {
        attempts.incrementAndGet();
        throw new PriceRejected(sku, "unknown sku");
    };
    assertThatThrownBy(() -> new RetryingPriceLookup(rejecting, RetryPolicy.fixed(3))
            .of(SKU, Deadline.in(ofSeconds(5))))
        .isInstanceOf(PriceRejected.class);
    assertThat(attempts).hasValue(1);
}
```

These partial tests use lambda delegates. Success on attempt three does not test exhaustion;
the always-failing delegate distinguishes that property. Use a recording, non-sleeping backoff
fixture to also assert two waits for three failed attempts and no wait after the final failure.
Also exercise expiry during backoff, interruption and a throwing metrics recorder. Best-effort
metrics must not turn a completed price lookup into a retryable failure or mask the original failure.

## Testing the order

Start each test with a fresh empty cache and known breaker state. The factory must use the same
breaker and cache instances controlled by the fixture; a hit would otherwise hide breaker rejection.
The first two tests check transport reachability, not the relative order of every layer.

```java
@Test
void a_second_lookup_uses_the_cache_without_calling_transport() {
    var calls = new AtomicInteger();
    PriceLookup counting = (sku, d) -> { calls.incrementAndGet(); return Price.of("9.99", EUR); };
    var stack = productionStack(counting);          // same composition as the @Bean

    stack.of(SKU, deadline());
    stack.of(SKU, deadline());

    assertThat(calls).hasValue(1);                  // second call served from cache
}

@Test
void an_open_breaker_rejects_without_calling_transport() {
    breaker.transitionToOpenState();
    var calls = new AtomicInteger();
    var stack = productionStack((sku, d) -> { calls.incrementAndGet(); return price(); });

    assertThatThrownBy(() -> stack.of(SKU, deadline())).isInstanceOf(CallNotPermitted.class);
    assertThat(calls).hasValue(0);                  // proves no transport call, not nesting
}
```

Zero delegate calls with an open breaker does not distinguish the two nestings: both can reject
before reaching HTTP. To test order, start closed and script two transient failures then success;
use a recording breaker configured not to open. Assert one successful logical observation outside
retry versus three attempt observations inside. Clear the cache and instrument retry entries too.

Extract `productionStack(...)` so the test composes the layers in the same order as the `@Bean`
method. A test that hand-assembles its own order proves nothing about production.

## Illustrative retry amplification

Suppose the client allows three total attempts and the mesh two total attempts (one retry):

```text
3 client attempts × 2 mesh attempts = at most 6 dependency requests per logical call
provided all failures are retryable and no deadline/breaker stops them earlier.
Two mesh retries instead means 3 mesh attempts and a bound of 9, not 6.
```

The realized load multiplier and latency require failure correlation, retry eligibility, budgets,
backoff and breaker state; no error percentage alone establishes them. Prefer one owner and test
the shared bounds. This is an illustrative scenario, not a measured incident.

## What was left to the framework

Tracing and connection pooling were not written as decorators. The `RestClient` builder supplies
integration hooks; actual pooling depends on the HTTP request factory, and observations/tracing
need configured registries/instrumentation. Verify them in the target project rather than inferring
automatic propagation from the builder name (`rpc-and-api-contracts`, `distributed-tracing-design`).

Source: [Spring RestClient API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/client/RestClient.html)
identifies its introduction in Spring Framework 6.1; inspect the deployed version for available hooks.
