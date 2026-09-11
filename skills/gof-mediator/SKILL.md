---
name: gof-mediator
description: >
  Mediator in modern Java, treated as high-risk: replacing many-to-many collaboration with a hub
  that owns the interaction protocol, and the god object that hub becomes when nothing bounds it.
  Covers the direction test that separates it from a facade, event-based alternatives and their
  delivery coupling, the reentrancy loop when a colleague notifies the hub that
  notifies it back, when the hub serializes work, and orchestration versus choreography with
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
hub, peer dependencies are reduced; changes to the shared protocol can still affect participants.

The trade-off is concentration: the mediator owns interaction rules and therefore becomes a
coupling and operational hotspot if its protocol boundary is too broad. It need not know every
participant implementation or all domain rules; ports, messages and protocol state can keep the
hub focused.

Start with an ordinary caller flow, a supported advanced interaction and a failure/misuse path.
Reuse callers, tests and accepted protocol, lifetime and recovery constraints before asking about
material gaps such as inline callbacks or cancellation authority. Preserve an adequate direct
collaboration or existing coordinator; compare extraction only for an observed ownership/change
problem. Keep uncertain changes conditional and continue independent review.

## The direction test

```text
Facade     callers use a simpler entry point; subsystem components need
           not coordinate peers through it.

Mediator   peer interactions are routed/coordinated through a hub, directly
           or through messages; the hub owns their collaboration protocol.
```

Callbacks alone do not establish a mediator: inspect whether the hub actually owns peer
collaboration rules (`gof-facade`).

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
  Observer or an application event; it removes the publisher's choice of recipient reactions,
  while retaining event and delivery contracts
  (`gof-observer`).
- **It is dispatch, not coordination.** A class that routes a request to its single handler is a
  command dispatcher; the "mediator" label — borrowed from libraries in other ecosystems — hides
  that dispatch/result policy alone is not a peer collaboration protocol (`gof-command`).
- **The same protocol rule remains owned in two places.** Direct calls outside the mediated
  protocol can be valid; duplicate authority over its transitions is the actual defect.
- **It has become the application.** See the god-object criteria below.

## Decision rules

Examples use Java 17 records/APIs and include partial snippets and labeled pseudocode. Inspect
target toolchains and transaction frameworks; the pattern does not authorize dependency upgrades.

```text
IF participants or methods change for unrelated protocols
THEN split by protocol, consistency boundary or lifecycle. Count is only a signal;
     a large cohesive mediator may be safer than several hubs with duplicated state.

IF a participant notifies the hub, which notifies that participant
THEN inspect reentrancy and feedback. Guards may discard required events; queues can turn recursion
     into infinite queued work. Define coalescing/idempotent transitions and a bounded delivery policy.

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
THEN define the flow's required lifetime: accepted ephemeral read coordination need not
     persist progress, while restart-surviving work needs durable progress and recovery.
     Each remote step needs a deadline and explicit retry/terminal policy;
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
  consumer, actor-style — serializes owned state only if callbacks and offloaded completions return
  through that queue. Capacity, failure and shutdown still need contracts. Reentrancy is another hazard: a
  notification that re-enters the hub while it is mid-update may see inconsistent state
  (`java-memory-model`).
- **Distribution.** The distributed mediator is an orchestrator, and the differences are
  operational rather than structural: it must survive its own restart (state persisted, steps
  resumable) when progress must survive restart; calls can fail or time out, compensation is a
  semantic policy rather than rollback, and dependent flows can stall while the hub is unavailable.
  Choreography — participants reacting to each other's events — distributes those duties.
  Require durable delivery/progress when the flow must survive restart and idempotency where
  retries/redelivery can repeat effects; choose observability to meet its operational contract.
  Cancellation still needs explicit ownership and protocol
  (`event-driven-architecture`).
- **Performance.** A hub is not necessarily a queue: stateless synchronous routing may run
  concurrently, while locks, shared state or a mailbox introduce queueing. A single consumer has
  one-at-a-time service semantics but can batch or delegate work; measure arrival rate, service
  time and queue growth
  (`littles-law-and-queueing`).
- **Testing.** Drive the protocol with contract fakes: assert required state, effects and their
  ordering, including duplicates, reentrant callbacks and failure after a claim. Do not fix every
  incidental call sequence; return/admission is not necessarily downstream completion. Many test doubles are a cohesion
  smell, not a numerical failure criterion; shared protocol fixtures and contract fakes can keep
  tests expressive (`java-test-doubles`).

## Review checklist

- [ ] Peer collaboration is coordinated through the hub—otherwise compare a facade/dispatcher
- [ ] No competing owner enforces the same mediated transition
- [ ] Participants share one coherent protocol, lifecycle or consistency reason
- [ ] Methods serve a coherent protocol; shared fields alone do not establish cohesion
- [ ] Reentrant notification is prevented or explicitly safe
- [ ] The hub's thread-safety model is stated (single-threaded queue, or synchronised state)
- [ ] Restart-surviving flows persist progress and define retry, terminal and applicable compensation policies
- [ ] Where distribution is in scope, coordination and recovery ownership are deliberate
- [ ] Dispatch alone is distinguished from GoF peer coordination, regardless of library naming

## References

Deliver the selected or retained protocol owner, state/effect ordering, caller outcome and
callback/threading/lifetime contract with relevant checks for duplicates, failure and cancellation.
Keep public entry points compatible when splitting internals. State which guarantees remain
unverified and which missing contract would change the recommendation.

- [Mediator against the alternatives](references/mediator-vs-alternatives.md) — the direction test
  in detail; Mediator against Facade, Observer, event bus and command dispatcher; god-object
  criteria with the splitting technique; reentrancy patterns and guards; and orchestration versus
  choreography with the properties each gives up. Read when classifying or splitting a coordinator.
- [Worked example](references/worked-example.md) — an order-fulfilment coordinator: the
  illustrative many-to-many web, reentrancy and duplicate-effect hazards, the split across protocols with nine
  participants, and the distributed orchestrator version with persistence, timeouts and
  compensation. Read when implementing.
