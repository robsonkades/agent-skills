# Choosing limits and shedding policy

## The two mechanisms, side by side

|                       | Rate limiting                                 | Load shedding                                              |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Input to the decision | Policy key/cost and recent or reserved usage  | Current bottleneck, deadline slack and available capacity  |
| Active when idle      | Yes — the quota is enforced regardless        | No — nothing is shed while there is headroom               |
| Protects              | Other clients, from one client                | The service, from all clients together                     |
| Typical response      | 429; optional meaningful `Retry-After`        | 503/overload result; optional meaningful `Retry-After`     |
| Fails to help when    | Aggregate legitimate traffic exceeds capacity | The problem is one abusive client inside a large aggregate |
| Tuned from            | The contract or the fair share                | Measured capacity and queue behaviour                      |

A service with only limits collapses under legitimate traffic. A service with only shedding
lets one client consume everybody's capacity right up to the point of shedding. They are
complements, never substitutes.

## Rate-limiting algorithms

| Algorithm              | Burst behaviour                                                                                                   | Memory per key                                                     | The failure it has                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Fixed window           | Up to **2× the rate** across a boundary — a full window at the end of one, a full window at the start of the next | One counter + window stamp                                         | The boundary. Invisible in any test that does not straddle one                                        |
| Sliding window log     | Exact accepted-count window with atomic prune/check/insert                                                        | One timestamp per retained accepted request; bound keys separately | Storage/operation cost grows with limit and active keys; logging rejected attempts can grow unbounded |
| Sliding window counter | Approximate; smooths the boundary by weighting the previous window                                                | Two counters                                                       | Error depends on within-window clustering; not necessarily small                                      |
| Token bucket           | Explicit burst = capacity, then the sustained refill rate                                                         | Two numbers                                                        | Capacity left equal to the rate, i.e. burst policy never actually chosen                              |
| Leaky bucket (queue)   | No burst out; bursts are queued and smoothed                                                                      | Queue                                                              | It **adds latency by design**, and the queue is a place requests wait past their deadline             |

Defaults that hold up: **token bucket** for client quotas, because bursts are legitimate and
capacity states the policy; **sliding window counter** when you need a simple approximation
with tiny state; **leaky bucket** only when a downstream genuinely requires smooth arrivals,
and then bound the queue and give it a deadline check.

## Distributed limits, and what each gets wrong

| Strategy                                            | Enforcement                                                                   | The error it admits                                                                                        | Cost                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Per-replica static share                            | Conservative/local under stable assumptions                                   | Underutilization under skew; aggregate changes with membership unless admission is consistently routed     | Free hot path; operational membership coupling  |
| Atomic shared counter/reservation                   | Defined by store consistency and algorithm                                    | Store latency/outage/hot key; race-free only with one atomic script/transaction and exact expiry semantics | One shared operation per request or reservation |
| **Local bucket from non-overlapping escrow grants** | Exact up to issued-grant semantics; temporarily underutilizes stranded grants | Sum of unspent grants is unavailable elsewhere; unsafe allocator failover can double-issue                 | Background grant protocol and lease/epoch state |
| Limit at the edge proxy only                        | Before the JVM; global only with coordinated enforcement                      | Visibility/key precision depends on configuration; edge replicas can multiply local quotas                 | Early rejection; coordination may add cost      |

State the bound from the actual algorithm. In escrow, a coordinator allocates portions whose
sum never exceeds the global budget; partitions strand allowance and reduce availability but
need not over-admit. In eventually reconciled independent buckets, overage depends on every
bucket's initial/refill allowance and partition duration. Prove allocator failover does not
double-issue an epoch. Contractual limits need precise window/burst/error semantics.

For example, a weighted counter at halfway through a window estimates half of the previous
count. If all 100 previous arrivals occurred near its end, the rolling window can still contain
all 100 while the estimate counts only 50. Do not advertise an exact rolling quota from this model.

Sequencing is worth a line: an edge limit that stops obvious abuse cheaply, plus in-process
shedding that protects against everything the edge cannot see, covers far more than either
alone.

## Saturation signals for shedding

| Signal                                    | Leads or lags      | Use it when                                      | Why it misleads                                                                                      |
| ----------------------------------------- | ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Time waiting in queue                     | Leads              | Almost always — the best single signal           | Only if the queue you measure is the real one                                                        |
| Queue depth                               | Leads              | Cheap to expose; pair it with wait time          | Depth without service time says nothing about delay                                                  |
| In-flight concurrency vs a measured limit | Leads              | Cost varies by orders of magnitude               | The limit has to be measured, not guessed                                                            |
| CPU utilisation                           | Workload-dependent | CPU-bound bottleneck and throttling are measured | It misses I/O saturation and can be distorted by cgroup throttling/steal; it may lead or lag latency |
| Error rate from downstreams               | Lags               | As corroboration                                 | It is the consequence, not the cause                                                                 |
| Heap or GC pressure                       | Workload-dependent | Memory is the measured constrained resource      | Allocation bursts and GC cycles make raw occupancy noisy; calibrate headroom and recovery            |

The queue you can see is not always the one that matters. Requests also wait in the
connector's accept queue and the OS backlog, requiring layer-specific instrumentation. Coordinate
worker, connector and admission bounds to avoid hidden or unbounded waiters; increasing the
worker pool alone neither relocates all waiting nor guarantees observability.

## Priority classes

Uniform shedding degrades everything a little, including the traffic whose failure costs most.
Classify, then shed from the bottom:

1. **Control/lifecycle plane** — health, readiness and bounded recovery/admin operations.
   Reserve separate small capacity and authenticate it; even this class needs abuse and
   emergency bounds.
2. **Interactive user requests** — a person is waiting. Shed last.
3. **Non-interactive but user-visible** — background refresh, prefetch, recommendations.
4. **Batch, replay, backfill, crawler** — shed first, and shed hard.

- Priority must come from something trustworthy. A client-supplied header is a request, not a
  fact: an authenticated tenant tier or an internal call path is a fact. Otherwise every
  client is high priority within a week.
- Retries deserve their own class. A retried request has already consumed capacity once; under
  overload, shedding retries before first attempts limits amplification — the amplification
  itself is `retries-and-backoff` and its system-wide form is `cascading-failures`.

## Deadline-aware rejection

Under overload, first discard work with an expired/cancelled deadline. For remaining work,
queue discipline is a decision:

- **Reject new/tail-drop:** simple, preserves FIFO/fairness and work already queued; callers get
  immediate feedback, but old requests may have little slack.
- **Drop expired/head or controlled LIFO:** can maximize within-deadline goodput before work
  starts, but risks starvation and adversarial displacement.
- **Earliest deadline/priority:** aligns with usefulness when deadlines/costs are trustworthy,
  but requires authenticated metadata and guards against starvation.

Never evict work already executing unless its cancellation semantics are safe; sunk work and
remote effects change the economics. Bound every queue and expose age/slack by class.

## What to alert on, what to plot

- **Page on goodput and on the latency of admitted work.** Those describe what users get.
- **Plot** shed rate, 429 rate, queue wait time and in-flight concurrency. A rising shed rate
  with flat admitted-latency is the mechanism working correctly.
- Count shed required traffic in its user-facing SLI. Alert from error-budget burn and class,
  while using internal shed rate to explain why the service remained stable. A brief expected
  batch rejection and one rejected payment request have different policies.
- Investigate **zero** shedding paired with rising latency: verify saturation and the configured
  signal before blaming protection; latency can rise for reasons the shedder does not control.
- Per-client 429 rate is a product signal as much as an operational one: one client at its
  limit constantly may indicate plan mismatch, abuse or a limiter regression; investigate context.

## Load-testing the rejection path

The happy path proves nothing about overload. `load-testing` owns generating the load; what to
assert is here.

1. **Drive past capacity in steps** — 0.8×, 1.0×, 1.5×, 3× measured capacity — with an
   **open-loop** generator. A closed-loop generator throttles itself against the slowdown and
   can under-expose offered-load overload (`coordinated-omission`).
2. **Assert goodput does not collapse.** Beyond capacity, successful-inside-deadline responses
   should stay near the measured capacity envelope for a stable workload/bottleneck. A collapse
   calls for checking rejection cost, downstream capacity, workload mix and generator validity.
3. **Assert rejection is cheap.** At 3× load, per-rejection CPU cost should be a small fraction
   of a success. Total CPU can still rise because even cheap rejection has nonzero cost;
   measure marginal rejection cost and remaining headroom before inferring rejection is too late.
4. **Assert class isolation and fairness.** Send mixed authenticated priority traffic, confirm
   reservations and shedding order, then attack the high-priority path and prove its own bound.
5. **Assert recovery.** Drop the load back to 0.8× and measure how long until shedding stops.
   Continued shedding can reflect undrained queues, controller recovery or continuing downstream
   saturation; use signal history to distinguish them.

Also test membership changes and limiter-store partitions, cost-estimation abuse, a single hot
tenant, downstream slowdown at constant arrival rate, cancellation and clock jumps. Report
offered—not merely admitted—load or successful shedding will make traffic appear to disappear.
Keep eligible offered traffic in the availability denominator and show admitted-only latency
separately. For 100 eligible requests, 80 fast successes and 20 shed requests yield 80% success,
not 100%; planned quota exclusions must precede the observation. Invalid generator/measurement
results are inconclusive, not evidence that overload handling passed.

## Primary references

- [RFC 6585 §4: 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585#section-4)
- [RFC 9110 §10.2.3: Retry-After](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)
- [Google SRE: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [CoDel controlled delay queue management](https://queue.acm.org/detail.cfm?id=2209336)
