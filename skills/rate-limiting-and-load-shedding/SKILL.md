---
name: rate-limiting-and-load-shedding
description: >
  Choose policy quotas and saturation-based admission: limit identity, charged work, burst
  and window semantics, distributed budgets, early rejection, fairness, deadlines and
  recovery. Use when replica-local limits multiply a quota, window-boundary bursts break
  the contract, rejection amplifies retries, or a service overloads while clients remain
  within quota. Covers token/leaky buckets, fixed/sliding windows, 429/503 and meaningful
  Retry-After guidance. Not queue arithmetic (littles-law-and-queueing), system-wide spread
  (cascading-failures), circuit-breaker behavior (circuit-breakers), client retry design
  (retries-and-backoff), replica routing (load-balancing-and-routing), error budgets
  (slo-and-alerting), or load generation (load-testing).
---

# Rate Limiting And Load Shedding

## Purpose

These are two mechanisms with two different inputs, and conflating them is why services with
careful rate limits still fall over. **Rate limiting is a policy about fairness and quota**:
this client gets N requests per second, and the limiter enforces it identically whether the
service is idle or dying. **Load shedding is self-protection**: the service refuses work it
cannot complete, based on its own saturation, even when the client is within quota. A global
rate budget can protect a known stable workload, and shedding can preserve tenant shares;
neither automatically supplies the other's contract. Keep the decision reasons distinct,
and add both only when the existing controls leave both needs unmet.

The failure this prevents is the collapse with a green limiter. Every client is inside its
quota, the aggregate is above capacity, queues grow, every request now waits longer than the
caller's timeout, and the service spends 100% of its capacity producing responses nobody is
waiting for. Nothing was violated. Nothing was rejected. Deadline goodput goes to zero.

## Workflow

1. **Name the policy or resource being protected.** Inspect existing limits, quota/API
   contracts, workload costs and saturation evidence. Compare retaining the current control
   with a fixed rate/concurrency bound before adding distributed or adaptive machinery.
   If both quota and capacity matter, expose separate decisions and metrics; they may share
   one admission component. Ask only for missing contract/capacity facts that change the choice.
2. **For a limit: fix the unit, the key and the burst.** Requests per second or a
   cost-weighted unit; keyed by API key, tenant, user or IP — an IP key behind a proxy or NAT
   limits a shared address, not a client. Specify whether attempts, admissions or completed
   work consume quota, including later rejection/failure/refund behavior. Choose the algorithm
   from the actual window and burst contract; capacity equal to one second's refill is valid
   when deliberately chosen and absorbable. See
   `references/limits-and-shedding-decisions.md`.
3. **Decide how the limit is enforced across replicas.** Static shares can strand allowance
   under skew and need a membership rule when replica count changes; a shared counter puts
   a round trip on every request; local grants add protocol and stranded-budget costs. Choose
   from the consistency, overage and availability contract rather than a default distributed shape.
   State the resulting bound rather than claiming the global rate is exact.
4. **For shedding: pick a leading saturation signal and an explicit queue policy.** Queue
   delay, deadline slack and in-flight work often lead CPU; the real bottleneck may instead be
   a connection pool, event loop or downstream limit. Reject expired work first. For live work,
   choose reject-new, deadline/priority scheduling or controlled LIFO from fairness and wasted-
   work costs—oldest-first is not universal.
5. **Make rejection early but preserve trust.** Apply cheap connection/global abuse controls
   before expensive parsing, then authenticate enough to determine tenant, cost and priority.
   Bound body/headers before deserialization and reject before business/database work. Never
   trust a caller's priority header merely to save authentication cost.
6. **Publish the contract.** 429 commonly represents client-specific quota; 503 commonly
   represents temporary service unavailability. `Retry-After` is useful when the server can
   estimate it, but must not promise recovery it cannot know. Document scope, reset semantics
   and headers in the API contract
   (`rpc-and-api-contracts`) so a client can act on them (`retries-and-backoff`).
7. **Load-test the rejection path**, not just the happy path. Drive load past measured capacity
   and check goodput, offered/admitted/rejected populations, fairness and recovery (`load-testing`).
   Return the policy and evidence, failure/overage bounds and unverified assumptions. Missing
   load or store-failover evidence leaves those guarantees conditional; inspect project versions
   and existing quota/API contracts before changing them.

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
- queued or running demand can exceed the protected resource/deadline budget
Use both when:
- independent quota and overload requirements are not covered by existing controls
Prefer a concurrency limit over a rate limit when:
- request cost varies by orders of magnitude, so requests per second is not a proxy for
  work. Concurrency bounds simultaneous operations, not their unbounded bytes/fanout;
  combine cost/size limits where needed and preserve any independent quota contract
Do not use shedding as a substitute for capacity when:
- the service sheds continuously at expected traffic. Investigate the configured limit,
  workload mix and bottleneck capacity before concluding more replicas will fix it
```

## Rules

- Rate limiting allocates an arrival/work budget by a policy dimension—tenant, credential,
  endpoint, operation, region or globally. Load shedding reacts to current capacity. An
  overload controller may preserve fair shares/priority while shedding; expose quota and
  saturation decisions separately so both remain explainable.
- A **fixed window** allowing N requests per T can admit 2N around a boundary, not merely
  twice the instantaneous rate. A token bucket instead permits burst B plus refill R over
  elapsed time; it does not enforce N in every rolling T. Choose exact/approximate rolling
  accounting or an explicit burst envelope according to the contract.
- Token bucket's **capacity is a deliberate burst allowance**, and the parameter most often
  left implicit. Capacity is how much idle credit a client may
  accumulate and spend at once; refill rate is the sustained limit. Set both, and size
  capacity against what the service can actually absorb in a burst.
- A static per-replica share is exact only under restrictive assumptions about membership,
  routing and demand. Under skew it rejects locally while capacity/allowance elsewhere idles;
  during rollout the aggregate changes. It can be an intentionally conservative emergency
  bound, but publish those assumptions.
- A shared counter (Redis or equivalent) makes the limiter a required dependency on every
  request: one round trip added to every call, and a decision about what happens when it is
  unavailable. Fail-open admits everything during the outage; fail-closed rejects everything.
  Pick deliberately; a local fallback is valid only within the accepted overage/reservation policy.
- With local escrow/leases, the error bound is the sum of outstanding grants that can still be
  spent, plus protocol failure/clock uncertainty—not a universal `replicas × burst`. A shared
  allocator must never issue overlapping budget across failover. State the exact grant,
  expiry and partition behavior; strict monetary/security quotas may require centralized or
  reservation-based enforcement.
- The response is part of the mechanism. **429 usually means the request exceeded a policy
  limit; 503 means the service is temporarily unable to serve.** Another replica may share the
  same bottleneck/quota, so blind failover amplifies load. Use `Retry-After` when meaningful;
  client backoff/jitter and an end-to-end deadline remain required. A limiter that returns 500 is
  indistinguishable from a defect; whether it is retried depends on the client's retry contract.
- Do not implement shaping as unbounded `Thread.sleep` on request workers. A bounded
  asynchronous delay queue can intentionally smooth traffic when deadlines and memory permit;
  account for held connections/context and reject when waiting cannot finish usefully.
- **Choose signals from the actual bottleneck.** An I/O-bound service can saturate its pool
  at moderate CPU; CPU or memory pressure can be useful for their respective bottlenecks.
  Pair them with queue delay, deadline slack and in-flight work against measured limits.
- Reject work whose deadline has expired first. Among live requests, rejecting new arrivals is
  simple/fair and preserves invested wait; controlled LIFO/drop-head can improve deadline
  goodput under overload but risks starvation and is safe only before execution begins. Use
  propagated deadlines or cancellation signals instead of guessing that age means abandonment.
- Uniform shedding can protect homogeneous traffic. Where criticality differs, derive
  trusted classes and reservations from business outcomes, including starvation bounds.
  Health/control paths need their own small abuse bounds; batch or retry work is not
  automatically less valuable than an interactive first attempt.
- Shedding can keep the service recoverable, but each rejected required request is still a
  user-visible availability outcome and usually counts against its SLI. Page on **goodput** — successful responses delivered inside the
  caller's deadline — and on the latency of admitted work, plot shed rate alongside them, and
  alert on shedding according to error-budget burn/priority. A saturated
  service without shedding shows high throughput while delivering almost nothing useful;
  `slo-and-alerting` owns the alerting policy.
- Keep SLI eligibility fixed when rejecting: admitted-only latency has survivor bias. Report
  offered, admitted, quota-rejected, saturation-rejected, failed and deadline-missed outcomes
  by bounded class, plus outstanding work. Cancellation/timeout does not prove execution ended.

## Overload control loop

```text
Measure offered load + bottleneck queue/slack + admitted goodput
  ↓
Estimate safe concurrency/work rate with headroom
  ↓
Allocate by trusted tenant/priority and reject before expensive work
  ↓
Propagate explicit 429/503 outcome and retry guidance
  ↓
Observe survivor latency, fairness, shed SLI and recovery hysteresis
```

Fail closed when the limiter protects a security/spend invariant; fail open or use conservative
local emergency allowance when availability is more important and overage is repairable. This
is a business safety choice, not a Redis-client default.

When quota and capacity gates compose, define whether a later rejection keeps the earlier
debit; do not invent refunds after a timeout or unknown execution outcome. Release execution
permits only when their protected resource lifetime ends. Process-local permit mechanics are
`concurrency-limiting-and-bulkheads`; use `java-performance` only for an actual JVM diagnosis.

## References

- [Limiting and shedding in Java](references/java-implementations.md) — a pedagogical token
  bucket including burst, the local-plus-shared reconciliation shape, an admission-control
  filter that sheds on queue time, the 429 response with `Retry-After`, and where Bucket4j
  and Resilience4j fit by role. Read for Java implementation/review; the policy reference
  below applies regardless of implementation language.
- [Choosing limits and shedding policy](references/limits-and-shedding-decisions.md) — the
  algorithm comparison table, distributed-limit strategies with the error each admits,
  priority classes, deadline-aware queue policies and their fairness cost, what to
  alert on versus what to plot, and how to load-test the rejection path. Read when choosing
  an algorithm, setting a limit's value, or reviewing overload behaviour.
