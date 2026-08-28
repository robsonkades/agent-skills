---
name: rate-limiting-and-load-shedding
description: >
  Two mechanisms kept apart: rate limiting as a fairness and quota policy enforced per
  client whether or not you are busy, and load shedding as self-protection that refuses work
  you cannot complete, from your own saturation. Covers token versus leaky bucket, fixed
  versus sliding windows, burst capacity, distributed limits and local-plus-shared
  reconciliation, the 429 and Retry-After contract, saturation signals, oldest-first
  rejection. Use when a limit is enforced per replica and multiplies by replica count, when
  a fixed window lets through double the rate intended, when a limiter returns 500 or omits
  Retry-After, when a service collapses under traffic that broke no limit, or when shed rate
  alerts as an error. Not queue arithmetic (littles-law-and-queueing), system-wide spread
  (cascading-failures), the client-side complement (circuit-breakers), the retry side of a
  429 (retries-and-backoff), replica spread (load-balancing-and-routing), error budgets
  (slo-and-alerting), or load generation (load-testing).
---

# Rate Limiting And Load Shedding

## Purpose

These are two mechanisms with two different inputs, and conflating them is why services with
careful rate limits still fall over. **Rate limiting is a policy about fairness and quota**:
this client gets N requests per second, and the limiter enforces it identically whether the
service is idle or dying. **Load shedding is self-protection**: the service refuses work it
cannot complete, based on its own saturation, regardless of whose request it is and whether
that client is within its quota. A limiter cannot save you from legitimate traffic; a shedder
cannot enforce a contract. A service that needs one usually needs both.

The failure this prevents is the collapse with a green limiter. Every client is inside its
quota, the aggregate is above capacity, queues grow, every request now waits longer than the
caller's timeout, and the service spends 100% of its capacity producing responses nobody is
waiting for. Nothing was violated. Nothing was rejected. Throughput goes to zero.

## Workflow

1. **Name which mechanism you are building.** Quota and fairness, or self-protection. If the
   answer is "both", they are two components with two configurations and two dashboards.
2. **For a limit: fix the unit, the key and the burst.** Requests per second or a
   cost-weighted unit; keyed by API key, tenant, user or IP — an IP key behind a proxy or NAT
   limits a shared address, not a client. Then choose the algorithm from the burst you intend
   to allow and set that burst explicitly: token bucket's capacity _is_ the burst policy, and
   leaving it equal to the refill rate rejects traffic the service could easily serve. See
   `references/limits-and-shedding-decisions.md`.
3. **Decide how the limit is enforced across replicas.** Dividing by the replica count is
   wrong whenever load is uneven or the count changes; a shared counter puts a round trip on
   every request; local buckets reconciled against a shared budget is the usual middle. State
   the resulting over-admission bound rather than claiming the global rate is exact.
4. **For shedding: pick a saturation signal you can act on before it is too late.** Queue
   depth and time-in-queue lead; CPU lags and is misleading under I/O-bound load. Shed the
   **oldest** queued work first — it is closest to its deadline and least likely to still be
   wanted (`timeouts-and-deadlines`).
5. **Make rejection cheap.** Reject before authentication, before deserialising a body,
   before touching the database. A rejection that costs as much as a success sheds nothing.
6. **Publish the contract.** 429 with `Retry-After` for a quota breach, 503 with
   `Retry-After` for shedding, both documented in the API contract
   (`rpc-and-api-contracts`) so a client can act on them (`retries-and-backoff`).
7. **Load-test the rejection path**, not just the happy path. Drive load past capacity and
   assert that goodput holds flat rather than collapsing (`load-testing`).

## Decision block

```text
Use rate limiting when:
- the resource is shared between clients and one client's volume can starve another
- a quota is part of the contract (a plan, a tier, an agreement) and must be enforced
  identically at idle and at peak
- an abusive or looping client is a realistic threat
Use load shedding when:
- arrival rate can exceed capacity from traffic that violates no quota — a retry storm,
  a batch job, a marketing push, or a slowed dependency reducing your own capacity
- a queue exists anywhere on the request path (it does)
Use both when:
- the service is multi-tenant and its capacity is finite. They answer different questions
Prefer a concurrency limit over a rate limit when:
- request cost varies by orders of magnitude, so requests per second is not a proxy for
  work. Concurrency bounds work in flight; rate bounds arrivals only
Do not use shedding as a substitute for capacity when:
- the service sheds continuously at normal traffic. That is under-provisioning with extra
  steps; the sizing arithmetic is littles-law-and-queueing
```

## Rules

- Rate limiting is keyed by **who**; load shedding is keyed by **how loaded you are**. If a
  mechanism consults the client's identity to decide whether to reject under load, it is a
  limiter; if it consults its own queue, it is a shedder. Anything that does both without
  saying so is untunable.
- A **fixed window** admits up to twice the intended rate across a boundary: a full window's
  worth at the end of one window and another full window's worth at the start of the next.
  Use a sliding window (or a token bucket) whenever the burst matters.
- Token bucket's **capacity is a deliberate burst allowance**, and the parameter most often
  left equal to the rate by accident. Capacity is how much idle credit a client may
  accumulate and spend at once; refill rate is the sustained limit. Set both, and size
  capacity against what the service can actually absorb in a burst.
- **A per-replica limit divided by the replica count is wrong**, not approximate: uneven
  balancing means some replicas reject while others idle, and during a rollout the count
  changes so the fleet limit changes with it. If you use it anyway, say so, and expect the
  effective limit to be lower than configured under skew.
- A shared counter (Redis or equivalent) makes the limiter a required dependency on every
  request: one round trip added to every call, and a decision about what happens when it is
  unavailable. Fail-open admits everything during the outage; fail-closed rejects everything.
  Pick one deliberately, and prefer a local fallback bucket over either.
- With local buckets reconciled against a shared budget, over-admission is bounded by roughly
  `replicas × local burst` per reconciliation interval. State that bound; do not describe the
  result as an exact global rate.
- The response is part of the mechanism. **429 means "you exceeded your quota"; 503 means "I
  am overloaded"** — a client should back off harder on the first and may retry another
  replica on the second. Both carry `Retry-After`. A limiter that returns 500 is
  indistinguishable from a defect and will be retried immediately.
- Never `Thread.sleep` a caller to enforce a limit. Throttling by blocking converts a
  rejection into an occupied thread, a held connection and a filled queue — it moves the
  overload inside your own process. Reject, and let the client back off.
- **CPU is a lagging and misleading shedding signal.** An I/O-bound service saturates its
  connection pool and its queues at moderate CPU, and a CPU-based shedder acts long after
  latency has already broken. Prefer queue depth, time-in-queue, or in-flight concurrency
  against a measured limit.
- **Reject the oldest queued request first.** It has consumed the most of its caller's budget,
  is most likely already abandoned, and completing it delivers a response nobody is waiting
  for. FIFO under overload maximises the number of requests that time out just before
  completing — the worst possible outcome per unit of work spent.
- Shedding must be non-uniform to be useful. Assign priority or criticality classes — health
  and control-plane calls above interactive user traffic above batch and prefetch — and shed
  from the bottom. Uniform shedding degrades everything a little, including the things whose
  failure costs the most.
- **A shedding service is healthier than an overloaded one.** Shed rate is a saturation
  signal, not an error rate: page on **goodput** — successful responses delivered inside the
  caller's deadline — and on the latency of admitted work, plot shed rate alongside them, and
  alert on shedding only when it is sustained or reaches high-priority classes. A saturated
  service without shedding shows high throughput while delivering almost nothing useful;
  `slo-and-alerting` owns the alerting policy.

## References

- [Limiting and shedding in Java](references/java-implementations.md) — a correct token
  bucket including burst, the local-plus-shared reconciliation shape, an admission-control
  filter that sheds on queue time, the 429 response with `Retry-After`, and where Bucket4j
  and Resilience4j fit by role. Read before writing or reviewing a limiter or a shedder.
- [Choosing limits and shedding policy](references/limits-and-shedding-decisions.md) — the
  algorithm comparison table, distributed-limit strategies with the error each admits,
  priority classes, oldest-first rejection with its rationale and its fairness cost, what to
  alert on versus what to plot, and how to load-test the rejection path. Read when choosing
  an algorithm, setting a limit's value, or reviewing overload behaviour.
