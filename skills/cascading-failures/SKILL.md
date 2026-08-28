---
name: cascading-failures
description: >
  How one slow dependency becomes a total outage: the amplification loop and the four points
  that close it — retry storms, unbounded queues, thread and connection exhaustion, an inner
  timeout longer than the outer one. Covers why only cutting offered load recovers a
  cascading system, metastable failure where the trigger is gone and the backlog sustains
  it, the thundering herd on recovery, and criticality separation. Use when one dependency's
  latency rise took down services that never call it, when the dependency recovered and the
  system did not, when adding replicas mid-incident made it worse, or when queue depth grows
  while goodput falls to zero. Does not cover the breaker (circuit-breakers), shedding
  policy (rate-limiting-and-load-shedding), bulkheads (concurrency-limiting-and-bulkheads),
  retry policy (retries-and-backoff), queue arithmetic (littles-law-and-queueing), replica
  routing (load-balancing-and-routing), the fault model (failure-models), or the patterns
  individually (distributed-failure-catalogue).
---

# Cascading Failures

## Purpose

A cascade is a loop, not a list of failures. A dependency slows; its callers' threads and
connections sit blocked waiting; the callers saturate; _their_ callers slow; retries add
load to the already-slow dependency; it slows further. Every incident that begins in one
component and ends with an unrelated one down went round that loop. The work is to name the
amplification point closing it here, and cut that one.

The failure this prevents is the intervention that deepens the outage. **During a cascade
the system is doing more work than normal and completing less of it** — retries, queued
requests whose callers have already given up, connections held by abandoned calls. Every
instinctive response (add replicas, raise timeouts, retry harder) increases offered load,
and only the responses that reduce it recover the system.

## Workflow

1. **Distinguish a cascade from a dependency outage.** An outage shows errors concentrated at
   one dependency and flat inbound rates. A cascade shows that dependency's inbound rate
   _rising_ while its success rate falls, pools pinned at 100% in services that do not call
   it, and queue depth growing while completions fall. See `references/cascade-response.md`.
2. **Name the amplification point.** Retries (system-level storm — the policy is
   `retries-and-backoff`), an unbounded queue, an exhausted thread or connection pool, or a
   timeout stack. There is usually one dominant point; cutting it stops the loop.
3. **Reduce offered load before anything else.** Shed at the entry point
   (`rate-limiting-and-load-shedding`), cap concurrency at the saturated resource
   (`concurrency-limiting-and-bulkheads`), trip breakers on the failing dependency
   (`circuit-breakers`). These are the only three levers that shorten the loop rather than
   feed it.
4. **Check the timeout stack down the call path.** An inner timeout longer than its caller's
   remaining budget means the outer hop gives up while the inner call still holds a thread, a
   connection and a downstream request. The bound arithmetic is `timeouts-and-deadlines`;
   the consequence — resources held by work nobody will read — is here.
5. **Decide whether the state is metastable.** If the trigger is gone and the system is still
   down, the backlog is now the cause, and recovery means destroying work: drain the queue,
   reject until it clears, or restart with admission ramped back in.
6. **Ramp with jitter.** Everything retrying the instant the dependency returns knocks it
   over again. Admit a fraction of traffic, raise it while watching goodput, and stagger
   restart and reconnect timing across instances.
7. **Afterwards, classify every dependency by criticality** and give each non-critical one a
   defined degraded behaviour. See `references/cutting-the-loop.md`.

## Intervention decision block

```text
Reduce offered load (shed, cap concurrency, trip the breaker) when:
- queue depth or time-in-queue is rising while completed requests per second is falling
- the saturated resource is a pool whose utilisation has been at 100% for longer than one
  timeout period
- the dependency's inbound rate is above its normal rate while its success rate is below it
Add capacity when:
- utilisation is high, latency is elevated, and goodput still rises with offered load —
  that is under-provisioning, not a cascade
Avoid adding capacity when:
- goodput is falling as offered load rises. New instances start with cold caches, cold JIT
  and empty pools, take a full share of a backlog, saturate, and add a fresh source of
  timeouts and retries against the same dependency
Avoid raising a timeout when:
- the dependency is already slower than the caller's budget. A longer wait holds each
  thread longer, which raises concurrency at the dependency by Little's Law
  (littles-law-and-queueing) and slows it further
Restart only when:
- the backlog is in process memory and cannot be drained otherwise — and then only with
  admission ramped in, never with the full fleet at once
```

## Rules

- **Goodput, not throughput, is the incident metric.** Throughput counts responses produced;
  goodput counts responses delivered inside the caller's deadline. A saturated system holds
  throughput flat while goodput goes to zero — every response arrives after its caller left.
- An unbounded queue does not absorb overload; it converts overload into unbounded latency.
  Once queue wait exceeds the caller's timeout, **every** dequeued item is waste, and the
  service spends 100% of capacity on work nobody will read. Bound every queue and define the
  rejection; an unbounded `LinkedBlockingQueue` in an executor is the shape to find.
- Pool exhaustion propagates upstream, which is why the blast radius looks wrong for the
  fault: a slow dependency occupies request threads and pooled connections in its caller, so
  endpoints that never touch it start failing on acquisition. One pool shared across
  dependencies lets the slowest starve the rest — `concurrency-limiting-and-bulkheads`.
- An inner timeout must be shorter than the caller's remaining budget, checked over the whole
  path rather than per hop. Stacked the other way, the outer hop returns an error while every
  resource the inner call holds stays held for the difference.
- **A metastable failure has two states under the same load.** The trigger moved the system
  into the bad one and removing it does not move the system back, because retries and backlog
  now supply the excess load. The exit is to destroy work — shed, drain, reject — not to wait.
- Restarting the fleet at once produces a thundering herd — synchronised cache fills,
  connection storms and retry waves. Stagger restarts, jitter reconnect (`retries-and-backoff`).
- A shared dependency is a shared failure domain whatever the topology says: two services
  with no call between them fail together if they share a database, a cache or a token
  issuer. Enumerate shared components, not the call graph (`failure-models`).
- **Classify every dependency as critical or non-critical, and implement the classification.**
  A non-critical dependency on the request path with no fallback is critical in practice.
  Fail open with a defined degraded response — a default, a stale value
  (`caching-strategies`), a skipped enrichment — and make the degraded state observable.
- A readiness probe that calls a downstream dependency converts that dependency's slowdown
  into fleet-wide unreadiness, and outlier ejection then removes the instances that were
  still serving. Probe design is `kubernetes-service-lifecycle`, ejection is
  `load-balancing-and-routing`.
- Prove the loop is cut before the incident: load-test at capacity, inject latency into one
  dependency, and assert goodput on paths that do not use it stays flat (`load-testing`,
  `distributed-systems-testing`).

## References

- [Recognising and stopping a cascade](references/cascade-response.md) — the metric
  signatures separating a cascade from a plain dependency outage, the intervention order with
  each lever's cost, the actions that deepen it, and the recovery procedure with backlog
  shedding and ramped restart. Read during an incident, or when writing the runbook.
- [Cutting the amplification points](references/cutting-the-loop.md) — the design control per
  amplification point, criticality classification with the fail-open or fail-closed decision
  per dependency, and a design-review checklist. Read when designing a service that calls
  others, or reviewing one after an incident.
