# Event lifecycle and the integration boundary

Read when implementing registration, event collection, persistence or publication. The
worked names extend the domain/application/infrastructure convention; they do not claim
that the target project contains an order model or guarantees a particular delivery mode.

## Capture the accepted transition

For `Order.submit(...)`, define the state precondition, successful state and fact together.
Suppose only a draft with at least one valid line can be submitted. Validate that condition
before mutation; compute any fallible derived values first. Update state and register one
`OrderSubmitted` for this successful transition. A second submit follows the business
contract: either reject it or recognize the already-completed action without inventing a
second occurrence. Submission after a legitimate reopen is a different occurrence if the
business permits it. Event deduplication must not suppress that later valid transition.

Keep `registerEvent` as collection behavior. It must not send a message or invoke unknown
handlers halfway through a mutation. Handler failure should not leave the caller with a
half-applied aggregate and an apparently successful event registration.

The following Java 17 fragments illustrate placement and data; adapt them to the target's
existing base classes, exception constructors and immutable `OrderID`. They are not a
standalone implementation or a reason to upgrade the project.

```java
package com.example.domain.order.event;

import com.example.domain.events.DomainEvent;
import com.example.domain.order.OrderID;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record OrderSubmitted(
        UUID eventId,
        OrderID orderId,
        Instant occurredOn
) implements DomainEvent {
    public OrderSubmitted {
        Objects.requireNonNull(eventId);
        Objects.requireNonNull(orderId);
        Objects.requireNonNull(occurredOn);
    }
}
```

Inside the existing `domain.order.Order`, the illustrative transition is:

```java
public void submit(final UUID eventId, final Instant occurredOn) {
    if (status != OrderStatus.DRAFT || lines.isEmpty()) {
        throw new DomainException("only a non-empty draft can be submitted");
    }
    final var submitted = new OrderSubmitted(eventId, getId(), occurredOn);
    status = OrderStatus.SUBMITTED;
    registerEvent(submitted);
}
```

The application supplies the time through its injected `Clock` for a locally initiated
transition; validate any caller-supplied business time under the actual business policy.
For an imported occurrence, distinguish the original occurrence time from the time this
system records it. The snippet deliberately carries only identity and time: if a consumer
needs the accepted lines, price or terms, add immutable snapshots of those values.

An `OrderSubmitted.from(order)` factory can preserve the same shape if it copies values at
registration. Storing `Order order` in the event defers observation until a handler reads
it and can change the apparent history. `List.copyOf` protects the list container, but its
elements must also be immutable or copied. Do not include a JPA entity, lazy proxy or
database session in the fact.

## Distinguish creation, rehydration and replay

A business creation factory may register `OrderCreated` if creation is meaningful to the
domain. A mapper's `with(...)`, `restore(...)` or rehydration constructor restores existing
state with an empty pending-event list. It must not call the business creation factory and
then clear its accidental events as an informal workaround.

Copying a live aggregate for a unit of work needs a deliberate rule about pending events:
preserving them may be correct for one work unit and duplicating them into two independent
save paths is not. Never infer the rule from the method name `with` or `clone` alone.

Replaying a previously accepted event to rebuild state must not run the ordinary command
method that creates a new event ID, timestamp or external effect. Separate application of
historical data from acceptance of a new command. Event sourcing requires its own storage
and evolution design; a list of unpublished events is not an authoritative event store.

## Own pending events across transaction completion

Choose and document one lifetime for the aggregate instance. A simple model is one loaded
instance per command/unit of work, discarded after completion. Returning that instance for
reuse after a failed transaction requires a restoration protocol and additional tests.

Use the following trace to inspect an implementation:

| Point             | Required interpretation                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| Register          | The in-memory transition produced a pending fact                                     |
| Snapshot          | An immutable collection captures the exact batch to handle or stage                  |
| Save/stage        | Storage writes may still roll back; a returned entity is not commit evidence         |
| Commit            | State and any required durable publication intent become visible together            |
| Acknowledge/clear | Only the handled or staged batch is released under the chosen lifecycle              |
| Rollback          | Uncommitted effects disappear; mutated objects/bookkeeping are discarded or restored |

A non-destructive `pendingEvents()` snapshot plus an acknowledgment step is one option.
A destructive `pullEvents()` is also viable when the unit of work takes explicit ownership
of that batch until it is durably staged or the whole failed work unit is discarded.
Neither API name proves correctness. For best-effort in-process delivery, clearing after
dispatch is a deliberate loss/retry policy, not durable acknowledgment.

A read-only view is not a batch snapshot: Java's
[`Collections.unmodifiableList`](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Collections.html#unmodifiableList(java.util.List)>)
still reflects changes to its backing list. On the Java 17 example baseline,
`List.copyOf(pending)` freezes membership when the entries are non-null; the payloads still
need the immutability described above. Capture and acknowledge under one unit-of-work owner;
copying a list does not make concurrent aggregate mutations atomic.

If an aggregate is saved twice within one transaction, track which occurrences have already
been staged; do not insert the first batch twice. If a handler registers another event,
do not clear that new event accidentally with a blanket `clear()`. Acknowledge exact
occurrences using stable event IDs or an owned batch token: `removeAll(batch)` is unsafe
if value equality can match a distinct occurrence appended later. Prefer explicit bounded
batches and a documented follow-up policy over recursive dispatch with unbounded cycles.
When state changes multiple times before saving, capture each relevant occurrence at its
transition. Do not recreate all facts from the final aggregate state at flush time.

Distinguish confirmed rollback from an unknown completion outcome, such as a lost commit
response. Discarding the Java object does not prove the database rolled back. Reconcile
through the command's stable operation identity and authoritative stored outcome, or retry
through an established idempotent command contract. Event-ID deduplication alone cannot
prevent a repeated command from producing a second fact with a new ID. See
[AWS's retry/idempotency rationale](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/);
the existing use-case and idempotency mechanisms own that recovery decision.

For synchronous local handlers, define whether they execute within the same transaction
and whether a failure aborts the whole use case. If an early handler writes the database
and a later handler fails, atomic rollback requires those writes to participate in the
same transaction. Email and HTTP effects do not roll back with a database transaction.
If a loop publishes two messages and fails on the second, retrying the retained list can
duplicate the first; clearing the list before publishing can instead lose the second.
Required delivery needs a stronger boundary than either list operation.

## Map the external contract deliberately

An integration event serves consumers across a boundary and has an independent compatibility
obligation. Place an `OrderSubmittedMessage` or equivalent envelope mapping in infrastructure,
using the existing project naming. The map may omit or transform internal fields. Do not
share the aggregate implementation as a consumer SDK or assume that two contexts use the
same meanings for order, customer or status.

Separate these roles when needed:

- Occurrence ID identifies one accepted fact across repeated delivery. Preserve the stored
  value when relaying; a newly generated ID on every send defeats deduplication.
- Aggregate identity identifies the affected business object, not an occurrence.
- Aggregate revision and an event's ordinal within that revision can order multiple facts
  from a transaction if the contract needs them; verify revision assignment under concurrency.
- Correlation/causation metadata explains a flow and its cause; it is not a substitute for
  business identity, tenant scoping or a command's idempotency key.

Do not put these fields in every local event mechanically. For multiple external messages
derived from one local fact, use distinct message identities with a stable source-occurrence
reference when consumers must distinguish them. Define the deduplication scope and lifetime
with the consumer, including authorized replays. A timestamp or random UUID does not impose
business order, and per-aggregate order is not global order.

If delivery must survive interruption, persist the mapped publication intent in the same
transaction as the aggregate change, then let a recoverable relay deliver it. Reuse an
existing outbox or other proven atomic mechanism; establish that both writes actually
enlist in the same transaction. Redelivery after ambiguous sends requires idempotent
consumer effects. This is the [transactional outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html),
not a guarantee supplied by `registerEvent` or by the gateway's `save` method name.

An after-commit listener is useful for best-effort local work, but callback timing alone
does not persist delivery intent. Spring defaults transaction-bound listeners to after
commit and, without a transaction, does not invoke them unless fallback is configured.
Consult the target release's
[transaction-bound event documentation](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
before relying on its behavior. A listener failure after commit does not undo the completed
business transaction; blindly retrying the business command can create another operation.

For external payload changes, inventory active consumers and retained records before
renaming or deleting fields. Select only authorized data; stored events, logs, archives
and dead letters extend its exposure. Mutable publication status, attempt counters and
delivery timestamps belong to delivery records, separate from the immutable business fact.
