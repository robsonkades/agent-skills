# Worked example: an order-fulfilment coordinator

Five components take part in fulfilling an order: stock reservation, payment, packing, carrier
booking, and customer notification. Their rules interact — packing may not start before payment
settles _and_ stock is reserved; a carrier booking is cancelled if packing fails; the customer is
notified differently depending on which step failed.

This is a hypothetical Java 17 teaching scenario, not a reported incident. Coordinator snippets
are partial: domain types, constructors, ingress and failure handling belong to the application.

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

    // All methods run on one owned event loop; callbacks enqueue and never invoke inline.
    private final Map<OrderId, FulfilmentState> states = new HashMap<>();

    public void orderPlaced(OrderId id) {
        if (states.putIfAbsent(id, FulfilmentState.initial()) != null) return;
        stock.reserve(id);
        payments.authorise(id);
    }

    public void stockReserved(OrderId id) { advance(id, FulfilmentState::withStockReserved); }
    public void paymentSettled(OrderId id) { advance(id, FulfilmentState::withPaymentSettled); }

    private void advance(OrderId id, UnaryOperator<FulfilmentState> transition) {
        var current = java.util.Objects.requireNonNull(states.get(id), "unknown order");
        var next = transition.apply(current);
        boolean start = next.readyToPack();
        states.put(id, start ? next.withPackingRequested() : next);
        if (start) packing.start(id); // claim recorded first; duplicate events cannot request again
    }
}
```

The participants now know only the coordinator. The "ready to pack" rule exists once, in a value
type that can be unit-tested without any participant at all:

```java
record FulfilmentState(boolean stockReserved, boolean paymentSettled,
                       boolean cancelled, boolean packingRequested) {
    static FulfilmentState initial() { return new FulfilmentState(false, false, false, false); }
    boolean readyToPack() {
        return stockReserved && paymentSettled && !cancelled && !packingRequested;
    }
    FulfilmentState withStockReserved() {
        return new FulfilmentState(true, paymentSettled, cancelled, packingRequested);
    }
    FulfilmentState withPaymentSettled() {
        return new FulfilmentState(stockReserved, true, cancelled, packingRequested);
    }
    FulfilmentState withPackingRequested() {
        return new FulfilmentState(stockReserved, paymentSettled, cancelled, true);
    }
}
```

Extracting the protocol state into a value is what keeps the hub small: the coordinator wires and
sequences, the state type decides.

The queue needs bounded admission, an owner that closes it, and a failure policy. Exceptions from
participants must become explicit failed/unknown outcomes; a recorded request is not completed
packing. If delivery throws or the process dies after recording the claim, this in-memory example
does not recover it automatically. Do not reset and retry blindly when the effect may have happened.
Likewise, if `stock.reserve` throws, `payments.authorise` is not reached, yet the order remains in
the map and another `orderPlaced` is ignored. The application must record/reconcile that partial or
unknown outcome; the sketch is not a complete retry protocol. Even when both participant calls
return normally, that does not establish completion of their asynchronous business effects.
Keep completed-state retention/deduplication bounded with a defined late-event policy.

Cancellation must be ordered against the packing claim: this model closes cancellation when
packing is requested. A contract allowing cancellation until physical packing starts needs an
additional participant handshake, not merely this flag.

## The reentrancy bug found in review

The first version called participants inside the map's atomic computation:

```java
private void advance(OrderId id, UnaryOperator<FulfilmentState> transition) {
    states.compute(id, (k, current) -> {
        var next = transition.apply(current);
        if (next.readyToPack()) packing.start(id);      // inside compute — do not do this
        return next;
    });
}
```

Two defects. `ConcurrentHashMap.compute` requires the remapping function to be short and says
recursive updates must not modify the map; re-entering the same-key computation can be detected
as an illegal recursive update or otherwise violate progress assumptions depending on the path/JDK.
Even without reentrancy, placing an outbound call inside atomic map computation can block updates
that contend for the same internal coordination scope.

Moving effects outside atomic computation avoids that callback hazard, but is not a complete fix:

```java
var next = states.compute(id, (k, current) -> transition.apply(require(current)));
if (next.readyToPack()) packing.start(id);       // still wrong if repeated ready events reissue work
```

Claim the effect once in the transition, then deliver it with defined failure handling. Concurrent
publication alone does not order effects or make delivery atomic. The serialized version above
assumes all events and callbacks go through its queue; a ConcurrentHashMap is not a substitute.

## When it reached nine participants

Suppose the class later acquires returns, refunds and catalogue re-pricing. The signals
fired in this order: a test for `returnRequested` had to construct fakes for `carrier` and
`packing`, which it never touched; then `onCatalogueUpdated` appeared, sharing no state with
anything else.

```java
final class FulfilmentCoordinator { }   // 5 participants — the original protocol
final class ReturnsCoordinator { }      // 3 participants — a separate protocol with its own state
// re-pricing turned out to be one event and one listener; no coordinator at all
```

The third responsibility does not need coordination in this scenario. Remove the unnecessary hub
without generalizing this illustrative split into a ratio or participant-count threshold.

## The distributed version

When packing and carrier booking moved to other services, the coordinator became an orchestrator,
and four things changed that have nothing to do with structure:

```text
Transaction in one database (pseudocode):
  lock the order row, or validate an optimistic version with retry of the whole transaction
  load current state and apply payment-settled event idempotently
  if ready and packing not yet requested:
    record packing-requested and its stable command identity
    insert StartPacking with that identity into the outbox
  save state and commit state + outbox atomically

Relay retries use the stored identity, never a fresh identity per delivery.
The packing consumer atomically deduplicates that identity with its local effect.
```

- **State is persisted.** An in-memory map loses every in-flight order on a deploy. The
  orchestrator is a process that outlives the JVM.
- **Every remote step has a deadline and outcome policy.** Compensation applies only to effects
  that require semantic undo. "Packing did not respond within 30 minutes" is
  a state the protocol must have, with a defined action. Missing response leaves packing unknown:
  releasing stock is safe only when terminal evidence or a participant-enforced cancellation/recovery
  protocol rules out incompatible late packing. A transient status lookup alone may not do that;
  retain pending state or escalate when authority is unresolved. Retry with the stored identity
  under the participant contract, not as a new attempt that forgets earlier effects
  (`distributed-transactions-and-sagas`).
- **Commands need idempotency/deduplication.** The outbox relay can redeliver. A fresh UUID alone
  does not deduplicate repeated decisions, and an external effect needs its own provider contract
  (`idempotency`).
- **Availability is coupled for dependent progress.** A durable flow may wait and resume after
  orchestrator recovery; already dispatched independent work can continue.

## Why not choreography

It was considered. Each service publishing `StockReserved`, `PaymentSettled` and so on, with
packing subscribing to both, removes that central orchestrator but adds subscriber protocol state
and still depends on messaging infrastructure.

It was rejected for this flow because of two requirements:

- **Cancellation.** In this simplified model, cancellation closes at the packing request. Something must know the flow's
  position to decide whether cancellation is still possible. Choreography needs an explicit owner
  and handshake for this decision; it is possible but more involved in this scenario.
- **Stuck-flow diagnosis.** "Which orders are waiting, and on what" is one query against the
  orchestrator's state. This scenario has no equivalent durable workflow view in its choreographed
  alternative; one could be built or already exist elsewhere. Compare its coverage, freshness and
  maintenance cost before treating central coordination as necessary for visibility.

For a fan-out with neither requirement — notify analytics, warm a cache, update a search index —
choreography is a candidate; require a concrete coordination need before adding an orchestrator
(`event-driven-architecture`).

Sources: [ConcurrentHashMap computation contracts](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
and [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html).
