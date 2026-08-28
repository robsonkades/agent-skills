# Repository Misuse

## The layered nothing

```text
OrderController
    └── OrderService              save() → repository.save()
        └── OrderRepository       save() → jpaRepository.save()
            └── OrderJpaRepository extends BaseRepository<Order, Long>
                └── BaseRepository extends JpaRepository<T, ID>
                    └── SimpleJpaRepository
                        └── EntityManager
```

Six hops, one behaviour. Each layer was added for a reason that sounded like architecture:
the service "for the transaction", the repository "for the domain", the base repository "for
the common methods".

**Detection:** for each layer, name a behaviour it adds. Layers that only forward are
identified in one pass by looking for methods whose body is a single delegating call.

```bash
# Rough but effective: methods whose entire body is one delegated call.
grep -rn -A2 "public .* save(" src/main/java | grep -B1 "return .*\.save(.*);"
```

**Fix:** delete inward-out. Remove the base repository (it can only offer what every entity
shares); remove the hand-written repository if it does not narrow, translate or rename;
remove the service methods that only forward (`service-layer-design`). Keep the layer that
demarcates the transaction and the layer that maps.

## The generic repository

```java
public interface GenericRepository<T, ID> {
    Optional<T> findById(ID id);
    List<T> findAll();
    T save(T entity);
    void delete(T entity);
    List<T> findByExample(T probe);
}
```

**Why it cannot work:** its methods are the intersection of what every entity supports, so
it offers CRUD and nothing an aggregate actually needs. Every real requirement — "overdue
orders for this customer" — must be added elsewhere, so the generic base becomes a tax paid
for nothing plus a second mechanism.

**Worse:** `findAll()` on an aggregate with a million rows is now a published, callable
method, and `delete` bypasses whatever the domain says about deletion.

**Fix:** delete it. Per-aggregate interfaces with the four to eight methods that aggregate
actually needs are shorter in total and say something.

## Business verbs on the repository

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Modifying
    @Query("update Order o set o.status = 'CANCELLED' where o.dueDate < :date and o.status = 'OPEN'")
    int cancelExpired(@Param("date") LocalDate date);      // ← a business rule, in SQL,
}                                                           //   in the data layer
```

The rule "an order expires when its due date passes and it is still open" now lives in a
JPQL string. It cannot be unit tested, it does not run the aggregate's cancellation logic,
it does not emit the event cancellation should emit, and it does not increment the version
(`offline-concurrency-control`).

**Fix:** the use case selects, then the aggregate decides.

```java
@Transactional
public int cancelExpired(LocalDate asOf) {
    var expired = orders.openWithDueDateBefore(asOf);    // repository: a query
    expired.forEach(order -> order.cancel(clock));        // domain: the rule
    return expired.size();
}
```

**When the bulk statement is nevertheless right:** millions of rows, where loading is not
viable. Then keep it, and name it for what it is — a bulk operation in a gateway, with its
version handling and its bypassed invariants documented
(`domain-logic-organization`).

## A repository for a child entity

```java
public interface OrderLineRepository extends JpaRepository<OrderLine, Long> { }
```

Its existence means a line can be loaded, changed and saved without the order's rules
running: quantities that break the credit limit, lines added to a shipped order, totals that
no longer match.

**Detection:** a repository whose entity has a `@ManyToOne` to an aggregate root and is
never used outside that aggregate's own operations.

**Fix:** delete it; go through the root. If code genuinely needs to query lines across
orders — a report of best-selling products — that is a read model, not a repository
(`query-objects-and-specifications`).

## Leaked framework types

```java
// In a domain-owned interface — the domain now depends on Spring Data.
public interface Orders {
    Page<Order> findAll(Specification<Order> spec, Pageable pageable);
}
```

The abstraction is decorative: every caller imports Spring Data, and swapping the
implementation would break all of them.

**Fix:** if the interface is domain-owned, express paging and criteria in domain terms (a
query object, a simple `PageRequest` record of your own). If that feels like pointless
translation, the honest conclusion is that this module does not need a domain-owned
interface — use Spring Data directly (`repository-boundaries.md`).

## Leaked managed entities

```java
var order = orders.byId(id).orElseThrow();     // managed
return order;                                   // ...to a controller, outside the transaction
```

Downstream: a lazy association fails during serialisation; a mutation after the transaction
is silently lost; a mutation inside one is silently persisted. All three are surprising, and
all three are the consequence of the same leak.

**Fix:** map to a DTO or projection inside the transaction
(`remote-facade-and-dto`), or return a detached domain object from the adapter.

## Check-then-act

```java
if (!customers.existsByEmail(email)) {      // ← another transaction can insert here
    customers.save(new Customer(email));
}
```

**Fix:** the unique constraint is the enforcement; the check is only for the message.

```java
try {
    customers.save(new Customer(email));
} catch (DataIntegrityViolationException e) {
    throw new EmailAlreadyRegistered(email, e);    // translate at the adapter boundary
}
```

## The audit, in order

1. **One repository per aggregate root?** Count repositories, count roots. A difference is
   the first thing to explain.
2. **Any business verb in a repository method name?** Each is a rule in the wrong layer.
3. **Any framework type in a domain-owned interface?** Each makes the abstraction
   decorative.
4. **Any layer that only forwards?** Delete it.
5. **Any `existsBy` immediately followed by a `save`?** Each is a race.
6. **Do reads go through the repository?** If the slow screens do, the read model is
   missing.
7. **Is `deleteAll` / `findAll` reachable from a controller?** The surface is wider than
   anyone intended.

Each finding has a small, safe fix. Do them one at a time with tests, not as a "data layer
refactor" (`architecture-refactoring-paths`).
