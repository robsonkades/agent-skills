---
name: gof-command
description: >
  Command in modern Java: turning an invocation into an object so it can be queued, logged,
  scheduled, retried or undone — and the distinction from an event, which is a fact rather than a
  request. Covers when reifying a call earns its cost and when a method reference is enough, undo
  through inverses versus mementos versus compensation, what changes when a command is persisted
  or sent to a broker (versioning, at-least-once delivery, idempotency), and the captured-state
  hazard when a command executes later than it was created.
  Use when an operation must be deferred, queued, audited or undone, when a command bus is
  proposed, when a class is created per method with no queue or undo behind it, or when commands
  and events are being used interchangeably. Does
  not cover domain and integration events and the outbox (event-driven-architecture),
  broker delivery semantics (delivery-semantics), executor and task lifecycle
  (executors-and-task-lifecycle), or algorithm selection (gof-strategy).
---

# Command

## Purpose

Make "do this" a value. Once an invocation is an object it can be parameterized, composed,
stored, queued, replayed, audited, undone or scheduled. Instrumentation can observe ordinary
method calls too; Command matters when the invocation itself needs identity, lifetime or
polymorphic handling.

Those capabilities are the justification test. A synchronous command may still decouple an
invoker from receivers or parameterize UI/workflow actions, but `GetCustomerByIdCommand` plus a
handler that merely calls one repository often adds ceremony without a consumer of reification.

## Command is not Event

```text
Command                              Event
───────────────────────────────────  ───────────────────────────────────
An instruction: PlaceOrder           A fact: OrderPlaced
Imperative, present tense            Past tense, immutable history
Addressed to one logical handler     Broadcast to zero or more subscribers
May be rejected or fail validation   The fact remains true; a consumer may reject/park malformed delivery
Sender usually owns an outcome       Publisher does not coordinate one authoritative handler result
Coupling: sender knows the operation Coupling: publisher knows nothing of
                                     the subscribers
Retry semantics: re-issue the        Retry semantics: redeliver the same
  instruction (needs idempotency)      fact (subscribers need idempotency)
```

Conflating them produces two specific defects: an "event" that a subscriber is allowed to reject,
which makes the publisher responsible for a decision it cannot see; and a "command" published to
several handlers, which means nobody owns the outcome. Name them by tense, and the mistake becomes
visible in review (`event-driven-architecture`).

## When it is the answer

```text
The invocation must outlive the moment — queued, scheduled, retried,
persisted, sent over a boundary
        → Command. This is the core case.

The invocation must be undoable
        → Command with an undo, or Command plus Memento for the state
          it cannot reconstruct (gof-memento).

The invocation must be audited as an intent, distinct from its effect
        → Command, stored as the record of what was asked.

The set of operations is open and must be dispatched uniformly
(a CLI, a message consumer, a job runner)
        → Command, keyed by a name from a closed registry.
```

## When it is not

- **The call happens now, synchronously, once.** Call the method.
- **A class per method with no queue, no undo, no log.** Reification with no consumer of the
  reification.
- **`Runnable`, `Callable` or a method reference is enough.** They are commands. A class adds
  value only when the command carries data worth naming and inspecting.
- **The "command" is a CQRS query with no reason to be reified.** GoF Command can return a result,
  so mutation is not the discriminator. Use a method when the query needs no deferred lifetime,
  uniform dispatch, composition or audit (`query-objects-and-specifications`).
- **The thing being modelled already happened.** That is an event.

## Modern Java expression

```text
Behaviour only, executed soon        Runnable / Callable, or a method
                                     reference

Data + intent, dispatched by type    a record implementing a sealed
                                     Command interface, dispatched with an
                                     exhaustive switch

Handler per command                  Map<Class<?>, Handler> or the
                                     framework's own dispatch; a closed
                                     registry, never Class.forName

Undo                                 the command holds what it needs to
                                     reverse itself, or a memento captured
                                     before execution

Persisted / transmitted              a record with an explicit schema
                                     version and a stable name — the wire
                                     shape is now a contract
```

A sealed command hierarchy plus exhaustive `switch` gives compile-time proof that every command
has a handler, which the classical `Map<String, Handler>` cannot (`java-composition-over-inheritance`).

## Decision rules

```text
IF nothing queues, stores, logs, retries or undoes the command
THEN delete the class and call the method.

IF a command is named in the past tense
THEN it is an event. Rename it, or reconsider who owns the outcome.

IF a command is delivered to more than one handler
THEN nobody owns the result. Either it is an event, or the dispatch
     is wrong.

IF a command is persisted or sent over a boundary
THEN its shape is a versioned contract: a stable name, tolerant
     deserialisation, an explicit schema version, and a plan for a
     command written by an older producer (rpc-and-api-contracts).

IF a command may be delivered more than once
THEN the handler needs idempotent effects, deduplication, or an explicitly tolerated
     duplicate policy keyed at the correct business scope. At-least-once permits
     duplicates; it does not promise that a duplicate eventually occurs
     (idempotency, delivery-semantics).

IF a command captures a mutable object and executes later
THEN it executes against state from execution time, not from creation
     time. Capture values, or an identifier to re-load.

IF undo must reverse an external effect
THEN it is compensation, not an inverse: refunds, cancellations and
     apologies, with their own failure modes
     (distributed-transactions-and-sagas).

IF a command handler is selected by a class name from the payload
THEN that is a deserialisation vulnerability. Dispatch from a closed
     registry of accepted names.
```

## Cross-cutting checks

- **Concurrency.** A command executed on a pool runs on a thread that is not the creator's:
  captured mutable state races, `ThreadLocal` context does not follow it, and a command holding a
  managed JPA entity holds an object whose session is gone. Capture immutable values and
  identifiers; propagate context explicitly (`scoped-values`,
  `executors-and-task-lifecycle`).
- **Distribution.** A command sent to a broker inherits its configured delivery, ordering,
  retention and acknowledgement semantics; do not assume every broker is at-least-once. Most
  broker flows decouple the immediate outcome, though reply channels are possible. A command that
  fails permanently needs a dead-letter path, or it blocks a partition forever
  (`poison-messages-and-dlq`, `message-ordering-and-partitioning`).
- **Performance.** Representation may allocate (records usually do; cached non-capturing lambdas
  may not per invocation), plus serialization/copying when crossing a boundary. Because commands
  are values, they can be batched, deduplicated and reordered — which is often why the design was
  chosen (`orm-behavioral-patterns`).
- **Testing.** Commands as values make tests unusually clean: assert that a service _produced_ the
  expected command rather than that an effect occurred, and test handlers independently against
  constructed commands. For undo, the property worth asserting is `undo(do(s)) == s` over generated
  states, which finds the cases hand-written tests miss.

## Review checklist

- [ ] Something actually queues, stores, retries, audits or undoes the command
- [ ] Commands are named imperatively; events in the past tense
- [ ] Each command has one outcome owner; horizontally competing handler instances are distinguished
      from multiple independent semantic handlers
- [ ] Persisted or transmitted commands carry a stable name and a schema version
- [ ] Handlers are idempotent when the transport may redeliver
- [ ] Commands capture values or identifiers, never live mutable objects
- [ ] Handler dispatch uses a closed registry, never a class name from the payload
- [ ] Undo of an external effect is modelled as compensation, not as an inverse
- [ ] A permanently failing command has a defined terminal path

## References

- [Command against event](references/command-vs-event.md) — the full contrast with naming,
  ownership, coupling and retry semantics; command bus design and dispatch safety; what changes
  when a command is persisted (versioning, tolerant readers, replay); idempotency keys; and undo
  by inverse, memento or compensation. Read when designing a command type or a bus.
- [Worked example](references/worked-example.md) — two uses of the same pattern: an editor undo
  stack where the inverse is exact, and a durable command queue where it is not — with the
  versioning, idempotency and dead-letter decisions each forced. Read when implementing.
