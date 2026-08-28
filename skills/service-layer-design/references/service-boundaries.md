# Service Boundaries and Responsibilities

## An application service that is doing its job

```java
@Service
public class PlaceOrder {

    private final Orders orders;                 // repository, domain-owned interface
    private final Customers customers;
    private final InventoryPort inventory;       // port; adapter calls another system
    private final ApplicationEventPublisher events;
    private final Clock clock;

    PlaceOrder(Orders orders, Customers customers, InventoryPort inventory,
               ApplicationEventPublisher events, Clock clock) {
        this.orders = orders;
        this.customers = customers;
        this.inventory = inventory;
        this.events = events;
        this.clock = clock;
    }

    @PreAuthorize("hasAuthority('ORDER_PLACE')")
    @Transactional
    public OrderId place(PlaceOrderCommand command) {
        Customer customer = customers.byId(command.customerId())
            .orElseThrow(() -> new UnknownCustomer(command.customerId()));

        Order order = Order.draftFor(customer, clock);          // domain decides
        for (var line : command.lines()) {
            order.addLine(line.product(), line.quantity(), line.unitPrice());
        }
        order.confirm(customer.creditLimit());                  // invariant lives here

        orders.save(order);
        events.publishEvent(new OrderPlaced(order.id(), order.total(), Instant.now(clock)));
        return order.id();
    }
}
```

Read the method against the two-column table in the skill body. Every line is transaction
demarcation, authorisation, loading, delegating, saving or publishing. No line decides a
business question: `Order.confirm` decides whether the credit limit permits the order, and
if it does not, no caller can proceed by accident.

Two details that are easy to get wrong and are load-bearing here:

- **`Clock` is injected**, so the use case is testable and `Instant.now()` never appears
  inside domain logic.
- **The event is published inside the transaction** but must be consumed after commit.
  Publishing to an external broker from inside the transaction is the dual-write bug: the
  transaction can still roll back after the message is gone. Either the listener runs after
  commit, or the message goes through an outbox written in the same transaction
  (`distribution-boundaries`).

## What the service must not become

```java
// The rule has moved. Order is now a data holder and every other caller
// that confirms an order must remember to repeat this.
@Transactional
public OrderId place(PlaceOrderCommand command) {
    Order order = new Order();
    order.setCustomerId(command.customerId());
    order.setLines(map(command.lines()));

    BigDecimal total = order.getLines().stream()
        .map(l -> l.getUnitPrice().multiply(BigDecimal.valueOf(l.getQuantity())))
        .reduce(BigDecimal.ZERO, BigDecimal::add);

    if (total.compareTo(customer.getCreditLimit()) > 0) {   // ← the invariant, out here
        throw new CreditLimitExceeded();
    }
    order.setStatus("CONFIRMED");
    order.setTotal(total);
    orders.save(order);
    return order.getId();
}
```

The mechanical tell: the service reads entity state, branches on it, and writes entity
state back. That triple is business logic in the wrong layer, regardless of how the classes
are named (`domain-logic-organization`).

## Application service versus domain service

|               | Application service                          | Domain service                                                     |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Answers       | "run this use case"                          | "what is the correct business outcome, given these domain objects" |
| Knows about   | repositories, ports, transactions, the actor | domain types only                                                  |
| Transaction   | demarcates it                                | never                                                              |
| Framework     | may use it (`@Transactional`, security)      | none                                                               |
| Testing       | with fakes for ports                         | pure unit test, no doubles needed                                  |
| Typical count | one per use case; many                       | few; some systems have none                                        |

A domain service is justified when a rule genuinely belongs to no single object:

```java
// Domain service: the policy is about two aggregates and belongs to neither.
public final class TransferPolicy {

    public Transfer prepare(Account source, Account target, Money amount) {
        if (!source.currency().equals(target.currency())) {
            throw new CurrencyMismatch(source.currency(), target.currency());
        }
        source.withdraw(amount);          // each aggregate still enforces its own rules
        target.deposit(amount);
        return new Transfer(source.id(), target.id(), amount);
    }
}
```

Note what it does not do: no repository, no transaction, no clock lookup, no persistence.
The application service loads both accounts, calls this, and saves — and that separation is
what makes the policy testable without a database.

**Before writing one, check the alternatives**: the behaviour usually belongs on one of the
objects (with the other passed as an argument), or it is really a use case and belongs in
the application service. Domain services that turn out to be neither become the anaemic
model's hiding place.

## Orchestrating more than one aggregate

Two aggregates in one transaction is a decision, not a default:

```java
@Transactional
public void settle(InvoiceId invoiceId, PaymentId paymentId) {
    Invoice invoice = invoices.byId(invoiceId).orElseThrow();
    Payment payment = payments.byId(paymentId).orElseThrow();

    settlement.apply(invoice, payment);     // domain service decides
    invoices.save(invoice);
    payments.save(payment);
}
```

This is correct when both aggregates are in the same database and the consistency must be
immediate. It costs a lock on both for the transaction's duration and a real chance of
`OptimisticLockException` under contention (`offline-concurrency-control`). Where the
consistency requirement is actually "eventually, and reliably", one aggregate plus an event
is the cheaper and more available design.

Fixed lock ordering matters here: two use cases that lock the same pair of aggregates in
opposite orders deadlock under load, and the failure is load-dependent, so it reaches
production.

## Translation at the boundary

The service layer is where infrastructure failures become domain-meaningful outcomes.

```java
try {
    inventory.reserve(order.id(), order.lines());
} catch (InventoryUnavailable e) {          // adapter already translated the transport
    throw new OrderCannotBeFulfilled(order.id(), e);
}
```

The adapter translates `RestClientException`/`SQLException` into a port-level failure; the
service translates that into something the use case's caller can act on. What must not
happen is a `DataAccessException` or an HTTP status reaching the domain, or a
`ResponseEntity` being constructed here (`layering-and-boundaries`).

## Read paths

Application services are a write-side construct. A list screen or a report does not need
one: it needs a query, and routing it through a use case object adds a transaction it does
not want and a mapping it does not need. Use a query object or a projection directly
(`query-objects-and-specifications`), and reserve the service layer for operations that
change something.
