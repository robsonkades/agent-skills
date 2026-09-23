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

The failure this prevents is the intervention that deepens the outage. **Feedback reduces
useful completions by amplifying waste, resource retention or capacity loss.** Retries and
abandoned calls can consume extra resources; repeated crashes or health-based ejections can
overload the survivors even when total traffic and attempts per logical call stay unchanged.
Common responses—uncontrolled replicas, longer timeouts, more retries—can increase offered load.
Stabilization usually starts by reducing admitted work; repairing the trigger or adding warm,
usable capacity can also recover the system when it does not amplify the bottleneck.

## Workflow

Inspect the deployed JDK/toolchain, server/client libraries, retry owners, queue/pool limits,
deadline/cancellation behavior and autoscaling/probe configuration before recommending an API
or configuration change. The topology guidance has no Java baseline; the executor reference
states its snippet baseline. Preserve project versions. When traces or counters are missing,
state the candidate loop and collect the smallest discriminating evidence; do not invent a
capacity number or diagnose metastability solely because recovery is slow.

1. **Distinguish trigger from feedback.** Compare logical calls with attempts, admitted load with
   goodput, queue age, pool occupancy and capacity/routing changes. No single metric proves a
   cascade; reconstruct the time order (`references/cascade-response.md`).
2. **Name the amplification point.** Retries (system-level storm — the policy is
   `retries-and-backoff`), an unbounded queue, an exhausted thread or connection pool, or a
   timeout stack. Also check whether crashes or ejections shift load onto fewer healthy instances
   (`load-balancing-and-routing`). Rank edges by amplification and reversibility; incidents can
   have several loops.
3. **Stabilize offered work before scaling blindly.** Shed at the entry point
   (`rate-limiting-and-load-shedding`), bound active work and waiting admission at the saturated resource
   (`concurrency-limiting-and-bulkheads`), trip breakers on the failing dependency
   (`circuit-breakers`). Also cancel expired work, disable optional fan-out and stop retry owners.
4. **Check the timeout stack down the call path.** An inner timeout longer than its caller's
   remaining budget can leave the inner call holding resources after the outer hop gives up.
   Verify which resources survive cancellation. The bound arithmetic is `timeouts-and-deadlines`;
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
- queue depth or time-in-queue is rising while goodput is falling
- pool acquisition waits or rejections threaten request deadlines and resource evidence shows
  saturation; do not wait a full timeout period or require exactly 100% utilisation to intervene
- demand exceeds the dependency's currently usable capacity while goodput degrades, including
  unchanged demand concentrated on fewer healthy instances
Add capacity when:
- evidence shows extra warm capacity at the actual bottleneck can increase useful completions
  without overloading a shared dependency; test a bounded increment and its rollback threshold
Avoid adding capacity when:
- goodput is falling as offered load rises and new instances would hit the same bottleneck. New instances start with cold caches, cold JIT
  and empty pools, take a full share of a backlog, saturate, and add a fresh source of
  timeouts and retries against the same dependency
Avoid raising a timeout when:
- the dependency is already slower than the caller's budget and the change would retain more
  useless work. At fixed admitted rate, longer residence time increases average in-flight work;
  a hard concurrency cap instead increases waiting/rejection. Verify actual cancellation.
Restart when:
- evidence identifies unrecoverable in-process state/resource failure or it is the safest way to
  discard explicitly disposable work; preserve durable work and ramp admission per failure domain
```

## Rules

- **Goodput, not throughput, is the incident metric.** Throughput counts responses produced;
  goodput counts successful logical operations satisfying the caller's correctness and deadline
  contract. Count retries once and track approved degraded successes separately. Fast errors and
  shed responses do not become goodput just because they arrive on time.
- An unbounded queue converts sustained overload into growing latency/memory. Work past an
  propagated request deadline is waste only when it has no durable side effect obligation;
  accepted commands/jobs may still require completion or reconciliation after the caller leaves.
  Bound queues and define expiry, rejection and durability semantics.
- Pool exhaustion propagates upstream, which is why the blast radius looks wrong for the
  fault: a slow dependency occupies request threads and pooled connections in its caller, so
  endpoints that never touch it start failing on acquisition. One pool shared across
  dependencies lets the slowest starve the rest — `concurrency-limiting-and-bulkheads`.
- Fit inner operations inside the caller's remaining deadline with time for local cleanup and
  response delivery. A timeout may only stop waiting: verify transport/task cancellation and
  resource release separately, and reconcile durable effects that continue after abandonment.
- **A metastable failure has two states under the same load.** The trigger moved the system
  into the bad one and removing it does not move the system back, because retries and backlog
  now sustain excess resource demand. Reduce admitted work or restore usable capacity enough
  to leave that feedback regime; preserve durable obligations and measure whether backlog shrinks.
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
  dependency, and assert unaffected paths stay inside explicit goodput/error/latency bounds
  under representative shared-resource load (`load-testing`,
  `distributed-systems-testing`).

## Deliverable

Return the observed timeline, proposed feedback edge and competing explanation, intervention
with expected metric movement, durable-work constraints, and recovery ramp/abort thresholds.
Record what actually improved versus what remains a hypothesis. A design review should name
the fault-injection scenario and acceptance bounds; configuration checks alone do not prove
cancellation, isolation or recovery under load.

## Primary sources

- [Google SRE — Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Google SRE — Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Builders' Library — Avoiding insurmountable queue backlogs](https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/)
- [Java 17 ThreadPoolExecutor contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Java 17 Semaphore contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Semaphore.html):
  timed acquisition bounds each caller's wait, not the total number of waiting callers.
- [Resilience4j CircuitBreaker behavior](https://resilience4j.readme.io/docs/circuitbreaker)

## References

- [Recognising and stopping a cascade](references/cascade-response.md) — the evidence
  distinguishing feedback from a plain dependency outage, the intervention order with
  each lever's cost, the actions that deepen it, and the recovery procedure with backlog
  shedding and ramped restart. Read during an incident, or when writing the runbook.
- [Cutting the amplification points](references/cutting-the-loop.md) — the design control per
  amplification point, criticality classification with the fail-open or fail-closed decision
  per dependency, and a design-review checklist. Read when designing a service that calls
  others, or reviewing one after an incident.
