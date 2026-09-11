# Structural Base Patterns

## Layer Supertype

A common superclass for all types in a layer, holding what genuinely all of them need.

```java
@MappedSuperclass
public abstract class AggregateRoot<ID> {

    @Version private long version;

    public abstract ID id();
    public long version() { return version; }
}
```

This partial JPA sketch is justified only for roots sharing this identity accessor and
optimistic-version policy. Equality is deliberately not centralised: two unassigned ids must
not make distinct transient entities equal, and runtime `getClass()` checks can conflict with
ORM proxies. Choose and test identity across transient, persisted, detached and proxied states
with `java-object-contracts`; a shared superclass alone provides no equality guarantee.

**How it fails:** accretion.

```java
public abstract class BaseService {
    @Autowired protected EntityManager em;              // now every service has one
    protected void audit(String action) { ... }         // used by 3 of 20 subclasses
    protected <T> T retry(Supplier<T> work) { ... }     // used by 2
    protected LocalDate today() { ... }                 // hides an injected Clock
}
```

Every subclass now depends on the union of everyone's needs, `em` is reachable from classes
that should not touch it, and `today()` makes time untestable. The rule that prevents this:
**a member may live in the supertype only if every subtype needs it.** Anything else is a
collaborator to inject.

## Separated Interface

Separate the interface from its implementation. Caller-owned placement is useful when
inverting a dependency:

```text
com.acme.orders.domain
    Orders.java              ← interface, owned by the domain
com.acme.orders.persistence
    JpaOrders.java           ← implementation, depends on the domain
```

The dependency now points from persistence to domain, not the reverse. An independently owned
contract module is another valid location when several consumers/providers share a stable API.
Check the actual dependency graph and compatibility obligations before moving it
(`layering-and-boundaries`).

**Cost:** the implementation is not discoverable from the interface without tooling, and
wiring must be explicit, through manual construction or configuration. Both are acceptable at a real
boundary and pure friction at a fake one — an interface with one implementation, no
inversion, and no seam is a file (`enterprise-architecture-smells`).

## Registry

A well-known object other objects use to find common services.

```java
// A registry: a global with a nicer name.
public final class ServiceRegistry {
    private static final Map<Class<?>, Object> SERVICES = new ConcurrentHashMap<>();
    public static <T> T get(Class<T> type) { return type.cast(SERVICES.get(type)); }
}
```

**Costs of this static locator:** dependencies vanish from constructors, so a class's real requirements are
invisible; tests become order-dependent and must remember to reset it; and concurrent access
needs care. In an application with dependency injection, almost every use is avoidable.

**Distinguish scoped lookup:** an injected plugin registry can legitimately select by a runtime
key while keeping the lookup dependency visible. Prefer direct injection for fixed collaborators;
where ambient lookup is unavoidable, keep it narrow and replaceable in tests. For either form,
define key/tenant scope, missing-entry behavior, mutation and who closes providers. Protect actual
compound operations when shared; `ConcurrentHashMap` alone does not define lifecycle or isolation.

`ApplicationContext.getBean()` inside business code is the same pattern with the framework's
name on it, and carries the same costs (`layering-and-boundaries`).

## Special Case

A type providing behaviour for a particular case, so callers stop branching.

```java
public sealed interface Customer permits RegisteredCustomer, GuestCustomer {
    Money discountFor(Money amount);
    boolean canPayOnAccount();
}

public record GuestCustomer() implements Customer {
    @Override public Money discountFor(Money amount) { return Money.zero(amount.currency()); }
    @Override public boolean canPayOnAccount() { return false; }
}
```

Twenty callers stop writing `if (customer == null || !customer.isRegistered())`.

**The condition that justifies it:** the special case's behaviour is **the same for every
caller**. When callers need to know it is special — different messages, different flows,
different authorisation — Special Case makes things worse: they will test with `instanceof`,
which is worse than an explicit `Optional`.
Establish the case first: a known guest is different from an unresolved customer lookup.
Do not convert a failure into guest privileges or silently change authorization behavior.

```text
Optional<T>     at a boundary, where the caller must decide what absence means.
Special Case    inside the model, where absence has uniform, real behaviour.
Null            only where the existing interop contract requires it;
                handle it explicitly before business use.
```

A modern refinement: a sealed interface plus exhaustive `switch` gives Special Case's
polymorphism _and_ compile-checked handling where callers do need to distinguish
(`patterns-and-modern-frameworks`).

## Plugin

Link an implementation chosen at configuration time rather than at compile time.

```java
public interface TaxCalculator { Money taxFor(Order order); }

@Component @ConditionalOnProperty(name = "acme.tax.region", havingValue = "BR")
class BrazilTaxCalculator implements TaxCalculator { ... }

@Component @ConditionalOnProperty(name = "acme.tax.region", havingValue = "PT")
class PortugalTaxCalculator implements TaxCalculator { ... }
```

**The condition that justifies it:** a concrete configuration-time variation or supported
external extension contract. One bundled implementation can be enough for a public SPI whose
providers are deployed independently. A private switch with no such requirement may simply add
wiring and misconfiguration costs; compare direct construction and preserve published contracts.

**Costs even when justified:** the actual behaviour is not determinable from the code alone;
a misconfiguration fails at startup if you are lucky and at first use if you are not; and
every implementation needs its own tests plus a test that the selection works.

For this tax selector, reject an unknown region rather than silently changing tax rules.
Test supported, missing and ambiguous selection against the declared contract, including any
explicit default, and identify provider initialization and cleanup ownership.

## Record Set and Value Object in modern Java

Two patterns whose modern forms are worth naming:

**Record Set** — an in-memory representation of tabular data, the natural companion to Table
Module. JDBC includes `RowSet` and disconnected `CachedRowSet`; typed application code often
uses `List<SomeRow>` records plus SQL for set operations. Choose based on tabular API needs,
mapping and bounded memory rather than claiming Java lacks record-set support
(`domain-logic-organization`).

**Value Object** — an object whose identity is its value. Java records give equality,
shallow immutability and a constructor to validate in; mutable components still need defensive
ownership. This example validates a deliberately narrow legacy digit-only format:

```java
public record TaxId(String digits) {
    public TaxId {
        Objects.requireNonNull(digits);
        if (!digits.matches("\\d{11}|\\d{14}")) throw new InvalidTaxId(digits);
    }
}
```

This constructor excludes null and wrong-shaped strings; it does not validate check digits,
registration, ownership or every jurisdiction's identifier format. Value semantics do not
require a nontrivial validator. Name the accepted format and add its actual invariants before
claiming a valid tax identifier
(`orm-structural-mapping` for how it is stored).

## Choosing, quickly

| You are about to…               | Ask                                                         |
| ------------------------------- | ----------------------------------------------------------- |
| Add a base class                | Does _every_ subtype need every member?                     |
| Add an interface                | What dependency, API or extension contract does it protect? |
| Add a registry or static holder | Is lookup required, and what owns its scope and lifetime?   |
| Add a null object               | Is the behaviour identical for every caller?                |
| Add a plugin point              | Is there a concrete variation or supported external SPI?    |
| Add a mapper                    | Must both sides remain ignorant of each other?              |
| Wrap an external system         | What isolation or policy is missing from the existing seam? |

## Sources

- [Separated Interface](https://martinfowler.com/eaaCatalog/separatedInterface.html): separating contract from implementation; caller-package placement is not universal.
- [Java 25 ServiceLoader](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ServiceLoader.html): independently deployed providers, selection with zero/one/many providers and configuration failures; not a requirement to adopt this loader.
- [Java 17 CachedRowSet](https://docs.oracle.com/en/java/javase/17/docs/api/java.sql.rowset/javax/sql/rowset/CachedRowSet.html): disconnected tabular data support.
- [Java 17 Record](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html): shallow immutability and component-derived equality.
