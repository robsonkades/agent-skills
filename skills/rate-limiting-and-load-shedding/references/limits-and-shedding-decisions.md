# Choosing limits and shedding policy

## The two mechanisms, side by side

|                       | Rate limiting                                 | Load shedding                                              |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Input to the decision | Who the client is, and their recent usage     | How saturated _this instance_ is right now                 |
| Active when idle      | Yes — the quota is enforced regardless        | No — nothing is shed while there is headroom               |
| Protects              | Other clients, from one client                | The service, from all clients together                     |
| Typical response      | 429 with `Retry-After`                        | 503 with `Retry-After`                                     |
| Fails to help when    | Aggregate legitimate traffic exceeds capacity | The problem is one abusive client inside a large aggregate |
| Tuned from            | The contract or the fair share                | Measured capacity and queue behaviour                      |

A service with only limits collapses under legitimate traffic. A service with only shedding
lets one client consume everybody's capacity right up to the point of shedding. They are
complements, never substitutes.

## Rate-limiting algorithms

| Algorithm              | Burst behaviour                                                                                                   | Memory per key                                                       | The failure it has                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Fixed window           | Up to **2× the rate** across a boundary — a full window at the end of one, a full window at the start of the next | One counter + window stamp                                           | The boundary. Invisible in any test that does not straddle one                            |
| Sliding window log     | Exact over the window                                                                                             | One timestamp per request in the window — attacker-controlled growth | Memory; unusable for high rates or many keys                                              |
| Sliding window counter | Approximate; smooths the boundary by weighting the previous window                                                | Two counters                                                         | Approximation error near the boundary, bounded and small                                  |
| Token bucket           | Explicit burst = capacity, then the sustained refill rate                                                         | Two numbers                                                          | Capacity left equal to the rate, i.e. burst policy never actually chosen                  |
| Leaky bucket (queue)   | No burst out; bursts are queued and smoothed                                                                      | Queue                                                                | It **adds latency by design**, and the queue is a place requests wait past their deadline |

Defaults that hold up: **token bucket** for client quotas, because bursts are legitimate and
capacity states the policy; **sliding window counter** when you need a simple approximation
with tiny state; **leaky bucket** only when a downstream genuinely requires smooth arrivals,
and then bound the queue and give it a deadline check.

## Distributed limits, and what each gets wrong

| Strategy                                               | Enforcement                      | The error it admits                                                                                                                 | Cost                                                           |
| ------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Per-replica limit = `fleet / replicas`                 | Local only                       | Wrong under uneven balancing (some replicas reject while others idle) and wrong during any rollout, since the replica count changes | Free                                                           |
| Shared counter per request (Redis)                     | Close to the fleet rate          | Bounded by races on the counter; the store becomes a required dependency on every request                                           | One round trip per request; an availability decision on outage |
| **Local bucket + periodic lease from a shared budget** | Approximate, with a stated bound | Over-admission up to roughly `replicas × local burst` per reconciliation interval                                                   | One background round trip per interval per replica             |
| Limit at the edge proxy only                           | Fleet-wide, before the JVM       | Cannot see per-instance saturation; coarse keys only                                                                                | Cheapest rejection available                                   |

State the bound. "The fleet limit is 1000 rps" is a claim you cannot support with local
buckets; "1000 rps sustained, with up to `replicas × burst` extra admitted within any one-
second reconciliation interval" is one you can. If the limit is contractual, that sentence
belongs in the API documentation.

Sequencing is worth a line: an edge limit that stops obvious abuse cheaply, plus in-process
shedding that protects against everything the edge cannot see, covers far more than either
alone.

## Saturation signals for shedding

| Signal                                    | Leads or lags   | Use it when                             | Why it misleads                                                                                                     |
| ----------------------------------------- | --------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Time waiting in queue                     | Leads           | Almost always — the best single signal  | Only if the queue you measure is the real one                                                                       |
| Queue depth                               | Leads           | Cheap to expose; pair it with wait time | Depth without service time says nothing about delay                                                                 |
| In-flight concurrency vs a measured limit | Leads           | Cost varies by orders of magnitude      | The limit has to be measured, not guessed                                                                           |
| CPU utilisation                           | **Lags**        | CPU-bound work only                     | An I/O-bound service saturates pools and queues at moderate CPU; by the time CPU is high, latency broke minutes ago |
| Error rate from downstreams               | Lags            | As corroboration                        | It is the consequence, not the cause                                                                                |
| Heap or GC pressure                       | Lags, and noisy | Never as the primary trigger            | Attribution is `java-performance`, not a shedding signal                                                            |

The queue you can see is not always the one that matters. Requests also wait in the
connector's accept queue and the OS backlog, where the application cannot measure them. Size
the container's worker pool above your admission limit so that waiting happens where you have
instrumentation.

## Priority classes

Uniform shedding degrades everything a little, including the traffic whose failure costs most.
Classify, then shed from the bottom:

1. **Control plane** — health checks, readiness, admin. Never shed; shedding these gets the
   instance killed or ejected while it is still useful.
2. **Interactive user requests** — a person is waiting. Shed last.
3. **Non-interactive but user-visible** — background refresh, prefetch, recommendations.
4. **Batch, replay, backfill, crawler** — shed first, and shed hard.

- Priority must come from something trustworthy. A client-supplied header is a request, not a
  fact: an authenticated tenant tier or an internal call path is a fact. Otherwise every
  client is high priority within a week.
- Retries deserve their own class. A retried request has already consumed capacity once; under
  overload, shedding retries before first attempts limits amplification — the amplification
  itself is `retries-and-backoff` and its system-wide form is `cascading-failures`.

## Oldest-first rejection

Under overload, reject the **oldest** queued work first.

- It has consumed the most of its caller's budget and is closest to (or past) its deadline.
- The caller has most likely already timed out, so completing it delivers a response nobody
  receives — capacity spent for zero goodput.
- FIFO under sustained overload maximises exactly that outcome: everything is served, everything
  is served late, and almost nothing arrives in time. Serving newest-first (or dropping the
  head) means a subset of requests completes within deadline instead of all of them missing.

The cost is fairness: the shed requests are systematically the ones that waited longest, so
under sustained overload a specific caller can starve. Bound it — cap how long the LIFO regime
persists, or fall back to FIFO once wait time recovers below the threshold. The rule is a
tactic for the overloaded regime, not the normal service discipline.

## What to alert on, what to plot

- **Page on goodput and on the latency of admitted work.** Those describe what users get.
- **Plot** shed rate, 429 rate, queue wait time and in-flight concurrency. A rising shed rate
  with flat admitted-latency is the mechanism working correctly.
- Alert on shedding only when it is _sustained_ (minutes, not a spike) or when it reaches a
  high-priority class. A shedding service is healthier than an overloaded one; paging on the
  first rejection trains everybody to disable the protection.
- Alert separately on **zero** shedding paired with rising latency: that means the shedder is
  not engaging, which is a defect in the protection rather than an absence of load.
- Per-client 429 rate is a product signal as much as an operational one: one client at its
  limit constantly is a conversation about tiers, not an incident.

## Load-testing the rejection path

The happy path proves nothing about overload. `load-testing` owns generating the load; what to
assert is here.

1. **Drive past capacity in steps** — 0.8×, 1.0×, 1.5×, 3× measured capacity — with an
   **open-loop** generator. A closed-loop generator throttles itself against the slowdown and
   hides the effect entirely (`coordinated-omission`).
2. **Assert goodput does not collapse.** Beyond capacity, successful-inside-deadline responses
   must stay roughly flat. A curve that rises and then falls towards zero means the service has
   no working shedder, whatever the configuration says.
3. **Assert rejection is cheap.** At 3× load, per-rejection CPU cost should be a small fraction
   of a success. If total CPU keeps climbing with the shed rate, rejection is happening too
   late in the request path.
4. **Assert the class ordering.** Send mixed-priority traffic and confirm batch sheds before
   interactive, and that health checks are never shed — this is the property that keeps the
   instance in rotation while it protects itself.
5. **Assert recovery.** Drop the load back to 0.8× and measure how long until shedding stops.
   A service that keeps shedding after the surge has a queue it never drained, or a stuck
   adaptive limit.
