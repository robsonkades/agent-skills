# Hedging, bounding and tail-tolerant routing

## Hedging: fire the second request only on the timer

A hedge is a duplicate request issued only when the first one has not answered within a
chosen delay. The delay is a percentile of the observed distribution, and that choice is
the entire cost model.

```java
CompletableFuture<Response> primary = callService(request);
CompletableFuture<Response> result = new CompletableFuture<>();
primary.thenAccept(result::complete);

scheduler.schedule(() -> {
    if (!result.isDone()) {
        callService(request).thenAccept(result::complete);
    }
}, p90DelayMs, TimeUnit.MILLISECONDS);
```

The `isDone()` guard is what makes the cost bounded: only the fraction of requests that
exceed the trigger percentile ever produces a second call.

### Cost of the trigger percentile

| Trigger | Fraction that hedges | Backend load overhead       |
| ------- | -------------------- | --------------------------- |
| p50     | 50%                  | 1.5x total load — 50% extra |
| p90     | 10%                  | ~10% extra                  |
| p95     | 5%                   | ~5% extra                   |
| p99     | 1%                   | ~1% extra                   |

p95–p99 is the usual sweet spot: it removes the extreme tail for 1–5% overhead. A p50
trigger cuts p99 harder but sustains 1.5x the backend load permanently.

### When hedging makes the tail worse

Hedging works when the slowness is **local and uncorrelated** — a GC pause on one replica,
scheduling jitter on one host. When the cause is a **shared resource already saturated** —
a database connection pool, a downstream running near capacity — the duplicate lands on the
same stressed resource at the worst possible moment and deepens the tail it was meant to
cut.

Two conditions reduce that risk:

- **Route the hedge to a genuinely independent replica**, not the same instance or pool
  that is slow. This is the "tied requests" idea: send the second copy to a different
  server and cancel the loser as soon as a winner responds.
- **Confirm the cause is transient and local** rather than a systemic capacity condition. A
  growing queue or an exhausted pool is a capacity problem; hedging there attacks the
  symptom and aggravates the cause.

## Bounding: aggressive timeout plus retry

The complementary lever is to refuse to wait: set the request timeout at the p99 you intend
to promise and retry, so the retry can land on a different instance through the load
balancer.

```java
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(url))
    .timeout(Duration.ofMillis(p99SLO))
    .build();

for (int attempt = 0; attempt < 2; attempt++) {
    try {
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException e) {
        if (attempt == 1) throw e;
    }
}
```

This converts a long tail into a bounded latency plus an error rate. That trade is only
acceptable when the operation is safe to repeat.

## Latency-aware balancing: P2C is not least-connections

Both beat round-robin with heterogeneous backends, but for different reasons, and treating
them as interchangeable is a common misconfiguration.

| Aspect                   | Power of Two Choices (P2C)                                                                                      | Deterministic least-connections                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sampling                 | 2 random backends per decision                                                                                  | All backends (full scan)                                                                                                           |
| Decision metric          | Lower estimated load/latency of the two sampled                                                                 | Lowest active connection count overall                                                                                             |
| Real implementations     | Envoy `least_request` (`choice_count` default 2 — this _is_ P2C, despite the name); HAProxy `balance random(2)` | HAProxy `leastconn`; Nginx `least_conn`                                                                                            |
| Cost per decision        | O(1)                                                                                                            | O(N) in the number of backends                                                                                                     |
| Under a concurrent burst | Collisions scatter statistically across different random pairs                                                  | Vulnerable to simultaneous convergence: concurrent decisions can all see the same backend as least loaded and route to it together |
| Theoretical guarantee    | Expected maximum load grows as O(log log N)                                                                     | None equivalent — it is deterministic, not randomised                                                                              |

The guarantee comes from the balls-into-bins result (Azar, Broder, Karlin and Upfal;
popularised by Mitzenmacher): with one random bin per ball the fullest bin holds
`Θ(log N / log log N)` balls with high probability; sampling two and taking the lesser
drops that to `Θ(log log N)`. It is an idealised model, not a simulation of HTTP queues with
variable service times, but it explains why sampling two captures most of the benefit of
scanning all — without the O(N) cost or the concurrent-convergence failure mode.

## Validating a mitigation

- The trigger percentile was chosen from the cost table, not arbitrarily.
- If the slowness came from a saturated shared resource, hedging was evaluated against the
  correlated-cause risk before being switched on.
- The choice between P2C and deterministic least-connections was deliberate.
- The improvement was measured on the same percentiles used to diagnose the problem —
  never on p50 alone.
