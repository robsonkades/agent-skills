---
name: distributed-systems
description: >
  Triage and routing entry point for distributed systems in Java: turn a design question or
  a production symptom into the one skill that owns it. Use when work crosses a process
  boundary and the next step is unclear — a new service or integration is being designed, a
  review must decide whether an operation is safe to retry or duplicate, a request fans out
  or a queue backs up, replicas disagree, an incident is spreading across services, or
  someone proposes sharding, a distributed lock, a leader or an event-driven rewrite. Routes
  to failure-models for the fault model, delivery-semantics and idempotency for duplicates,
  consistency-models for what a reader observes, and the rest of the family for each
  specific decision. Does not itself cover any of those topics; JVM performance is
  java-performance and in-process concurrency is the Java concurrency family.
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

1. **Say which boundary is crossed.** Process, host, availability zone, region, or an
   organisational boundary. The answer changes the fault model, the latency budget and who can be
   trusted; a question stated without it cannot be routed.
2. **Fix the fault model before anything else** if it is not already written down —
   `failure-models`. Every decision below is an answer to "which faults do we tolerate?", and a
   design that skipped it has answered by accident.
3. **Route from the table below.** If it gives two candidates, use `references/triage-map.md`.
4. **For a design or review rather than an incident**, walk `references/design-review.md` in
   order instead — it asks the questions in the sequence that makes later ones answerable.
5. **Hand off.** The specialist skill carries the workflow, the decision block and the Java.
6. **During an incident, name the pattern first.** `distributed-failure-catalogue` maps a symptom
   to a named failure and its owner faster than reasoning from first principles.

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
| Probes, graceful shutdown, 502s during a deploy         | `kubernetes-service-lifecycle`         |
| Add a capability to a container I cannot modify         | `sidecar-pattern`                      |
| Mediate outbound calls, split traffic, route by shard   | `ambassador-pattern`                   |
| Normalise the logs, metrics or health a service emits   | `adapter-sidecar-pattern`              |
| Can this service be replicated at all?                  | `stateless-service-design`             |
| How does a request reach a replica?                     | `load-balancing-and-routing`           |
| Too much traffic, or more than we can serve             | `rate-limiting-and-load-shedding`      |
| Should this data be split across owners?                | `sharding-and-partitioning`            |
| Which key belongs to which node?                        | `consistent-hashing`                   |
| One shard is hot while the rest are idle                | `hot-partitions-and-rebalancing`       |
| Sharding or replicating a cache                         | `cache-sharding-and-replication`       |
| One request must fan out to many workers                | `scatter-gather`                       |
| Publish facts, or call the service directly?            | `event-driven-architecture`            |
| Does order matter, and over what scope?                 | `message-ordering-and-partitioning`    |
| Distribute work to a pool of interchangeable workers    | `task-queues-and-competing-consumers`  |
| A message that can never succeed                        | `poison-messages-and-dlq`              |
| Kafka consumers, offsets, rebalances, lag               | `kafka-consumers-in-java`              |
| Compose pipeline stages — filter, split, shard, merge   | `streaming-pipeline-topologies`        |
| A multi-service operation must not end half-done        | `distributed-transactions-and-sagas`   |
| Combine results computed across many workers            | `distributed-aggregation-and-barriers` |
| Agreement, quorum sizing, etcd or ZooKeeper             | `consensus-and-quorums`                |
| Only one process may do this at a time                  | `distributed-locks-and-leases`         |
| One instance must own a role — the job ran N times      | `leader-election`                      |
| What should this service log?                           | `structured-logging`                   |
| What should it measure, and what must not be a label?   | `metrics-and-cardinality`              |
| What deserves a span, and how do async hops link?       | `distributed-tracing-design`           |
| What should wake someone at 3am?                        | `slo-and-alerting`                     |
| Error rate and latency climbing across several services | `cascading-failures`                   |
| Stop calling a dependency that is failing               | `circuit-breakers`                     |
| Name this symptom — is it a known pattern?              | `distributed-failure-catalogue`        |
| Prove it still works when the network or a node fails   | `distributed-systems-testing`          |

## Rules

- Route the **decision**, not the technology. "We are adding Kafka" is not a question; "these two
  services must not be deployed together" and "this work must survive a consumer restart" are,
  and they route differently.
- Establish idempotency before discussing retries, and the fault model before either. A retry
  policy over an operation of unknown repeat-safety is a decision to corrupt data on a schedule.
- **Three questions are asked at the wrong altitude more than any others.** "Should we shard?" is
  usually "should we cache or add a replica?" (`sharding-and-partitioning` says so). "We need a
  distributed lock" is usually a conditional write or a partitioned owner
  (`distributed-locks-and-leases`). "We need exactly-once" is at-least-once delivery plus an
  idempotent consumer (`delivery-semantics`, `idempotency`) — there is no other kind.
- Never accept "ordered", "exactly-once", "consistent" or "guaranteed" without a named scope. If
  the scope cannot be named, the claim is not yet a design.
- During an incident, route to the pattern before the mechanism. The instinctive interventions
  during a cascade — more replicas, longer timeouts, more retries — are the ones that deepen it.
- Do not stay in this skill once the owning skill is known. It carries no depth by design.
- Two neighbouring families own what this one does not: JVM latency, GC, allocation and profiling
  are `java-performance` and the skills below it; in-process concurrency mechanics — executors,
  cancellation, structured concurrency, bulkheads — belong to the Java concurrency family, and a
  distributed skill that needs them names the owner rather than restating it.

## References

- [Triage map](references/triage-map.md) — the separating question for each pair of symptoms that
  routes to two different owners, and the cheapest evidence that resolves it. Read when the table
  above gives two candidates rather than one.
- [Design review](references/design-review.md) — the questions to ask of a distributed design, in
  the order that makes each answerable, each routed to its owning skill. Read when reviewing or
  designing a component rather than diagnosing one.
