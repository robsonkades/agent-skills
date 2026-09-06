---
name: distributed-systems
description: >
  Triage and routing entry point for cross-process Java systems. Classifies design questions
  and production symptoms, establishes boundary and fault assumptions, then selects the
  specialist skill for delivery, consistency, time, overload, partitioning, messaging,
  coordination, recovery or observability. Use when the next technical owner is unclear; it
  deliberately does not duplicate specialist guidance.
---

# Distributed Systems

## Purpose

Be the first skill a cross-process question reaches, and the last one to stay loaded. Its job is
classification: take a design question or a symptom, ask the two or three questions that separate
the candidates, and hand off to the skill that owns the decision.

The failure this prevents is the answer given at the wrong altitude — debating retry policy for
an operation nobody has established is idempotent, tuning a consumer whose real problem is that
the partition key was wrong, or adding a distributed lock to a system that needed a conditional
write. In a distributed system the expensive mistakes are made at design time and discovered at
3am, so the routing matters more here than the depth.

## Workflow

This router has no Java language minimum. Before a specialist implementation, inspect the
project runtime/toolchain, resolved clients/frameworks and deployed broker/store versions;
the specialist's compatibility contract applies. Routing does not authorize upgrades.

1. **Say which boundary is crossed.** Process, host, availability zone, region, or an
   organisational boundary. The answer changes the fault model, the latency budget and who can be
   trusted. Missing details permit a provisional route, not an unsupported guarantee.
2. **Record the known fault assumptions and gaps.** Use `failure-models` when choosing a
   guarantee or when unknown outcomes are central. During an incident, do not delay a clear
   specialist handoff until a complete fault model has been written.
3. **Route from the table below.** If it gives two candidates, use `references/triage-map.md`.
4. **For a design or review rather than an incident**, walk `references/design-review.md` in
   order instead — it asks the questions in the sequence that makes later ones answerable.
5. **Hand off.** The specialist skill carries the workflow, the decision block and the Java.
6. **During an incident, use the catalogue only if the owner remains unclear.** Treat names
   from `distributed-failure-catalogue` as hypotheses requiring discriminating evidence;
   otherwise go directly to the owner with the observed symptoms and uncertainty.

## The routing table

| Question or symptom                                     | Owning skill                           |
| ------------------------------------------------------- | -------------------------------------- |
| Which faults do we tolerate? What does a timeout mean?  | `failure-models`                       |
| Will duplicates arrive, and where do they come from?    | `delivery-semantics`                   |
| Is this operation safe to apply twice?                  | `idempotency`                          |
| What may a reader observe after a write?                | `consistency-models`                   |
| How long may this call take, and who cancels it?        | `timeouts-and-deadlines`               |
| Should this failure be retried, and how many times?     | `retries-and-backoff`                  |
| What do we promise callers, and how does it change?     | `rpc-and-api-contracts`                |
| Can old and new schemas coexist through rollout/replay? | `schema-evolution-and-compatibility`   |
| Probes, graceful shutdown, 502s during a deploy         | `kubernetes-service-lifecycle`         |
| Add a capability to a container I cannot modify         | `sidecar-pattern`                      |
| Mediate outbound calls, split traffic, route by shard   | `ambassador-pattern`                   |
| Normalise the logs, metrics or health a service emits   | `adapter-sidecar-pattern`              |
| Can this service be replicated at all?                  | `stateless-service-design`             |
| How does a request reach a replica?                     | `load-balancing-and-routing`           |
| Too much traffic, or more than we can serve             | `rate-limiting-and-load-shedding`      |
| One dependency exhausts a JVM's shared capacity         | `concurrency-limiting-and-bulkheads`   |
| Should this data be split across owners?                | `sharding-and-partitioning`            |
| Which key belongs to which node?                        | `consistent-hashing`                   |
| One shard is hot while the rest are idle                | `hot-partitions-and-rebalancing`       |
| Sharding or replicating a cache                         | `cache-sharding-and-replication`       |
| One request must fan out to many workers                | `scatter-gather`                       |
| Publish facts, or call the service directly?            | `event-driven-architecture`            |
| Is a process boundary justified at all?                 | `distribution-boundaries`              |
| Should state be cached, and who owns freshness?         | `caching-strategies`                   |
| Persist current state or an event history?              | `event-sourcing`                       |
| Where should session state live?                        | `session-state-strategies`             |
| Does order matter, and over what scope?                 | `message-ordering-and-partitioning`    |
| Distribute work to a pool of interchangeable workers    | `task-queues-and-competing-consumers`  |
| A message that can never succeed                        | `poison-messages-and-dlq`              |
| Kafka consumers, offsets, rebalances, lag               | `kafka-consumers-in-java`              |
| Compose pipeline stages — filter, split, shard, merge   | `streaming-pipeline-topologies`        |
| Atomicity or recovery across transactional owners       | `distributed-transactions-and-sagas`   |
| Combine results computed across many workers            | `distributed-aggregation-and-barriers` |
| Agreement, quorum sizing, etcd or ZooKeeper             | `consensus-and-quorums`                |
| Only one process may do this at a time                  | `distributed-locks-and-leases`         |
| One instance must own a role — the job ran N times      | `leader-election`                      |
| What should this service log?                           | `structured-logging`                   |
| What should it measure, and what must not be a label?   | `metrics-and-cardinality`              |
| What deserves a span, and how do async hops link?       | `distributed-tracing-design`           |
| What should wake someone at 3am?                        | `slo-and-alerting`                     |
| Authentication, authorization or tenant isolation       | `java-application-security-basics`     |
| RPO/RTO, restore and correlated failure domains         | `failure-models`                       |
| Error rate and latency climbing across several services | `cascading-failures`                   |
| Stop calling a dependency that is failing               | `circuit-breakers`                     |
| Name this symptom — is it a known pattern?              | `distributed-failure-catalogue`        |
| Prove it still works when the network or a node fails   | `distributed-systems-testing`          |

## Rules

- Route the **decision**, not the technology. "We are adding Kafka" is not a question; "these two
  services must not be deployed together" and "this work must survive a consumer restart" are,
  and they route differently.
- Before enabling retries, establish repeat-safety or evidence that the previous attempt
  could not have applied. Unknown repeat-safety means duplication risk; route the missing
  contract to `idempotency`/`failure-models` without asserting corruption already occurred.
- **Three questions are asked at the wrong altitude more than any others.** "Should we shard?" is
  usually "should we cache or add a replica?" (`sharding-and-partitioning` says so). "We need a
  distributed lock" is often a conditional write or a partitioned owner
  (`distributed-locks-and-leases`). "We need exactly-once" must name the observable effect and
  boundary: it may reduce to at-least-once plus deduplication, or to one transaction containing
  progress and effect (`delivery-semantics`, `idempotency`).
- Never accept "ordered", "exactly-once", "consistent" or "guaranteed" without a named scope. If
  the scope cannot be named, the claim is not yet a design.
- During an incident, route from evidence without requiring a catalogue detour. More replicas, longer
  timeouts or more retries can deepen a cascade under specific saturation/recovery conditions;
  require evidence and a rollback trigger before changing them.
- Do not stay in this skill once the owning skill is known. It carries no depth by design.
- Two neighbouring families own what this one does not: JVM latency, GC, allocation and profiling
  are `java-performance` and the skills below it; in-process concurrency mechanics — executors,
  cancellation, structured concurrency, bulkheads — belong to the Java concurrency family, and a
  distributed skill that needs them names the owner rather than restating it.
- Keep in-process and cross-process semantics separate: a Java `synchronized` block cannot
  order another JVM, cancellation of a `CompletableFuture` need not cancel remote work, and
  virtual threads increase local concurrency capacity but do not create distributed
  backpressure.

Return the primary owner, the separating evidence, any conditional secondary owner, and the
next concrete question/check. Carry the boundary, effect, timestamps/IDs and unknowns into the
handoff. Naming a skill is not evidence that the cause has been established.

## References

- [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Amazon Builders' Library: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)

- [Triage map](references/triage-map.md) — the separating question for each pair of symptoms that
  routes to two different owners, and the cheapest evidence that resolves it. Read when the table
  above gives two candidates rather than one.
- [Design review](references/design-review.md) — the questions to ask of a distributed design, in
  the order that makes each answerable, each routed to its owning skill. Read when reviewing or
  designing a component rather than diagnosing one.
