# Limiting and shedding in Java

Two mechanisms, two implementations. Keep them in separate components even when they sit in
the same filter chain: one is keyed by client, the other by saturation.

## A token bucket, including the burst

```java
/** Lazy-refill token bucket. Capacity is the burst allowance; rate is the sustained limit. */
final class TokenBucket {
    private final long capacity;
    private final double tokensPerNano;
    private double tokens;
    private long lastRefillNanos;

    TokenBucket(long capacity, double tokensPerSecond) {
        if (capacity <= 0 || !Double.isFinite(tokensPerSecond) || tokensPerSecond <= 0) {
            throw new IllegalArgumentException("positive finite capacity and rate required");
        }
        this.capacity = capacity;                                  // burst — set it on purpose
        this.tokensPerNano = tokensPerSecond / 1_000_000_000d;     // sustained rate
        this.tokens = capacity;
        this.lastRefillNanos = System.nanoTime();                  // monotonic, not wall clock
    }

    record Decision(boolean admitted, Duration retryAfter) {}

    synchronized Decision tryConsume(long permits) {
        if (permits <= 0 || permits > capacity) {
            throw new IllegalArgumentException("permits must be in [1, capacity]");
        }
        refill();
        if (tokens >= permits) {
            tokens -= permits;
            return new Decision(true, Duration.ZERO);
        }
        double deficit = permits - tokens;
        return new Decision(false,
                Duration.ofNanos((long) Math.ceil(deficit / tokensPerNano)));
    }

    private void refill() {
        long now = System.nanoTime();
        tokens = Math.min(capacity, tokens + (now - lastRefillNanos) * tokensPerNano);
        lastRefillNanos = now;
    }
}
```

This pedagogical implementation uses floating point and one monitor. At very high rates/long
uptime, production libraries use tested fixed-point/saturating arithmetic and define snapshot/
distributed semantics. Return admission and retry delay from one atomic method; calculating
them in separate synchronized calls lets another caller change the bucket between them.

- **`capacity` is the policy, not a buffer size.** It is how much unused allowance a client may
  bank and spend at once. Equal to the rate means "no burst at all", which rejects traffic the
  service could serve; ten times the rate means a client may spend ten seconds of quota in one
  instant, which the service must be able to absorb.
- Refill lazily from `System.nanoTime()`. A scheduled refill task costs a thread and a wakeup
  per bucket, and a wall-clock source lets an NTP step hand out or withhold tokens.
- Weight by cost where request cost varies: `tryConsume(estimatedCost)` makes an expensive
  endpoint consume more of the same quota than a cheap one.
- The critical section is a few field updates and no I/O, so `synchronized` is appropriate
  here; the virtual-thread interaction is `thread-sizing-and-virtual-threads`, not this skill.

**Per-key buckets are per-replica state, and they grow.** `ConcurrentHashMap<String,
TokenBucket>` keyed by API key is an unbounded map fed by attacker-controlled keys. Use a
bounded cache with expiry-after-access (`caching-strategies`), and remember that the map's
contents are exactly the kind of in-process authoritative state `stateless-service-design`
tells you to classify.

## Local plus shared: the practical distributed shape

Neither extreme is usually right: a shared counter per request adds a round trip and a
dependency to the hot path, and a static per-replica share is wrong under skew.

```java
// Conceptual: every request is served from a local bucket; a background task leases capacity.
final class LeasedLimiter {
    private final TokenBucket local;          // serves the request path, no network
    private final SharedBudget shared;        // Redis or equivalent, off the request path

    boolean tryAcquire(String key, long cost) {
        return local.tryConsume(cost).admitted(); // never blocks on the network
    }

    /** Runs on a schedule, e.g. every second. Never on the request path. */
    void reconcile() {
        long used = local.consumedSinceLastReconcile();
        long granted = shared.claim(used, /* want */ local.recentDemand());
        local.setRateForNextInterval(granted);   // shrink or grow this replica's share
        // Shared store unreachable: keep the previous lease, decayed, and record the fallback.
    }
}
```

- This sketch is insufficient for a contractual global limit unless `SharedBudget` issues
  non-overlapping, epoch-fenced grants whose total never exceeds the window budget. Merely
  reporting local usage periodically can over-admit for the entire partition duration.
- In escrow, short grant duration improves redistribution but increases allocator load and
  dependence on clocks/renewal; unspent tokens strand capacity. In approximate reconciliation,
  derive overage from all local refill/burst allowances and outage duration.
- Decide the unavailability behaviour explicitly. Fail-open admits everything during a Redis
  outage; fail-closed rejects everything and makes the limiter an availability risk larger
  than the abuse it prevents. Holding a last grant is safe only until its explicit budget/
  epoch validity ends; local emergency capacity must be reserved in the global contract.

## Admission control: shedding on queue time

```java
/** Conceptual: concurrency limit plus a bound on how long a request may wait to start. */
final class AdmissionController {
    private final Semaphore permits;          // in-flight limit, not an arrival-rate limit
    private final long maxWaitNanos;

    <T> T call(Supplier<T> work) throws Overloaded {
        long start = System.nanoTime();
        boolean acquired;
        try {
            acquired = permits.tryAcquire(maxWaitNanos, TimeUnit.NANOSECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Overloaded(Duration.ZERO);
        }
        if (!acquired) {
            queueTimeouts.increment();        // this counter IS the saturation signal
            throw new Overloaded(suggestedBackoff());
        }
        waitTime.record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
        try {
            return work.get();
        } finally {
            permits.release();
        }
    }
}
```

- `permits` bounds **work in flight**, which is the quantity that actually breaks a service.
  Requests per second does not, when request cost varies by orders of magnitude.
- The recorded wait time is the signal to shed on, and it leads CPU: it rises as soon as
  arrivals exceed service capacity, while CPU on an I/O-bound service can still look
  comfortable. Relating wait time, arrival rate and service time is
  `littles-law-and-queueing` — read it there rather than re-deriving it.
- Set `maxWaitNanos` from the caller's remaining budget, not from a round number: waiting
  longer than the caller will wait produces work nobody receives
  (`timeouts-and-deadlines`).
- Coordinate connector backlog, request workers/event loops and this limit so waiting occurs
  in one bounded observable place. Making a platform-thread pool larger than the concurrency
  limit can itself consume memory/context switches; virtual threads reduce thread cost but not
  held connections or downstream demand.
- The adaptive form replaces the fixed limit with a controller — additive increase while
  latency stays near its observed minimum, multiplicative decrease on timeouts or rejections.
  It removes a hand-tuned constant at the cost of a control loop that can oscillate; start
  fixed, measure, then adapt.

## Deadline-aware queue handling

FIFO under overload maximises the number of requests that time out just before completing.

```java
// Conceptual: skip work whose explicit deadline has passed.
record Job(Runnable work, long enqueuedNanos, long deadlineNanos) {}

Job next = queue.pollFirst();
while (next != null && System.nanoTime() >= next.deadlineNanos()) {
    expired.increment();                     // shed: nobody is waiting for this any more
    next = queue.pollFirst();
}
```

- On a full queue, tail-drop/reject-new is the safe default. Drop-head/LIFO can improve deadline
  goodput only with trustworthy deadlines, no work started and explicit starvation/fairness
  bounds. Do not infer cancellation merely from age.
- Rejection must be early, but authenticate enough to determine protected tenant/priority.
  Apply cheap global connection/size controls before expensive auth and business parsing.
- A bounded asynchronous shaper may delay work deliberately. Do not sleep request workers or
  create an unbounded wait queue; propagate cancellation and remaining deadline.

## The response contract

```java
// 429 = this policy budget was exceeded. Retry-After is sent only when meaningful.
ProblemDetail body = ProblemDetail.forStatusAndDetail(
        HttpStatus.TOO_MANY_REQUESTS, "Rate limit exceeded for this API key");
return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, seconds)))
        .body(body);
```

- `Retry-After` is delta-seconds or an HTTP date. It describes when retry might be appropriate,
  not a reservation. Omit it when recovery/reset cannot be estimated; publish standard rate-
  limit fields only if their semantics match the implementation.
- Clients should apply jitter around server guidance without retrying before a strict quota
  reset. Server-side randomized advice can spread load, but must not claim an earlier reset
  than policy permits.
- Never return 500 for a limit or a shed. It is indistinguishable from a defect, and a
  well-behaved client retries it. The error format itself belongs to `rpc-and-api-contracts`.
- Document both statuses, the header, and the limit's unit and key in the API contract. An
  undocumented limiter does not shift load, it just relocates the failure into the client.

## Libraries, by role

- **Bucket4j** — a token-bucket implementation with pluggable backends, including distributed
  ones. It gives you the algorithm and the storage; the burst capacity, the key and the
  reconciliation policy are still your decisions.
- **Resilience4j** — a per-instance rate limiter (permits per refresh period) and a bounded
  bulkhead for concurrency limiting. Neither is distributed, and the rate limiter's
  permit-wait timeout must be zero if you want rejection rather than a blocked caller.
- **The gateway or mesh** — an edge proxy can enforce coarse per-client limits before traffic
  reaches the JVM at all, which is the cheapest possible rejection. It cannot see your queue
  depth, so it can limit but it cannot shed on your behalf.

## Verification matrix

| Fault/load                    | Evidence to assert                                                        |
| ----------------------------- | ------------------------------------------------------------------------- |
| Same key, concurrent requests | atomic bucket/counter never exceeds declared burst error                  |
| Replica scale up/down         | aggregate policy and grant conservation remain within contract            |
| Allocator partition/failover  | no double-issued epoch; defined fail-open/closed behavior                 |
| Cost underestimation          | expensive endpoint/tenant cannot monopolize bottleneck                    |
| Queue overload                | bounded memory, deadline propagation, fairness and stable goodput         |
| Recovery                      | controller does not oscillate or remain artificially low after load falls |

## Primary references

- [Java `Semaphore` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [Bucket4j reference documentation](https://bucket4j.com/)
- [Resilience4j RateLimiter documentation](https://resilience4j.readme.io/docs/ratelimiter)
