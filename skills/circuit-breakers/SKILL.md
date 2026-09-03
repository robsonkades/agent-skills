---
name: circuit-breakers
description: >
  The breaker as a state machine that stops calling a failing dependency: closed, open and
  half-open; choosing rate windows versus consecutive failures; why half-open admits a bounded
  number of probes; the failure predicate—classifying correlated dependency failures rather than
  blindly counting status classes—and the honest limit, that a
  breaker converts a slow failure into a fast one and creates no availability unless the
  caller has a fallback. Use when a breaker trips on consecutive failures, when it never
  trips or trips on one client's bad requests, when half-open sends full traffic at a
  recovering dependency, when a breaker sits on a call with no timeout under it, or when a
  dependency is slow rather than failing. Does not cover bulkheads
  (concurrency-limiting-and-bulkheads), retry policy (retries-and-backoff), the bound itself
  (timeouts-and-deadlines), the system-wide loop (cascading-failures), shedding
  (rate-limiting-and-load-shedding), or serving a cached fallback (caching-strategies).
---

# Circuit Breakers

## Purpose

A circuit breaker is a state machine in the caller that stops calling a dependency which is
already failing, so calls fail immediately instead of waiting for a timeout. Its whole value
is that the caller's threads and connections are not held by calls that were going to fail —
the amplification point `cascading-failures` names as pool exhaustion.

**A breaker does not make a system available. It converts a slow failure into a fast one.**
That protects the caller's resources even when the only honest result is a typed error. A
fallback or degraded response can preserve useful availability, but is not a prerequisite for
resource protection. Decide both the fast-failure contract and any fallback first.

## States

```text
CLOSED    → OPEN       failure rate or slow-call rate ≥ threshold, over ≥ minimum calls
OPEN      → HALF_OPEN  after the wait duration; calls before it are rejected untried
HALF_OPEN → CLOSED     the configured probe sample meets success/slow-call thresholds
HALF_OPEN → OPEN       the completed probe sample breaches a threshold (per implementation policy)
```

## Workflow

1. **Check the failure is dependency-wide, not request-specific.** Failures that track one
   caller's input, one tenant or one endpoint are not a breaker's problem.
2. **Decide what the caller does with a fast failure**, including status/type, retry guidance,
   fallback provenance and whether accepted writes may be queued.
3. **Put a timeout under the breaker.** A breaker counts outcomes, and a call that never
   returns produces none (`timeouts-and-deadlines`).
4. **Write the failure predicate explicitly**, exception type by exception type and status
   class by status class. This is the decision with the largest consequence; the table is in
   `references/breaker-configuration.md`.
5. **Size the window from the endpoint's traffic**: sliding window type and size, the minimum
   number of calls before the rate is evaluated, the failure-rate threshold, and — separately
   — a slow-call rate threshold, so a dependency that is slow but returning 200s still trips.
6. **Bound the half-open probes and set the wait duration.** Trial calls, not full traffic.
7. **Instrument state and transitions**, then prove both directions in a test: force the trip
   under injected failure, assert the probe count, assert recovery. See
   `references/fallbacks-and-testing.md`.

## Decision block

```text
Use a circuit breaker when:
- the call is remote and its failures are correlated — this call failing predicts the next
  one failing, which is what makes past outcomes usable as a prediction
- the call holds a scarce resource while it waits: a request thread, a pooled connection
- the caller has a defined behaviour for a fast failure, and that behaviour is honest
Avoid a circuit breaker when:
- failures are independent or request-specific, so recent outcomes do not predict the next call
- the failures are per-request rather than per-dependency — validation errors, not-found,
  one tenant's malformed payload. The breaker punishes every caller for one caller's bug
- traffic through that breaker is below the minimum call count that makes a rate meaningful:
  it will either never trip or trip on a run of noise
- the call is in-process and the real issue is a lock, algorithm or local resource; diagnose and
  bound that resource rather than using remote-health prediction
Prefer instead when:
- the saturated resource is yours and the dependency is healthy → a concurrency limit or
  bulkhead (concurrency-limiting-and-bulkheads)
- you are the overloaded party and must refuse work → rate-limiting-and-load-shedding
- one call occasionally hangs but the dependency is fine → a timeout alone
```

## Rules

- Prefer a rate/slow-call window with a minimum sample for ordinary noisy traffic. Consecutive
  thresholds react faster and can fit rare calls or categorical failures, but are noise-sensitive
  and miss sustained intermittent failure. Choose from traffic and failure correlation; test
  false-open probability and detection time.
- **State the minimum number of calls and derive it from the endpoint's rate.** Below it the
  breaker stays closed whatever the rate, or one failure out of two evaluates to 50%. An
  endpoint serving 2 requests a minute needs a longer/count-based window, a smaller justified
  sample, a categorical/consecutive signal, or no statistical breaker.
- **Half-open admits a bounded number of probes, not full traffic.** Reopening to the whole
  request stream is a thundering herd aimed at the instance that just came back; the probe
  count is a load decision — enough to be a sample, few enough to survive.
- A breaker with no slow-call criterion misses the failure mode that matters most: a
  dependency answering 200 OK in 30 s exhausts the caller like an outage while the
  failure-rate breaker reads 0%. Set a slow-call duration and rate, or a tight enough timeout.
- **What counts as a failure decides whether the breaker works.** Classify whether an outcome is
  correlated across future calls in this breaker scope and consumes the protected resource. Most
  validation/domain 4xx are excluded, but 408/429 and shared authentication/routing failures need
  policy. Some 5xx are payload-specific bugs and should not poison unrelated calls.
- **A typical library breaker's state is per instance.** N instances each learn from their own traffic, so in
  a partial outage some are open and some closed and the fleet degrades unevenly. Usually
  acceptable; never quote a fleet-wide trip time.
- **Scope the breaker to the failure domain you want to isolate.** One breaker per downstream
  host lets one slow endpoint open it for all of them; one on a shared resource lets one
  abusive caller open it for everyone. Key per dependency and endpoint, per tenant when
  tenants can be independently bad—but per-tenant keys need cardinality bounds and expiry or the
  breaker registry becomes attacker-controlled memory.
- Retry composition is a decision, not a default. With `Retry(Breaker(call))` the breaker
  records **every attempt**, so a rate threshold is reached after fewer logical calls than it
  appears; with `Breaker(Retry(call))` it records one outcome per logical call, but each
  protected call lasts `attempts × timeout + Σ backoff`, distorting slow-call detection and
  letting retries reach a dependency the breaker would have protected. Pick one deliberately.
- A fallback that silently returns wrong data is worse than an error. An empty list the caller
  persists, a zero balance, a default entitlement that grants access — each turns an
  availability incident into a data one. Mark degraded responses as degraded.
- Instrument the breaker as a **dependency health signal**: state, transitions and the rates
  it computed. Alert on time spent open, not on transitions. A breaker that has never opened
  is an untested hypothesis.

## Primary sources

- [Resilience4j CircuitBreaker guide](https://resilience4j.readme.io/docs/circuitbreaker)
- [Google SRE — Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [AWS Builders' Library — Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

## References

- [Configuring a breaker](references/breaker-configuration.md) — every parameter with what it
  controls and the failure a wrong value produces, the failure-predicate decision table over
  status codes and exception types, retry composition arithmetic, and per-instance versus
  shared state. Read before configuring or reviewing a breaker.
- [Fallbacks and testing](references/fallbacks-and-testing.md) — the fallback options with the
  condition making each honest, the wrong-data rule, and how to prove a breaker works: forcing
  the trip, asserting the half-open probe count, asserting recovery. Read when writing the
  fallback or its tests.
