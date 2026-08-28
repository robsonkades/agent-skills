# Structural Base Patterns

## Layer Supertype

A common superclass for all types in a layer, holding what genuinely all of them need.

```java
@MappedSuperclass
public abstract class AggregateRoot<ID> {

    @Version private long version;

    public abstract ID id();
    public long version() { return version; }

    @Override public final boolean equals(Object other) {
        return other instanceof AggregateRoot<?> that
            && getClass() == other.getClass()
            && Objects.equals(id(), that.id());
    }

    @Override public final int hashCode() { return getClass().hashCode(); }
}
```

Identity semantics, equality and the version. Every aggregate root needs all three, so the
supertype earns its place — and centralising `equals`/`hashCode` fixes a defect that is
otherwise written wrongly per entity (`orm-behavioral-patterns`).

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

Declare the interface in the package that **uses** it; implement it elsewhere.

```text
com.acme.orders.domain
    Orders.java              ← interface, owned by the domain
com.acme.orders.persistence
    JpaOrders.java           ← implementation, depends on the domain
```

The dependency now points from persistence to domain, not the reverse. This one placement
rule is most of what ports and adapters means, and stating it as a small pattern
demystifies the style (`layering-and-boundaries`).

**Cost:** the implementation is not discoverable from the interface without tooling, and
wiring is by configuration rather than by construction. Both are acceptable at a real
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

**Costs:** dependencies vanish from constructors, so a class's real requirements are
invisible; tests become order-dependent and must remember to reset it; and concurrent access
needs care. In an application with dependency injection, almost every use is avoidable.

**The remaining legitimate uses:** a static utility that genuinely cannot be injected;
rehydrating a serialised object that must reconnect to services; and a plugin lookup at
startup. In those cases keep it thread-safe, make it replaceable in tests, and keep it small.

`ApplicationContext.getBean()` inside business code is the same pattern with the framework's
name on it, and carries the same costs (`layering-and-boundaries`).

## Special Case

A subclass providing behaviour for a particular case, so callers stop branching.

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

```text
Optional<T>     at a boundary, where the caller must decide what absence means.
Special Case    inside the model, where absence has uniform, real behaviour.
Null            never.
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

**The condition that justifies it:** more than one implementation exists, or one is
scheduled. With a single implementation you have bought an interface, a factory, a
configuration key, a wiring test and a runtime failure mode (misconfiguration), in exchange
for nothing.

**Costs even when justified:** the actual behaviour is not determinable from the code alone;
a misconfiguration fails at startup if you are lucky and at first use if you are not; and
every implementation needs its own tests plus a test that the selection works.

Fail fast on an unknown value — a plugin mechanism that silently falls back to a default is
how a production deployment quietly runs the wrong tax rules.

## Record Set and Value Object in modern Java

Two patterns whose modern forms are worth naming:

**Record Set** — an in-memory representation of tabular data, the natural companion to Table
Module. In Java there is no first-class record set, and the practical equivalent is a
`List<SomeRow>` of records plus SQL that does the set work. Attempting to simulate a rich
record set in Java produces something worse than either objects or SQL
(`domain-logic-organization`).

**Value Object** — an object whose identity is its value. Java records give equality,
immutability and a constructor to validate in:

```java
public record TaxId(String digits) {
    public TaxId {
        Objects.requireNonNull(digits);
        if (!digits.matches("\\d{11}|\\d{14}")) throw new InvalidTaxId(digits);
    }
}
```

The validation in the compact constructor is what makes it a value object rather than a
wrapper: an invalid `TaxId` cannot exist, so no caller needs to check
(`orm-structural-mapping` for how it is stored).

## Choosing, quickly

| You are about to…               | Ask                                                             |
| ------------------------------- | --------------------------------------------------------------- |
| Add a base class                | Does _every_ subtype need every member?                         |
| Add an interface                | Is there an inversion or a second implementation?               |
| Add a registry or static holder | Can this be injected instead?                                   |
| Add a null object               | Is the behaviour identical for every caller?                    |
| Add a plugin point              | Does a second implementation exist or is one scheduled?         |
| Add a mapper                    | Must both sides remain ignorant of each other?                  |
| Wrap an external system         | Yes — and translate its types and its errors, not just its URL. |
