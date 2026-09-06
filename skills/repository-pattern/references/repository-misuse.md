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

**Detection:** name each layer's behavior or dependency/contract boundary. A forwarding body
is a candidate for inspection, not proof of redundancy; transaction proxies and narrow ports
can have identical delegation code.

```bash
# Candidate search only; inspect annotations, callers and interface ownership too.
rg -n 'return .*\.save\(' src/main/java
```

**Fix:** remove only proven redundant layers, preserving domain dependency direction,
capabilities, transaction/authorization interception and error semantics. A shared internal
base can be legitimate; verify callers before removing it (`service-layer-design`).

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

**Risk:** a mandatory generic surface gives every aggregate capabilities it may not permit,
while hiding meaningful domain queries behind another mechanism. A narrow internal generic
base can still reduce real duplication; judge what consumers can call, not the type parameters.

**Worse:** `findAll()` on an aggregate with a million rows is now a published, callable
method, and `delete` bypasses whatever the domain says about deletion.

**Fix:** narrow the exposed interfaces to required capabilities; retain a shared implementation
only if it earns its cost. There is no correct universal number of repository methods.

## Business verbs on the repository

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Modifying
    @Query("update Order o set o.status = 'CANCELLED' where o.dueDate < :date and o.status = 'OPEN'")
    int cancelExpired(@Param("date") LocalDate date);      // ← a business rule, in SQL,
}                                                           //   in the data layer
```

The rule "an order expires when its due date passes and it is still open" now lives in a
JPQL string. Its database behavior needs integration testing; it does not run the aggregate's cancellation logic,
it does not emit the event cancellation should emit, and it does not increment the version
(`offline-concurrency-control`).

**Fix:** the use case selects, then the aggregate decides.

```java
@Transactional
public int cancelExpired(LocalDate asOf) {
    var expired = orders.openWithDueDateBefore(asOf);    // bounded selection in this example
    expired.forEach(order -> {
        order.cancel(clock);                           // domain: the rule
        orders.save(order);                            // explicit repository write contract
    });
    return expired.size();
}
```

Partial use-case snippet: use a bounded batch and a real intercepted transaction. For
managed JPA aggregates, dirty checking can make save redundant; an independent-domain-object
adapter needs its explicit write path. Define concurrent eligibility/version checks and
persist outgoing event intent atomically where required; do not perform irreversible remote
effects merely because an annotation appears on this method.

**When the bulk statement is nevertheless right:** millions of rows, where loading is not
viable. Then a bulk gateway must enforce the required eligibility/invariants, concurrency
and event/audit semantics by an equivalent mechanism. Documenting bypassed rules is not a
substitute for enforcing them. Flush relevant pending changes before bulk DML and reconcile
the stale persistence context/cache afterward; JPQL bulk does not automatically version rows
(`domain-logic-organization`).

## A repository for a child entity

```java
public interface OrderLineRepository extends JpaRepository<OrderLine, Long> { }
```

If independently callable for mutation, this broad interface can bypass the order's rules:
quantities that break the credit limit, lines added to a shipped order or inconsistent totals.
An adapter-internal gateway or read-only projection does not imply such a write path exists.

**Detection:** trace actual consistency rules and write callers. `@ManyToOne` describes a
mapping, not proof of an aggregate boundary; cross-aggregate associations can use it too.

**Fix:** close independent child mutation paths that bypass invariants. Keep necessary
internal gateways and read projections, including cross-order reports, under an explicit
read contract; whether Spring Data names that interface Repository is immaterial
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

Possible consequences: an uninitialized association fails after context closure, detached
changes are not tracked, or later flush persists unintended managed changes. Inspect the
actual context lifetime and flush/write policy; these are risks, not inevitable outcomes.

**Fix:** map to a DTO or projection inside the transaction
(`remote-facade-and-dto`), or return a detached domain object from the adapter.

## Check-then-act

```java
if (!customers.existsByEmail(email)) {      // ← another transaction can insert here
    customers.save(new Customer(email));
}
```

**Fix:** use a database constraint with the required normalization/collation and null policy;
the precheck is only advisory. The failure may occur on save, flush or transaction commit.

```java
try {
    // Partial: transaction runner owns this complete transaction, including commit.
    transactions.executeWithoutResult(status -> customers.save(new Customer(email)));
} catch (RuntimeException e) {
    if (!isViolationOf(e, "uq_customer_email")) throw e;
    throw new EmailAlreadyRegistered(email, e);
}
```

`isViolationOf` must inspect the deployed driver's/provider's exception chain and the exact
constraint identity, not classify every integrity failure as duplicate email. Run translation
after rollback; do not continue using a failed transaction. If this call joins an outer
transaction, commit occurs outside this catch and translation belongs at that outer boundary.

## The audit, in order

1. **Do write paths respect aggregate consistency?** Distinguish domain repositories,
   internal gateways and read-only projections before judging counts.
2. **Any business verb in a repository method name?** Inspect whether it hides policy or
   implements an explicit domain-defined operation with equivalent safeguards.
3. **Any framework type in a domain-owned interface?** Each makes the abstraction
   decorative.
4. **Any layer that only forwards?** Check its contract, dependencies and interception before deletion.
5. **Any `existsBy` immediately followed by a `save`?** Each is a race.
6. **Are reads slow?** Inspect SQL, fetch volume and hydration; consider a projection/query path.
7. **Is `deleteAll` / `findAll` reachable from a controller?** The surface is wider than
   anyone intended.

Each finding has a small, safe fix. Do them one at a time with tests, not as a "data layer
refactor" (`architecture-refactoring-paths`).

## Sources

- [Spring Data JPA transaction boundaries](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html)
- [Spring Data JPA lock metadata](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html)
- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2) — entity lifecycle, flush and bulk-update semantics.
