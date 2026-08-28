# Worked example: an order-fulfilment coordinator

Five components take part in fulfilling an order: stock reservation, payment, packing, carrier
booking, and customer notification. Their rules interact — packing may not start before payment
settles _and_ stock is reserved; a carrier booking is cancelled if packing fails; the customer is
notified differently depending on which step failed.

## Before — the web

```java
class StockReservation {
    private final Packing packing;
    private final Notifications notifications;
    void onReserved(OrderId id) {
        if (payments.isSettled(id)) packing.start(id);      // knows Payments and Packing
        else notifications.pendingPayment(id);
    }
}

class Payments {
    private final Packing packing;
    private final StockReservation stock;
    void onSettled(OrderId id) {
        if (stock.isReserved(id)) packing.start(id);        // the same rule, written twice
        ...
    }
}
```

Every component references two or three others, the "packing may start" rule exists in two places
and has already diverged (one checks a cancellation flag, the other does not), and adding
carrier booking means editing four classes.

## After — one coordinator

```java
public final class FulfilmentCoordinator {

    private final StockReservation stock;
    private final Payments payments;
    private final Packing packing;
    private final CarrierBooking carrier;
    private final Notifications notifications;

    private final Map<OrderId, FulfilmentState> states = new ConcurrentHashMap<>();

    public void orderPlaced(OrderId id) {
        states.put(id, FulfilmentState.initial());
        stock.reserve(id);
        payments.authorise(id);
    }

    public void stockReserved(OrderId id) { advance(id, FulfilmentState::withStockReserved); }
    public void paymentSettled(OrderId id) { advance(id, FulfilmentState::withPaymentSettled); }

    private void advance(OrderId id, UnaryOperator<FulfilmentState> transition) {
        var next = states.compute(id, (k, current) -> transition.apply(require(current)));
        if (next.readyToPack()) packing.start(id);          // the rule, in exactly one place
    }
}
```

The participants now know only the coordinator. The "ready to pack" rule exists once, in a value
type that can be unit-tested without any participant at all:

```java
record FulfilmentState(boolean stockReserved, boolean paymentSettled, boolean cancelled) {
    boolean readyToPack() { return stockReserved && paymentSettled && !cancelled; }
}
```

Extracting the protocol state into a value is what keeps the hub small: the coordinator wires and
sequences, the state type decides.

## The reentrancy bug found in review

The first version called participants while holding the map entry's lock:

```java
private void advance(OrderId id, UnaryOperator<FulfilmentState> transition) {
    states.compute(id, (k, current) -> {
        var next = transition.apply(current);
        if (next.readyToPack()) packing.start(id);      // inside compute — do not do this
        return next;
    });
}
```

Two defects. `ConcurrentHashMap.compute` holds the bin lock while the mapping function runs, so
`packing.start` — which calls back into `packedSuccessfully` — re-enters `compute` for the same
key and deadlocks. And even without reentrancy, holding a map lock across an outbound call
serialises unrelated orders that hash to the same bin.

The fix is the one that generalises: **compute the transition under the lock, perform effects
after it.**

```java
var next = states.compute(id, (k, current) -> transition.apply(require(current)));
if (next.readyToPack()) packing.start(id);       // outside
```

## When it reached nine participants

Eighteen months later the class had returns, refunds and catalogue re-pricing in it. The signals
fired in this order: a test for `returnRequested` had to construct fakes for `carrier` and
`packing`, which it never touched; then `onCatalogueUpdated` appeared, sharing no state with
anything else.

```java
final class FulfilmentCoordinator { }   // 5 participants — the original protocol
final class ReturnsCoordinator { }      // 3 participants — a separate protocol with its own state
// re-pricing turned out to be one event and one listener; no coordinator at all
```

The third line is the usual outcome and the most valuable: a third of a god mediator is typically
not coordination. Removing it is the cheapest available reduction and it needs no new abstraction.

## The distributed version

When packing and carrier booking moved to other services, the coordinator became an orchestrator,
and four things changed that have nothing to do with structure:

```java
@Transactional
public void paymentSettled(OrderId id) {
    var state = repository.load(id);                    // durable, not a ConcurrentHashMap
    var next = state.withPaymentSettled();
    repository.save(next);                              // survives a restart mid-flow
    if (next.readyToPack()) {
        outbox.enqueue(new StartPacking(CommandId.newId(), id));   // at-least-once, idempotent
    }
}
```

- **State is persisted.** An in-memory map loses every in-flight order on a deploy. The
  orchestrator is a process that outlives the JVM.
- **Every step has a timeout and a compensation.** "Packing did not respond within 30 minutes" is
  a state the protocol must have, with a defined action — retry, escalate, or release the stock
  reservation. Without it, orders stall silently and are found by customers
  (`distributed-transactions-and-sagas`).
- **Commands are idempotent and deduplicated.** The outbox delivers at least once, so
  `StartPacking` may arrive twice (`idempotency`).
- **Availability is now coupled.** Every fulfilment depends on the orchestrator being up. That is
  the price of having one readable flow, and it should be a stated decision, not a consequence of
  keeping the class.

## Why not choreography

It was considered. Each service publishing `StockReserved`, `PaymentSettled` and so on, with
packing subscribing to both, removes the orchestrator and its availability coupling.

It was rejected for this flow because of two requirements:

- **Cancellation.** A customer can cancel until packing starts. Something must know the flow's
  position to decide whether cancellation is still possible; with choreography, nothing does.
- **Stuck-flow diagnosis.** "Which orders are waiting, and on what" is one query against the
  orchestrator's state, and a distributed-trace correlation exercise otherwise.

For a fan-out with neither requirement — notify analytics, warm a cache, update a search index —
choreography would be the right answer, and the orchestrator would be a bottleneck that adds
nothing (`event-driven-architecture`).
