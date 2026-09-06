# Service Boundaries and Responsibilities

## An application service that is doing its job

```java
@Service
public class PlaceOrder {

    private final Orders orders;                 // repository, domain-owned interface
    private final Customers customers;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    PlaceOrder(Orders orders, Customers customers,
               ApplicationEventPublisher events, Clock clock) {
        this.orders = orders;
        this.customers = customers;
        this.events = events;
        this.clock = clock;
    }

    @PreAuthorize("hasAuthority('ORDER_PLACE')")
    @Transactional
    public OrderId place(PlaceOrderCommand command) {
        // Partial sketch: require authorized actor/tenant access to this customer.
        // Resolve authoritative prices or validate an authorized quote; do not trust client prices.
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

The sketch requires configured transaction management and method security, proxy-mediated
invocation and domain validation. A coarse ORDER_PLACE authority alone does not authorize
arbitrary customer IDs. Validate quantities, bounded line counts and pricing provenance.
`Order.confirm` enforces local rules, not a concurrent cross-order credit reservation;
that needs an explicit version/locking/reservation protocol.

Two details matter here:

- **`Clock` is injected**, so the use case is testable and `Instant.now()` never appears
  inside domain logic.
- **ApplicationEventPublisher alone does not promise after-commit or durable delivery.**
  A transactional listener may deliberately run before commit for local transactional work;
  external effects usually need after-commit ordering. An AFTER_COMMIT listener still has a
  crash window and cannot roll back the committed order if it fails. For durable delivery,
  write an outbox entry in the order transaction, then relay with retry/deduplication.
  Check listener phase, fallback and executor configuration (`distribution-boundaries`).

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
state back. In a domain-model design, check whether this bypasses invariant ownership;
a deliberate Transaction Script can legitimately own that logic (`domain-logic-organization`).

## Application service versus domain service

The table describes the domain-model separation used by these examples. A domain service
may use domain-owned ports; a pure calculation needs fewer collaborators than an IO-backed policy.

|               | Application service                          | Domain service                                                     |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Answers       | "run this use case"                          | "what is the correct business outcome, given these domain objects" |
| Knows about   | repositories, ports, transactions, the actor | domain types only                                                  |
| Transaction   | demarcates it                                | never                                                              |
| Framework     | may use it (`@Transactional`, security)      | none                                                               |
| Testing       | fakes plus integration checks for boundaries | unit tests; doubles if domain ports participate                    |
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

This policy shape is a domain-model choice, not the only definition of a domain service.
Validate amount/currency and destination eligibility before mutation. If deposit fails after
withdraw, the Java source object is already changed: database rollback does not undo its
fields. Execute under the intended transaction/concurrency contract and discard failed unit-
of-work objects; do not reuse or publish them. Same-account transfers need explicit semantics.

This example performs no repository or transaction operations.
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

This can be correct when both participate in the same actual transaction and immediate
consistency is required. Lock timing depends on SQL, isolation and lock mode; optimistic
conflict detection requires versioning or another protocol. Eventual coordination can reduce
coupling but adds delivery, retry and reconciliation costs; it is not universally cheaper.

Fixed lock ordering matters here: two use cases that lock the same pair of aggregates in
opposite orders can deadlock under load, and the failure is load-dependent, so it reaches
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

A timeout during reserve may mean the remote reservation succeeded; preserve UNKNOWN outcome
and use operation identity/reconciliation instead of declaring definite non-fulfillment.

The adapter translates `RestClientException`/`SQLException` into a port-level failure; the
service translates that into something the use case's caller can act on. What must not
happen is a `DataAccessException` or an HTTP status reaching the domain, or a
`ResponseEntity` being constructed here (`layering-and-boundaries`).

## Read paths

Read use cases can need authorization, snapshot consistency, orchestration or stable APIs.
Keep a service when it owns those duties; direct query objects/projections can simplify
reads when equivalent enforcement remains. A service does not inherently create a transaction.
Materialize required data within its valid persistence context and bound streams/cursors;
do not return lazy resources whose owning context has already closed.

## Primary references

- [Fowler: Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) — application boundary and coordinated operations.
- [Spring transaction-bound events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html) — listener phases and transaction-context requirements.
- [Spring transactional annotations](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html) — proxy interception and configuration.
