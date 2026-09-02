# Hedging, bounding and tail-tolerant routing

The techniques below are Dean & Barroso's ("The Tail at Scale", CACM 56(2), 2013) split
the way the paper splits them: **within-request** responses that act on the request in
flight (hedged and tied requests), and **cross-request** adaptations that change the
system over minutes to hours (micro-partitions, selective replication, latency-induced
probation). Each removes a different kind of tail, and each has a failure mode that shows
up during an incident rather than in the test that justified it. The fan-out root's own
design — choosing N, the completion rule, the hedge cap and the four series that show
whether a hedge is helping — is `scatter-gather`; this file owns the cost model, the
conditions under which each lever backfires, and which lever fits which cause.

## Which lever for which cause

| Cause of the tail (from `attributing-the-tail.md`)                | Lever that fits                                                             | Lever that makes it worse                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Replica-local, uncorrelated: one GC pause, one throttled pod      | Hedge or tied request to a **different** replica; latency-induced probation | Retry against the same replica; a fleet-wide synchronised pause          |
| Fleet-wide, synchronised: every replica pauses in the same window | Fix the pause; or synchronise it deliberately behind a fan-out (below)      | Hedging — the second replica is in the same window                       |
| Saturated shared resource: pool, downstream near capacity         | Cap concurrency, shed, size the pool                                        | Hedging and retry — duplication lands on the saturated resource          |
| Hot key or hot shard                                              | Micro-partitions, selective replication                                     | Hedging — every copy of the request needs the same shard                 |
| One persistently slow replica                                     | Probation / outlier ejection, bounded                                       | Hedging as a permanent patch: a steady 5–10% of traffic doubled for ever |
| Large request blocking small ones                                 | Service classes; time-slice the large request (head-of-line blocking)       | A tighter timeout — the small requests were not the ones taking the time |
| Cold replica after deploy                                         | Warm-up gate, slow-start weighting                                          | Hedging: the hedge costs the cold replica an invocation it needed        |

Owners of the levers this file does not detail: concurrency caps and pool sizing are
`queueing-models` and `rate-limiting-and-load-shedding`; the hot shard is
`hot-partitions-and-rebalancing`; outlier ejection is `load-balancing-and-routing`; the
warm-up gate is `jit-compilation`.

## Hedging: fire the second request only on the timer

A hedge is a duplicate request issued only when the first one has not answered within a
chosen delay. The delay is a percentile of the observed distribution, and that choice is
the entire cost model.

```java
CompletableFuture<Response> primary = callService(request);   // must be idempotent
CompletableFuture<Response> hedge = new CompletableFuture<>();

ScheduledFuture<?> timer = scheduler.schedule(() -> {
    if (!primary.isDone()) {
        callService(request).whenComplete((r, t) -> {
            if (t == null) hedge.complete(r); else hedge.completeExceptionally(t);
        });
    }
}, p95DelayMs, TimeUnit.MILLISECONDS);

CompletableFuture<Response> result = primary.applyToEither(hedge, r -> r);
result.whenComplete((r, t) -> {              // cancel the loser and the pending timer
    timer.cancel(false);
    primary.cancel(true);
    hedge.cancel(true);
});
```

The `isDone()` guard is what makes the cost bounded: only the fraction of requests that
exceed the trigger percentile ever produces a second call. The `whenComplete` on the result
is what stops the loser from consuming the callee after the winner returned — without
cancellation a hedge is pure added load, and a timer that keeps its reference to the
request until it fires is a memory cost per in-flight call. `applyToEither` propagates the
_first_ completion, including an exceptional one; if a primary failure should wait for the
hedge instead, route the primary's exception into the hedge path rather than the result.
Cancelling `sendAsync`'s future in `java.net.http.HttpClient` cancels the request on JDK
16 and later (not verified here on 25); an older client keeps the connection busy until
the response arrives regardless.

### Cost of the trigger percentile

| Trigger | Fraction that hedges | Backend load overhead       |
| ------- | -------------------- | --------------------------- |
| p50     | 50%                  | 1.5x total load — 50% extra |
| p90     | 10%                  | ~10% extra                  |
| p95     | 5%                   | ~5% extra                   |
| p99     | 1%                   | ~1% extra                   |

p95–p99 is the usual range: it removes the extreme tail for 1–5% overhead, and p95 is the
paper's own recommendation (the delay "for more than the 95th-percentile expected latency
for this class of requests" limits extra load to approximately 5%). The paper's BigTable
benchmark — 1,000 keys across 100 servers, a hedge after 10 ms — reports the p99.9 for the
whole fan-out falling from 1,800 ms to 74 ms for 2% more requests (paper figures; full text
not re-fetched here). A p50 trigger cuts p99 harder but sustains 1.5x the backend load
permanently.

The overhead column holds only when the hedge is **cancelled** on the first answer. A
hedge that runs to completion costs the callee the full second execution, and the
"overhead" is then a throughput number, not a latency one.

### The incident failure mode: a fixed trigger becomes a 2x multiplier

The table assumes the trigger is a percentile of the _current_ distribution. In practice
the trigger is a number of milliseconds derived from last month's p95. When the callee
degrades — a shared-resource incident — most requests cross that fixed number, the hedge
rate rises towards 100%, and the callee receives up to twice its offered load at exactly
the moment it has no headroom. Hedging at "5% overhead" is then a 100% overhead lever with
a latency-shaped trigger.

Three controls, in order of preference, and none of them optional:

1. **A hedge budget**, as a rolling ratio of hedges issued to requests issued, checked
   before every hedge and suppressing hedging while over the cap. gRPC's hedging policy
   (gRFC A6) applies its `retryThrottling` (`maxTokens`, `tokenRatio`) to hedged attempts:
   the first attempt always goes, subsequent hedged attempts only while the token count is
   above the threshold — the budget is the load bound, `maxAttempts` (capped at 5) is
   not. The cap-holding and hedge-win-rate series are in `scatter-gather`.
2. **An adaptive trigger** — a percentile of a short recent window — so the hedge rate
   stays near the nominal fraction as the distribution moves. It chases a degraded
   distribution upward, which is correct: a hedge cannot help when every replica is slow.
3. **Server pushback**: gRPC's `grpc-retry-pushback-ms` (negative means "do not retry at
   all") lets a callee switch off the duplication from its side.

### Hedge only what may be duplicated, at one layer, without a retry on top

- **Idempotency is a precondition, not a preference.** A hedge is a deliberate duplicate
  send; a non-idempotent operation executes twice by design. `idempotency` owns the key
  and the dedup store; if the operation has neither, it cannot be hedged.
- **Hedge at exactly one layer.** Hedges compose multiplicatively across layers exactly as
  retries do (below): a hedge inside a hedge is four attempts at the bottom.
- **A call is governed by a hedge policy or a retry policy, not both** (gRFC A6 makes this
  explicit). Hedge plus retry-on-timeout doubles the attempt count and hides the budget.
- **The hedge inherits the remaining deadline**, never a fresh timeout — it is a second
  attempt inside the same budget (`timeouts-and-deadlines`).

### When hedging makes the tail worse

Hedging works when the slowness is **local and uncorrelated** — a GC pause on one replica,
scheduling jitter on one host. When the cause is a **shared resource already saturated** —
a database connection pool, a downstream running near capacity — the duplicate lands on the
same stressed resource at the worst possible moment and deepens the tail it was meant to
cut. When the cause is **correlated across replicas** — a fleet-wide synchronised pause, a
hot key every copy must read — the second copy is as slow as the first and the load is
simply doubled. Confirm the cause is transient and local before switching it on; a growing
queue or an exhausted pool is a capacity problem, and hedging there attacks the symptom
and aggravates the cause.

## Tied requests: enqueue in two places, cancel the loser at dequeue

Tied requests are the paper's stronger variant and are **not** "a hedge sent to a
different replica". The client sends the request to two servers **simultaneously**, each
copy tagged with the identity of the other; when one server _begins executing_ the
request it sends a cancellation to its counterpart, which discards its copy from the
queue. The duplicate therefore costs almost nothing when it is cancelled while still
queued, and the pair tracks queue depth rather than a timer — which is why it removes tail
from queueing, where a timed hedge only removes tail from execution.

The subtlety the paper names: when both queues are empty, both servers start executing
before either cancellation arrives (one network delay in flight each way). The mitigation
is a delay of **twice the average network message delay** — about 1 ms in a data-centre
network — between the first and the second send. Reported result on a BigTable disk-read
benchmark: median latency down 16% and p99.9 down nearly 40% on an idle cluster, with the
gain preserved under a concurrent sort load (paper figures; not re-fetched here).

Tied requests need the callee to implement cancellation at dequeue and to see both
copies' identities; a stateless HTTP callee behind a load balancer cannot. Where that
plumbing is absent, the timed hedge to a different replica is the available approximation,
and it inherits the timer's weakness: it fires late and never on queueing alone.

## Bounding: aggressive timeout plus retry

The complementary lever is to refuse to wait: set the request timeout at the p99 you intend
to promise and retry once, so the retry can land on a different instance through the load
balancer.

```java
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(url))
    .timeout(Duration.ofMillis(perAttemptMs))     // deadline / attempts, not the deadline
    .build();

for (int attempt = 0; attempt < 2; attempt++) {
    try {
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (HttpTimeoutException e) {
        if (attempt == 1) throw e;
        if (!retryBudget.tryAcquire()) throw e;   // fleet-level bound, not a local count
    }
}
```

This converts a long tail into a bounded latency plus an error rate. Three conditions make
the trade legitimate:

- **The operation is safe to repeat.** A timeout is ambiguous — the callee may have
  completed the work — so a retry after a timeout is only safe under idempotency.
- **The attempts fit the deadline.** Two attempts at the p99 timeout is a worst case of
  twice the p99, plus backoff; the caller's deadline has to hold that, or the second
  attempt is work the caller will never read.
- **The retry is budgeted, not counted.** Google's SRE book (ch. 22, "Addressing
  Cascading Failures") gives the arithmetic: with each of three layers retrying three
  times, one user action can reach the bottom layer as `4³ = 64` attempts, and 100 QPS of
  failures becomes 300+ QPS of retries. A per-client retry budget as a fraction of
  successful traffic (10% is the common starting point) is the only bound on
  amplification that survives an incident; a per-call attempt count is not.
  `retries-and-backoff` owns the policy — jittered exponential backoff, retry at one
  layer, honouring `Retry-After` and the remaining deadline.

The retry storm is the tail's own cascade: retries add load to a callee _because_ it is
slow, its tail lengthens, more calls time out, more retries follow. `cascading-failures`
owns the loop and its four closure points; the decision that belongs here is that a
timeout-plus-retry policy is a tail lever only while the retry rate stays a small fraction
of traffic, and must degrade to "fail fast" — not "retry harder" — when it does not.

## Cross-request adaptations from the paper

- **Micro-partitions.** Many more partitions than machines — the paper's example is
  BigTable tablets, many per machine — so load moves in small units and a failed
  machine's work is spread over many others rather than one. The JVM-side analogue is
  Kafka partitions and cache shards; a hot partition still needs
  `hot-partitions-and-rebalancing`.
- **Selective replication.** Extra replicas of the hot items only, detected from access
  frequency, so the hot key's tail is served by more copies without replicating everything.
- **Latency-induced probation.** A replica that is slow is temporarily removed from the
  serving set while it keeps receiving **shadow** requests, so its recovery is observed
  without users paying for it. The paper's observation is that removing capacity during
  high load can _improve_ latency, because the slow replica was lengthening every fan-out
  that touched it. The hazard is the one `load-balancing-and-routing` names: a
  shared-dependency blip makes every replica slow at once, and unbounded ejection removes
  the fleet. Cap ejection at a fraction of the upstream, and eject on the replica's
  latency _relative to its peers_, never on an absolute threshold that all of them cross
  together.
- **Good-enough results.** Once a sufficient fraction of leaves has answered, return with
  a completeness flag rather than waiting for the last one — the paper's search leaves.
  This trades result completeness for the tail, and `scatter-gather` owns the completion
  rule (k-of-N by deadline) and the partial-results contract.
- **Canary requests.** For a very wide fan-out, send the request to one or two leaves
  first and to the rest only after they succeed, so a query that crashes leaves cannot
  crash all of them. It costs one leaf round trip on every request; the paper accepts that
  cost for high fan-out, and it is the wrong trade at N of a few.

## Reducing the component's own variability

The paper's component-level list is what to do before reaching for any of the above,
because each of the above pays for a tail that these remove:

- **Service classes and shallow low-level queues.** Keep the OS or device queue short and
  do the prioritisation in a higher-level queue the application controls, so an
  interactive request is not stuck behind a batch one that was already handed to the
  kernel. `rate-limiting-and-load-shedding` owns criticality-based shedding.
- **Head-of-line blocking.** Time-slice large requests so a small one interleaves rather
  than waits; a tighter timeout on the small request does nothing for it.
- **Background activity: throttle, shrink, and — behind a fan-out — synchronise.** A GC
  or compaction that runs at a random moment on each of 100 leaves hits some leaf on most
  fan-out requests; the same pause scheduled in the **same** window on every leaf hits
  all of them in one brief window and none of them otherwise, so the fan-out's tail is
  smaller. This is the counter-intuitive one, and it inverts outside a fan-out: for
  independent, load-balanced replicas the same synchronisation creates a fleet-wide pause
  that hedging cannot route around. Decide from the topology, not from the pause.

## Latency-aware balancing: P2C is not least-connections

Both beat round-robin with heterogeneous backends, but for different reasons, and treating
them as interchangeable is a common misconfiguration.

| Aspect                         | Power of Two Choices (P2C)                                                                                      | Deterministic least-connections                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sampling                       | 2 random backends per decision                                                                                  | Every backend consulted (a scan, or an index kept in step with the counts)                                                                                            |
| Decision metric                | Lower load of the two sampled                                                                                   | Lowest active connection count overall                                                                                                                                |
| Real implementations           | Envoy `least_request` (`choice_count` default 2 — this _is_ P2C, despite the name); HAProxy `balance random(2)` | HAProxy `leastconn`; Nginx `least_conn`                                                                                                                               |
| Cost per decision              | O(1)                                                                                                            | Grows with the number of backends                                                                                                                                     |
| With stale or shared-view load | Two random samples rarely agree on the same backend, so herding is bounded                                      | Independent deciders — many client-side balancers, several proxy replicas, a load signal updated periodically — all pick the same "least loaded" backend and flood it |
| Theoretical guarantee          | Expected maximum load grows as O(log log N)                                                                     | None equivalent — it is deterministic, not randomised                                                                                                                 |

Within a single balancer process whose counts update synchronously, full-information
least-connections does not herd; the failure mode needs **independent deciders or stale
information**, which is the normal production shape — every client-side balancer, every
proxy replica, a latency EWMA refreshed on a period. Mitzenmacher's follow-up result on
old information ("How Useful Is Old Information?", IEEE TPDS 2000) is the formal version:
with stale load data, choosing the least loaded of _all_ servers is worse than choosing
the better of a small random sample, and the gap widens as the data ages.

The O(log log N) guarantee comes from the balls-into-bins result (Azar, Broder, Karlin and
Upfal; popularised by Mitzenmacher): with one random bin per ball the fullest bin holds
`Θ(log N / log log N)` balls with high probability; sampling two and taking the lesser
drops that to `Θ(log log N)`. It is an idealised model, not a simulation of HTTP queues with
variable service times, but it explains why sampling two captures most of the benefit of
consulting all — without the per-decision cost or the herding failure mode.
`load-balancing-and-routing` owns the algorithm choice in full.

## Validating a mitigation

- The cause was named first, and the lever chosen from the table at the top of this file.
- The trigger percentile was chosen from the cost table, and a hedge budget or adaptive
  trigger bounds the incident case — the number to publish is the hedge rate under the
  worst degradation the callee has shown, not the nominal 5%.
- The hedged or retried operation is idempotent, governed by one policy, at one layer.
- If the slowness came from a saturated shared resource, hedging was evaluated against the
  correlated-cause risk before being switched on.
- The choice between P2C and deterministic least-connections was deliberate.
- The improvement was measured on the same percentiles used to diagnose the problem —
  never on p50 alone — and the callee's request rate was measured, not inferred.
