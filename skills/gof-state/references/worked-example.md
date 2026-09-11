# Worked example: an order lifecycle, from flags to a state machine

Illustrative case, not a reported incident or executed database migration. Java 21 partial snippets
(no preview) require Instant, Objects and the nested OrderState types; event/value types, imports,
repositories and Spring/ShedLock configuration are omitted. Validate the target framework/database.

## Before — four booleans

```java
@Entity
public class Order {
    private boolean paid;
    private boolean shipped;
    private boolean cancelled;
    private boolean refunded;

    private Instant paidAt;
    private String trackingId;      // meaningful only when shipped
    private String cancelReason;    // meaningful only when cancelled
}
```

Sixteen non-null Boolean combinations exist. In this illustrative contract six combinations map
to five states (unpaid cancellation and settled refund both map to Cancelled). Illegal examples:

```text
paid=false shipped=true            shipped without payment, possible if
                                   an admin tool bypasses transition rules
paid=true cancelled=true           two code paths disagreed about whether
  refunded=false                   this meant "refund pending" or "done"
cancelled=true shipped=true        an order shipped after cancellation
```

And the rules lived in every reader:

```java
if (order.isPaid() && !order.isShipped() && !order.isCancelled()) { /* shippable */ }
```

Duplicating this condition makes it possible for a path to omit cancelled.

## After — a sealed state and one transition function

```java
public sealed interface OrderState permits OrderState.Draft, OrderState.Paid,
        OrderState.Shipped, OrderState.Refunding, OrderState.Cancelled {
    record Draft() implements OrderState {}
    record Paid(Instant at, PaymentReference reference) implements OrderState {
        public Paid { Objects.requireNonNull(at); Objects.requireNonNull(reference); }
    }
    record Shipped(TrackingId tracking, Instant at) implements OrderState {
        public Shipped { Objects.requireNonNull(tracking); Objects.requireNonNull(at); }
    }
    record Refunding(Instant requestedAt, PaymentReference reference, Reason reason) implements OrderState {
        public Refunding { Objects.requireNonNull(requestedAt); Objects.requireNonNull(reference); Objects.requireNonNull(reason); }
    }
    record Cancelled(Instant at, Reason reason) implements OrderState {
        public Cancelled { Objects.requireNonNull(at); Objects.requireNonNull(reason); }
    }
}
```

`trackingId` now exists only on `Shipped`, so no code can read a tracking id from a draft order.
That removes a nullable field and, with it, the question "what does a tracking id on an unshipped
order mean?" — which had two answers in the codebase.

```java
public static OrderState transition(OrderState current, OrderEvent event) {
    Objects.requireNonNull(current);
    Objects.requireNonNull(event);
    return switch (current) {
        case Draft d -> switch (event) {
            case Pay p -> new Paid(p.at(), p.reference());
            case Cancel c -> new Cancelled(c.at(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Paid p -> switch (event) {
            case Ship s -> new Shipped(s.tracking(), s.at());
            case Cancel c -> new Refunding(c.at(), p.reference(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Shipped s -> throw new IllegalTransition(current, event);
        case Refunding r -> switch (event) {
            case RefundSettled x -> new Cancelled(x.at(), r.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Cancelled c -> throw new IllegalTransition(current, event);
    };
}
```

The type eliminates combinations of status flags, not every invalid payload or business history.
Value/event constructors must validate data and the transition boundary must enforce authorization,
refund correlation, timing and other guards. Paid is shippable only under this simplified contract;
real eligibility may also depend on inventory, holds or other aggregate state.

## The race that the flags hid

Two requests — a customer cancelling and a warehouse shipping — arrived within milliseconds. Both
read `Paid`, both transitioned, both saved. The order ended `Shipped` with a refund in flight.

The transition function alone does not fix this: it is a read-decide-write, and both reads
returned `Paid`. The fix is at the write:

```java
@Transactional
public void ship(OrderId id, long expectedVersion, TrackingId tracking, Instant at) {
    int updated = jdbc.update("""
            UPDATE orders
               SET status = 'SHIPPED', tracking = ?, shipped_at = ?, version = version + 1
             WHERE id = ? AND status = 'PAID' AND version = ?
            """, tracking.value(), Timestamp.from(at), id.value(), expectedVersion);

    if (updated != 1) {
        throw new ConcurrentTransition(id, "PAID", currentStatusOf(id));
    }
    outbox.enqueue(new OrderShipped(EventId.newId(), id, tracking, at));
}
```

The predicate and checked row count form a conditional write. All competing transition writers
must follow the same protocol. Zero rows can mean absence, a changed version or a disallowed state;
a subsequent diagnostic read need not describe the exact conflict moment (`offline-concurrency-control`).

The alternative considered was `@Version` optimistic locking on the aggregate, which is correct
but can conflict on unrelated aggregate fields. If raw SQL coexists with versioned ORM writes,
explicitly increment/check the same version as above and prevent stale managed entities from
being flushed later (refresh/clear or use one persistence path). Additional guards must participate
in the authoritative decision. This sketch assumes a non-null numeric version column.

## The side effect, made safe

Shipping must eventually notify the customer in this example. The first version had no retry or
reconciliation protocol and sent the email from the service after saving:

```java
orders.save(order);
notifications.sendShipped(order);        // process dies here → no email, ever
```

and the second version sent it before, which emailed customers for shipments that then failed.
The outbox coordinates both only when status and event writes share the effective database
transaction. Relay retries/acknowledgements, monitoring and idempotent effects are still required (`event-driven-architecture`, `idempotency`).
This example's durable notification requirement justifies that machinery; a deliberately
best-effort local observation need not adopt the same persistence protocol.

## Persistence and migration

The database column stayed a `VARCHAR` status plus the per-state columns, mapped explicitly:

```java
static OrderState fromRow(Row row) {
    return switch (row.string("status")) {
        case "DRAFT" -> new Draft();
        case "PAID" -> new Paid(row.instant("paid_at"), new PaymentReference(row.string("payment_ref")));
        case "SHIPPED" -> new Shipped(new TrackingId(row.string("tracking")), row.instant("shipped_at"));
        case "REFUNDING" -> new Refunding(row.instant("cancelled_at"), new PaymentReference(row.string("payment_ref")), reasonFromCode(row.string("cancel_reason")));
        case "CANCELLED" -> new Cancelled(row.instant("cancelled_at"), reasonFromCode(row.string("cancel_reason")));
        default -> throw new UnknownPersistedState(row.string("status"));
    };
}
```

The migration from flags ran in one statement per state, with the illegal combinations dealt with
explicitly rather than by a `CASE` fallthrough:

```sql
-- Illustrative 0/1 columns; status must be a new nullable column.
-- Translate literals/types for the actual dialect and keep writes paused or coordinated.
UPDATE orders SET status = 'SHIPPED' WHERE status IS NULL AND paid = 1 AND shipped = 1 AND cancelled = 0 AND refunded = 0;
UPDATE orders SET status = 'CANCELLED' WHERE status IS NULL AND shipped = 0 AND cancelled = 1
  AND ((paid = 0 AND refunded = 0) OR (paid = 1 AND refunded = 1));
UPDATE orders SET status = 'REFUNDING' WHERE status IS NULL AND paid = 1 AND shipped = 0 AND cancelled = 1 AND refunded = 0;
UPDATE orders SET status = 'PAID' WHERE status IS NULL AND paid = 1 AND shipped = 0 AND cancelled = 0 AND refunded = 0;
UPDATE orders SET status = 'DRAFT' WHERE status IS NULL AND paid = 0 AND shipped = 0 AND cancelled = 0 AND refunded = 0;

-- NULL flags, invalid values and all unclassified combinations require investigation.
SELECT id, paid, shipped, cancelled, refunded FROM orders WHERE status IS NULL;
```

No production counts or executed migration evidence accompany this example. Verify all 16 Boolean
combinations plus NULL/invalid flags before running it. Also validate required state payloads and
backfill missing timestamps/reasons from evidence, not invented defaults. Plan compatibility with
old writers/readers, dual-write consistency, constraints, rollback and archived state data.
reasonFromCode is an omitted stable-code decoder that rejects unknown/missing reasons.

## The timeout

"Cancel a draft order unpaid after 24 hours" is an event, delivered by a sweep:

```java
@Scheduled(fixedDelay = 5, timeUnit = MINUTES)
@SchedulerLock(name = "expireDraftOrders", lockAtMostFor = "10m")
void expireDrafts() {
    var at = clock.instant();
    jdbc.update("""
            UPDATE orders SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = 'EXPIRED', version = version + 1
             WHERE status = 'DRAFT' AND created_at < ?
            """, Timestamp.from(at), Timestamp.from(at.minus(24, HOURS)));
}
```

The conditional state predicate resolves a payment/expiry race only when both writers use
compatible atomic predicates/versioning. Define whether deadline or commit order wins.
ShedLock reduces duplicate scheduling but lock expiry can permit overlap; correctness cannot
rely on a fixed ten-minute lease. Use bounded batches and inspect the actual query plan before
choosing indexes. Catch up after outages; stale timers need a lifecycle generation when states
can recur. If expiry requires events, enqueue them atomically with affected rows; this SQL-only
sketch omits that protocol
(`distributed-locks-and-leases`).

## Suggested table tests (partial, not executed integration tests)

```java
static Stream<Arguments> transitions() {
    return Stream.of(
        arguments(draft(),     pay(),           Paid.class),
        arguments(draft(),     ship(),          IllegalTransition.class),
        arguments(draft(),     cancel(),        Cancelled.class),
        arguments(paid(),      ship(),          Shipped.class),
        arguments(paid(),      pay(),           IllegalTransition.class),
        arguments(paid(),      cancel(),        Refunding.class),
        arguments(shipped(),   cancel(),        IllegalTransition.class),
        arguments(shipped(),   ship(),          IllegalTransition.class),
        arguments(refunding(), refundSettled(), Cancelled.class),
        arguments(cancelled(), pay(),           IllegalTransition.class));
}
```

This list has ten examples, not all twenty pairs of five states and four event kinds. Assert the
full Cartesian coverage explicitly, including payload guards and the preserved refund reason.
Test stale versions and concurrent ship/cancel against the actual database, rollback after outbox
enqueue, missing/corrupt row data, repeated commands and timeout catch-up. These checks complement
sequence tests; compiler exhaustiveness alone does not prove business correctness.
