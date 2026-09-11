# Cutting the amplification points before the incident

Each amplification point can turn slowdown into more work or held resources. Cutting a measured
edge can break one loop; simultaneous loops and shared infrastructure still need failure tests.

## The four points and their controls

| Point                    | What it amplifies                                          | Control                                                                        | Owner                                |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Retry                    | one logical call into N requests, multiplied across layers | one retrying layer, full jitter, a retry **budget** rather than an attempt cap | `retries-and-backoff`                |
| Unbounded queue          | overload into latency/memory and expired work              | bounded queue + deadline/priority/durability-aware rejection or expiry         | `rate-limiting-and-load-shedding`    |
| Pool / thread exhaustion | one slow dependency into failure of unrelated endpoints    | one limit per dependency, `tryAcquire` with a timeout                          | `concurrency-limiting-and-bulkheads` |
| Timeout stack            | an abandoned call into resources held for the difference   | deadline propagation; inner bound < caller's remaining budget                  | `timeouts-and-deadlines`             |

Two controls are worth stating as arithmetic a reviewer can check:

```text
Sequential local time + Σ attempt durations + Σ backoff + cleanup reserve
    ≤ remaining end-to-end budget
Σ (replica admission ceiling × bounded per-permit fan-out) + additional live demand
    ≤ dependency's safe concurrent-work budget
```

Sum sequential durations, not nested enclosing timeouts: a 200 ms child call inside a 300 ms
parent budget consumes part of that 300 ms, not 500 ms. Parallel branches consume their longest
required duration but all their resource demand. Include pool acquisition and retry backoff.
For concurrency, use maximum active replicas including rollout surge and failure traffic; compare
in-flight operations with in-flight capacity, never directly with requests/second. The ceiling
term bounds downstream work only while permits cover its actual resource lifetime. Include live
work no longer represented by those ceilings: lowering a limit gates new starts, but previously
admitted work can still be draining, including on removed replicas or after caller timeout.
Account for retries, half-open probes, cache warming, replay and other callers outside the same
controls; do not count them twice when already covered. Route per-shard skew and other tenants
explicitly. If surviving work cannot be bounded, the configured sum does not establish safe
exposure. Static checks find inconsistent budgets; cancellation, real capacity and isolation
still require runtime evidence (`distributed-systems-testing`).

## Bounding the queue is not optional

An executor with an unbounded queue provides no early overload signal; latency and retained
memory can grow until external failure, shutdown or `OutOfMemoryError`:

Partial Java 11+ snippet using `java.util.concurrent` imports; Java 17 API contracts were checked.
Inspect the target toolchain and executor ownership before adapting it; no dependency upgrade is
required. Sizes below illustrate a bound, not measured production capacity.

```java
// Unbounded queue; default AbortPolicy still rejects after shutdown, not on queue overload.
new ThreadPoolExecutor(8, 8, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());

// Bounded, with an explicit, countable rejection.
var executor = new ThreadPoolExecutor(
        8, 8, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(200),
        new ThreadPoolExecutor.AbortPolicy());   // catch RejectedExecutionException at submission
```

The owner must shut down and await termination with a bounded policy; do not create a pool per
request. Map rejection to the application contract (for HTTP, commonly 503), and advertise a
retry delay only when justified and compatible with retry budgets. Preserve or explicitly reject
accepted durable work; rejection must not become a silent successful submission.

`CallerRunsPolicy` is not a rejection: it applies backpressure by executing the task on the
submitting thread, which on a request thread means the request thread becomes the worker. It
can throttle an internal producer, but defeats isolation when the submitter must remain responsive
(especially an event loop). It silently discards the task after shutdown, so it is unsuitable when
submission requires explicit acceptance/rejection or durable delivery without additional handling.

The same rule applies to queues you did not write: an HTTP client's pending-acquire queue, a
message consumer's prefetch buffer, an in-memory batch accumulator. Each needs a bound and a
defined rejection.

## Criticality classification

Do this per dependency, in writing, before the design review ends. It is the control that
turns a shared outage into a degraded feature.

```text
Critical — the request cannot produce a correct answer without it:
- the system of record for the data being returned or written
- the authoriser for a request that must not be served unauthorised
Behaviour when the required capability is unavailable: fail closed, fast, with a typed
error. Never bypass its correctness or security contract to produce a successful response.

Degradable — this operation has a correct, explicitly lower-quality answer without it:
- enrichment, recommendation, personalisation, A/B assignment, analytics
- an audit/metrics write only when policy permits and it is durably captured elsewhere
Behaviour on failure: return a defined degraded response — a default, a stale
cached value with an explicit staleness marker (caching-strategies), or omission —
recorded on a degraded-response counter so the degradation is visible.

Declared degradable but implemented as required — treat as critical until fixed:
- called synchronously, no timeout shorter than the request budget, no fallback branch,
  no breaker. This is the classification error that causes the outage: nobody believed
  the dependency mattered, and the code made it required.
```

Classify the required capability separately from one provider. An accepted alternative that
preserves the full contract is not feature degradation; account for its load and any uncertain
primary effect before invoking it. A stale authorization decision is not automatically such an
alternative just because it is cached.

The test that this classification is real: for each non-critical dependency, there is a test
that makes it fail and asserts the endpoint still returns a successful, degraded response —
and a metric that increments when it does. A classification held only in a document is not
implemented.

**Fail open is a security decision, not a synonym for feature degradation.** For an authoriser, a
quota enforcer or a fraud check, failing open admits requests that should have been refused;
that trade must be made deliberately and recorded, not inherited from a `catch` block.

## Design-review checklist

- [ ] Sequential work and retries fit the remaining deadline; nested budgets are not double-counted.
- [ ] Retry ownership is explicit; layered retries have non-overlapping purposes and one bounded
      end-to-end attempt budget rather than an accidental multiplier.
- [ ] The retry policy has a budget, not just an attempt count.
- [ ] Every queue and executor is bounded, with a rejection mapped to a real response.
- [ ] There is one concurrency limit per dependency, not one shared across all of them.
- [ ] Aggregate live demand includes fan-out, rollout surge, surviving work and recovery callers
      outside the same controls, and fits measured capacity.
- [ ] Every dependency is labelled critical or non-critical, and each non-critical one has a
      degraded behaviour with a test and a counter.
- [ ] Readiness includes downstream health only when no admitted traffic can be served correctly
      without it; liveness avoids remote dependencies (`kubernetes-service-lifecycle`).
- [ ] Shed rate, successful goodput and queue age are visible. Count shed eligible requests according
      to the service SLI; do not hide lost availability because rejection is intentional (`slo-and-alerting`).
- [ ] The runbook names which lever to pull first and who may pull it, so the decision is not
      made at 03:00 for the first time.
