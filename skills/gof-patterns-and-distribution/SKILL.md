---
name: gof-patterns-and-distribution
description: >
  What happens to a Gang-of-Four pattern when the collaboration crosses a process boundary,
  and which additional architectural contracts it may require. Covers process-local,
  boundary, interaction and algorithm patterns; assumptions that need rechecking at a boundary
  — shared state, clocks, atomicity, ordering and delivery; the transformations
  (Singleton to leader election, Observer to pub/sub, Iterator to pagination, Mediator to an
  orchestrator); and the level confusion that treats a design pattern as a substitute for an
  architectural one. Use when a local design is being distributed, when a pattern name is
  applied to a network component, when a "singleton" or a cache is expected to hold across
  replicas, or when a getter turns out to make a call. Does not cover the individual
  patterns (the gof-\* skills), saga and outbox mechanics
  (distributed-transactions-and-sagas, event-driven-architecture), service boundary
  decisions (distribution-boundaries), or failure taxonomy (failure-models).
---

# Patterns and Distribution

## Purpose

Stop a local design's guarantees from being assumed across a network. GoF patterns primarily
describe collaborating objects in one address space. Local calls can still partially mutate then
throw, block on I/O, or race; a process boundary additionally introduces an independent
failure/ambiguity domain, serialization and operational ownership. The patterns
whose names survive the crossing are the ones most likely to hide that it stopped holding.

## What a boundary removes

This classification is conceptual; Java API references use Java 17. Inspect the target runtime,
codec, broker and persistence versions and effective configuration before applying their guarantees.

Start with the caller's operation, required effects, loss/recovery tolerance and actual deployment
boundary. Reuse existing contracts, tests and operational evidence; ask only about missing facts
that change the decision. Keep an adequate local design or remote protocol. A remote read does not
need durable progress merely because it crosses a process; a restart-surviving effect may.

```text
Inside one process                  Across a boundary
──────────────────────────────────  ───────────────────────────────────
A call has one process failure domain It may commit remotely while the reply is lost
Latency follows local work/I/O      Adds transport queues and independent tail latency
A reference addresses local state  Values or remote handles; no shared heap reference
Uniqueness is per class loader      Uniqueness requires coordination
Order follows synchronization/API   Broker/protocol/topology defines its scope
State can share memory              State may be remote/replicated; consistency is a contract
Monotonic intervals are local       Clock offset and rate assumptions need explicit treatment
One invocation; effects may partial Delivery may be at-most/at-least/effectively-once
```

The mappings below are possible roles and additional contracts, not mandatory topology changes.
Logical identity can travel in an ID or remote handle; it does not establish shared heap identity,
current authority or the lifetime of the referenced resource.

## Classification

```text
PROCESS-LOCAL — the guarantee stops at the JVM
    Singleton    uniqueness is per class loader, never per cluster
    Flyweight    shares in-process state; remote reuse needs a separate protocol
    Iterator     the cursor is in this process
    Memento      remote restoration needs explicit representation, ownership and lifetime

BOUNDARY — the pattern manages a seam, and the seam may be a network
    Adapter      where a foreign model, vocabulary and failure stop
    Proxy        the pattern most able to hide that a call is remote
    Facade       simplifies caller use; actual remote granularity decides round trips
    Bridge       supported backends must satisfy the chosen contract honestly

INTERACTION — the pattern shapes who talks to whom
    Command      may become a message: schema, delivery and effect policies needed
    Observer     becomes pub/sub with broker-specific delivery and ordering
    Mediator     becomes an orchestrator, with its own availability
    Chain        becomes a workflow, failing at every step

ALGORITHM — largely unaffected; the choice may not be
    Strategy     the choice of partitioner, serialiser or retry policy
                 has system-wide effects
    State        needs durability if progress must survive restart
    Template     coordinate overall budget with each remote step's transport limits
    Visitor      the element set becomes a versioned contract
```

## The transformations

| Local pattern | Distributed form                                        | What must be added                                                                            |
| ------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Singleton     | Leader election / authoritative resource coordination   | Resource-enforced authority, or proof that overlapping effects preserve the invariant         |
| Flyweight     | Local interning or justified remote content/cache reuse | Identity, capacity and freshness; invalidation where mutable content requires it              |
| Iterator      | Pagination/cursor                                       | Strategy, bound, deadline, cancellation, mid-walk consistency                                 |
| Memento       | Remote restore handle / snapshot                        | Identity, compatibility, ownership and lifetime; durable recovery when required               |
| Observer      | Publish/subscribe                                       | Declared delivery/ordering; transactional bridge when committed changes must publish reliably |
| Command       | A message                                               | Schema identity, delivery/effect policy, deduplication where needed, terminal outcome         |
| Mediator      | An orchestrator                                         | Persistence when recovery requires it, deadlines, applicable compensation and availability    |
| Chain         | A workflow                                              | Per-step failure and retry, redelivery semantics, partial-effect handling                     |
| Facade        | Remote facade, gateway or BFF when appropriate          | Contract, deployment, authentication, scaling and outage surface                              |
| Proxy         | A service client                                        | Deadlines, a failure vocabulary and bounded granularity; bulk operations where useful         |
| State         | State machine within a distributed workflow             | Required persistence, timeout outcomes and duplicate policy; not automatically a saga         |
| Composite     | Fan-out                                                 | Concurrency, an overall deadline, a defined partial-failure result                            |

## Decision rules

```text
IF a requirement says "there must be only one"
THEN ask "one per what?" A static field gives one per class loader.
     Cluster-wide singularity needs leader election, a lease, or a
     design where multiplicity does not matter (gof-singleton,
     leader-election).

IF a process-local limit is configured—a pool, limiter or cache
THEN model the aggregate across minimum/maximum dynamic replica count, rollout
     overlap and sidecars. Simple multiplication is a scenario, not a stable invariant.

IF an interface designed against a local implementation is about to be
implemented remotely
THEN review the contract: suitable granularity, propagated deadline/context, cancellation
     and named failure/unknown-outcome semantics may require change.
     Keep an interface whose contract already covers these effects; check actual call count
     (gof-proxy). A local System.nanoTime deadline cannot be compared in another JVM;
     inspect the transport's budget representation and propagation (timeouts-and-deadlines).

IF an in-process listener is being moved to a broker
THEN it is a redesign: six properties change at once — thread,
     transaction, ordering, delivery, failure visibility, schema
     (gof-observer).

IF an object is sent across a boundary
THEN identify whether the protocol transfers a value or a remote handle. Neither transfers a
     shared heap reference. Logical identity, constructor/invariant behavior and handle lifetime
     are protocol/codec-specific; the representation is a compatibility contract
     (rpc-and-api-contracts).

IF a pattern name is applied to a deployed component — "the gateway is
our facade", "the orchestrator is a mediator"
THEN identify the actual deployment boundary and its availability, authentication,
     scaling and failure contracts. The pattern name establishes none of these;
     local object design can still affect whether the component meets them.

IF the design question is really "where should this boundary be"
THEN it is not an object-design question at all
     (distribution-boundaries).

IF duplicate effects are harmful
THEN distinguish repeating one intent from stale or conflicting distinct intents. Deduplication
     or natural idempotence does not by itself reject a stale owner's different write; fencing
     does not by itself deduplicate repeated writes by a current owner. Enforce the required
     invariant at the effect boundary (idempotency, distributed-locks-and-leases).
     Check dedup retention and failure behavior; expiration does not establish that an earlier
     effect never occurred.
```

## The level confusion

```text
Design pattern         objects and classes inside one component
Component design       modules, packages, release units
Architectural pattern  how a system is organised: hexagonal, CQRS,
                       event-driven, layered
Distributed pattern    what crosses a network: saga, outbox, circuit
                       breaker, bulkhead, gateway, service mesh
```

A GoF pattern is not a substitute for any of the lower three rows. Proxy is not an API gateway;
Observer is not event-driven architecture; Mediator is not orchestration; Facade is not a
backend-for-frontend; Memento is not event sourcing; Flyweight is not a distributed cache. The
second decision includes contracts that the object pattern alone does not establish. Architecture
can remain within one deployment: CQRS or event sourcing does not itself require separate services.
Where components actually cross a process boundary, name their deployment, availability, scaling
and failure contracts so the pattern vocabulary does not hide the network hop.

Patterns can participate in architectures: an adapter can implement a port in hexagonal
architecture, a CQRS write can be represented by Command, and saga progress can use a state
machine. The required behavior need not force a particular GoF object structure.

## Review checklist

- [ ] Every "only one" requirement names its scope, and the mechanism matches
- [ ] Process-local limits are modeled across autoscaling and rollout replica ranges
- [ ] Remote contracts expose deadline representation, failure types and operation granularity
- [ ] Any getter/per-item remote call is explicit, bounded and protected from accidental fan-out
- [ ] Published representations have explicit schema identity and compatibility/unknown-value policy
- [ ] Delivery semantics drive idempotency/deduplication and atomicity requirements
- [ ] Fan-out has an overall deadline and a defined partial-failure result
- [ ] Durable workflows persist their state and treat timeouts as real events
- [ ] Pattern names are not used for deployed components without saying so

## References

Deliver the boundary, assumptions that changed, required guarantees and owners, then the smallest
contract changes and failure checks. Keep unsupported guarantees conditional and route detailed
protocol design to the specialist skills below.

- [Boundary classification](references/boundary-classification.md) — all twenty-three placed in the
  four classes, with what survives a boundary crossing, what silently stops holding, and the
  specific additions each distributed form requires. Read when distributing an existing design.
- [Design patterns against architectural patterns](references/design-vs-architecture.md) — the four
  levels with what belongs at each, the pairs most often conflated (Proxy/gateway, Observer/EDA,
  Mediator/orchestration, Memento/event sourcing, Flyweight/distributed cache), how patterns
  legitimately participate in architectures, and the escalation ladder from a class to a service.
  Read when a pattern is being proposed as an architecture, or vice versa.
