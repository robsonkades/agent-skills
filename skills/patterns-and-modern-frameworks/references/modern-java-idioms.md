# Modern Java Expression of the Patterns

## Records: where they fit and where they do not

| Use                                 | Record? | Why                                                                          |
| ----------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Value Object (Money, TaxId)         | **Yes** | Equality by value, immutability, validation in the compact constructor       |
| Embedded Value (`@Embeddable`)      | **Yes** | Supported from Hibernate 6.2                                                 |
| DTO / request / response            | **Yes** | Immutable carrier; component names are the wire contract                     |
| Command                             | **Yes** | Immutable input to a use case                                                |
| Domain event                        | **Yes** | A fact does not change                                                       |
| Projection / row                    | **Yes** | Constructor expressions and interface-free projections                       |
| Aggregate root                      | **No**  | Identity plus mutable state; JPA needs a no-arg constructor and field access |
| JPA `@Entity`                       | **No**  | Same                                                                         |
| Anything with an identity lifecycle | **No**  | Equality by value is wrong for entities                                      |

```java
public record Money(BigDecimal amount, Currency currency) {

    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        if (amount.scale() > currency.getDefaultFractionDigits()) {
            throw new IllegalArgumentException("scale exceeds " + currency);
        }
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public boolean isLessThan(Money other) {
        requireSameCurrency(other);
        return amount.compareTo(other.amount) < 0;      // never equals() on BigDecimal
    }
}
```

Two details that make this a value object rather than a wrapper: validation in the compact
constructor, so an invalid instance cannot exist; and behaviour on the type, so callers stop
writing currency checks.

**The trap:** a record component of a mutable type (`List`, `Map`, array, `Date`) is not
immutable. Copy in the constructor and return a copy from the accessor, or use
`List.copyOf`.

## Sealed types and exhaustive switch

The modern expression of a closed hierarchy — outcomes, states, instrument types:

```java
public sealed interface SettlementResult {
    record Settled(PaymentId payment, Instant at)      implements SettlementResult { }
    record Rejected(RejectionReason reason)            implements SettlementResult { }
    record Pending(Instant retryAfter)                 implements SettlementResult { }
}

// Exhaustive: adding a variant is a compile error at every switch. That is the feature.
String describe(SettlementResult result) {
    return switch (result) {
        case Settled(var payment, var at) -> "settled by " + payment + " at " + at;
        case Rejected(var reason)         -> "rejected: " + reason;
        case Pending(var retryAfter)      -> "pending until " + retryAfter;
    };
}
```

**Where this replaces a classical pattern:**

- **Special Case** where callers must distinguish — a sealed variant plus exhaustive switch
  is better than an `instanceof` check against a null object.
- **Result/outcome types** instead of exceptions for expected business outcomes: the outcome
  is in the signature and cannot be forgotten.
- **State machines** in the domain, with transitions as methods returning the next state.

**Where it does not replace a pattern:** Plugin. A sealed hierarchy is closed by definition;
a plugin point must be open to implementations the compiler has not seen. Do not seal
something you intend to extend at configuration time
(`enterprise-base-patterns`).

Do not add a `default` branch to a switch over a sealed type. It silently absorbs future
variants, which is exactly the compile error you sealed the type to obtain.

## Immutability against JPA's requirements

JPA requires a no-arg constructor and access to fields. Neither requires setters, and this
is the most consequential misconception in enterprise Java:

```java
@Entity
public class Order {

    @Id private OrderId id;
    @Enumerated(STRING) private OrderStatus status;
    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private final List<OrderLine> lines = new ArrayList<>();
    @Version private long version;

    protected Order() { }                     // for the ORM only; not public

    public Order(OrderId id, CustomerId customerId) {   // enforces the invariants
        this.id = Objects.requireNonNull(id);
        this.customerId = Objects.requireNonNull(customerId);
        this.status = OrderStatus.DRAFT;
    }

    public void confirm(Money creditLimit) {  // a transition, not a setter
        requireDraft();
        if (total().isGreaterThan(creditLimit)) throw new CreditLimitExceeded(id, creditLimit);
        status = OrderStatus.CONFIRMED;
    }

    public List<OrderLine> lines() { return List.copyOf(lines); }   // no mutable escape
}
```

No public setters, no mutable collection escaping, a protected constructor for the ORM, and
state changes expressed as domain transitions. This is a rich domain model that is also a
JPA entity, and it removes the usual justification for a separate domain model
(`data-source-patterns`).

## Optional at boundaries, not in fields

```java
public interface Orders {
    Optional<Order> byId(OrderId id);       // the caller must decide about absence
}

@Entity
public class Order {
    private Instant cancelledAt;             // NOT Optional<Instant> — not serialisable,
                                              // and not a field type
    public Optional<Instant> cancelledAt() { return Optional.ofNullable(cancelledAt); }
}
```

Return type: yes. Field or parameter: no. Inside a model where absence has uniform
behaviour, a Special Case variant beats both (`enterprise-base-patterns`).

## Virtual threads and the patterns

Virtual threads change the **sizing arithmetic**, not the patterns:

- **Thread-per-request is the sensible default again**, which removes the main non-domain
  reason to write reactive pipelines
  (`reactive-and-virtual-thread-selection`).
- **Connection pools do not scale with threads.** Ten thousand virtual threads against a
  pool of 20 means 9 980 waiting; the pool is still the bound, and transaction duration
  still sizes it (`connection-pool-sizing`).
- **Transactions and the persistence context remain thread-bound.** Handing an entity to
  another thread hands over a proxy with no usable session, virtual or not.
- **`synchronized` pinning is resolved from JDK 24** (JEP 491), so advice to replace
  `synchronized` with `ReentrantLock` for pinning reasons is obsolete on current runtimes
  (`virtual-threads-internals`; verify the target JDK).
- **Fan-out becomes cheap and therefore tempting.** A structured concurrency scope makes
  partial-failure handling explicit; a bounded fan-out is still required, because the
  downstream's capacity has not changed (`structured-concurrency`).

## Text blocks and `JdbcClient` for gateways

```java
return db.sql("""
        SELECT o.id, o.status, o.placed_at, c.name AS customer_name
          FROM customer_order o
          JOIN customer c ON c.id = o.customer_id
         WHERE o.status = :status
         ORDER BY o.placed_at DESC
        """)
    .param("status", status.name())
    .query(OrderSummary.class)
    .list();
```

Readable SQL, bound parameters, a record result. Table Data Gateway is more attractive in
current Java than it has ever been, and this is worth knowing when the alternative is a
criteria query that expresses the same thing worse
(`query-objects-and-specifications`).

## What not to modernise

- **Do not make an aggregate a record** to be "modern". Identity and mutation are the point.
- **Do not seal a hierarchy that is a plugin point.**
- **Do not replace a Domain Model with functions** because functions are fashionable; the
  invariant needs an owner, and a function has no state to own.
- **Do not convert a working Transaction Script into a Domain Model** because records and
  sealed types exist. The decision criterion is rule interaction, not language features
  (`domain-logic-organization`).
