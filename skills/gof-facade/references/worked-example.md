# Worked example: a checkout facade

## Before — the sequence, repeated

```java
// in the REST controller
var basket = basketRepository.load(basketId);
var tariff = tariffResolver.resolve(basket.customerId());
basketValidator.validate(basket, tariff);
var reservation = stockReservation.reserve(basket.lines());
var priced = pricingService.price(basket, tariff);
var order = orderFactory.from(basket, priced, reservation);
orderRepository.save(order);
domainEvents.publish(order.events());
```

The same eight lines appear in the controller, in an admin tool, and in a scheduled job that
converts abandoned baskets. Three copies, and they have already diverged: the scheduled job
forgot `basketValidator`, so it creates orders that the controller would have rejected.

The knowledge being duplicated is the **order of operations** and the fact that all of it is one
unit. That is what a facade is for.

## After

```java
@Service
public class PlaceOrder {

    private final BasketRepository baskets;
    private final TariffResolver tariffs;
    private final BasketValidator validator;
    private final StockReservation stock;
    private final PricingService pricing;
    private final OrderRepository orders;
    private final DomainEvents events;

    @Transactional
    public OrderId place(BasketId basketId) {
        var basket = baskets.load(basketId);
        var tariff = tariffs.resolve(basket.customerId());
        validator.validate(basket, tariff);

        var reservation = stock.reserve(basket.lines());
        var order = Order.from(basket, pricing.price(basket, tariff), reservation);

        orders.save(order);
        events.publish(order.events());
        return order.id();
    }
}
```

Seven collaborators — at the top of the acceptable range, and a signal to watch. One method, one
intention, one transaction.

## What deliberately did not move in

```java
// stayed in the domain
public static Order from(Basket basket, PricedBasket priced, Reservation reservation) {
    if (priced.total().isGreaterThan(basket.customer().creditLimit())) {
        throw new CreditLimitExceeded(basket.customerId(), priced.total());
    }
    ...
}
```

The credit-limit rule is a decision about an order, so it lives on `Order`. Had it gone into
`place()`, the rule would be unenforced for every other path that creates an order — including
the migration script written next quarter (`domain-logic-organization`).

The distinction to hold: the facade knows **what happens in what order**; the domain knows
**what is allowed**.

## The transaction boundary, made explicit

`@Transactional` on `place` fixes three things:

- The order and the stock reservation commit together. That is intended — a reserved stock line
  with no order is a leak that only a reconciliation job would find.
- A database connection is held for the whole method. `pricingService` must therefore be local;
  when it later became an HTTP call, the transaction was split so the remote call happens before
  it opens (`connection-pool-sizing`).
- `events.publish` inside the transaction means listeners must run after commit, or they will act
  on data that may roll back. Here it enqueues to an outbox written in the same transaction
  (`event-driven-architecture`).

None of that is visible in the signature, which is why it is written down beside it.

## The split when the second use case arrived

Six months later the class had `place`, `cancel`, `refund`, `resendConfirmation` and
`exportForAccounting`, and twelve constructor parameters. `exportForAccounting` shared no
collaborator with `place`.

```java
final class PlaceOrder  { /* 7 collaborators */ }
final class CancelOrder { CancelOrder(OrderRepository, StockReservation, DomainEvents) { } }
final class RefundOrder { RefundOrder(OrderRepository, PaymentGateway, DomainEvents) { } }
final class ExportOrdersForAccounting { ExportOrdersForAccounting(OrderQueries, CsvWriter) { } }
```

The signal that triggered it was not the line count: it was that a test for `cancel` had to stub
`pricingService` and `basketValidator`, neither of which `cancel` calls. Test setup complaining
about collaborators a method does not use is the cheapest available detector of a class doing two
jobs.

Note that `ExportOrdersForAccounting` takes `OrderQueries`, not `OrderRepository`: a read-shaped
use case does not need the write model, and giving it one invites a report to load and mutate
aggregates (`query-objects-and-specifications`).

## The remote variant

The read side of the same domain aggregates three services:

```java
public OrderView view(OrderId id, Deadline deadline) {
    try (var scope = StructuredTaskScope.open()) {
        var order    = scope.fork(() -> orders.byId(id, deadline));
        var customer = scope.fork(() -> customers.byId(id, deadline));
        var shipping = scope.fork(() -> shipments.forOrder(id, deadline));
        scope.join();

        return OrderView.of(order.get(), customer.get(),
                            shipping.state() == SUCCESS ? shipping.get() : Shipping.unavailable());
    }
}
```

Three decisions made explicitly, none of which the sequential version made:

- **Concurrent**, so latency is the slowest call rather than the sum
  (`structured-concurrency`).
- **Partial failure is a product decision.** The order and the customer are required; shipping
  degrades to "unavailable" rather than failing the page. Without this the view's availability is
  the product of three services' — three dependencies at 99.9% give 99.7%
  (`failure-models`).
- **One deadline is passed down**, so the whole view is bounded even if every dependency is slow.

If this aggregation later moves out of the process, it becomes a backend-for-frontend: a deployed
component with its own scaling, authentication and outage surface. That is a different thing from
this class, and calling both "the order facade" is how a network hop becomes invisible in design
discussions.

## What the facade bought

```text
Before                              After
──────────────────────────────────  ────────────────────────────────────
sequence duplicated in 3 callers    one place; the job's missing
                                      validation is now impossible
transaction boundary implicit and   one @Transactional, reviewed
  different per caller
adding a step means finding all     one edit
  callers
testing a caller requires the       callers depend on one intention
  whole subsystem
```

What got worse: reading the controller no longer tells you what happens on checkout. That is the
trade — acceptable because the sequence is stable and the name states the intention.
