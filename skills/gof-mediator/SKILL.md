---
name: gof-mediator
description: >
  Mediator in modern Java, treated as high-risk: replacing many-to-many collaboration with a hub
  that owns the interaction protocol, and the god object that hub becomes when nothing bounds it.
  Covers the direction test that separates it from a facade, why an event bus is the decoupled
  alternative and what it gives up, the reentrancy loop when a colleague notifies the hub that
  notifies it back, the hub as a serialisation point, and orchestration versus choreography with
  the availability coupling an orchestrator introduces. Use when collaborators reference each
  other in a web, when a coordinator class keeps growing, when a command bus is called a mediator,
  when a saga orchestrator is designed, or when a notification loops between two components. Does not
  cover one-way notification to unknown subscribers (gof-observer, event-driven-architecture), a
  simplifying entry point (gof-facade), request dispatch to one handler (gof-command), or saga
  mechanics (distributed-transactions-and-sagas).
---

# Mediator

## Purpose

Take the interaction rules out of the participants and put them in one place. When five components
each know about the other four, a change to one ripples through the set; when each knows only a
hub, the ripple stops there.

The trade-off is concentration: the mediator owns interaction rules and therefore becomes a
coupling and operational hotspot if its protocol boundary is too broad. It need not know every
participant implementation or all domain rules; ports, messages and protocol state can keep the
hub focused.

## The direction test

```text
Facade     callers use a simpler entry point; subsystem components need
           not coordinate peers through it.

Mediator   peer interactions are routed/coordinated through a hub, directly
           or through messages; the hub owns their collaboration protocol.
```

If your "facade" is invoked by its own collaborators, it is a mediator and it will accumulate
their interaction rules (`gof-facade`).

## When it is the answer

```text
Several components interact in a genuine web, and the rules
about their interaction are the complicated part
        → Mediator. Classic examples: dialog widgets that enable and
          disable each other, a resource scheduler, a session
          coordinating devices.

A protocol has state — "after A completes, B may start unless C is
pending" — and that state belongs to no participant
        → Mediator, and it is usually also a state machine (gof-state).

A multi-step process must be coordinated with explicit ordering,
compensation and visibility
        → an orchestrator, which is the distributed form.
```

## When it is not

- **A small stable interaction where direct collaboration is clearer.** Participant count alone
  does not decide it; cyclic coupling, protocol state, ownership and change rate do.
- **The interaction is one-way notification.** "This happened, whoever cares may react" is
  Observer or an application event, and it decouples further than a mediator does
  (`gof-observer`).
- **It is dispatch, not coordination.** A class that routes a request to its single handler is a
  command dispatcher; the "mediator" label — borrowed from libraries in other ecosystems — hides
  that there is no protocol and no participants calling back (`gof-command`).
- **Participants still call each other.** A partial mediator is the worst of both: the rules exist
  in two places, and the hub's version is the one that will be out of date.
- **It has become the application.** See the god-object criteria below.

## Decision rules

```text
IF participants or methods change for unrelated protocols
THEN split by protocol, consistency boundary or lifecycle. Count is only a signal;
     a large cohesive mediator may be safer than several hubs with duplicated state.

IF a participant notifies the hub, which notifies that participant
THEN reentrancy: a loop, or a stack overflow, or a partially applied
     change observed by the participant that caused it. Break it with
     a change-in-progress guard, or by queueing notifications.

IF the hub holds mutable protocol state
THEN its thread-safety contract must be explicit. A single-threaded
     hub processing a queue is a legitimate and simple answer; an
     unsynchronised hub shared by request threads is a race.

IF the hub is the only path in a hot flow
THEN inspect whether implementation actually serializes work. Stateless routing can be
     concurrent; shared state, locks or a single-consumer mailbox create the bottleneck.

IF participants need to know the outcome of what other participants did
THEN the protocol has results, not just notifications. Model the
     protocol explicitly rather than passing state through callbacks.

IF the hub spans processes
THEN it is an orchestrator: flows it coordinates depend on its durable progress and
     recovery. Each remote step needs a deadline and explicit retry/terminal policy;
     compensation is needed only for effects that must be semantically undone
     (distributed-transactions-and-sagas).

IF the alternative is "each component publishes what it did"
THEN compare explicitly: choreography distributes coordination and failure handling,
     reducing central runtime dependency but increasing emergent coupling, observability,
     schema evolution and cancellation complexity. Both are defensible.
```

## Cross-cutting checks

- **Concurrency.** Two hazards, in opposite directions. A hub with mutable protocol state shared
  by many threads needs real synchronisation, and lock ordering becomes its problem because it
  touches every participant. Conversely, a deliberately single-threaded hub — a queue and one
  consumer, actor-style — makes the protocol trivially safe and is often the right design, at the
  price of being a throughput ceiling. Reentrancy is the third hazard and belongs to both: a
  notification that re-enters the hub while it is mid-update sees inconsistent state
  (`java-memory-model`).
- **Distribution.** The distributed mediator is an orchestrator, and the differences are
  operational rather than structural: it must survive its own restart (state persisted, steps
  resumable), every call to a participant can fail or time out, compensation replaces rollback,
  and its availability multiplies into everyone's. Choreography — participants reacting to each
  other's events — distributes those duties; it still needs durable delivery, idempotency,
  observability and can support cancellation only through an explicit protocol
  (`event-driven-architecture`).
- **Performance.** A hub is not necessarily a queue: stateless synchronous routing may run
  concurrently, while locks, shared state or a mailbox introduce queueing. A single consumer has
  one-at-a-time service semantics but can batch or delegate work; measure arrival rate, service
  time and queue growth
  (`littles-law-and-queueing`).
- **Testing.** A well-bounded mediator is unusually testable: fake participants, drive the
  protocol, assert the interactions — it is the one place where interaction-based testing is
  clearly appropriate, because interaction _is_ the subject. Many test doubles are a cohesion
  smell, not a numerical failure criterion; shared protocol fixtures and contract fakes can keep
  tests expressive (`java-test-doubles`).

## Review checklist

- [ ] Peer collaboration is coordinated through the hub—otherwise compare a facade/dispatcher
- [ ] No participant retains a direct reference to another
- [ ] Participants share one coherent protocol, lifecycle or consistency reason
- [ ] The hub's methods share protocol state; unrelated methods mean it is two mediators
- [ ] Reentrant notification is prevented or explicitly safe
- [ ] The hub's thread-safety model is stated (single-threaded queue, or synchronised state)
- [ ] The distributed form persists its state and defines compensation per step
- [ ] Orchestration versus choreography was a stated choice
- [ ] A command dispatcher is not described as a mediator

## References

- [Mediator against the alternatives](references/mediator-vs-alternatives.md) — the direction test
  in detail; Mediator against Facade, Observer, event bus and command dispatcher; god-object
  criteria with the splitting technique; reentrancy patterns and guards; and orchestration versus
  choreography with the properties each gives up. Read when classifying or splitting a coordinator.
- [Worked example](references/worked-example.md) — an order-fulfilment coordinator: the
  many-to-many web it replaced, the reentrancy bug found in review, the split when it reached nine
  participants, and the distributed orchestrator version with persistence, timeouts and
  compensation. Read when implementing.
