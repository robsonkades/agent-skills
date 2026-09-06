# Worked example: a checkout facade

Local examples are Java 17/Spring partial snippets with project domain/port types. The transaction
contract below assumes an external call through the configured Spring proxy and one database
transaction manager. The remote example has a separate Java 25 preview requirement.

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

    public PlaceOrder(BasketRepository baskets, TariffResolver tariffs, BasketValidator validator,
                      StockReservation stock, PricingService pricing, OrderRepository orders,
                      DomainEvents events) {
        this.baskets = baskets;
        this.tariffs = tariffs;
        this.validator = validator;
        this.stock = stock;
        this.pricing = pricing;
        this.orders = orders;
        this.events = events;
    }

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

Seven collaborators serving one intention; assess coherence rather than an acceptable count.
One effective transaction is an explicit assumption, not a consequence of one method.

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

For this local example, verify these contracts before relying on `@Transactional`:

- Stock reservation, order save and outbox insertion use the same enlisted database transaction,
  with rollback configured for the relevant failures. A remote stock service cannot be rolled
  back by this annotation; it needs its own idempotency/recovery design.
- Acquired database connections and locks may remain through subsequent calls. Keep remote
  pricing outside the transaction when feasible, then revalidate price/version-sensitive
  assumptions within the write boundary; moving the call alone can introduce a stale-price race
  (`connection-pool-sizing`).
- `DomainEvents.publish` here means inserting an outbox row in that transaction, not immediate
  external publication. A dispatcher delivers after commit with retry/idempotency. Synchronous
  local listeners can be valid if their effects participate in rollback; after-commit callbacks
  alone do not guarantee durable delivery
  (`event-driven-architecture`).

None of that is visible in the signature, which is why it is written down beside it.

## The split when the second use case arrived

Six months later the class had `place`, `cancel`, `refund`, `resendConfirmation` and
`exportForAccounting`, and twelve constructor parameters. `exportForAccounting` shared no
collaborator with `place`.

```text
// Structural pseudocode, not Java constructor declarations.
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

The read side aggregates three services. This Java 25 preview partial method requires
`javac --release 25 --enable-preview` and `java --enable-preview`, plus imports for Duration,
StructuredTaskScope and its Joiner. Do not enable preview without project authorization.
Deadline is a project abstraction using a monotonic remaining budget; ports honor it and
interruption. OrderCustomer is a local pair record; DeadlineExpired is a project runtime exception
for an exhausted input budget. ShippingUnavailable is the explicitly
recoverable remote-unavailability exception; cancellation, authorization and programming errors
must not be converted into missing shipping.

```java
public OrderView view(OrderId id, Deadline deadline) throws InterruptedException {
    Duration remaining = deadline.remaining();
    if (remaining.isZero() || remaining.isNegative()) {
        throw new DeadlineExpired();
    }
    try (var scope = StructuredTaskScope.open(
            Joiner.<Object>awaitAllSuccessfulOrThrow(), config -> config.withTimeout(remaining))) {
        var required = scope.fork(() -> {
            var order = orders.byId(id, deadline);
            return new OrderCustomer(order, customers.byId(order.customerId(), deadline));
        });
        var shipping = scope.fork(() -> {
            try {
                return shipments.forOrder(id, deadline);
            } catch (ShippingUnavailable unavailable) {
                return Shipping.unavailable();
            }
        });
        scope.join();
        return OrderView.of(required.get().order(), required.get().customer(), shipping.get());
    }
}
```

Three decisions made explicitly, none of which the sequential version made:

- **Concurrent branches**, with order→customer sequential within the required branch. Latency
  follows approximately max(order + customer, shipping) plus scheduling, join and cleanup
  (`structured-concurrency`).
- **Partial failure is a product decision.** The order and the customer are required; shipping
  degrades only on the named recoverable failure, before it can fail the default fail-fast joiner.
  Required failures still fail the view. Multiplying availability assumes independent failures;
  shared dependencies and this fallback policy change the result
  (`failure-models`).
- **One deadline is passed down and a scope timeout cancels outstanding tasks.** InterruptedException
  propagates; scope timeout/failure remains visible. Scope close waits for child termination, so
  uncooperative clients can exceed the budget. Require transport deadlines and cancellation tests.

If this aggregation moves out of process, it becomes a remote boundary with its own scaling,
authentication and outage surface. It is a backend-for-frontend when tailored to a particular
frontend. Name those responsibilities alongside its facade role so the network hop stays visible.

## What the facade bought

```text
Before                              After
──────────────────────────────────  ────────────────────────────────────
sequence duplicated in 3 callers    one path for routed callers;
                                      validate bypass paths separately
transaction boundary implicit and   one @Transactional, reviewed
  different per caller
adding a step means finding all     one edit
  callers
testing a caller requires the       callers depend on one intention
  whole subsystem
```

What got worse: reading the controller no longer tells you what happens on checkout. That is the
trade — acceptable because the sequence is stable and the name states the intention.

Primary contracts: [Spring transactional invocation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
and [JDK 25 StructuredTaskScope](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html).
