# Worked example: an order lifecycle, from flags to a state machine

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

Sixteen combinations exist; five are legal. The illegal ones were reachable:

```text
paid=false shipped=true            shipped without payment — happened,
                                   via an admin tool that set shipped directly
paid=true cancelled=true           two code paths disagreed about whether
  refunded=false                   this meant "refund pending" or "done"
cancelled=true shipped=true        an order shipped after cancellation
```

And the rules lived in every reader:

```java
if (order.isPaid() && !order.isShipped() && !order.isCancelled()) { /* shippable */ }
```

written slightly differently in seven places, three of which had forgotten `cancelled`.

## After — a sealed state and one transition function

```java
public sealed interface OrderState permits Draft, Paid, Shipped, Refunding, Cancelled {

    record Draft() implements OrderState { }
    record Paid(Instant at, PaymentReference reference) implements OrderState { }
    record Shipped(TrackingId tracking, Instant at) implements OrderState { }
    record Refunding(Instant requestedAt, PaymentReference reference) implements OrderState { }
    record Cancelled(Instant at, Reason reason) implements OrderState { }
}
```

`trackingId` now exists only on `Shipped`, so no code can read a tracking id from a draft order.
That removes a nullable field and, with it, the question "what does a tracking id on an unshipped
order mean?" — which had two answers in the codebase.

```java
public static OrderState transition(OrderState current, OrderEvent event) {
    return switch (current) {
        case Draft d -> switch (event) {
            case Pay p -> new Paid(p.at(), p.reference());
            case Cancel c -> new Cancelled(c.at(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Paid p -> switch (event) {
            case Ship s -> new Shipped(s.tracking(), s.at());
            case Cancel c -> new Refunding(c.at(), p.reference());
            default -> throw new IllegalTransition(current, event);
        };
        case Shipped s -> throw new IllegalTransition(current, event);
        case Refunding r -> switch (event) {
            case RefundSettled x -> new Cancelled(x.at(), Reason.CUSTOMER_CANCELLED);
            default -> throw new IllegalTransition(current, event);
        };
        case Cancelled c -> throw new IllegalTransition(current, event);
    };
}
```

Two properties the flags did not have. Illegal combinations are unrepresentable rather than merely
undesirable. And "shippable" is not a rule anyone writes: it is `current instanceof Paid`, decided
in one place.

## The race that the flags hid

Two requests — a customer cancelling and a warehouse shipping — arrived within milliseconds. Both
read `Paid`, both transitioned, both saved. The order ended `Shipped` with a refund in flight.

The transition function alone does not fix this: it is a read-decide-write, and both reads
returned `Paid`. The fix is at the write:

```java
@Transactional
public void ship(OrderId id, TrackingId tracking, Instant at) {
    int updated = jdbc.update("""
            UPDATE orders
               SET status = 'SHIPPED', tracking = ?, shipped_at = ?
             WHERE id = ? AND status = 'PAID'
            """, tracking.value(), Timestamp.from(at), id.value());

    if (updated == 0) {
        throw new ConcurrentTransition(id, "PAID", currentStatusOf(id));
    }
    outbox.enqueue(new OrderShipped(EventId.newId(), id, tracking, at));
}
```

The database performs the compare-and-swap; the row count is the answer. Checking that count is
the whole mechanism — an update matching nothing returns 0 and is otherwise indistinguishable from
success (`offline-concurrency-control`).

The alternative considered was `@Version` optimistic locking on the aggregate, which is correct
and coarser: it also fails when an unrelated field changed concurrently. It was kept for the rest
of the aggregate; the conditional update handles the transition specifically because a
transition's precondition is exactly the current state.

## The side effect, made safe

Shipping notifies the customer. The first version sent the email from the service after saving:

```java
orders.save(order);
notifications.sendShipped(order);        // process dies here → no email, ever
```

and the second version sent it before, which emailed customers for shipments that then failed.
The outbox resolves both: the event row commits with the status change, and a relay delivers it
at least once to an idempotent consumer (`event-driven-architecture`, `idempotency`).

## Persistence and migration

The database column stayed a `VARCHAR` status plus the per-state columns, mapped explicitly:

```java
static OrderState fromRow(Row row) {
    return switch (row.string("status")) {
        case "DRAFT" -> new Draft();
        case "PAID" -> new Paid(row.instant("paid_at"), new PaymentReference(row.string("payment_ref")));
        case "SHIPPED" -> new Shipped(new TrackingId(row.string("tracking")), row.instant("shipped_at"));
        case "REFUNDING" -> new Refunding(row.instant("cancelled_at"), new PaymentReference(row.string("payment_ref")));
        case "CANCELLED" -> new Cancelled(row.instant("cancelled_at"), Reason.valueOf(row.string("cancel_reason")));
        default -> throw new UnknownPersistedState(row.string("status"));
    };
}
```

The migration from flags ran in one statement per state, with the illegal combinations dealt with
explicitly rather than by a `CASE` fallthrough:

```sql
UPDATE orders SET status = 'SHIPPED'  WHERE shipped = 1 AND cancelled = 0;
UPDATE orders SET status = 'CANCELLED' WHERE cancelled = 1 AND refunded = 1;
UPDATE orders SET status = 'REFUNDING' WHERE cancelled = 1 AND refunded = 0 AND paid = 1;
UPDATE orders SET status = 'PAID'      WHERE paid = 1 AND shipped = 0 AND cancelled = 0;
UPDATE orders SET status = 'DRAFT'     WHERE paid = 0 AND cancelled = 0;

-- everything left over is an illegal combination and is reported, not guessed
SELECT id, paid, shipped, cancelled, refunded FROM orders WHERE status IS NULL;
```

That last query found 340 orders in states the code had believed impossible, including 11 shipped
without payment. They were resolved by hand. Guessing at them with a fallback `UPDATE` would have
hidden a real revenue problem.

## The timeout

"Cancel a draft order unpaid after 24 hours" is an event, delivered by a sweep:

```java
@Scheduled(fixedDelay = 5, timeUnit = MINUTES)
@SchedulerLock(name = "expireDraftOrders", lockAtMostFor = "10m")
void expireDrafts() {
    jdbc.update("""
            UPDATE orders SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = 'EXPIRED'
             WHERE status = 'DRAFT' AND created_at < ?
            """, now(), now().minus(24, HOURS));
}
```

Three details: the lock, because every replica runs the schedule; the conditional `status =
'DRAFT'`, so the sweep cannot cancel an order that was paid a moment ago; and an index on
`(status, created_at)`, without which the sweep scans the table every five minutes
(`distributed-locks-and-leases`).

## The test that replaced twenty

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

Every `(state, event)` pair, including the rejections. When `Refunding` was added later, this
table was the checklist: five new rows, and the compiler had already flagged the two `switch`
statements that needed a branch.
