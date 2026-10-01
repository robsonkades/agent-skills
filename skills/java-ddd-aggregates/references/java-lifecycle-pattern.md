# Java lifecycle and transition pattern

Read when implementing a root, a validator, creation/rehydration, or a transition
that can fail after partially changing state.

## Organize by responsibility inside the context

Use the target project's package root. A compatible layout is:

```text
com.example.domain
  AggregateRoot<ID extends Identifier>
  Identifier
  exceptions.DomainException
  validation.ValidationHandler
  validation.Validator
  validation.Error
  validation.handler.ThrowsValidationHandler
  order.Order
  order.OrderID
  order.OrderValidator
  order.OrderStatus
  order.OrderLineSnapshot
  order.event.OrderSubmitted
```

The root owns its invariant and lifecycle. The validator reports domain violations,
not HTTP response codes; it must not load repositories or make remote calls. The
application supplies needed facts and coordinates persistence. Shared base classes
are existing contracts to inspect, not a requirement to build an inheritance tree.

## Prepare before mutating

The `ddd-example` source supplies the `AggregateRoot`/`Entity`, `Identifier`, handler
and `newCategory`/`with` conventions. Its `Category.update(...)` mutates before
`DefaultUpdateCategoryUseCase` calls `validate(notification)`; that sequence does not
guarantee an unchanged object on rejection. The illustration below strengthens this
contract instead of reproducing that sequence. Its Java 17 baseline describes the
illustration's source/API requirements, not a verified build or runtime of the
reference application.

This is a **partial Java 17 example**, not a complete reusable domain library.
Supporting types follow these contracts:

- `AggregateRoot<OrderID>` owns a stable ID, `getId()`, `validate(handler)` and a
  non-publishing `registerEvent(event)` buffer. Registration of a valid event has
  no further business validation, I/O or user callbacks.
- `OrderID extends Identifier` and `OrderLineSnapshot` are immutable. A line contains an immutable
  `lineID()` and a positive `quantity()`. Equal line IDs identify the same line.
- `OrderValidator extends Validator` appends state violations as `validation.Error`
  to `ValidationHandler`. `Notification` can collect them; the command below uses
  `ThrowsValidationHandler`, which throws `DomainException.with(error)` at the first
  violation. The reference's handler interface is not a functional interface.
- `OrderSubmitted` implements the domain `DomainEvent` contract, including
  `occurredOn()`; it contains the immutable order ID and supplied timestamp.
- The domain rule permits empty drafts, requires nonempty submitted orders, permits
  at most ten total units, and forbids duplicate line IDs. The validator must enforce
  these rules, including positive quantities and non-null status/timestamps.

```java
package com.example.domain.order;

import com.example.domain.AggregateRoot;
import com.example.domain.exceptions.DomainException;
import com.example.domain.order.event.OrderSubmitted;
import com.example.domain.validation.Error;
import com.example.domain.validation.ValidationHandler;
import com.example.domain.validation.handler.ThrowsValidationHandler;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class Order extends AggregateRoot<OrderID> {
    private final List<OrderLineSnapshot> lines;
    private final Instant createdAt;
    private OrderStatus status;
    private Instant updatedAt;

    private Order(
            final OrderID id,
            final List<OrderLineSnapshot> lines,
            final OrderStatus status,
            final Instant createdAt,
            final Instant updatedAt) {
        super(Objects.requireNonNull(id));
        this.lines = List.copyOf(lines);
        this.status = Objects.requireNonNull(status);
        this.createdAt = Objects.requireNonNull(createdAt);
        this.updatedAt = Objects.requireNonNull(updatedAt);
    }

    public static Order newOrder(
            final OrderID id,
            final List<OrderLineSnapshot> lines,
            final Instant occurredAt) {
        final var order = new Order(
                id, lines, OrderStatus.DRAFT, occurredAt, occurredAt);
        order.validateOrThrow();
        return order;
    }

    public static Order with(
            final OrderID id,
            final List<OrderLineSnapshot> lines,
            final OrderStatus status,
            final Instant createdAt,
            final Instant updatedAt) {
        final var order = new Order(id, lines, status, createdAt, updatedAt);
        order.validateOrThrow();
        return order;
    }

    @Override
    public void validate(final ValidationHandler handler) {
        new OrderValidator(this, handler).validate();
    }

    private void validateOrThrow() {
        validate(new ThrowsValidationHandler());
    }

    public void submit(final Instant occurredAt) {
        final var acceptedAt = Objects.requireNonNull(occurredAt);
        if (status != OrderStatus.DRAFT) {
            throw DomainException.with(new Error("Only a draft order can be submitted"));
        }
        if (lines.isEmpty()) {
            throw DomainException.with(new Error("An order must contain a line before submission"));
        }
        validateOrThrow();
        // Prepare anything that can reject the command before changing state.
        final var event = new OrderSubmitted(getId(), acceptedAt);
        status = OrderStatus.SUBMITTED;
        updatedAt = acceptedAt;
        registerEvent(event);
    }

    public List<OrderLineSnapshot> getLines() { return lines; }
    public OrderStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
```

The example creates no creation event because no such business fact was specified.
The application supplies the time for a new command; rehydration accepts stored time
without calling `Instant.now()`. `List.copyOf` is sufficient here only because every
line snapshot is immutable. The collection and its elements must both satisfy that
contract. Production base classes may expose different accessors/event APIs; adapt
those deliberately instead of inventing a second foundation.

If a command changes quantities, construct a candidate immutable line list, validate
the resulting total and duplicate-ID rules, and only then replace the current list.
A field holding that list then becomes replaceable. Do not mutate children one by
one and expect a later exception to roll back the in-memory object. An alternative
is returning a new aggregate state if the project consistently uses immutable roots.

A fluent transition returning `this` can fit an existing API, provided each public
call leaves a valid aggregate or rejects without mutation. A chain is not an atomic
command: if its second call rejects, the first call may already have succeeded.
When several edits must succeed together, validate one combined command or candidate
state before applying it. Choose fluent or void returns for caller clarity; neither
return type supplies rollback.

The demonstrated guarantee covers expected command rejection. It is not recovery
from JVM resource exhaustion or arbitrary failures inside a custom event buffer.
If registration can invoke callbacks or fail business validation, change that design
or stage state and event changes together before publishing them. Events remain
pending until the application's persistence/event protocol commits successfully.

## Restore historical facts deliberately

The example uses the same structural validator on creation and load because its
rules are assumed unchanged. Real systems distinguish representational validity
(identity, status, child ownership and compatible fields) from current admission
policy. Do not reject a valid historic order because today's catalog no longer sells
its product, recompute its price, or re-run its submission rule during rehydration.

If persisted state violates an invariant that must still hold, choose an explicit
load failure/quarantine or an authorized migration/repair path. Do not silently
normalize it into a new history. Preserve the expected persistence version in the
existing mapping or load-result contract as well as stored timestamps and identity.
This example omits that adapter-level token rather than fabricating version behavior
inside the domain. Event-sourced replay needs its own event-application contract;
calling public command methods is not a replay implementation.

## Focused verification

Check an empty draft's rejected submission preserves its status, timestamps and
pending-event count. Submit a populated draft and require exactly one matching
event; reject a second submission without changes. Rehydrate the submitted state
with its original timestamps and require no new event. Mutate the original input
list and attempt to mutate the accessor; neither may change the root's lines.

For a validator collecting multiple errors, deliberately supply an invalid candidate
and verify that the caller checks those errors before mutation. For persistence
integration, verify the version and child-write protocol from the boundary reference;
this Java fragment alone does not establish it.
