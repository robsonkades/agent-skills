---
name: event-driven-architecture
description: >
  Choosing facts, asynchronous commands or request/response across services; then designing
  choreography/orchestration, payload authority, evolution horizon and consumer runtime.
  Use when a broker masks synchronous outcome dependence, workflows are unreconstructable,
  consumers read back every event, or publish and database commit form a dual write. Delivery,
  idempotency, ordering, outbox mechanics and schema evolution remain in their owning skills.
---

# Event Driven Architecture

## Purpose

Decide whether two components should exchange a **fact** or a **call**. An event is a
immutable observation about something that happened in the publisher's domain
(`OrderPlaced`); a command is an instruction to a named recipient with an expected outcome
(`ShipOrder`); request/response is one command style whose outcome the caller waits for. An
asynchronous command can return outcome later through status, callback or event. This
is a coupling decision, not a technology one, and the honest answer is often
request/response — a broker between two parties that each need the other's outcome buys a
new failure domain, added latency and no answer.

The failure this prevents is the distributed monolith: services that talk only over a broker
yet cannot be released independently, because one team's event is another team's function
call in disguise. The second is the flow that exists nowhere — every step is a handler,
the sequence is emergent, and answering "why did this order never ship" means reconstructing
it from logs.

## Workflow

1. **Name the semantic contract, not just the tense.** Past tense is a useful event smell;
   imperative naming suggests a command. Verify ownership, recipient, whether rejection is
   possible, and whether the message remains meaningful with no consumer.
2. **Ask when and where the outcome is needed.** An outcome needed in the current latency
   budget favors request/response. Deferred completion may use an addressed async command
   with status/callback; independent reactions to a fact favor events.
3. **Choose coordination from flow semantics.** Independent reactions can choreograph. A
   branching business workflow needing explicit state, deadlines, compensation or one
   recovery owner favors orchestration—participant count alone is not a threshold.
4. **Design the payload.** Decide what the event carries versus what the consumer fetches,
   and name the authority for the current value — `references/event-design.md`.
5. **Fix the compatibility direction and the window.** The window is the topic's retention
   plus the replay horizon, not the deploy's duration; the rules are `rpc-and-api-contracts`.
6. **Prove the commit boundary.** A local DB transaction does not include an ordinary broker
   send. Use an outbox/CDC, an explicitly enlisted XA resource, or a broker-local transaction
   whose exact boundary fits; “before versus after commit” alone leaves a failure window.
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
- there is one known recipient, the message is semantically a command, and no buffering,
  replay or asynchronous completion requirement justifies the broker
- the producer needs to know the work was rejected, and the rejection is a business outcome
- the boundary has no independent lifecycle/scaling/resilience driver and the broker only
  obscures a synchronous dependency
Prefer request/response instead when:
- the interaction is a query. Publishing an event to ask a question is a request/response
  call with an extra hop and no correlation
- the outcome must be surfaced to a user inside the current request
- the consumer count is one and stable, and the added broker is pure operational surface
```

## Rules

- Events can reduce synchronous **temporal** coupling while increasing schema, semantic,
  operational and retention coupling. Maintain consumer ownership/usage evidence where
  possible; a schema registry checks structural compatibility, not business meaning.
- The compatibility window is the data's lifetime. An event on a seven-day topic must be
  readable by old and new consumers for at least seven days; an event kept for replay must be
  readable or transformable for the supported replay horizon. Archives can use versioned
  upcasters/migrations; “forever” is a costly policy, not a default.
- Adding a subscriber is a capacity and governance change when it adds broker reads,
  fan-out or shared downstream load. Budget quotas, PII access and replay impact per consumer;
  it does not automatically multiply load on the publisher.
- **Anti-pattern — the event that is a command.** `ShipOrder` published to a topic with one
  subscriber. Observable shapes: an imperative name; exactly one consumer that must exist; a
  correlation id used to wait synchronously for a reply topic. Model it explicitly as an async
  command with an outcome contract, or use request/response when the caller is actually blocked.
- **Anti-pattern — the distributed monolith.** Observable shapes: a release checklist naming
  two services; a consumer that breaks when a producer adds a field; a shared library of event
  classes that every service must upgrade in lockstep. Publishing over a broker did not
  decouple anything; the schema is a compile-time dependency wearing a wire format.
- **Anti-pattern — projection without authority or recovery.** Event-carried state transfer with no named
  authority for the current value: each consumer keeps its own projection, they diverge, and
  no service can answer "what is true now". Name the owner of each entity and how a consumer
  resyncs after a gap.
- **Anti-pattern — publish inside the transaction.** A `send()` between the write and the
  commit publishes facts that may never become true; a `send()` after the commit loses them on
  a crash. Both are the dual-write problem and both need the outbox
  (`distributed-transactions-and-sagas`).
- End-to-end redelivery is common but product/configuration boundaries differ: at-most-once,
  at-least-once and transactional broker-local processing all exist. Handlers that may see a
  duplicate must be repeat-safe:
  the guarantee vocabulary is `delivery-semantics`, the handler technique is `idempotency`.
  Never write "exactly-once" about an event pipeline without naming the boundary.
- Choreography needs durable observability: event ID, causation ID, trace context and business
  correlation identity have different roles. Propagate them with bounded cardinality and
  retain a queryable event/workflow view where the business must answer current status.
- Orchestration's cost is a component that knows every step. That is acceptable; a coordinator
  that also holds business rules for each participant is not — it has become the monolith the
  events were meant to split.
- **FaaS is a placement/runtime decision, not an architecture.** Pricing, cold starts,
  concurrency, batching, retry/partial-batch behavior, maximum duration, connection reuse and
  ordering are provider/event-source specific. Execution environments may reuse pools, while
  burst scaling can multiply them; managed pollers can preserve per-partition order. Compare
  measured end-to-end latency, backlog recovery, connection quotas and control limits against
  a long-lived consumer.

## References

- [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- [AWS Lambda with Kafka event sources](https://docs.aws.amazon.com/lambda/latest/dg/with-kafka-configure.html)

- [Choosing the style](references/choosing-the-style.md) — events versus commands versus
  request/response with the condition that selects each, choreography versus orchestration
  compared on debuggability, coupling, failure handling and participant count, and the FaaS
  versus long-lived-consumer decision with the Java cold-start considerations. Read when
  deciding how two components should communicate, or when a saga is being designed.
- [Designing an event](references/event-design.md) — naming, fat versus thin payloads and the
  read-back stampede, the event schema as a contract with unknown consumers, which direction
  of compatibility events actually need, and what belongs in the payload versus what must be
  fetched. Read before publishing a new event type or changing an existing one.
