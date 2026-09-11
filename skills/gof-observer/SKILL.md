---
name: gof-observer
description: >
  Observer in Java: choosing and reviewing in-process listener contracts for ordering,
  errors, threads, registration lifetime, reentrancy and notification outside locks.
  Use when adding listeners, investigating retained listeners or missed callbacks, or
  assessing a move from local notifications to a broker. Covers migration contract changes;
  detailed transaction/outbox design belongs to event-driven-architecture, broker guarantees
  to delivery-semantics, demand protocols to reactive-backpressure, and hub coordination
  to gof-mediator.
---

# Observer

## Purpose

Let a subject tell an unknown set of dependents that something happened, without depending on
them. It is the most reached-for decoupling mechanism in object design and the one whose contract
is most often over-read.

The abstract pattern does not itself choose ordering, thread, error isolation, lifecycle or crash
delivery. A concrete observer API must choose them; even “registered observers are called” needs
qualification for concurrent deregistration, filtering and failure policy.

Use Java 17 as the baseline for the partial examples here (no preview). Inspect actual compiler,
Spring/Guava/Modulith versions, multicaster/executor configuration and transaction manager before
applying framework-specific guidance; no upgrade is implied. Return the concrete dispatch and
lifecycle contract, evidence for it, and tests or explicit unverified cases.

Start from the caller's operation and its listeners' required effects, using existing tests,
registration owners, transaction configuration and recovery arrangements. Ask only about material
gaps such as tolerated loss, callback completion or ordering. Preserve an adequate local mechanism;
compare alternatives when those contracts cannot be met, not merely because more listeners exist.

Keep callback dispatch, transaction phase, propagation and subscription lifetime here. If diagnosis
reveals a need to design or change durable publication or business recovery, hand that design to
`event-driven-architecture`; use `idempotency` for repeated intent or an unknown remote effect.
Carry forward known committed effects, unresolved outcomes, recovery requirements and existing
reconciliation/provider constraints instead of designing a new outbox or recovery protocol here.
Local failure visibility and checking an already adequate reconciliation path remain in scope;
they do not by themselves require that handoff.

## What people assume, and what holds

```text
Assumed                              Risk in a simple synchronous strong-listener loop
───────────────────────────────────  ───────────────────────────────────
"Asynchronous"                       Synchronous, on the notifying thread,
                                     possibly sharing caller transaction context

"They run in registration order"     List iteration can preserve that order;
                                     the pattern alone does not promise it

"A failing listener is isolated"     The exception propagates and the
                                     remaining listeners never run

"The event will be delivered"        In-process only, and lost on crash

"Adding a listener is free"          The subject now holds it alive, and
                                     notification cost is linear

"The subject is decoupled"           From concrete listener types, yes. From
                                     their latency and failures, no
```

Every one of these is fixable, and each fix is a decision to make deliberately rather than
inherit.

## Observer, reactive stream, pub/sub

| Property              | In-process Observer                    | Reactive Stream                                   | Distributed pub/sub                 |
| --------------------- | -------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Thread                | API-defined; often publisher           | Publisher/subscriber unless a scheduler shifts it | Consumer execution context          |
| Backpressure          | No demand protocol; dispatch-dependent | `request(n)`, explicit                            | Broker buffering, consumer lag      |
| Delivery              | In memory                              | In memory, with cancellation                      | Broker/configuration-specific       |
| Ordering              | Implementation contract                | Per-stream contract                               | Scope depends on broker/topology    |
| Failure of a consumer | Policy-defined; often propagates       | Usually terminates that subscription              | Ack/retry/terminal policy-specific  |
| Transaction           | May share caller context               | Context/framework-dependent                       | Usually separate; bridge explicitly |
| Schema                | A Java type                            | A Java type                                       | A versioned contract                |

These are not interchangeable implementations of one idea. Moving a listener from the first column
to the third changes transactional semantics, ordering, error handling, latency and idempotency
requirements — it is a redesign, not a refactor (`event-driven-architecture`, `delivery-semantics`).

## When it is the answer

```text
A subject must notify dependents it does not know about, in-process
        → Observer, with ordering, error and lifecycle policies stated.

Modules within one application must react to a domain change without
the originator knowing them
        → application events, with before/after-commit phase chosen from consistency needs.

A consumer must control the rate of a stream it cannot outrun
        → a reactive stream when explicit demand is needed; a synchronous loop
          blocks, while async observers need a bounded overload policy (reactive-backpressure).

Another service must react
        → messaging; choose a consistency bridge such as an outbox if database
          state and publication must agree. Hand off to event-driven-architecture.
```

## When it is not

- **There is one listener, same ownership, and no lifecycle/evolution reason for indirection.** A
  direct call is clearer. One current listener can still justify an event at a module boundary or
  when publisher semantics explicitly permit zero/many future observers.
- **The publisher needs the outcome.** Observers return nothing; a publisher that inspects results
  is issuing commands, not events (`gof-command`).
- **Order between listeners is essential but implicit.** Prefer an explicit pipeline/workflow;
  ordered observers remain valid when the API makes phases and dependencies visible.
- **Required recovery cannot be met by the local mechanism.** Failure visibility alone does not
  require durability. For work that must survive a crash, choose durable publication or a complete
  reconciliation path within the recovery target; the worked example's nightly job is one such path.

## Decision rules

```text
IF a subject can outlive a listener's intended registration or captured state
THEN provide deregistration with a defined owner. Bounded registrations that deliberately share
     the subject's lifetime can remain until that lifetime ends.
     Retaining expired registrations is the classic listener leak:
     capturing callbacks retain their owner; keep the exact listener reference
     or return a subscription handle. Fresh method references need not be identical.

IF listeners may register or deregister during notification
THEN choose defined iteration semantics (for example a CopyOnWriteArrayList snapshot).
     Removal excludes future snapshots, not callbacks already captured or running.
     State whether close waits for in-flight callbacks; avoid self-close deadlock.

IF a listener throws
THEN decide: fail the publisher (fine when the listener is essential),
     or isolate and record (fine when it is not). Silently swallowing
     is the failure that gets discovered by a customer.
     Propagating an exception does not undo an already applied transition or earlier listener
     effects; any rollback or compensation needs its own effective boundary.

IF the subject notifies while holding a lock
THEN a listener that acquires another lock or re-enters can deadlock or see
     partial state. Prefer publishing an immutable snapshot after releasing the lock;
     if atomic synchronous callbacks are required, document lock/reentrancy rules.

IF the listener does I/O
THEN the publisher's latency now includes it. Either accept that
     explicitly or hand the work to an executor — and then handle the
     failure that no longer propagates, bounded queue/rejection, context transfer and shutdown.

IF the event is published inside a transaction and the listener writes
THEN identify phase and effective transaction participation. After completion,
     resources may remain accessible without any further commit; writes need a new boundary
     (event-driven-architecture).

IF the listener is in another process
THEN choose durability and duplicate handling from loss tolerance and broker configuration.
     An uncoordinated database state change plus broker send is a dual write
     (event-driven-architecture).

IF ordering between listeners matters
THEN state it explicitly and test it, or remove the dependency.
```

## Cross-cutting checks

- **Concurrency.** Three recurring failures. Mutation of the listener list during notification—
  `CopyOnWriteArrayList` fits read-heavy/small listener sets, while snapshot copies, immutable
  registries or locks may fit different churn/size. Notification under a lock turns listener locking into a
  deadlock risk. And reentrancy: a listener that triggers another notification on the same subject
  can expose partial state if the transition is unfinished, or reorder delivery even after it finishes (`java-memory-model`).
- **Distribution.** Observer stops at the process boundary. Crossing it requires explicit delivery,
  duplicate and ordering scopes from the broker/topology, asynchronous failure reporting and
  an event schema that other teams depend on. The
  common transactional bridge is an outbox: write the event in the same database transaction and
  relay it. CDC or coordinated transactions are alternatives with different assumptions; an
  uncoordinated database write plus broker send is the dual-write hazard
  (`idempotency`, `message-ordering-and-partitioning`).
- **Performance.** A sequential synchronous implementation is linear and publisher latency includes
  listeners until failure/short-circuit; parallel/asynchronous forms trade this for queues,
  scheduling and detached failure. A hot subject with many listeners is a fan-out on the request
  path. An event object per notification is normally fine; measure allocation before changing
  a hot per-element loop (`allocation-profiling`).
- **Testing.** Test the publisher by asserting the event it published, and each listener
  independently against a constructed event — this is the pattern's main testing dividend. Then add
  the two tests nobody writes: that a throwing listener behaves as the chosen policy says, and that
  deregistration excludes later snapshots. A notification test is not proof of collectability;
  test captured/in-flight callbacks separately, then inspect retention when warranted.

## Review checklist

- [ ] Every registration has an owner and end condition, including deliberate co-lifetime retention
- [ ] The listener collection is safe to iterate while listeners are added or removed
- [ ] Notification locking, reentrancy and snapshot visibility are explicit and deadlock-reviewed
- [ ] Concurrent publishers cannot violate the listener thread-safety/order contract
- [ ] The policy for a throwing listener is explicit and tested
- [ ] Listener ordering is either irrelevant or imposed and tested
- [ ] Listeners doing I/O are accounted for in the publisher's latency budget
- [ ] Events crossing a transaction boundary have a defined phase
- [ ] When state and cross-process publication must agree, the recovery/transactional bridge and duplicate policy meet that contract
- [ ] A single known listener has a stated module/lifecycle reason or is a direct call

## References

- [Observer variants and lifecycle](references/observer-variants.md) — in-process, reactive and
  distributed compared in full; the listener leak with weak-reference pitfalls; ordering, error
  and reentrancy policies with code; notification outside locks; and Spring's event phases with
  what each guarantees. Read when designing a notification mechanism.
- [Worked example](references/worked-example.md) — an in-process domain listener migrated to a
  broker: what the outbox changed, why the consumer needed an idempotency key, the ordering
  assumption that broke, and proposed tests for each. Read when implementing or migrating.
