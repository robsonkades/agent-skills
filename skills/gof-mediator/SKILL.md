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

The cost is exact and unavoidable: **the hub now knows everything.** Every rule about how two
participants relate is in it, and it grows with every new relationship. That is the pattern's
whole trade, and it is why a mediator either stays deliberately small or becomes the class nobody
wants to open.

## The direction test

```text
Facade     callers call in; the subsystem does not call back and need
           not know the facade exists.

Mediator   the participants call in AND are called back. They depend on
           the hub; the hub owns their protocol.
```

If your "facade" is invoked by its own collaborators, it is a mediator and it will accumulate
their interaction rules (`gof-facade`).

## When it is the answer

```text
Four or more components interact in a genuine web, and the rules
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

- **Fewer than four collaborators.** Direct references are clearer, and the hub is an extra layer
  with no coupling saved worth having.
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
IF the hub has more than roughly seven participants, or its methods
share no state
THEN split it by protocol, not by noun. One mediator per interaction,
     not one per subsystem.

IF a participant notifies the hub, which notifies that participant
THEN reentrancy: a loop, or a stack overflow, or a partially applied
     change observed by the participant that caused it. Break it with
     a change-in-progress guard, or by queueing notifications.

IF the hub holds mutable protocol state
THEN its thread-safety contract must be explicit. A single-threaded
     hub processing a queue is a legitimate and simple answer; an
     unsynchronised hub shared by request threads is a race.

IF the hub is the only path between components in a hot flow
THEN it is a serialisation point. Measure before assuming that is
     acceptable.

IF participants need to know the outcome of what other participants did
THEN the protocol has results, not just notifications. Model the
     protocol explicitly rather than passing state through callbacks.

IF the hub spans processes
THEN it is an orchestrator: its availability becomes every
     participant's availability, and every step needs a timeout,
     a retry policy and a compensation
     (distributed-transactions-and-sagas).

IF the alternative is "each component publishes what it did"
THEN compare explicitly: choreography removes the hub and the
     bottleneck, and removes the single place where the flow is
     readable. Both are defensible; the choice must be stated.
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
  other's events — has none of those and gives up the single readable flow and the ability to
  cancel it (`event-driven-architecture`).
- **Performance.** A hub that every interaction passes through is a queue whether or not it is
  implemented as one. Its cost is contention on its state and, in the single-threaded variant, a
  hard concurrency limit of one. Both are acceptable in many systems and neither should be assumed
  (`littles-law-and-queueing`).
- **Testing.** A well-bounded mediator is unusually testable: fake participants, drive the
  protocol, assert the interactions — it is the one place where interaction-based testing is
  clearly appropriate, because interaction _is_ the subject. A mediator that needs twelve mocks
  has already failed the size test (`java-test-doubles`).

## Review checklist

- [ ] Participants are called back by the hub — otherwise it is a facade
- [ ] No participant retains a direct reference to another
- [ ] The hub coordinates fewer than about seven participants
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
