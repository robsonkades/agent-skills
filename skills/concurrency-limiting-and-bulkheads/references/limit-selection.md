# Choosing and placing the limit

## Which limit does this requirement need

| Requirement, as stated                                   | Mechanism                                        | Not this                |
| -------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| "No more than 20 calls in flight to the pricing service" | `Semaphore(20)` at the client                    | a rate limiter          |
| "The vendor allows 600 requests per minute"              | token bucket (Resilience4j, Guava `RateLimiter`) | a semaphore             |
| "Never hold more than 500 pending jobs"                  | bounded queue + rejection policy                 | a semaphore             |
| "One tenant must not starve the others"                  | a limit **per tenant** (bulkhead)                | one bigger global limit |
| "Shed load before the heap does"                         | queue limit, sized in bytes not items            | a concurrency limit     |
| "Only one instance of this job at a time, cluster-wide"  | a distributed lease                              | anything in this file   |

A system that says "we rate-limit with a semaphore" is describing a concurrency limit and
will discover the difference the first time the dependency slows down: at constant
concurrency, a dependency that gets 5× slower receives 5× _fewer_ requests per second, which
is either exactly the protection you wanted or exactly the collapse in throughput you did
not — and you should know which before it happens.

## Sizing, worked through

The limit is the smallest of three numbers:

```text
1. What the dependency can take            e.g. 100 concurrent, per its documentation
2. What our share of it is                 100 ÷ 6 replicas ≈ 16
3. What we need                            L = λ × W = 200 rps × 0.04 s = 8
```

Take 8, not 16, and certainly not 100. Sizing to what the dependency _allows_ rather than
what the service _needs_ is how a limit stops being a protection and becomes a licence to
overwhelm something else downstream of it.

Then sanity-check the implied rate at both ends of the latency distribution:

| Latency | Rate at 8 permits |
| ------- | ----------------- |
| 10 ms   | 800 rps           |
| 40 ms   | 200 rps ← normal  |
| 400 ms  | 20 rps            |
| 2 s     | 4 rps             |

The bottom row is the important one. When the dependency degrades, the limit throttles you
to 4 rps automatically — good, if the callers get a fast rejection; catastrophic, if they
queue behind `acquire()` with no timeout, because now the queue holds every request that
arrived in the last minute.

## Where the limit goes

| Resource                         | Limit lives                                                  | Notes                                                  |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| Database                         | the connection pool (`maximumPoolSize`)                      | already a semaphore; do not add a second one           |
| One HTTP dependency              | a `Semaphore` in that client's adapter                       | or the client's own per-route connection cap           |
| All outbound HTTP                | **nowhere** — this is the anti-pattern                       | one slow host consumes every other host's budget       |
| CPU-heavy work                   | a fixed executor sized to cores                              | the pool is the limit; adding a semaphore is redundant |
| Memory-heavy work (large bodies) | a semaphore whose permits represent **megabytes**, not tasks | permit count should track the scarce unit              |
| Inbound requests                 | the server's own accept/worker configuration + shedding      | the edge, and only the edge                            |

Placing it in the adapter — the class that owns the client — is what makes it testable and
what makes "which limit was hit?" answerable from a metric name.

## The wrapper worth writing once

```java
final class BoundedPricingClient implements PricingClient {
    private final PricingClient delegate;
    private final Semaphore permits;
    private final Duration waitBudget;
    private final Counter rejections;

    @Override
    public Price price(Sku sku) {
        boolean acquired;
        try {
            acquired = permits.tryAcquire(waitBudget.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();          // the caller was cancelled
            throw new CancellationException("cancelled waiting for a pricing permit");
        }
        if (!acquired) {
            rejections.increment();                       // the shedding decision, counted
            throw new DependencyOverloadedException("pricing");   // maps to 503 + Retry-After
        }
        try {
            return delegate.price(sku);
        } finally {
            permits.release();                            // finally, unconditionally
        }
    }
}
```

Four properties to preserve in any variant: the wait is bounded, interruption is honoured
and re-asserted, the rejection is a distinguishable exception rather than a generic failure,
and `release()` is in a `finally` with nothing between it and the acquire that can return
early.

## Bulkheads: partitioning the budget

A single limit of 30 shared by three tenants means one tenant can hold all 30. Partitioning
converts a shared failure into a contained one.

```java
// Per-tenant partition, with a small shared reserve so a quiet tenant is never starved
Map<TenantId, Semaphore> perTenant = …;   // 8 permits each
Semaphore overflow = new Semaphore(6);    // borrowed only when a tenant's own permits are gone
```

Choose the partition key by the failure you are containing:

- **By dependency** — one slow service cannot exhaust the budget of the others. This is the
  default and the highest value per unit of complexity.
- **By tenant** — one customer's traffic spike cannot deny the rest. Needed in multi-tenant
  systems; requires a story for unknown/new tenants.
- **By operation class** — cheap reads separated from expensive writes, so a batch job
  cannot starve interactive traffic.

The cost is utilisation: partitioned budgets sit idle while another partition rejects. That
is the trade being made, and it is usually worth it — but say the number out loud, because a
partition scheme with 12 partitions of 2 permits each behaves nothing like one pool of 24.

## Under virtual threads

```java
// Before: the pool was the limit, whether or not anyone decided that
ExecutorService pool = Executors.newFixedThreadPool(20);

// After: the executor cannot reject and has no size. The limit must be re-declared.
ExecutorService vt = Executors.newVirtualThreadPerTaskExecutor();
Semaphore downstream = new Semaphore(20);      // ← the line the migration usually forgets
```

Audit every place the old pool size was implicitly protecting something: outbound HTTP,
database calls that bypass the pool's own bound, file handles, third-party clients with
internal buffers. Each one now needs its own limit, and each one is a separate decision.

## Metrics that make the limit operable

```java
Gauge.builder("limit.available", permits, Semaphore::availablePermits).tag("dep", "pricing")…
Timer.builder("limit.wait")…            // time spent in tryAcquire — rises first
Counter.builder("limit.rejected")…      // the shedding rate
Gauge.builder("limit.max", () -> configured)…   // so a dashboard can compute saturation
```

Alert on wait time, not on rejections: by the time rejections appear the dependency is
already the bottleneck. And export the configured maximum, or nobody reading the dashboard a
year from now can tell 18 available permits from 18 out of 20 versus 18 out of 200.
