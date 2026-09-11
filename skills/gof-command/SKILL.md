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

Start with ordinary caller code, a composed/deferred use and a misuse or failure path. Reuse
the project's current callbacks, dispatch and history before adding a bus. Establish who owns
the result, execution thread/lifetime, captured state and each effect; ask only when a missing
ordering, undo or retry requirement changes the choice. Compare the direct call/callback with
a named command or existing framework dispatcher. Finish with that choice, its contracts and
an observable success/failure check; an adequate existing callback is a valid result.

## Command is not Event

```text
Command                              Event
───────────────────────────────────  ───────────────────────────────────
An instruction: PlaceOrder           A fact: OrderPlaced
Imperative, present tense            Past tense, immutable history
Addressed to one logical handler     Broadcast to zero or more subscribers
May be rejected or fail validation   The fact remains true; a consumer may reject/park malformed delivery
Sender usually owns an outcome       Publisher does not coordinate one authoritative handler result
Coupling: sender knows the operation Coupling: fact contract need not name
                                     each subscriber
Retry semantics: re-issue the        Retry semantics: redeliver the same
  intent under its repeat policy       fact under subscriber repeat policies
```

Conflating them can hide a requested decision inside a claimed fact, or send one instruction to
independent effect owners without defining the combined outcome. Delivery validation and an
explicit coordinator/fan-out contract are separate concerns. Tense is a review clue; establish
meaning and outcome ownership (`event-driven-architecture`).

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

- **The call happens now, synchronously, once with no invoker/receiver or action-binding need.**
  Call the method; synchronous UI actions can still justify Command.
- **A class per method with no queue, no undo, no log.** Reification with no consumer of the
  reification.
- **`Runnable`, `Callable` or a method reference is enough.** They are commands. A class adds
  value only when the command carries data worth naming and inspecting.
- **The "command" is a CQRS query with no reason to be reified.** GoF Command can return a result,
  so mutation is not the discriminator. Use a method when the query needs no deferred lifetime,
  uniform dispatch, composition or audit (`query-objects-and-specifications`).
- **The thing being modelled already happened.** That is an event.

## Modern Java expression

Records/sealed types in the examples use Java 17; exhaustive type-pattern switches require
Java 21 without preview. Inspect the project's release and existing libraries before selecting
syntax; do not upgrade the project merely to implement the pattern.

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

A sealed hierarchy with explicit exhaustive cases checks coverage of source-known types.
It does not prove each arm invokes the right handler or that separately deployed types remain
compatible. A registry instead needs registration/type checks and behavior tests
(`java-composition-over-inheritance`).

## Decision rules

```text
IF nothing needs invocation identity, action binding, invoker/receiver separation,
uniform handling, queues, logs, retries or undo
THEN prefer the direct method; remove an existing public class only with its compatibility
     and consumers accounted for.

IF a command is named in the past tense
THEN inspect its meaning: is it an instruction or an already-established fact?
     Naming is a clue, not proof. Correct the name without changing semantics silently.

IF a command is delivered to more than one handler
THEN identify one logical outcome owner; competing instances and coordinated subcommands
     are distinct from independent handlers performing the same effect.

IF a command is persisted or sent over a boundary
THEN its shape is a versioned contract: a stable name, compatible
     deserialisation, an explicit schema/version identity, and a plan for a
     command written by an older producer (rpc-and-api-contracts).

IF a command may be delivered more than once
THEN the handler needs idempotent effects, deduplication, or an explicitly tolerated
     duplicate policy keyed at the correct business scope. At-least-once permits
     duplicates; it does not promise that a duplicate eventually occurs
     (idempotency, delivery-semantics).

IF a command captures a mutable object and executes later
THEN it holds a live reference, not a creation-time snapshot; unsynchronised changes
     need not be observed reliably. Choose snapshot values, an identifier to re-load,
     or an explicit confined live-receiver lifetime.

IF undo must address an effect outside the reversible state/transaction boundary
THEN model compensation where the business permits it: refunds, cancellations and
     other operations with their own failure modes; some effects cannot be compensated
     (distributed-transactions-and-sagas).

IF untrusted payload data can select an arbitrary class to load or instantiate
THEN restrict selection to accepted types through a closed registry or equivalent
     allowlist; it does not replace payload validation or caller authorization.
```

## Cross-cutting checks

- **Concurrency.** Dispatch may run inline or on another thread. Establish confinement,
  safe publication and resource lifetime; do not rely on implicit `ThreadLocal` propagation
  or a managed entity's session surviving deferred work. Capture values/identifiers when
  those lifetimes differ; an intentionally confined callback may retain its live receiver
  (`scoped-values`, `executors-and-task-lifecycle`).
- **Distribution.** A command sent to a broker inherits its configured delivery, ordering,
  retention and acknowledgement semantics; do not assume every broker is at-least-once. Most
  broker flows decouple the immediate outcome, though reply channels are possible. A command that
  fails permanently needs an owned terminal/recovery policy, such as an audited rejection,
  quarantine or a DLQ. Whether it blocks a partition depends on the actual consumer policy
  (`poison-messages-and-dlq`, `message-ordering-and-partitioning`).
- **Performance.** Representation may allocate (records usually do; cached non-capturing lambdas
  may not per invocation), plus serialization/copying when crossing a boundary. Values enable
  inspection; batching, deduplication or reordering still require compatible outcome, atomicity
  and ordering contracts. Idempotence does not imply commutativity (`orm-behavioral-patterns`).
- **Testing.** At an intent-producing boundary, assert the expected command; separately verify
  handler effects/results and any required transaction or transport integration. Production of
  the value is not completion of the effect. For exact undo, test `undo(do(s)) == s` over valid
  state/command pairs plus history failure and branch behavior; use compensation's business
  postconditions when exact restoration is not promised.

## Review checklist

- [ ] Reifying the invocation serves a named identity, action-binding, dispatch or lifecycle need
- [ ] Commands are named imperatively; events in the past tense
- [ ] Each command has one outcome owner; horizontally competing handler instances are distinguished
      from multiple independent semantic handlers
- [ ] Persisted or transmitted commands carry a stable name and a schema version
- [ ] Repeated execution obeys the declared effect/response policy: natural repeat safety, deduplication or tolerated repeats
- [ ] Captured values, identifiers or live receivers have explicit state and lifetime ownership
- [ ] Untrusted type selection is allowlisted; payload validation and caller authorization remain enforced
- [ ] Undo stays within its reversible boundary; compensation has its own accepted postconditions
- [ ] A permanently failing command has a defined terminal path

## References

- [Command against event](references/command-vs-event.md) — the full contrast with naming,
  ownership, coupling and retry semantics; command bus design and dispatch safety; what changes
  when a command is persisted (versioning, tolerant readers, replay); idempotency keys; and undo
  by inverse, memento or compensation. Read when designing a command type or a bus.
- [Worked example](references/worked-example.md) — two uses of the same pattern: an editor undo
  stack where the inverse is exact, and a durable command queue where it is not — with the
  versioning, idempotency and dead-letter decisions each forced. Read when implementing.
