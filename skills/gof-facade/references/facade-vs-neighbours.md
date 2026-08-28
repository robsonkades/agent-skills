# Facade against its neighbours, and how one goes bad

## Discriminators

| Candidate                 | Discriminator                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **Facade**                | New, coarser interface over **several** collaborators you own; simplifies access    |
| **Adapter**               | New interface over **one** foreign type; makes it usable at all (`gof-adapter`)     |
| **Decorator**             | **Same** interface, behaviour added, stackable (`gof-decorator`)                    |
| **Proxy**                 | **Same** interface, access controlled; caller believes it is the real thing         |
| **Mediator**              | Collaborators talk **through** it to each other; it owns their protocol             |
| **Service Layer** (PoEAA) | An architectural layer defining the application's boundary and transactions         |
| **Remote Facade** (PoEAA) | A facade whose coarseness exists to save network round trips, paired with DTOs      |
| **API gateway / BFF**     | A deployed network component: routing, auth, aggregation, its own failure semantics |

Two of these are frequently conflated with Facade and should not be.

**Mediator.** The test is direction. In a facade, callers call in and the subsystem does not call
back; the subsystem's parts need not know the facade exists. In a mediator, the participants
depend on the hub and communicate through it. A "facade" that its own collaborators call into is
a mediator, and it will accumulate their interaction rules (`gof-mediator`).

**API gateway / BFF.** These live on a network boundary. They have their own availability,
their own authentication, their own timeouts, and a failure in them is an outage for everyone
behind them. A facade is a class. Using one word for both leads to reasoning about the gateway as
though it were free.

## Simplify, or forbid?

GoF's facade simplifies without restricting: clients with unusual needs may still use the
subsystem. Modern layered designs frequently want the stronger claim — nothing may reach past
this point. That is a boundary, and wanting it is fine; the mistake is asserting it in a document
and not in the code.

```text
Simplify (classical facade)
  subsystem types remain public; the facade is a convenience
  → say so, or someone will "enforce" it later and break callers

Forbid (boundary)
  subsystem types package-private, or the module exports only the facade
  package; an architecture test asserts no other package imports them
  → enforced, and a violation fails the build (architecture-testing)
```

Anything in between — public types plus a convention — degrades to "everyone calls whatever they
found first", and the facade becomes one of several entry points, which is worse than not having
it.

## God-facade drift

The failure is gradual and every individual step is reasonable.

```text
1. OrderFacade.place(basket)                    3 collaborators
2. + cancel(orderId)                            4
3. + refund(orderId, amount)                    6
4. + resendConfirmation(orderId)                7
5. + exportForAccounting(range)                 9
6. + recalculatePricesForCampaign(campaignId)  12
...
n. 30 methods, 20 constructor parameters, 2000 lines
```

Detection, in order of how early it fires:

- **Constructor parameter count above roughly seven.** The most reliable early signal.
- **Methods that share no collaborators.** `exportForAccounting` and `resendConfirmation` touch
  disjoint sets; they are two classes wearing one name.
- **Test setup grows superlinearly.** A new test must stub collaborators it does not use.
- **Merge conflicts concentrate in one file.** Every feature touches it because everything is in
  it.
- **A method takes a boolean or an enum that selects behaviour.** Two intentions in one method.

## Splitting one

Split by **use case**, not by noun. `OrderFacade` becomes `PlaceOrder`, `CancelOrder`,
`RefundOrder` — each with only the collaborators it needs, each testable in isolation, each
named for the caller's intention.

```java
// before
class OrderFacade { /* 30 methods, 20 dependencies */ }

// after
final class PlaceOrder   { PlaceOrder(BasketRepository, PricingService, StockReservation,
                                      OrderRepository, DomainEvents) { } }
final class CancelOrder  { CancelOrder(OrderRepository, StockReservation, DomainEvents) { } }
final class RefundOrder  { RefundOrder(OrderRepository, PaymentGateway, DomainEvents) { } }
```

Objections and answers:

- _"Now there are twenty classes."_ There were twenty methods; each is now independently
  readable, testable and ownable, and none forces the others to load.
- _"Callers must know which class to use."_ They already had to know which method. The class name
  carries the same information with better discoverability.
- _"Shared setup is duplicated."_ Extract it as a collaborator, not as a base class. Shared
  behaviour through inheritance re-creates the coupling you just removed
  (`java-composition-over-inheritance`).

Keep a single class only where the operations genuinely share state or a sequence — a wizard-like
flow, a saga's steps — and then the shared thing, not the noun, is the reason.

## The transaction boundary

A facade method is usually where `@Transactional` sits, which makes it responsible for:

- **What commits together.** Two aggregates written in one method commit atomically; if that is
  not intended, the method is doing two things (`domain-logic-organization`).
- **How long a connection is held.** A facade method that calls a remote service inside the
  transaction holds a database connection for the duration of an HTTP call — the classic pool
  exhaustion under a slow dependency (`connection-pool-sizing`).
- **What happens to published events.** Events published inside the transaction but delivered
  before commit can be acted on before the data exists (`event-driven-architecture`).

None of these are visible from the method's signature, which is why they belong in review
(`enterprise-transactions`).

## Remote fan-out

```java
public OrderView view(OrderId id, Deadline deadline) {
    // three remote calls; latency is the slowest, not the sum, only if run concurrently
    var order    = orders.byId(id, deadline);
    var customer = customers.byId(order.customerId(), deadline);
    var shipping = shipments.forOrder(id, deadline);
    return OrderView.of(order, customer, shipping);
}
```

Three decisions this method silently makes and should make explicitly:

1. **Sequential or concurrent.** Sequential costs the sum. Structured concurrency makes the
   concurrent version safe and cancellable (`structured-concurrency`).
2. **Partial failure.** If `shipments` is down, is the whole view an error, or a view with the
   shipping section absent? A facade that propagates every failure makes the page's availability
   the product of its dependencies' (`scatter-gather`, `failure-models`).
3. **The overall deadline.** Passing the same `deadline` to three sequential calls means the last
   one may have no budget left — correct, and it must be handled rather than surfacing as a
   confusing timeout.
