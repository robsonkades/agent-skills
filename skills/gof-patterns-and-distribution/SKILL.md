---
name: gof-patterns-and-distribution
description: >
  What happens to a Gang-of-Four pattern when the collaboration crosses a process boundary,
  and which architectural pattern it becomes. Covers the classification into process-local,
  boundary, interaction and algorithm patterns; the guarantees that evaporate at a boundary
  — shared memory, a shared clock, atomic calls, ordering, exactly-once; the transformations
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

Stop a local design's guarantees from being assumed across a network. Every GoF pattern was
written for objects in one address space, where a call cannot half-happen, a reference is a
reference, and "one instance" means one. None of that holds across a process, and the patterns
whose names survive the crossing are the ones most likely to hide that it stopped holding.

## What a boundary removes

```text
Inside one process                  Across a boundary
──────────────────────────────────  ───────────────────────────────────
A call succeeds or throws           It may succeed and the reply be lost
Latency is nanoseconds              Milliseconds at best, unbounded at worst
A reference is the object           A copy; identity does not travel
Uniqueness is per class loader      Uniqueness requires coordination
Order is program order              Order is per partition, or absent
State is shared                     State is replicated and stale
A clock is one clock                Clocks disagree
Exactly once                        At least once, plus deduplication
```

Every transformation below follows from that table.

## Classification

```text
PROCESS-LOCAL — the guarantee stops at the JVM
    Singleton    uniqueness is per class loader, never per cluster
    Flyweight    references are shared; nothing crosses the wire
    Iterator     the cursor is in this process
    Memento      opaque and transient; it is not a wire format

BOUNDARY — the pattern manages a seam, and the seam may be a network
    Adapter      where a foreign model, vocabulary and failure stop
    Proxy        the pattern most able to hide that a call is remote
    Facade       coarse granularity is how round trips are saved
    Bridge       one backend may be remote; design for that one

INTERACTION — the pattern shapes who talks to whom
    Command      becomes a message: versioned, redelivered, idempotent
    Observer     becomes pub/sub: at-least-once, partition-ordered
    Mediator     becomes an orchestrator, with its own availability
    Chain        becomes a workflow, failing at every step

ALGORITHM — largely unaffected; the choice may not be
    Strategy     the choice of partitioner, serialiser or retry policy
                 has system-wide effects
    State        becomes a durable, resumable machine
    Template     a step may be remote; the template owns its timeout
    Visitor      the element set becomes a versioned contract
```

## The transformations

| Local pattern | Distributed form                            | What must be added                                                        |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Singleton     | Leader election / a lease                   | Fencing tokens, or idempotency so overlap is harmless                     |
| Flyweight     | A distributed cache — a **different** thing | Invalidation, staleness policy, a network hop per miss                    |
| Iterator      | Pagination                                  | Keyset cursors, a bound, a deadline, mid-walk consistency semantics       |
| Memento       | A versioned snapshot                        | A schema, a version field, a tolerant reader                              |
| Observer      | Publish/subscribe                           | An outbox, idempotent consumers, DLQ, consumer-lag alerting               |
| Command       | A message                                   | A stable name, a version, an idempotency key, a terminal failure path     |
| Mediator      | An orchestrator                             | Durable state, per-step timeouts, compensation, its availability budget   |
| Chain         | A workflow                                  | Per-step failure and retry, redelivery semantics, partial-effect handling |
| Facade        | An API gateway or BFF                       | A deployment, authentication, its own scaling and outage surface          |
| Proxy         | A service client                            | Deadlines, a failure vocabulary, bulk operations                          |
| State         | A durable state machine / saga              | Persisted transitions, timeouts as real events, idempotent transitions    |
| Composite     | Fan-out                                     | Concurrency, an overall deadline, a defined partial-failure result        |

## Decision rules

```text
IF a requirement says "there must be only one"
THEN ask "one per what?" A static field gives one per class loader.
     Cluster-wide singularity needs leader election, a lease, or a
     design where multiplicity does not matter (gof-singleton,
     leader-election).

IF a process-local limit is configured — a pool, a rate limiter, a
cache size
THEN write the figure multiplied by the replica count next to it.
     20 connections × 8 replicas is 160, and the database has 100.

IF an interface designed against a local implementation is about to be
implemented remotely
THEN the CONTRACT must change, not only the implementation: bulk
     operations, a deadline parameter, a named failure vocabulary.
     Otherwise a loop becomes N network calls (gof-proxy).

IF an in-process listener is being moved to a broker
THEN it is a redesign: six properties change at once — thread,
     transaction, ordering, delivery, failure visibility, schema
     (gof-observer).

IF an object is sent across a boundary
THEN it is serialised: identity is lost, invariants enforced only in
     constructors are not re-run, and its shape becomes a versioned
     contract (rpc-and-api-contracts).

IF a pattern name is applied to a deployed component — "the gateway is
our facade", "the orchestrator is a mediator"
THEN the name is a metaphor, not a design. The component has
     availability, authentication, scaling and an outage surface that
     no class has.

IF the design question is really "where should this boundary be"
THEN it is not an object-design question at all
     (distribution-boundaries).

IF work must happen once and duplicates are harmful
THEN idempotency first, coordination second. A deduplication key
     survives the lock failing; a lock does not (idempotency).
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
backend-for-frontend; Memento is not event sourcing; Flyweight is not a distributed cache. In each
pair the second has an operational existence — deployment, availability, scaling, failure — that
the first does not, and using one word for both is how a network hop becomes invisible in a design
discussion.

Patterns do participate in architectures: an adapter implements a port in hexagonal architecture, a
command is a CQRS write, a state machine is a saga's core. That is composition across levels, not
equivalence.

## Review checklist

- [ ] Every "only one" requirement names its scope, and the mechanism matches
- [ ] Process-local limits are recorded multiplied by the replica count
- [ ] No interface hides remoteness: deadlines, failure types and granularity are in the contract
- [ ] No getter or per-item method makes a network call
- [ ] Anything published beyond the process has a version and a tolerant reader
- [ ] Consumers of at-least-once delivery are idempotent, keyed, and commit dedup with the effect
- [ ] Fan-out has an overall deadline and a defined partial-failure result
- [ ] Durable workflows persist their state and treat timeouts as real events
- [ ] Pattern names are not used for deployed components without saying so

## References

- [Boundary classification](references/boundary-classification.md) — all twenty-three placed in the
  four classes, with what survives a boundary crossing, what silently stops holding, and the
  specific additions each distributed form requires. Read when distributing an existing design.
- [Design patterns against architectural patterns](references/design-vs-architecture.md) — the four
  levels with what belongs at each, the pairs most often conflated (Proxy/gateway, Observer/EDA,
  Mediator/orchestration, Memento/event sourcing, Flyweight/distributed cache), how patterns
  legitimately participate in architectures, and the escalation ladder from a class to a service.
  Read when a pattern is being proposed as an architecture, or vice versa.
