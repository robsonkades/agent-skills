# Worked example: an outbound pricing client

`PriceLookup` fetches a price from a supplier's API. It needs metrics, a circuit breaker, retry,
a per-attempt timeout and a short cache. Every one of those is a separate concern, several are
optional per environment, and their order determines behaviour.

## The interface, and one layer

```java
public interface PriceLookup {
    Price of(Sku sku, Deadline deadline);
}

public final class RetryingPriceLookup implements PriceLookup {
    private final PriceLookup delegate;
    private final RetryPolicy policy;

    @Override
    public Price of(Sku sku, Deadline deadline) {
        PricingUnavailable last = null;
        for (int attempt = 1; attempt <= policy.maxAttempts(); attempt++) {
            if (deadline.hasExpired()) throw new PricingDeadlineExceeded(sku, attempt - 1);
            try {
                return delegate.of(sku, deadline);
            } catch (PricingUnavailable e) {        // transient only
                last = e;
                policy.sleepBefore(attempt + 1, deadline);
            }
        }
        throw last;
    }
}
```

Two properties this layer must have and hand-written retries usually lack. It retries **only the
transient exception** — a `PriceRejected` (unknown SKU) is permanent and is not caught. And it
respects the **deadline**, so it cannot spend the caller's whole budget on attempt three.

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
                 new RetryingPriceLookup(RetryPolicy.exponential(3),
                   new TimeoutPriceLookup(Duration.ofMillis(300),
                     new HttpPriceLookup(restClient))))));
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
Worst case without a deadline check   1200 ms  → exceeds the caller's budget

With the deadline checked before each attempt:
  attempt 1 at   0 ms  (fails at 300)
  attempt 2 at 400 ms  (fails at 700)
  attempt 3 would start at 900 ms → deadline expired, PricingDeadlineExceeded at 800
```

Without the deadline check the third attempt runs after the caller has already timed out —
holding a connection, adding load to a struggling supplier, for a result nobody will read. This
is the single most valuable line in the retry layer.

## Testing each layer

```java
@Test
void retries_transient_failures_and_stops_at_the_policy_limit() {
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

Each layer is tested against a lambda delegate. No mocking framework, no HTTP, and the test says
exactly what the layer promises.

## Testing the order

```java
@Test
void a_cache_hit_performs_no_downstream_call_and_no_retries() {
    var calls = new AtomicInteger();
    PriceLookup counting = (sku, d) -> { calls.incrementAndGet(); return Price.of("9.99", EUR); };
    var stack = productionStack(counting);          // same composition as the @Bean

    stack.of(SKU, deadline());
    stack.of(SKU, deadline());

    assertThat(calls).hasValue(1);                  // second call served from cache
}

@Test
void an_open_breaker_prevents_retries_entirely() {
    breaker.transitionToOpenState();
    var calls = new AtomicInteger();
    var stack = productionStack((sku, d) -> { calls.incrementAndGet(); return price(); });

    assertThatThrownBy(() -> stack.of(SKU, deadline())).isInstanceOf(CallNotPermitted.class);
    assertThat(calls).hasValue(0);                  // breaker is ABOVE retry
}
```

The second test is the one that catches a reordering. If someone moves the breaker below the
retry, the stack still compiles, every per-layer test still passes, and this test fails —
which is the only signal that the semantics changed.

Extract `productionStack(...)` so the test composes the layers in the same order as the `@Bean`
method. A test that hand-assembles its own order proves nothing about production.

## The reordering that caused an outage

An earlier version had retry outside the breaker **and** the service mesh configured with two
retries of its own, which nobody had checked:

```text
3 (client retry) × 2 (mesh retry) = 6 requests per logical call

Supplier degrades to 40% errors
  → 60% of logical calls retry
  → traffic to the supplier rises ~2.4×
  → supplier saturates, error rate goes to 100%
  → every call now costs 6 requests and 1.2 s before failing
  → caller thread pool fills; the outage becomes ours
```

Two changes fixed it: mesh retries disabled for this route, so retry exists at exactly one layer;
and the deadline check inside the retry loop, so a doomed call fails at 800 ms instead of 1200 ms
and stops holding a worker. Neither change is visible in any single layer's code — which is why
the composition needs its own test and its own comment (`cascading-failures`,
`retries-and-backoff`).

## What was left to the framework

Tracing and connection pooling were not written as decorators. The `RestClient` builder supplies
both, propagates trace context automatically, and reports metrics under the conventional names —
a hand-rolled tracing decorator would have produced spans the platform's dashboards do not know
about (`rpc-and-api-contracts`, `distributed-tracing-design`).
