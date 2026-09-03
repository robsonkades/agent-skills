---
name: cascading-failures
description: >
  How one slow dependency becomes a total outage: the amplification loop and the four points
  that close it — retry storms, unbounded queues, thread and connection exhaustion, an inner
  timeout longer than the outer one. Covers why cutting offered work is usually the first stabilization step in a
  cascade, metastability sustained by backlog, recovery herds and criticality separation. Use when one dependency's
  latency rise took down services that never call it, when the dependency recovered and the
  system did not, when adding replicas mid-incident made it worse, or when queue depth grows
  while goodput falls to zero. Does not cover the breaker (circuit-breakers), shedding
  policy (rate-limiting-and-load-shedding), bulkheads (concurrency-limiting-and-bulkheads),
  retry policy (retries-and-backoff), queue arithmetic (littles-law-and-queueing), replica
  routing (load-balancing-and-routing), or the fault model (failure-models).
---

# Cascading Failures

## Purpose

A cascade is a loop, not a list of failures. A dependency slows; its callers' threads and
connections sit blocked waiting; the callers saturate; _their_ callers slow; retries add
load to the already-slow dependency; it slows further. A wide incident is a cascade only when
such positive feedback expands or sustains the failure. Name and cut that edge. A shared infrastructure outage or a
coordinated bad deploy can create a wide blast radius without such a loop, so topology and timing
remain competing hypotheses.

The failure this prevents is the intervention that deepens the outage. **During a cascade
the system is doing more work than normal and completing less of it** — retries, queued
requests whose callers have already given up, connections held by abandoned calls. Common
responses—uncontrolled replicas, longer timeouts, more retries—can increase offered load.
Stabilization usually starts by reducing admitted work; repairing the trigger or adding warm,
usable capacity can also recover the system when it does not amplify the bottleneck.

## Workflow

1. **Distinguish trigger from feedback.** Compare logical calls with attempts, admitted load with
   goodput, queue age, pool occupancy and capacity/routing changes. No single metric proves a
   cascade; reconstruct the time order (`references/cascade-response.md`).
2. **Name the amplification point.** Retries (system-level storm — the policy is
   `retries-and-backoff`), an unbounded queue, an exhausted thread or connection pool, or a
   timeout stack. Rank edges by amplification and reversibility; incidents can have several loops.
3. **Stabilize offered work before scaling blindly.** Shed at the entry point
   (`rate-limiting-and-load-shedding`), cap concurrency at the saturated resource
   (`concurrency-limiting-and-bulkheads`), trip breakers on the failing dependency
   (`circuit-breakers`). Also cancel expired work, disable optional fan-out and stop retry owners.
4. **Check the timeout stack down the call path.** An inner timeout longer than its caller's
   remaining budget means the outer hop gives up while the inner call still holds a thread, a
   connection and a downstream request. The bound arithmetic is `timeouts-and-deadlines`;
   the consequence — resources held by work nobody will read — is here.
5. **Decide whether the state is metastable.** If the trigger is gone and the system is still
   down, backlog/retries may now sustain overload. Classify queued work as expired, supersedable or
   durable before dropping anything; drain at a controlled rate, quarantine, reject new work or
   restart only under an explicit recovery contract.
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
- goodput is falling as offered load rises and new instances would hit the same bottleneck. New instances start with cold caches, cold JIT
  and empty pools, take a full share of a backlog, saturate, and add a fresh source of
  timeouts and retries against the same dependency
Avoid raising a timeout when:
- the dependency is already slower than the caller's budget. A longer wait holds each
  thread longer, which raises concurrency at the dependency by Little's Law
  (littles-law-and-queueing) and slows it further
Restart when:
- evidence identifies unrecoverable in-process state/resource failure or it is the safest way to
  discard explicitly disposable work; preserve durable work and ramp admission per failure domain
```

## Rules

- **Goodput, not throughput, is the incident metric.** Throughput counts responses produced;
  goodput counts responses delivered inside the caller's deadline. A saturated system holds
  throughput flat while goodput goes to zero — every response arrives after its caller left.
- An unbounded queue converts sustained overload into growing latency/memory. Work past an
  propagated request deadline is waste only when it has no durable side effect obligation;
  accepted commands/jobs may still require completion or reconciliation after the caller leaves.
  Bound queues and define expiry, rejection and durability semantics.
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
- **Classify each dependency per operation and failure mode, and implement the classification.**
  A non-critical dependency on the request path with no fallback is critical in practice.
  Degrade with a defined response—a default, a stale value
  (`caching-strategies`), a skipped enrichment — and make the degraded state observable.
- A readiness probe that calls a downstream dependency can convert its slowdown into fleet-wide
  removal. Include a dependency only if the pod cannot correctly serve any admitted traffic
  without it, and test threshold/hysteresis. Probe design is `kubernetes-service-lifecycle`, ejection is
  `load-balancing-and-routing`.
- Prove the loop is cut before the incident: load-test at capacity, inject latency into one
  dependency, and assert goodput on paths that do not use it stays flat (`load-testing`,
  `distributed-systems-testing`).

## Primary sources

- [Google SRE — Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Google SRE — Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Builders' Library — Avoiding insurmountable queue backlogs](https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/)

## References

- [Recognising and stopping a cascade](references/cascade-response.md) — the metric
  signatures separating a cascade from a plain dependency outage, the intervention order with
  each lever's cost, the actions that deepen it, and the recovery procedure with backlog
  shedding and ramped restart. Read during an incident, or when writing the runbook.
- [Cutting the amplification points](references/cutting-the-loop.md) — the design control per
  amplification point, criticality classification with the fail-open or fail-closed decision
  per dependency, and a design-review checklist. Read when designing a service that calls
  others, or reviewing one after an incident.
