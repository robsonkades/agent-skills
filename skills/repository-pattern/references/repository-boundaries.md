# Repository Boundaries

## The domain-owned interface

```java
// package com.acme.orders.domain — no framework imports
public interface Orders {

    Optional<Order> byId(OrderId id);

    /** The domain criterion has a name here, not at every call site. */
    List<Order> overdueFor(CustomerId customer, LocalDate asOf);

    Order save(Order order);

    void remove(Order order);

    OrderId nextIdentity();      // optional preallocated-identity policy in this example
}
```

Five methods, all in domain types, all meaningful to someone who does not know the schema.
`nextIdentity()` supports creation rules that require an identity before persistence. An
application identity service or database-generated identity can also fit; constructor
invariants do not generally require IDs to originate from the repository.

```java
// package com.acme.orders.persistence — the adapter
@Component
class JpaOrders implements Orders {

    private final OrderJpaRepository jpa;      // Spring Data, internal to this package

    JpaOrders(OrderJpaRepository jpa) { this.jpa = jpa; }

    @Override public Optional<Order> byId(OrderId id) {
        return jpa.findById(id.value());
    }

    @Override public List<Order> overdueFor(CustomerId customer, LocalDate asOf) {
        return jpa.findOverdue(customer.value(), asOf);      // one named query
    }

    @Override public Order save(Order order) { return jpa.save(order); }

    @Override public void remove(Order order) { jpa.delete(order); }

    @Override public OrderId nextIdentity() {
        return new OrderId(UUID.randomUUID());
    }
}
```

Partial adapter: supply application types, the query declaration and framework/JDK imports.
This variant deliberately uses JPA-mapped `Order` as the domain aggregate inside the use
case's transaction. `save` returns the instance selected by Spring Data's persist/merge path;
when merge is used, the returned managed instance can differ from the supplied object.
Assigned IDs affect new-entity detection: configure version/Persistable or explicit insert
semantics as appropriate; do not assume non-null UUID means an already persisted row.

The Spring Data interface is package-private to the adapter. Nothing above it can reach
`deleteAll()`, `findAll()` or a `Specification`, and that narrowing — not the theoretical
ability to swap the database — is the concrete benefit of the hand-written interface.

## What the aggregate boundary means for the methods

```text
Order (root)
 ├── OrderLine     ← independent domain mutations go through Order's rules.
 └── ShipmentPlan  ← reached through Order.

Customer (root)    ← a separate aggregate. Order holds a CustomerId, not a Customer.
```

Three consequences:

- **Protect child mutations.** Internal child persistence gateways or cross-order read
  projections are legitimate; reject a public write path that bypasses the order's invariants.
- **Identifier references often clarify aggregate independence.** Object references are not
  forbidden by Repository, but inspect cascade, loading and transaction effects explicitly.
- **Load the state required by the operation's invariants.** This is a consistency boundary,
  not a requirement to fetch or rewrite every physical row eagerly. Lazy loading, targeted
  atomic updates and projections require their own consistency/version contracts.

## Reconstitution and detachment

Reconstitution restores valid lifecycle states that a new-order factory does not create:

```java
public final class Order {

    /** Public creation: enforces the invariants of a new order. */
    public static Order draftFor(Customer customer, Clock clock) { ... }

    /** Reconstitution: trusted, used only by the mapper. Package-private. */
    static Order reconstitute(OrderId id, CustomerId customerId, OrderStatus status,
                              List<OrderLine> lines, long version) { ... }
}
```

Do not weaken the public constructor to let the mapper in. That is how a domain model
acquires a constructor that accepts any state, at which point the invariants are advisory.

The package-private method is accessible only to a mapper in the domain package; an adapter
in another package cannot call it directly. Choose a colocated reconstitution component or
an explicit narrow factory accessible to the adapter. Restore valid persisted state rather
than replaying creation effects, and detect corrupt/incompatible persisted state.

**Object lifetime:** a JPA entity is managed only while associated with its persistence
context; transaction completion need not close an extended context. Detached changes require
an explicit persistence path, while managed changes may flush later. Two defensible positions: accept it and confine
mutation to transactional use cases (the common pragmatic choice), or map to a detached
domain object in the adapter (the Data Mapper position, with its cost)
(`data-source-patterns`). What is not defensible is not knowing which one you have.

## Read models alongside the repository

```java
// Write side: the aggregate, its invariants, its transaction.
public interface Orders { Optional<Order> byId(OrderId id); Order save(Order order); }

// Read side: an application query API; deliberately accepts Spring Data paging here.
public interface OrderQueries {
    Page<OrderSummary> search(OrderSearch criteria, Pageable page);
    Optional<OrderDetailView> detail(OrderId id);
    List<MonthlyTotal> monthlyTotals(Year year);
}
```

This separation can:

- keep the repository small, because screens stop demanding methods from it;
- let reads use projections and joins across aggregate boundaries
  (`query-objects-and-specifications`);
- make the write path's cost visible, because it is no longer serving screen queries.

It requires no CQRS infrastructure — two interfaces over the same database are enough, and
going further is a separate decision with its own drivers.

## When the hand-written interface is not worth it

Be honest about the alternative:

```java
// A CRUD module with no aggregate and no invariant. This is the right amount of code.
public interface CountryRepository extends JpaRepository<Country, String> {
    List<Country> findByRegion(String region);
}
```

If no distinct boundary contract is needed, wrapping this can add needless indirection.
Reasons a hand-written interface can earn its place include:

- The intended domain/application dependency contract excludes persistence framework types.
- The published surface must be narrower than Spring Data's.
- The method names must be domain language, and the mapping to queries is non-trivial.
- The implementation combines several sources (a table plus a cache, a table plus a remote
  system).
- A stable testing seam, domain-specific errors, lifecycle contract or verified
  transaction/authorization interception supplies value even with forwarding methods.

When no distinct contract earns its cost in this module, direct Spring Data is a candidate;
retain an adequate existing boundary when its value is established
(`architecture-decision-making`).

## Testing at the boundary

```java
// Domain and use case tests: an in-memory implementation, no database, no mocks.
final class InMemoryOrders implements Orders {
    private final Map<OrderId, Order> store = new ConcurrentHashMap<>();
    public Optional<Order> byId(OrderId id) { return Optional.ofNullable(store.get(id)); }
    public Order save(Order order) { store.put(order.id(), order); return order; }
    public void remove(Order order) { store.remove(order.id()); }
    public OrderId nextIdentity() { return new OrderId(UUID.randomUUID()); }
    public List<Order> overdueFor(CustomerId c, LocalDate asOf) { ... }
}
```

A hand-written fake is useful for behavioral scenarios, but this partial map stores aliases:
mutating a returned Order changes stored state without save. ConcurrentHashMap does not make
the aggregate thread-safe or implement rollback, optimistic versioning or atomic use cases.
Choose copying versus identity semantics to match the tested contract; share relevant contract
tests with the real adapter. A mock can be sufficient when only a narrow interaction matters.

Claims about the adapter's actual mapping, SQL and transaction behavior need relevant
provider/database integration evidence; an in-memory fake does not establish those contracts
(`architecture-testing`). A narrow naming, interaction or boundary review can reuse adequate
existing evidence without adding a full database test campaign.

## Sources

- [Fowler: Repository](https://martinfowler.com/eaaCatalog/repository.html)
- [Spring Data JPA 4.1.1: persisting entities](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/entity-persistence.adoc)
- [Spring Data JPA 4.1.1: transactionality](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/transactions.adoc)
