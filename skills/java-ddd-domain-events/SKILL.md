---
name: java-ddd-domain-events
description: >-
  Model Java DDD domain events when an aggregate transition needs an explicit business
  fact, handlers see mutable state, rehydration emits duplicate facts, or saving loses
  pending events. Define immutable payloads, occurrence identity, time, collection
  lifetime and the integration boundary in domain/application/infrastructure packages.
  Excludes broker operations, event sourcing and Spring listener configuration.
---

# Java DDD Domain Events

Make a meaningful business occurrence explicit without giving the aggregate responsibility
for delivery. A domain event may remain inside one process. Neither a broker nor an event
store follows from introducing `OrderSubmitted`.

## Establish the business fact and the existing path

Identify the bounded context, transition, business observer and acceptance example. Confirm
whether the consumer needs the fact that submission happened, the current order state, or
an instruction to submit an order. Use a direct collaborator for mandatory orchestration
when indirect event dispatch would only obscure the dependency. Past tense helps naming,
but authority and rejection semantics distinguish a fact from a command.

Inspect the aggregate, event base type, application use case, gateway, persistence mapper,
listeners and transaction tests. Trace registration through save, transaction completion,
delivery and list cleanup; find where each step actually runs. Record Java/framework
versions and preserve them. Read the target's package rules and any project overlay before
generating code; a sample project is evidence of a convention, not evidence of reliability.
An unavailable commit or delivery path remains an explicit unknown.

Follow the existing foundation where adopted:

| Responsibility                  | Example location and role                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Business state transition       | `domain.order.Order.submit(...)` checks invariants and registers a fact                 |
| Local event type                | `domain.order.event.OrderSubmitted` describes the occurrence                            |
| Shared event contract           | Existing `domain.events.DomainEvent`, if the project has one                            |
| Application coordination        | `application.order.submit.DefaultSubmitOrderUseCase` invokes the transition and gateway |
| Persistence/publication adapter | `infrastructure.order` maps state and selected facts to storage or an external contract |

Retain an existing `domain.video.VideoMediaCreated` placement or `occurredOn()` accessor
when that is the established contract. The `event` subpackage and `occurredAt` spelling
above are examples, not a reason for a package-wide migration. Keep Spring, broker and
serialization APIs outside the domain; a shared `DomainEvent` interface is optional.

## Choose the depth that changes the result

- **Adding or reviewing a fact:** establish business meaning, transition, immutable data,
  identity and time. Inspect one producer and its actual consumers; do not build delivery
  infrastructure for an unconsumed local fact.
- **Implementing event collection or persistence:** read
  [event lifecycle](references/event-lifecycle.md) for registration, snapshots, multiple
  saves and transaction ownership. Select the complete path, including rollback cleanup.
- **Crossing a process or bounded-context boundary:** use that reference's integration
  section to define the mapping and required guarantee, then hand off transport mechanics.
  An externally serialized domain class is already a contract even if called internal.
- **Proving a repair or new path:** read [verification](references/verification.md) and
  select cases that exercise the changed guarantee. Pure domain tests need no framework.

## Consequential decisions

1. **Register only after a successful transition.** Validate inputs and business invariants
   before changing state. Capture the event from the accepted transition and append it via
   the existing `registerEvent`; a rejected transition adds nothing. Registration records
   an in-memory fact, not a database commit. Construction, rehydration and replay have
   different responsibilities: loading old state must not announce a new occurrence.
2. **Freeze the fact.** Store immutable IDs/value snapshots needed by the semantic contract,
   not an aggregate, JPA proxy or mutable collection reference. A Java record is only
   shallowly immutable. Decide explicitly whether a consumer should use occurrence data
   or reload current state; a reload cannot reconstruct the old fact after later mutations.
3. **Give time and identity explicit meanings.** `occurredAt` describes when the business
   occurrence happened; recording and publishing can happen later. Obtain time from an
   injected `Clock` or supplied, validated occurrence data. Keep original identity/time
   on redelivery or replay. An event ID, aggregate ID and command idempotency key serve
   different purposes. Do not use wall-clock time as proof of total order.
4. **Own the event list lifecycle.** Choose who snapshots, stages, acknowledges and clears
   events, including repeated saves and partial handler failure. A successful `save()` or
   callback is not necessarily transaction completion. On rollback, discard the mutated
   unit of work or explicitly restore both state and pending-event bookkeeping; never
   silently reuse an object whose state no longer matches storage. If completion is
   uncertain, reconcile the command outcome before assuming rollback or creating new facts.
5. **Match publication strength to the requirement.** Local, disposable follow-up can use
   local dispatch with documented timing/failure behavior. Required external delivery
   needs durable publication intent atomically committed with the business write, commonly
   the existing outbox in the same database transaction. A send before commit can announce
   rolled-back state; an after-commit callback alone has a crash gap. Consumer effects
   that can repeat must be idempotent. Preserve an adequate existing durable mechanism.
6. **Treat integration events as owned contracts.** Infrastructure translates selected
   local facts into the external envelope; retain a stable occurrence identity and scope
   ordering only where business behavior needs it. Map the recipient's vocabulary at the
   boundary. Expose only authorized data, with retention and replay accounted for; dumping
   the entire aggregate creates privacy and compatibility liabilities.

Evans distinguishes meaningful domain activity from software activity; Fowler explains
immutable occurrence data and separate occurrence/recording time. These principles guide
the model, while the lifecycle and package choices here are implementation decisions.
See [Evans, DDD Reference, Domain Events](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf#page=20)
and [Fowler, Domain Event](https://martinfowler.com/eaaDev/DomainEvent.html).

## Execute and validate

State the expected transition and delivery outcome using existing requirements before
asking for missing policy. Ask only when an unresolved loss, ordering or consumer contract
changes the implementation; continue independent domain work in the meantime. Retaining
the present direct call or local mechanism is a valid result.

Implement the smallest complete path using the established class names, commands, outputs,
gateway ports and infrastructure mapping. Do not add a generic event bus, inheritance tree,
outbox or domain-event superclass merely to match an example. Keep business invariants
with the aggregate even if application handlers coordinate reactions.

Before finishing, verify these gates for the changed path:

- The event names an accepted business occurrence, with the producer and consumers known.
- Rejection, rehydration and mutation after registration preserve the declared event history.
- Pending-event ownership covers save, commit, rollback, repeat calls and partial failure.
- Any durable-delivery claim has evidence at the state/publication boundary and repeat-safe
  consumer effect; an annotation or mock interaction does not establish it.
- Payload, timestamps and ordering carry only justified semantics and approved data.

Run the applicable project checks and distinguish written scenarios from executed results.
Report the fact/contract, changed path, transaction/event-list owner, verification and any
remaining gap. A narrow naming repair needs only a concise rationale; a durable boundary
change belongs in the project's ADR or contract documentation.

## Specialist boundaries

Use `java-ddd-aggregates` for invariant ownership and aggregate boundaries;
`java-ddd-use-cases` for action orchestration; `java-ddd-repositories` for gateway mapping
and rehydration; and `java-ddd-testing` for the family testing strategy.
Pass the concrete model and failed scenario rather than restating their workflows.

Use `spring-transactions-and-events` for actual listener phases and transaction interception,
`event-driven-architecture` for service interaction/topology choices, `delivery-semantics`
for outbox/relay and acknowledgment guarantees, `idempotency` for repeat-safe effects,
`message-ordering-and-partitioning` for transport order, and
`schema-evolution-and-compatibility` for stored/published schema changes. Supply occurrence
identity, transaction resources, consumers and the required replay horizon. `event-sourcing`
owns choosing events as authoritative state. If these skills are unavailable, preserve
the explicit boundary and use version-matched primary documentation; do not invent a guarantee.
