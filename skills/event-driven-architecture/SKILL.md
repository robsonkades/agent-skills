---
name: event-driven-architecture
description: >
  When a system should publish facts instead of calling services: events versus commands and
  the imperative name that turns publish/subscribe back into RPC, choreography versus
  orchestration, temporal coupling traded for schema coupling with an unknown consumer set,
  fat versus thin events and the read-back stampede, and FaaS versus a long-lived consumer.
  Use when a broker is proposed between two services that need each other's answer, when an
  event is named ShipOrder, when the flow exists in no single file, when services exchanging
  only events must deploy together, when an event carries an id and every consumer calls
  back, or when a publish sits inside a transaction that can roll back. Not delivery
  guarantees (delivery-semantics), repeat-safe handlers (idempotency), ordering
  (message-ordering-and-partitioning), the outbox (distributed-transactions-and-sagas), work
  queues (task-queues-and-competing-consumers), stage topology
  (streaming-pipeline-topologies), or schema rules (rpc-and-api-contracts).
---

# Event Driven Architecture

## Purpose

Decide whether two components should exchange a **fact** or a **call**. An event is a
statement about the past that its publisher emits without caring who reads it
(`OrderPlaced`); a command is an instruction to a named recipient with an expected outcome
(`ShipOrder`); a request/response call is a command whose outcome the caller waits for. This
is a coupling decision, not a technology one, and the honest answer is often
request/response — a broker between two parties that each need the other's outcome buys a
new failure domain, added latency and no answer.

The failure this prevents is the distributed monolith: services that talk only over a broker
yet cannot be released independently, because one team's event is another team's function
call in disguise. The second is the flow that exists nowhere — every step is a handler,
the sequence is emergent, and answering "why did this order never ship" means reconstructing
it from logs.

## Workflow

1. **Name the message and check the tense.** Past tense and a name the publisher would use
   about itself (`PaymentCaptured`) is an event. If the natural name is imperative
   (`ShipOrder`, `RecalculatePrice`), it is a command: address it to the one recipient, and
   ask whether request/response is simpler.
2. **Ask whether the producer needs the outcome to finish its own work.** If it cannot
   proceed without the result, or must report it to a user now, stop — that is
   request/response (`rpc-and-api-contracts`).
3. **Count the participants and choose the coordination style.** Two or three steps with no
   compensation: choreography. More than that, or any flow needing compensation, a visible
   state or a timeout per step: orchestration. See `references/choosing-the-style.md`.
4. **Design the payload.** Decide what the event carries versus what the consumer fetches,
   and name the authority for the current value — `references/event-design.md`.
5. **Fix the compatibility direction and the window.** The window is the topic's retention
   plus the replay horizon, not the deploy's duration; the rules are `rpc-and-api-contracts`.
6. **Place the publish relative to the commit**, never inside a transaction that can still
   roll back. The outbox is `distributed-transactions-and-sagas`.
7. **Choose the consumer's runtime last** — long-lived process or FaaS — from throughput,
   burst shape and whether a partition assignment must be held.

## Decision block

```text
Publish an event when:
- the producer completes its own work without the consumer's outcome
- the consumer set is open: a new reader must be addable without changing the producer
- consumer unavailability must not bound producer availability, and a backlog is acceptable
- fan-out or replay from retained history is a requirement, not a nice-to-have
Avoid events when:
- the caller must answer its own caller with the result (any synchronous read path)
- there is exactly one consumer, it is known, and the producer must know it succeeded
- the producer needs to know the work was rejected, and the rejection is a business outcome
- the two services are owned by one team, released together, and never independently scaled
Prefer request/response instead when:
- the interaction is a query. Publishing an event to ask a question is a request/response
  call with an extra hop and no correlation
- the outcome must be surfaced to a user inside the current request
- the consumer count is one and stable, and the added broker is pure operational surface
```

## Rules

- Events trade **temporal** coupling for **schema** coupling. The producer no longer waits for
  anyone, and now owns a contract with consumers it cannot enumerate — nobody can tell it
  which fields are load-bearing. A schema registry with a compatibility mode enforced at
  publish time is what makes that survivable; without one, "we will coordinate" is the plan.
- The compatibility window is the data's lifetime. An event on a seven-day topic must be
  readable by old and new consumers for at least seven days; an event kept for replay must be
  readable for as long as replay is possible, which usually means forever.
- Adding a subscriber is a capacity change, not a configuration change: it multiplies the load
  that the event's downstream dependencies see, and nothing in the producer records it.
- **Anti-pattern — the event that is a command.** `ShipOrder` published to a topic with one
  subscriber. Observable shapes: an imperative name; exactly one consumer that must exist; a
  correlation id used to wait for a reply topic. This is RPC with the latency of a broker and
  none of the error surface. Either name the fact that happened, or make the call.
- **Anti-pattern — the distributed monolith.** Observable shapes: a release checklist naming
  two services; a consumer that breaks when a producer adds a field; a shared library of event
  classes that every service must upgrade in lockstep. Publishing over a broker did not
  decouple anything; the schema is a compile-time dependency wearing a wire format.
- **Anti-pattern — events as the database.** Event-carried state transfer with no named
  authority for the current value: each consumer keeps its own projection, they diverge, and
  no service can answer "what is true now". Name the owner of each entity and how a consumer
  resyncs after a gap.
- **Anti-pattern — publish inside the transaction.** A `send()` between the write and the
  commit publishes facts that may never become true; a `send()` after the commit loses them on
  a crash. Both are the dual-write problem and both need the outbox
  (`distributed-transactions-and-sagas`).
- Delivery is at-least-once in every practical broker, so every handler must be repeat-safe:
  the guarantee vocabulary is `delivery-semantics`, the handler technique is `idempotency`.
  Never write "exactly-once" about an event pipeline without naming the boundary.
- Choreography's cost is diagnostic, and it is payable up front: propagate a correlation id
  through every publish and require it in every consumer log line, or the flow is
  unreconstructable at exactly the moment you need it.
- Orchestration's cost is a component that knows every step. That is acceptable; a coordinator
  that also holds business rules for each participant is not — it has become the monolith the
  events were meant to split.
- **FaaS is a placement decision, not an architecture.** It buys no idle cost and elastic
  burst; it costs cold start (severe for a JVM — `startup-cds-crac-leyden`), per-invocation
  connection setup against pools the function cannot hold, and a runtime that does not keep a
  partition assignment, so per-key ordering is not available
  (`message-ordering-and-partitioning`). A long-lived consumer is the right answer for
  sustained throughput, pooled connections, batching, and any ordering requirement.

## References

- [Choosing the style](references/choosing-the-style.md) — events versus commands versus
  request/response with the condition that selects each, choreography versus orchestration
  compared on debuggability, coupling, failure handling and participant count, and the FaaS
  versus long-lived-consumer decision with the Java cold-start considerations. Read when
  deciding how two components should communicate, or when a saga is being designed.
- [Designing an event](references/event-design.md) — naming, fat versus thin payloads and the
  read-back stampede, the event schema as a contract with unknown consumers, which direction
  of compatibility events actually need, and what belongs in the payload versus what must be
  fetched. Read before publishing a new event type or changing an existing one.
