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

**Inspect:** reachable `findAll()` can permit an unbounded read, and `delete` can bypass
domain deletion rules. Check the actual authorized caller, population bounds and mutation
contract; intentionally bounded CRUD/admin capabilities are not automatically defects.

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

**When the bulk statement is appropriate:** set-shaped work whose explicit contract and
measured cost favor supported JPQL/Criteria/SQL or another bulk API. There is no minimum row
count that decides this. The adapter must enforce the required eligibility/invariants, concurrency
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

This interface couples its callers to Spring Data. That violates a promised
framework-independent domain boundary, but does not by itself make every other contract
decorative or mean every adapter replacement changes callers.

**Fix when independence is required:** express paging and criteria in domain/application
types (a query object or a suitable paging value). If coupling is intentionally accepted,
retain any useful error/testing/lifecycle seam; direct Spring Data is another candidate when
no distinct contract remains (`repository-boundaries.md`).

## Leaked managed entities

```java
var order = orders.byId(id).orElseThrow();     // managed
return order;                                   // ...to a controller, outside the transaction
```

Possible consequences: an uninitialized association fails after context closure, detached
changes are not tracked, or later flush persists unintended managed changes. Inspect the
actual context lifetime and flush/write policy; these are risks, not inevitable outcomes.

**Fix:** obtain required lazy state while its owning context is usable, then map an explicit
DTO/projection (`remote-facade-and-dto`), or return a suitable detached domain object.
Mapping already-materialized independent values can happen after context/transaction
completion; an annotation's location alone does not establish loaded state or safe lifetime.

## Check-then-act

```java
if (!customers.existsByEmail(email)) {      // ← another transaction can insert here
    customers.save(new Customer(email));
}
```

Without effective serialization of all relevant contenders, this precheck can become stale
before the insert. Inspect the actual protocol, transaction isolation, key scope and retry
behavior; an annotation or one process's lock is not proof that other writers are excluded.

**Fix when the check is unprotected:** use a database constraint with the required
normalization/collation and null policy; prefer that durable safeguard even when another
protocol also serializes contenders. The precheck alone is advisory. A uniqueness or
serialization failure may occur on save, flush or transaction commit.

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
3. **Any framework type in a domain-owned interface?** Compare it with the intended
   independence/capability contract; document intentional coupling.
4. **Any layer that only forwards?** Check its contract, dependencies and interception before deletion.
5. **Any `existsBy` immediately followed by a `save`?** Inspect complete contender
   serialization, constraints and commit/retry scope before calling it a race.
6. **Are reads slow?** Inspect SQL, fetch volume and hydration; consider a projection/query path.
7. **Is `deleteAll` / `findAll` reachable from a controller?** Verify intended authorization,
   population/cost bounds and domain mutation rules before narrowing the surface.

For a confirmed defect, give the evidence, consequence and smallest justified correction,
with checks for the affected contract. Preserve adequate designs; some questions need only
a supported no-change conclusion or a named evidence gap (`architecture-refactoring-paths`).

## Sources

- [Spring Data JPA 4.1.1 transaction boundaries](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/transactions.adoc)
- [Spring Data JPA 4.1.1 lock metadata](https://github.com/spring-projects/spring-data-jpa/blob/4.1.1/src/main/antora/modules/ROOT/pages/jpa/locking.adoc)
- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2) — entity lifecycle, flush and bulk-update semantics.
