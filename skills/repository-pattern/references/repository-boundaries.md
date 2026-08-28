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

    OrderId nextIdentity();      // identity generation is the collection's job
}
```

Five methods, all in domain types, all meaningful to someone who does not know the schema.
`nextIdentity()` is the under-used one: it lets the aggregate be fully constructed before it
is saved, which is what makes it possible to enforce invariants in a constructor.

```java
// package com.acme.orders.persistence — the adapter
@Component
class JpaOrders implements Orders {

    private final OrderJpaRepository jpa;      // Spring Data, internal to this package
    private final EntityManager em;

    @Override public Optional<Order> byId(OrderId id) {
        return jpa.findById(id.value());
    }

    @Override public List<Order> overdueFor(CustomerId customer, LocalDate asOf) {
        return jpa.findOverdue(customer.value(), asOf);      // one named query
    }

    @Override public Order save(Order order) { return jpa.save(order); }

    @Override public OrderId nextIdentity() {
        return new OrderId(UuidCreator.getTimeOrderedEpoch());
    }
}
```

The Spring Data interface is package-private to the adapter. Nothing above it can reach
`deleteAll()`, `findAll()` or a `Specification`, and that narrowing — not the theoretical
ability to swap the database — is the concrete benefit of the hand-written interface.

## What the aggregate boundary means for the methods

```text
Order (root)
 ├── OrderLine     ← reached through Order. No OrderLineRepository.
 └── ShipmentPlan  ← reached through Order.

Customer (root)    ← a separate aggregate. Order holds a CustomerId, not a Customer.
```

Three consequences:

- **No repository for `OrderLine`.** If one exists, lines can be loaded and modified without
  the order's invariants running, and the aggregate is decorative.
- **References across aggregates are identifiers**, not object references. `Order` holding a
  `Customer` invites loading both, locking both and writing both in one transaction.
- **The repository returns the whole aggregate.** Partial loading of an aggregate for a
  write is how invariants get checked against incomplete state; partial loading for a _read_
  is fine, and it should go through a projection rather than the repository.

## Reconstitution and detachment

Loading must be able to produce states the public constructor forbids:

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

**Detachment:** with a JPA-backed repository the returned object is managed, so a caller
mutating it after the use case will either silently persist the change or silently lose it,
depending on whether a transaction is open. Two defensible positions: accept it and confine
mutation to transactional use cases (the common pragmatic choice), or map to a detached
domain object in the adapter (the Data Mapper position, with its cost)
(`data-source-patterns`). What is not defensible is not knowing which one you have.

## Read models alongside the repository

```java
// Write side: the aggregate, its invariants, its transaction.
public interface Orders { Optional<Order> byId(OrderId id); Order save(Order order); }

// Read side: shaped for the screen. Not a repository, and not pretending to be one.
public interface OrderQueries {
    Page<OrderSummary> search(OrderSearch criteria, Pageable page);
    Optional<OrderDetailView> detail(OrderId id);
    List<MonthlyTotal> monthlyTotals(Year year);
}
```

This separation is the highest-value structural decision in this area. It:

- keeps the repository small, because screens stop demanding methods from it;
- lets reads use projections and joins with no regard for the aggregate boundary
  (`query-objects-and-specifications`);
- makes the write path's cost visible, because it is no longer serving reads;
- requires no CQRS infrastructure — two interfaces over the same database is enough, and
  going further is a separate decision with its own drivers.

## When the hand-written interface is not worth it

Be honest about the alternative:

```java
// A CRUD module with no aggregate and no invariant. This is the right amount of code.
public interface CountryRepository extends JpaRepository<Country, String> {
    List<Country> findByRegion(String region);
}
```

Wrapping this in a domain-owned interface plus an adapter adds two files, two indirections
and one mock per test, in exchange for nothing. The hand-written interface earns its place
when at least one of these is true:

- The domain must not depend on the persistence framework (there is a real domain model).
- The published surface must be narrower than Spring Data's.
- The method names must be domain language, and the mapping to queries is non-trivial.
- The implementation combines several sources (a table plus a cache, a table plus a remote
  system).

None of those true, in this module? Use Spring Data directly and record why
(`architecture-decision-making`).

## Testing at the boundary

```java
// Domain and use case tests: an in-memory implementation, no database, no mocks.
final class InMemoryOrders implements Orders {
    private final Map<OrderId, Order> store = new ConcurrentHashMap<>();
    public Optional<Order> byId(OrderId id) { return Optional.ofNullable(store.get(id)); }
    public Order save(Order order) { store.put(order.id(), order); return order; }
    public OrderId nextIdentity() { return new OrderId(UUID.randomUUID()); }
    public List<Order> overdueFor(CustomerId c, LocalDate asOf) { ... }
}
```

A hand-written fake beats a mocking framework here: it enforces the interface's real
semantics (save then find returns the object), it is written once, and it does not silently
pass when the interface changes.

The adapter itself needs an integration test against a real database — that is where the
mapping, the query and the transaction actually exist, and where an in-memory fake proves
nothing (`architecture-testing`).
