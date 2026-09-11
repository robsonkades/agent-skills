# Limiting and shedding in Java

Keep quota and saturation decisions distinguishable even when they share an implementation.
Quota keys may be per-client or global; capacity protection can also preserve tenant shares.

The standalone bucket uses Java 17 (`java.time.Duration` import); later Java snippets are
partial integration sketches. The HTTP sketch uses Spring Framework 6+ / Java 17+.
Inspect the project's actual Java, framework and limiter/backend versions; no upgrade is implied.

## A token bucket, including the burst

```java
/** Lazy-refill token bucket. Capacity is the burst allowance; rate is the sustained limit. */
final class TokenBucket {
    private final long capacity;
    private final double tokensPerNano;
    private double tokens;
    private long lastRefillNanos;

    TokenBucket(long capacity, double tokensPerSecond) {
        if (capacity <= 0 || capacity > (1L << 53)
                || !Double.isFinite(tokensPerSecond) || tokensPerSecond <= 0) {
            throw new IllegalArgumentException("positive finite capacity and rate required");
        }
        this.capacity = capacity;                                  // burst — set it on purpose
        this.tokensPerNano = tokensPerSecond / 1_000_000_000d;     // sustained rate
        if (tokensPerNano == 0 || capacity / tokensPerNano >= Long.MAX_VALUE) {
            throw new IllegalArgumentException("refill horizon must fit in signed nanos");
        }
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

This pedagogical implementation uses floating point and one monitor, with bounded numeric
inputs; rounding still makes it unsuitable as proof of exact contractual accounting. Elapsed
intervals must be less than 2^63 nanoseconds. Choose a library whose tested arithmetic and
distributed semantics meet the contract. Return admission and retry delay from one atomic method; calculating
them in separate synchronized calls lets another caller change the bucket between them.

- **`capacity` is the policy, not a buffer size.** It is how much unused allowance a client may
  bank and spend at once. Capacity numerically equal to tokens per second permits one second
  of accumulated credit at once; ten times the rate permits ten seconds of quota in one
  instant, which the service must be able to absorb.
- Refill lazily from `System.nanoTime()`. Scheduled refills add scheduling/wakeup overhead
  (tasks may share a scheduler); a wall-clock source lets an NTP step change local allowance.
- Weight by cost where request cost varies: `tryConsume(estimatedCost)` makes an expensive
  endpoint consume more of the same quota than a cheap one.
- The critical section is a few field updates and no I/O, so `synchronized` is appropriate
  here; the virtual-thread interaction is `thread-sizing-and-virtual-threads`, not this skill.

**Per-key buckets are per-replica state, and they grow.** `ConcurrentHashMap<String,
TokenBucket>` keyed by API key is an unbounded map fed by attacker-controlled keys. Use a
bounded registry keyed by authenticated/canonical identities (`caching-strategies`). Evicting
a depleted bucket and recreating it full grants new credit: cache bounds alone do not preserve
quota. Expire only when reconstruction equals accrued credit (for this bucket, idle at least
capacity/rate), or retain authoritative usage elsewhere. Define a conservative new-key policy
when storage is full; test key churn and restart. Removal/recreation must not leave two live
authoritative buckets for the same key during concurrent access. Never export raw per-key metric labels.

## Local plus shared: the practical distributed shape

A shared counter per request adds a round trip and a hot-path dependency; a static
per-replica share can strand allowance under skew. Use grants when their added protocol is
justified, not because either simpler choice is inherently wrong.

```text
Protocol sketch, not executable Java:
tryAcquire(authenticatedKey, cost):
    atomically inspect that key's installed grant, epoch, validity and remaining credit
    reject if expired, absent or insufficient; otherwise debit cost exactly once
    no independent local refill beyond explicitly issued credit
background renewal:
    request a uniquely identified grant for that key/window from the shared allocator
    allocator atomically reserves globally available credit; duplicate requests reuse grant ID
    atomically install each grant once; never reset spent credit on response replay
    on outage, spend only still-valid reserved credit, then use the declared failure policy
```

- This sketch is insufficient for a contractual global limit unless the shared allocator issues
  non-overlapping, epoch-fenced grants whose total never exceeds the window budget. Merely
  reporting local usage periodically can over-admit for the entire partition duration.
- In escrow, short grant duration improves redistribution but increases allocator load and
  dependence on clocks/renewal; unspent tokens strand capacity. In approximate reconciliation,
  derive overage from all local refill/burst allowances and outage duration.
- Decide the unavailability behaviour explicitly. Fail-open admits everything during a Redis
  outage; fail-closed makes limiter availability part of service availability. Holding a last grant is safe only until its explicit budget/
  epoch validity ends; local emergency capacity must be reserved in the global contract.
- Check/debit/expiry must form one atomic store operation. Redis script atomicity on a primary
  does not ensure durability across failover: asynchronous replication can lose acknowledged
  debits. Define ambiguous-timeout retries, persistence and failover guarantees. Bound clock
  uncertainty for lease expiry; never compare `nanoTime` values from different processes.

## Admission control: shedding on queue time

```java
/** Conceptual: concurrency limit plus a bound on how long a request may wait to start. */
final class AdmissionController {
    private final Semaphore permits;          // in-flight limit, not an arrival-rate limit
    private final long maxWaitNanos;

    <T> T call(Supplier<T> work) throws InterruptedException, Overloaded {
        long start = System.nanoTime();
        boolean acquired = permits.tryAcquire(maxWaitNanos, TimeUnit.NANOSECONDS);
        try {
            waitTime.record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
            if (!acquired) {
                queueTimeouts.increment();    // corroborate with wait/slack and bottleneck
                throw new Overloaded(suggestedBackoff());
            }
            return work.get();
        } finally {
            if (acquired) permits.release();
        }
    }
}
```

- This sketch requires synchronous `work`: it must retain the permit until protected execution
  finishes, including failure. Returning a `Future`/publisher releases too early; an async adapter
  releases exactly once on actual protected completion, not caller timeout/cancellation alone.
  Bound waiting callers separately or use immediate acquisition; timed acquisition alone
  does not bound their count. Propagate interrupted waits to the task owner, which chooses
  cancellation/shutdown handling; do not classify them as saturation or feed them into an
  overload controller as queue timeouts. Timed `tryAcquire(0, unit)` still observes interruption.
- `permits` bounds **work in flight** under that lifecycle contract.
  Requests per second does not, when request cost varies by orders of magnitude.
- The recorded wait time can expose this queue's saturation while CPU on an I/O-bound
  service still looks comfortable; verify that this is the bottleneck being protected.
  Relating wait time, arrival rate and service time is
  `littles-law-and-queueing` — read it there rather than re-deriving it.
- Set each call's wait from remaining deadline minus execution/response budget, capped by
  `maxWaitNanos`; recheck cancellation/slack after acquisition before starting. The sketch
  omits that request-specific integration. Waiting
  longer than the caller will wait produces work nobody receives
  (`timeouts-and-deadlines`).
- Coordinate connector backlog, request workers/event loops and this limit so waiting occurs
  in one bounded observable place. Making a platform-thread pool larger than the concurrency
  limit can itself consume memory/context switches; virtual threads reduce thread cost but not
  held connections or downstream demand.
- Adaptive controllers use different delay/loss signals; minimum latency can drift with
  workload mix and dependencies. Start fixed and adapt only when evidence justifies it.
  Set minimum/maximum limits, sampling and adjustment bounds, recovery hysteresis and a
  fixed fallback. A lower ceiling gates new admissions; it does not stop or reclaim already
  executing work. Classify quota refusals and caller cancellation separately from bottleneck
  congestion; do not decrease capacity on every rejection. Compare goodput, fairness and
  recovery against the fixed baseline under bursts, mix changes and downstream slowdown.

## Deadline-aware queue handling

FIFO can waste scarce execution on requests with little remaining slack under overload.

```java
// Conceptual: skip work whose explicit deadline has passed.
record Job(Runnable work, long enqueuedNanos, long deadlineNanos) {}

Job next = queue.pollFirst();
while (next != null && System.nanoTime() - next.deadlineNanos() >= 0) {
    expired.increment();                     // complete rejection and release queued resources
    next = queue.pollFirst();
}
```

Deadlines here share this JVM's monotonic clock, with differences below 2^63 nanoseconds.
Translate incoming remaining budgets at ingress; do not transport raw `nanoTime` timestamps.
The application must complete each expired job's rejection and release queued resources;
incrementing a counter alone does neither.

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
// retryAfter is a known nonnegative Duration with seconds < Long.MAX_VALUE.
long seconds = retryAfter.getSeconds() + (retryAfter.getNano() == 0 ? 0 : 1);
ProblemDetail body = ProblemDetail.forStatusAndDetail(
        HttpStatus.TOO_MANY_REQUESTS, "Rate limit exceeded for this API key");
return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header(HttpHeaders.RETRY_AFTER, Long.toString(Math.max(1, seconds)))
        .body(body);
```

- `Retry-After` is nonnegative integer delay-seconds or an HTTP date. Round fractional delays
  up, validate representable bounds, and account for wall-clock skew with dates. It describes when retry might be appropriate,
  not a reservation. Omit it when recovery/reset cannot be estimated; publish standard rate-
  limit fields only if their semantics match the implementation.
- Clients should apply jitter around server guidance without retrying before a strict quota
  reset. Server-side randomized advice can spread load, but must not claim an earlier reset
  than policy permits.
- Never return 500 for a limit or a shed. It is indistinguishable from a defect, and a
  client may retry it under its policy. The error format itself belongs to `rpc-and-api-contracts`.
- Document both statuses, the header, and the limit's unit and key in the API contract. An
  undocumented limiter does not shift load, it just relocates the failure into the client.

## Libraries, by role

- **Bucket4j** — a token-bucket implementation with pluggable backends, including distributed
  ones. It gives you the algorithm and the storage; the burst capacity, the key and the
  reconciliation policy are still your decisions.
- **Resilience4j** — a per-instance rate limiter (permits per refresh period) and a bounded
  bulkhead for concurrency limiting. Neither is distributed, and the rate limiter's
  synchronous permit wait can block the caller. Use a zero wait for immediate rejection;
  inspect the selected decorator's waiting/lifecycle contract.
- **The gateway or mesh** — an edge proxy can enforce coarse per-client limits before traffic
  reaches the JVM. It can also shed from its own resource pressure or configured upstream
  signals, but may lack internal JVM queue visibility. Edge replicas still need a defined
  shared quota protocol; placement alone does not make a limit global.

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
- [System.nanoTime contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/System.html#nanoTime()>)
- [Redis scripting atomicity](https://redis.io/docs/latest/develop/programmability/eval-intro/)
- [Redis replication and failover](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)
- [Envoy overload manager](https://www.envoyproxy.io/docs/envoy/latest/configuration/operations/overload_manager/overload_manager)
- [Netflix concurrency-limits: controller algorithms and traffic partitions](https://github.com/Netflix/concurrency-limits)
