---
name: java-ddd-domain-events
description: >-
  Implement and review Java DDD domain events using the ddd-example domain pattern.
  Use when adding an aggregate event, preserving pending events during copying,
  checking media event triggers, or testing publication failure and queue cleanup.
  Covers DomainEvent, DomainEventPublisher, Entity and VideoMediaCreated with simple
  domain tests without mocks. Excludes application, infrastructure and delivery design.
---

# Java DDD Domain Events

Follow the domain implementation in `C:\git\ddd-example\domain` as the sole technical
reference for this pattern. The inspected revision is
`8d964ce4106c2299164e28980ae7553e2afbdc92`; the source map and extracted contracts are in
[event lifecycle](references/event-lifecycle.md). This is an implementation standard for
the referenced domain, not a claim that every DDD project uses this design.

For implementation, read that reference and the complete Java files linked below.
Inspect the target's existing classes, build and tests before editing. Preserve its Java
and dependency versions. The examples use Java 17-compatible syntax; the reference has
records, but its domain build does not explicitly pin a Java release. Do not upgrade the
project or add a library to apply this skill.

If source evidence or the requested business trigger is missing, identify the exact gap
and ask a focused question before implementing that behavior. The packaged source and
extracted contracts remain usable when the original Windows path is unavailable; they
do not establish unrecorded business rules. Do not fill gaps with a generic DDD event
architecture.

## Complete Java implementations

When implementing or comparing the shared event contracts, open
[DomainEvent.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEvent.java)
and [DomainEventPublisher.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEventPublisher.java).
For the media payload and both constructors, open
[VideoMediaCreated.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaCreated.java).
These are complete files copied from the inspected revision, with their original packages
and contracts; the snippets in the lifecycle reference explain selected behavior.

When implementing the pending-event queue or its constructors, use the complete
[Entity.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java)
and [AggregateRoot.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java)
in `java-ddd`. The event's timestamp helper is
[InstantUtils.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/InstantUtils.java).
For producer triggers and copy/factory behavior, open
[Video.java](../java-ddd-aggregates/assets/reference/video/Video.java) in `java-ddd-aggregates`.
These companion skills are suggestions, so their files may be absent in a standalone
installation. Use the corresponding suggested skill or the original source revision
when those implementations are needed; do not reconstruct complete base classes from
the partial snippets. The three event files alone are not a standalone domain build.

## Keep the domain contract exact

| Responsibility | Reference contract                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Shared event   | `domain.events.DomainEvent extends Serializable`, exposing `Instant occurredOn()`                           |
| Publisher port | `domain.events.DomainEventPublisher`, a functional interface with `void publishEvent(DomainEvent event)`    |
| Pending events | `Entity<ID extends Identifier>` owns the list; `AggregateRoot` forwards the constructors                    |
| Concrete event | `domain.video.VideoMediaCreated(String resourceId, String filePath, Instant occurredOn)`                    |
| Producer       | `Video.updateVideoMedia(...)` and `updateTrailerMedia(...)` register the event for non-null `PENDING` media |

Keep the concrete event beside its aggregate, as `VideoMediaCreated` is beside `Video`.
Preserve the shared interfaces and method names. The two-argument event constructor uses
`InstantUtils.now()`, which truncates to microseconds. There is no event ID, schema
version, media-type field, injected `Clock` or explicit canonical-constructor validation
in this event. Do not silently add any of them. `resourceId` contains the video's ID
value; it is not the media's ID or a unique occurrence identity.

The producer captures strings and an `Instant`, not a mutable aggregate reference. Keep
that value-payload pattern when modeling an authorized new event, with its fields and
trigger justified by the requested business behavior. Do not impose an event on every
aggregate mutation: image updates and ordinary `Video.update(...)` do not register one.

## Preserve the observable lifecycle

- The `Entity` constructor copies the supplied list container. `getDomainEvents()` exposes
  an unmodifiable **live view**, not a snapshot. Do not replace it with `List.copyOf` and
  claim identical behavior.
- `registerEvent(null)` and `publishDomainEvents(null)` do nothing. Registration appends;
  it does not publish, deduplicate or validate the payload.
- A non-null publisher receives events sequentially in list order. The list clears only
  after all calls return normally. If a call throws, that exception escapes and the whole
  queue remains, including the already-published prefix. Retrying can repeat that prefix.
- `Video.newVideo(...)` and the full `Video.with(...)` reconstruction begin with an empty
  queue. `Video.with(existingVideo)` preserves the existing events in an independent
  list container. Do not conflate these overloads or recreate event timestamps on copying.
- `Video` media updates assign the media and refresh `updatedAt` before registration;
  they do not call `validate(handler)`. Preserve this external validation model.
  Do not promise automatic rejection, state rollback or deduplication on repeat calls.

Read [event lifecycle](references/event-lifecycle.md) for exact implementation snippets,
the status/trigger table, constructor null behavior and copying caveats. The source does
not provide concurrent/reentrant queue mutation support, durable publication, transaction
completion or exactly-once delivery. Do not add those guarantees to the domain contract.

## Verify the changed behavior

Read [verification](references/verification.md) when adding or changing events or their
tests. Use real aggregates, actual event values and a small recording publisher or counter
lambda, following `EntityTest`. Domain tests use no mocks, spies, Mockito extensions or
interaction verification. Every unit test must have a meaningful `@DisplayName` in
addition to `@Test`; this is the user's explicit requirement, absent from the inspected
reference tests.

Keep tests simple: one behavior, visible given/when/then, and assertions on the resulting
state, payload and queue. For a media trigger, verify the event's resource/path values;
for publication failure, verify both the emitted prefix and retained queue. Do not use
sleeping or equality with a second `InstantUtils.now()` call to test time.

Report the changed producer or lifecycle contract, the relevant source evidence, executed
checks and remaining limits. Written scenarios and source inspection are not executed
tests or measured evidence that the skill improved an agent's behavior.

## Boundaries

Use `java-ddd` for the base domain foundation, `java-ddd-aggregates` for aggregate behavior
and copy/factory choices, `java-ddd-repositories` for domain gateway signatures, and
`java-ddd-testing` for the domain testing conventions.

Application orchestration, persistence adapters, transaction listeners, integration
envelopes, outboxes, brokers and event sourcing require a separately authorized scope.
If requested, hand off to `java-ddd-use-cases`, `spring-transactions-and-events`,
`delivery-semantics`, `schema-evolution-and-compatibility` or `event-sourcing` as applicable.
The domain source cannot establish their contracts; do not implement them as prerequisites
for adding a domain event.
