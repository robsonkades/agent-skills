# Cutting the amplification points before the incident

Each amplification point is a place where a slowdown is turned into more load or more held
resources. Cutting one breaks the loop; cutting all four makes the cascade a local failure.

## The four points and their controls

| Point                    | What it amplifies                                          | Control                                                                        | Owner                                |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Retry                    | one logical call into N requests, multiplied across layers | one retrying layer, full jitter, a retry **budget** rather than an attempt cap | `retries-and-backoff`                |
| Unbounded queue          | overload into latency/memory and expired work              | bounded queue + deadline/priority/durability-aware rejection or expiry         | `rate-limiting-and-load-shedding`    |
| Pool / thread exhaustion | one slow dependency into failure of unrelated endpoints    | one limit per dependency, `tryAcquire` with a timeout                          | `concurrency-limiting-and-bulkheads` |
| Timeout stack            | an abandoned call into resources held for the difference   | deadline propagation; inner bound < caller's remaining budget                  | `timeouts-and-deadlines`             |

Two controls are worth stating as arithmetic a reviewer can check:

```text
Σ (per-hop timeout) + Σ backoff   ≤   the caller's budget          # no unreachable attempts
concurrency limit × replica count ≤   the dependency's published capacity
```

Both are properties of configuration and can be asserted in a test with no network — see
`distributed-systems-testing`.

## Bounding the queue is not optional

An executor with an unbounded queue provides no early overload signal; latency and retained
memory can grow until external failure, shutdown or `OutOfMemoryError`:

```java
// The default shape to find and delete: unbounded queue, no rejection policy.
new ThreadPoolExecutor(8, 8, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>());

// Bounded, with an explicit, countable rejection.
var executor = new ThreadPoolExecutor(
        8, 8, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(200),
        new ThreadPoolExecutor.AbortPolicy());   // caller must map this to 503 + Retry-After
```

`CallerRunsPolicy` is not a rejection: it applies backpressure by executing the task on the
submitting thread, which on a request thread means the request thread becomes the worker. It
is correct for an internal producer you want to slow down, and wrong on a request path.

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
Behaviour on failure: fail closed, fast, with a typed error. Do not fall back.

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

The test that this classification is real: for each non-critical dependency, there is a test
that makes it fail and asserts the endpoint still returns a successful, degraded response —
and a metric that increments when it does. A classification held only in a document is not
implemented.

**Fail open is a security decision, not a synonym for feature degradation.** For an authoriser, a
quota enforcer or a fraud check, failing open admits requests that should have been refused;
that trade must be made deliberately and recorded, not inherited from a `catch` block.

## Design-review checklist

- [ ] Every remote call has a timeout, and the sum down the path fits the caller's budget.
- [ ] Retry ownership is explicit; layered retries have non-overlapping purposes and one bounded
      end-to-end attempt budget rather than an accidental multiplier.
- [ ] The retry policy has a budget, not just an attempt count.
- [ ] Every queue and executor is bounded, with a rejection mapped to a real response.
- [ ] There is one concurrency limit per dependency, not one shared across all of them.
- [ ] `limit × replicas` was compared against what the dependency published.
- [ ] Every dependency is labelled critical or non-critical, and each non-critical one has a
      degraded behaviour with a test and a counter.
- [ ] Readiness does not depend on a downstream call; liveness does not depend on anything
      remote (`kubernetes-service-lifecycle`).
- [ ] Shed rate, goodput and queue time are on the dashboard, and shed rate is not alerted as
      an error rate (`slo-and-alerting`).
- [ ] The runbook names which lever to pull first and who may pull it, so the decision is not
      made at 03:00 for the first time.
