# Facade against its neighbours, and how one goes bad

## Discriminators

| Candidate                 | Discriminator                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Facade**                | Simplifies access to a subsystem; collaborator count and ownership alone do not decide |
| **Adapter**               | Translates a provided interface into the contract clients require (`gof-adapter`)      |
| **Decorator**             | **Same** interface, behaviour added, stackable (`gof-decorator`)                       |
| **Proxy**                 | **Same** interface, access controlled; caller believes it is the real thing            |
| **Mediator**              | Collaborators talk **through** it to each other; it owns their protocol                |
| **Service Layer** (PoEAA) | An architectural layer defining the application's boundary and transactions            |
| **Remote Facade** (PoEAA) | A facade whose coarseness exists to save network round trips, paired with DTOs         |
| **API gateway / BFF**     | A deployed network component: routing, auth, aggregation, its own failure semantics    |

Two of these are frequently conflated with Facade and should not be.

**Mediator.** Inspect the collaboration protocol: participants use a mediator to coordinate
with each other. A facade simplifies client access; callbacks for completion or progress alone
do not make it a mediator. One component may play both roles (`gof-mediator`).

**API gateway / BFF.** These live on a network boundary. They have their own availability,
their own authentication, their own timeouts, and a failure in them is an outage for everyone
behind them. They may implement facade simplification, but that label does not account for their
deployment, client contracts or network failure costs.

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

Public subsystem APIs plus a convenience facade can be intentional. If access restriction is
required, distinguish documentation, static architecture checks and runtime/module enforcement;
inspect existing callers before closing access. Package-private types are visible within their
package. JPMS exports constrain access from other modules, including unnamed clients reading a
named module; they do not isolate packages inside the same module. Verify the actual launch:
a modular JAR placed on the classpath behaves as a non-modular JAR, so its descriptor does not
hide public subsystem types. Package names alone do not restrict access.

Check `exports` and `--add-exports` for ordinary cross-module access, and `opens`/`--add-opens`
when reflective access matters. An architecture test checks its configured code scope; it does
not create a runtime access restriction.
Sources: [Java 17 JAR specification](https://docs.oracle.com/en/java/javase/17/docs/specs/jar/jar.html#modular-jar-files),
[JLS 17 module directives and unnamed modules](https://docs.oracle.com/javase/specs/jls/se17/html/jls-7.html#jls-7.7),
and [Java 17 launcher options](https://docs.oracle.com/en/java/javase/17/docs/specs/man/java.html).

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

- **Dependency growth with unrelated change reasons.** Counts are a prompt to inspect cohesion.
- **Methods that share no collaborators.** `exportForAccounting` and `resendConfirmation` touch
  disjoint sets; investigate independent change and ownership before splitting a coherent public API.
- **Test setup grows superlinearly.** A new test must stub collaborators it does not use.
- **Merge conflicts concentrate in one file.** Every feature touches it because everything is in
  it.
- **A flag hides distinct intentions or effects.** Preview versus publish deserves explicit names;
  a rendering format or another clear option of one operation is not itself a cohesion defect.

## Splitting one

Split by independently changing **use case or capability**. `OrderFacade` may become `PlaceOrder`, `CancelOrder`,
`RefundOrder` — each with only the collaborators it needs, each testable in isolation, each
named for the caller's intention.

The following is structural pseudocode; constructor parameter names/bodies are omitted.

```text
// before
class OrderFacade { /* 30 methods, 20 dependencies */ }

// after
final class PlaceOrder   { PlaceOrder(BasketRepository, PricingService, StockReservation,
                                      OrderRepository, DomainEvents) { } }
final class CancelOrder  { CancelOrder(OrderRepository, StockReservation, DomainEvents) { } }
final class RefundOrder  { RefundOrder(OrderRepository, PaymentGateway, DomainEvents) { } }
```

For a justified split, weigh the costs:

- _"Now there are twenty classes."_ Independent ownership/testing may repay the extra navigation
  and wiring; if there is no such gain, a small cohesive facade can remain adequate.
- _"Callers must know which class to use."_ Preserve a stable public facade that delegates where
  it still helps consumers. A public split needs compatibility/migration evidence; an internal
  split need not change callers.
- _"Shared setup is duplicated."_ Extract it as a collaborator, not as a base class. Shared
  behaviour through inheritance re-creates the coupling you just removed
  (`java-composition-over-inheritance`).

Shared state or a sequence — a wizard-like flow or a saga's steps — can justify one implementation.
A coherent consumer capability and stable ownership can justify one facade even when its delegated
operations do not share collaborators. Keep that decision tied to actual consumers and change costs.

## The transaction boundary

A facade method is usually where `@Transactional` sits, which makes it responsible for:

- **What commits together.** Atomicity requires the same effective transaction and enlisted
  transactional resource; REQUIRES_NEW, remote services and another manager can split it.
  One legitimate use case can have multiple deliberate transactional steps.
- **How long a connection is held.** A facade method that calls a remote service inside the
  transaction may retain an acquired connection/locks during an HTTP call. Lazy acquisition
  and transaction type matter; observe actual lifetime (`connection-pool-sizing`).
- **What happens to published events.** Events published inside the transaction but delivered
  before commit can be acted on before the data exists (`event-driven-architecture`).

None of these are visible from the method's signature, which is why they belong in review
(`enterprise-transactions`).

## Remote fan-out

```java
public OrderView view(OrderId id, Deadline deadline) {
    // Partial Java method: customer depends on order; these calls are sequential.
    var order    = orders.byId(id, deadline);
    var customer = customers.byId(order.customerId(), deadline);
    var shipping = shipments.forOrder(id, deadline);
    return OrderView.of(order, customer, shipping);
}
```

Three decisions this method silently makes and should make explicitly:

1. **Sequential or concurrent.** Follow dependencies: customer needs order.customerId(), while
   shipping can overlap the order→customer branch. Cooperative cancellation and client timeouts
   remain necessary even with structured concurrency (`structured-concurrency`).
2. **Partial failure.** If `shipments` is down, is the whole view an error, or a view with the
   shipping section absent? Multiplying component availability assumes independent failures;
   shared infrastructure, retries and overload change that model (`scatter-gather`, `failure-models`).
3. **The overall deadline.** Passing the same `deadline` to three sequential calls means the last
   one may have no budget left — correct, and it must be handled rather than surfacing as a
   confusing timeout.
