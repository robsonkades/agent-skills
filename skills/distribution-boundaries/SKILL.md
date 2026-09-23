---
name: distribution-boundaries
description: >
  Deciding whether a boundary should be a process boundary, and designing it when it must
  be: what distribution actually costs (latency, serialisation, partial failure, lost
  atomicity, independent deployment), caller-driven remote granularity, and choosing between
  synchronous call, messaging and replication. Use when a module
  is proposed for extraction into a service, when microservices are being adopted without a
  named driver, when a service call sits inside a transaction, when one request fans out to
  a dozen downstream calls, when two services share a database, when a "service" cannot be
  deployed without another being deployed too, when a synchronous chain has three or more
  hops, or when a distributed transaction is being designed. Does not cover the remote API's
  shape and payload types (remote-facade-and-dto), contract compatibility and versioning
  (rpc-and-api-contracts), transaction mechanics on one database (enterprise-transactions),
  or in-process layering (layering-and-boundaries).
---

# Distribution Boundaries

## Purpose

Make distribution a decision with a stated driver and a stated price, rather than a default
architecture. A process boundary is not a stronger version of a module boundary; it is a
different kind of thing, with different failure semantics. Remote calls do not inherit a
local transaction or a shared release lifecycle; transport failure can leave their outcome
unknown. Local calls can also block or fail after a mutation.

The first law here is old and still correct: **do not distribute your objects.** Distribute
when a concrete driver justifies it, and design the boundary to be worth its cost. The law
warns against transparent remote objects, not against every service boundary.

Java snippets are partial architectural illustrations, not a runnable application or a
declared Java baseline. Before implementing a client, transaction or cancellation choice,
inspect the project's JDK/toolchain, resolved framework/client versions and runtime
configuration. Applying this skill does not authorize upgrades or preview features.

## What crossing a process boundary actually costs

| Property       | In-process                            | Across a process boundary                                                     |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Call cost      | dispatch plus actual work             | transport, serialisation, queueing and work; measure tails                    |
| Failure modes  | exception, blocking, partial mutation | also transport ambiguity, independent failures and retry duplicates           |
| Atomicity      | only within an actual transaction     | requires explicit transaction participation or application recovery           |
| Refactoring    | often one release                     | compatibility across independently deployed versions                          |
| Debugging      | local evidence, possibly asynchronous | correlated evidence across systems, if instrumented                           |
| Types          | shared                                | a wire contract with independent lifecycles                                   |
| Coupling       | static and runtime                    | contract, data, temporal and operational dependencies                         |
| Potential gain | —                                     | independent deploy/scaling, isolation, autonomy, technology or regulatory fit |

The gains require design and operational evidence; a separate process alone guarantees none.

## Workflow

1. **Name the outcome and driver.** Start from caller/business needs and accepted constraints:
   independent deployment, scaling, fault isolation, ownership, or technology/regulatory fit.
   "Microservices" is not a driver. Distinguish measured demand from a credible target workload
   whose capacity assumptions still need validation; reuse available project evidence.
2. **Prefer an in-process rehearsal** when feasible. Inspect dependency and change history;
   moving tangled code over HTTP preserves its coupling. A regulatory or technology
   constraint can justify direct extraction with explicit migration risks
   (`layering-and-boundaries`).
3. **Draw the data ownership line.** Name the authority for each invariant and write path,
   including replicas and migration writers. Shared storage is not automatically shared
   ownership; direct access to private tables creates schema and deployment coupling.
4. **Shape the interface from caller use cases.** A bounded lookup may already be adequate.
   Coarsen or batch chatty navigation when the round-trip benefit justifies payload,
   consistency and compatibility costs (`remote-facade-and-dto`).
5. **Decide the consistency story explicitly.** What is atomic, what is eventual, what is
   the visible intermediate state, and what compensates a partial failure.
6. **Bound call duration and capacity.** Define a deadline, retry policy (including no retry),
   and safe failure behaviour. Some operations must fail closed. Repeated writes need
   idempotency or reconciliation of an unknown outcome (`timeouts-and-deadlines`,
   `retries-and-backoff`, `idempotency`).
7. **Verify the intended gain.** Persistent lockstep releases undermine independent
   deployment; they do not disprove scaling or isolation benefits. For a proposed extraction,
   define relevant mixed-version, dependency-outage and migration/rollback checks; distinguish
   those plans from executed validation.

With missing workload, dependency or ownership evidence, keep extraction conditional and
identify the next discriminating check or material question. Retain an adequate existing boundary
when its outcomes and constraints are met. Return a short decision: driver and evidence, local
alternative, chosen or retained interaction/consistency contract, failure behaviour, and relevant
validation/rollback criteria; state what evidence would change the choice.

## Decision rules

```text
The two sides change together in most commits
        → inspect why. Accidental coupling favours keeping local or
          redesigning; a cross-cutting feature alone does not invalidate a boundary.

The driver is independent deployability, and the module has a stable,
narrow, business-shaped interface
        → a candidate. Rehearse as a module when feasible; reuse evidence
          from an existing module. Direct extraction needs a stated constraint
          and explicit migration risks, not a mandatory local trial.

The driver is scaling one part independently
        → measure CPU, memory, I/O, bottlenecks and load curves. Low CPU
          alone does not reject extraction; a GPU or large heap requirement
          is a candidate driver, not proof of a net benefit.

The driver is fault isolation
        → valid, and often the strongest one — but only if the caller has
          a defined behaviour when the callee is down. Isolation without a
          capacity boundary and safe failure behaviour adds another failure mode.

The driver is team autonomy
        → measure release coordination cost and ownership friction
          against the new operational and contract maintenance costs.

Two candidate services would share a database table
        → inspect write authority and schema coupling. Shared private
          tables need an ownership/migration plan; shared infrastructure
          or a supported read contract is a different trade-off.

The operation requires atomicity across both sides
        → prefer a single transaction boundary. If distribution is necessary,
          verify supported atomic-commit protocols and their recovery costs,
          or obtain an explicit business contract allowing saga/outbox recovery.

A synchronous chain would be three or more hops deep
        → sequential stage latencies add; required dependencies can reduce
          availability. Measure the critical path before collapsing hops
          or changing the completion contract to events.
```

## Rules

- **Design remote granularity around caller use cases.** If measured latency is dominated
  by round trips, coarsening or batching is a candidate; measure payload/processing costs
  before attributing every slow remote call to chattiness (`architecture-and-performance`).
- If all four services are required and their success events are independent, each at
  99.9%, combined availability is `0.999^4 = 99.6006%`: about 2.876 hours unavailable
  in a 30-day month. Correlations, retries and the success definition change that model;
  it is not a measured outage forecast. Caches and messaging change dependencies and
  freshness/completion guarantees rather than making dependencies disappear.
- **A local transaction does not automatically include a remote effect.** Design the
  failure gap between a local commit and a remote operation. Sagas and outboxes do not
  provide cross-service ACID atomicity; explicit distributed transaction protocols can,
  with participant and availability constraints (`distributed-transactions-and-sagas`).
- Access to another service's private tables couples schema changes and operations.
  Evaluate supported views, replication or APIs against consistency and ownership needs.
- Chattiness and coupling trade off. A coarse operation that returns everything the caller
  might need transfers data nobody uses; a fine one requires many round trips. Resolve it
  from the caller's actual use cases, not by symmetry with the domain model.
- A boundary intended for independent deployment needs compatible evolution. If an
  optional field requires lockstep releases, inspect tolerant readers and contract tests;
  a change to required business semantics may need a staged migration
  (`rpc-and-api-contracts`).
- Prefer asynchronous messaging where the caller does not need the answer to proceed. It
  decouples producer progress from immediate consumer availability, subject to durable
  acceptance, queue capacity, retention and recovery. Publication still needs time bounds;
  define completion deadlines, backlog limits and visible intermediate states
  (`delivery-semantics`).
- Do not extract a service to fix a code quality problem. A tangled module becomes a
  tangled module you cannot refactor with an IDE.
- Reversing an extraction can require data and consumer migration. Assess that cost and
  recovery path before proceeding; record consequential choices using the project's ADR
  conventions (`architecture-decision-making`).

## References

- [Local versus remote boundaries](references/local-vs-remote.md) — the concrete arithmetic
  of a chatty interface, the failure modes a local call does not have, why an in-process
  module is the right rehearsal for a service, the distributed monolith's detectable
  symptoms, and how to run an extraction so it can be abandoned halfway. Read before
  proposing or reviewing an extraction.
- [Distribution strategies](references/distribution-strategies.md) — synchronous request,
  asynchronous messaging, event-carried state transfer and replication compared on
  coupling, consistency and failure; sagas and compensation; the outbox; fan-out and its
  latency; and choosing per interaction rather than per system. Read when designing the
  interaction between two services.
