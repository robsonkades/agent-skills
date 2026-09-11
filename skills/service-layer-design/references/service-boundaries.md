# Service Boundaries and Responsibilities

Java examples are partial domain-model/Spring sketches: imports, application types and
configuration are omitted. The `var` loop needs Java 10+; use the target's supported syntax
and resolved Spring/security APIs. Source checks below use Spring Framework 6.2.12 and do
not establish that any project's proxies, security, transactions or delivery are configured.

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

Read the method against the two-column table in the skill body. Its intended responsibilities
are loading, delegating, saving and publishing under a configured transaction/security boundary.
`Order.confirm` owns the local credit-limit decision if its implementation enforces that
contract; this sketch alone does not establish equivalent enforcement on every write path.

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

|             | Application service                          | Domain service                                                     |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Answers     | "run this use case"                          | "what is the correct business outcome, given these domain objects" |
| Knows about | repositories, ports, transactions, the actor | domain types and domain-owned port contracts                       |
| Transaction | demarcates the application unit              | states required consistency; does not own application demarcation  |
| Framework   | may use it (`@Transactional`, security)      | independent under this chosen separation                           |
| Testing     | fakes plus integration checks for boundaries | unit tests; doubles if domain ports participate                    |
| Grouping    | cohesive use case or capability              | domain operation that fits neither entity nor value object         |

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

**Before writing one, check the alternatives**: an object may own the behaviour (with the
other passed as an argument), or the work may be application orchestration. A domain policy
can use a domain-owned lookup port when the decision needs it; specify unavailable/stale
information, latency and concurrency semantics. A fake port can test policy branches without
proving the real adapter or transaction contract.

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

Consistent lock acquisition order reduces cycles for the actual resources and lock modes
covered. Java load order alone may not determine database lock order: generated SQL, indexes,
constraints and lock upgrades matter. It does not prove freedom from all deadlocks, which
can occur with only a few concurrent transactions. Preserve engine-appropriate rollback and
bounded retry handling; inspect actual lock evidence before attributing a failure
(`enterprise-transactions`).

## Translation at the boundary

The service layer is where infrastructure failures become domain-meaningful outcomes.

```java
try {
    inventory.reserve(order.id(), order.lines());
} catch (InventoryRejected e) {             // authoritative rejection: reserve had no effect
    throw new OrderCannotBeFulfilled(order.id(), e);
}
```

`InventoryRejected` is an illustrative port contract, not a framework exception: the adapter
must have authoritative evidence that this operation was rejected without reserving. Do not
classify a timeout, connection loss or generic unavailability this way. Those may follow a
successful remote reservation; preserve UNKNOWN outcome and the original operation identity
for reconciliation or contractually safe replay instead of declaring definite non-fulfillment.

The adapter translates `RestClientException`/`SQLException` into a port-level failure; the
service translates that into something the use case's caller can act on without discarding
outcome certainty or cause. Keep infrastructure/protocol types out of the independent domain
contract. At the application boundary, decide whether a framework type is accepted coupling
or needs adaptation for the actual callers (`layering-and-boundaries`).

## Read paths

Read use cases can need authorization, snapshot consistency, orchestration or stable APIs.
Keep a service when it owns those duties; direct query objects/projections can simplify
reads when equivalent enforcement remains. A service does not inherently create a transaction.
Materialize required data within its valid persistence context and bound streams/cursors;
do not return lazy resources whose owning context has already closed.

## Primary references

- [Fowler: Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) — application boundary and coordinated operations.
- [Evans: Domain-Driven Design Reference (2015), Services and Modules, pp. 14–15](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf) — domain operations and cohesive concepts, not a service-count rule.
- [Cockburn: Ports and Adapters (2005)](https://alistair.cockburn.us/hexagonal-architecture) — technology-independent port contracts; deciding which domain/application owner consumes a port still requires the chosen model.
- [Java SE 10 language specification, enhanced for](https://docs.oracle.com/javase/specs/jls/se10/html/jls-14.html#jls-14.14.2) — `var` in the illustrative loop; framework compatibility is a separate constraint.
- [Spring Framework 6.2.12 transaction-bound listener contract](https://github.com/spring-projects/spring-framework/blob/v6.2.12/spring-tx/src/main/java/org/springframework/transaction/event/TransactionalEventListener.java) — phases, fallback and transaction-context requirements.
- [Spring Framework 6.2.12 event publisher contract](https://github.com/spring-projects/spring-framework/blob/v6.2.12/spring-context/src/main/java/org/springframework/context/ApplicationEventPublisher.java) — publication is a handoff, not a durability promise.
- [Spring Framework 6.2.12 transactional annotations](https://github.com/spring-projects/spring-framework/blob/v6.2.12/framework-docs/modules/ROOT/pages/data-access/transaction/declarative/annotations.adoc) — proxy interception and configuration; verify the actual target version.
- [MySQL 8.4: minimizing and handling deadlocks](https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html) — an engine-specific example of hidden index locks and recovery despite ordering precautions, not a substitute for the target engine's contract.
