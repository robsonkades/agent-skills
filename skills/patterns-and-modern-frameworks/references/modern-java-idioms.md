# Modern Java Expression of the Patterns

Examples are partial snippets with application types/imports omitted. Records require Java
16+, sealed classes Java 17+, and the record-pattern switch shown here Java 21+ without
preview. Virtual threads are final in Java 21. `JdbcClient` requires Spring Framework 6.1+;
record embeddables require provider support (Hibernate 6.2+, standardized by Persistence
3.2). Inspect the project's toolchain and resolved dependencies; do not upgrade implicitly.

## Records: where they fit and where they do not

| Use                            | Record?     | Why                                                                          |
| ------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| Value Object (Money, TaxId)    | **Yes**     | Equality by value, immutability, validation in the compact constructor       |
| Embedded Value (`@Embeddable`) | **Yes**     | Supported from Hibernate 6.2                                                 |
| DTO / request / response       | **Yes**     | Shallow carrier; verify serializer names, annotations and wire compatibility |
| Command                        | **Yes**     | Immutable input to a use case                                                |
| Domain event                   | **Yes**     | A fact does not change                                                       |
| Projection / row               | **Yes**     | Constructor expressions and interface-free projections                       |
| Aggregate root                 | **Depends** | An immutable state model can use records; mutable JPA entities cannot        |
| JPA `@Entity`                  | **No**      | Records do not satisfy entity class requirements                             |
| Identity-bearing state         | **Depends** | Distinguish identity from record state equality and replacement semantics    |

Record support for an ordinary embedded value does not establish support for `@EmbeddedId`
or `@IdClass`. The [Hibernate 6.2 introduction](https://docs.hibernate.org/orm/6.2/introduction/html_single/#embeddable-objects)
documents record embeddables alongside an `@EmbeddedId` restriction dated May 2023;
[Persistence 3.2, section 2.4.1](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2#composite-primary-keys)
explicitly permits record primary-key classes. Inspect the exact provider/update and mapping
role instead of extending either statement to every version. Before converting a key, verify
persist/reload and lookup by key, including equality consistent with the mapped database types.

```java
public record Money(BigDecimal amount, Currency currency) {

    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        int digits = currency.getDefaultFractionDigits();
        if (digits < 0) throw new IllegalArgumentException("fraction digits undefined");
        amount = amount.setScale(digits, RoundingMode.UNNECESSARY);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public boolean isLessThan(Money other) {
        requireSameCurrency(other);
        return amount.compareTo(other.amount) < 0;
    }

    private void requireSameCurrency(Money other) {
        Objects.requireNonNull(other);
        if (!currency.equals(other.currency)) throw new IllegalArgumentException("currency mismatch");
    }
}
```

This example uses the currency's default fractional digits as an explicit domain policy;
some pricing or settlement domains need another scale. Canonical scale makes record equality
consistent for amounts such as 1.0 and 1.00; excess nonzero precision is rejected, not rounded.

The compact constructor enforces this example's null/currency/scale policy, not every domain
Money invariant: a nonnegative-balance rule would need separate enforcement. Behaviour on the
type centralizes the currency checks required by these operations.

**The trap:** a record component of a mutable type (`List`, `Map`, array, `Date`) is not
deeply immutable. Copy mutable containers on input/output, or use `List.copyOf` for an
unmodifiable list; that copy is shallow and rejects null elements. Mutable elements need
immutable representations or deeper defensive copies. Array components also retain
reference-based default record equality unless deliberately overridden.

## Sealed types and exhaustive switch

The modern expression of a closed hierarchy — outcomes, states, instrument types:

```java
public sealed interface SettlementResult {
    record Settled(PaymentId payment, Instant at)      implements SettlementResult { }
    record Rejected(RejectionReason reason)            implements SettlementResult { }
    record Pending(Instant retryAfter)                 implements SettlementResult { }
}

// On recompilation, a newly uncovered variant makes this no-default switch incomplete.
String describe(SettlementResult result) {
    return switch (result) {
        case SettlementResult.Settled(var payment, var at) -> "settled by " + payment + " at " + at;
        case SettlementResult.Rejected(var reason)         -> "rejected: " + reason;
        case SettlementResult.Pending(var retryAfter)      -> "pending until " + retryAfter;
    };
}
```

**Where this replaces a classical pattern:**

- **Special Case** where callers must distinguish — a sealed variant plus exhaustive switch
  is better than an `instanceof` check against a null object.
- **Result/outcome types** instead of exceptions for expected business outcomes: the outcome
  is in the signature; callers can still ignore returned values, so API usage needs review.
- **State machines** in the domain, with transitions as methods returning the next state.

**Where it does not replace a pattern:** Plugin discovery and lifecycle still need a mechanism.
A sealed root prevents arbitrary new direct implementations, but it can deliberately permit
an open extension branch. For example, this Java 17+ API keeps the built-in case closed while
allowing third-party implementations of `Handler.Extension`:

```java
public sealed interface Handler permits Handler.BuiltIn, Handler.Extension {
    record BuiltIn() implements Handler { }
    non-sealed interface Extension extends Handler { }
}
```

Keep that branch accessible to plugin code (and export its package when using named modules).
A Java 21 switch covering `BuiltIn` and `Extension` is exhaustive for these branches, even
when another plugin later implements `Extension`. It does not force a separate case for every
plugin class. Choose an open root when arbitrary direct implementations are required; retain
a sealed root with an open branch when that is the intended contract (`enterprise-base-patterns`).
The [Java 21 sealed-type rules](https://docs.oracle.com/javase/specs/jls/se21/html/jls-9.html#jls-9.1.1.4)
distinguish a closed set of direct subtypes from a freely extensible `non-sealed` subinterface.

Omit `default` when requiring each variant to be handled after recompilation. A deliberate
fallback can be appropriate for compatibility, but loses that diagnostic. Separately compiled
clients are not retroactively checked and may throw `MatchException` on a new unmatched
variant. A null selector needs `case null` or an explicit non-null precondition.

## Immutability against JPA's requirements

JPA entity classes require an accessible no-arg constructor and a supported field or
property access strategy. Field access does not require public setters; property access
has accessor requirements. Persistent fields must not be final for portable entities:

```java
@Entity
public class Order {

    @Id private Long id; // typed domain identifiers need a supported identifier mapping
    private Long customerId;
    @Enumerated(STRING) private OrderStatus status;
    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();
    @Version private long version;

    protected Order() { }                     // for the ORM only; not public

    public Order(Long id, Long customerId) {   // enforces the invariants
        this.id = Objects.requireNonNull(id);
        this.customerId = Objects.requireNonNull(customerId);
        this.status = OrderStatus.DRAFT;
    }

    public void confirm(Money creditLimit) {  // a transition, not a setter
        requireDraft();
        if (creditLimit.isLessThan(total())) throw new CreditLimitExceeded(id, creditLimit);
        status = OrderStatus.CONFIRMED;
    }

    public List<OrderLine> lines() { return List.copyOf(lines); } // protects list structure only
}
```

A protected constructor and domain transitions allow a rich JPA entity. The returned list
still exposes child references: restrict child mutators or return immutable projections if
callers must not mutate them. This addresses the setter objection; a separate domain model
can still be justified by lifecycle, boundary or persistence independence requirements
(`data-source-patterns`).

## Optional at boundaries, not in fields

```java
public interface Orders {
    Optional<Order> byId(OrderId id);       // signals absence; callers can still ignore the result
}

@Entity
public class Order {
    private Instant cancelledAt; // Optional<Instant> is not a standard JPA basic mapping
    public Optional<Instant> cancelledAt() { return Optional.ofNullable(cancelledAt); }
}
```

Use Optional primarily for return values signaling absence; fields and parameters are API
design choices, not forbidden Java syntax. Avoid assuming portable JPA persistence or
serialization support for Optional. A Special Case is useful only when absence has genuine
uniform domain behavior (`enterprise-base-patterns`).
The return type expresses intent; it does not enforce caller handling. Review use sites
where dropping the result would violate the operation's contract.

## Virtual threads and the patterns

Virtual threads change the **sizing arithmetic**, not the patterns:

- **Blocking thread-per-task becomes a viable option for I/O-heavy work.** Streaming,
  backpressure, framework integration and existing code can still justify reactive pipelines
  (`reactive-and-virtual-thread-selection`).
- **Connection pools do not scale with threads.** If ten thousand tasks simultaneously
  request one connection each from a saturated pool of 20, up to 9 980 must wait or be rejected.
  The pool is still the bound, and connection hold duration
  still sizes it (`connection-pool-sizing`).
- **Imperative Spring transactions normally use thread-bound resources.** Starting another
  thread does not propagate that transaction; an EntityManager must not be used concurrently.
  A proxy might still reference an open context, which makes cross-thread access unsafe rather
  than automatically detached. Pass immutable data/ids and open the intended transaction in
  the worker. Reactive transaction context follows different rules.
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

This illustrates readable SQL, bound values and typed results; it supplies no row bound or
tenant/access policy. `.list()` collects the returned rows. Use it for an authorized,
bounded cohort, or add the query's required scope and retrieval strategy. Interactive
paging needs a suitable limit and stable order; a small, known all-results use case may
already be adequate. Verify result-column/type mapping, null behavior and the target stack.
Text blocks and `JdbcClient` do not establish lower cost than criteria or derived queries.
Retain an adequate query and compare actual query shape, population and caller contracts
(`query-objects-and-specifications`).

The [Spring Framework 6.2.12 JdbcClient contract](https://github.com/spring-projects/spring-framework/blob/v6.2.12/spring-jdbc/src/main/java/org/springframework/jdbc/core/simple/JdbcClient.java)
and [implementation](https://github.com/spring-projects/spring-framework/blob/v6.2.12/spring-jdbc/src/main/java/org/springframework/jdbc/core/simple/DefaultJdbcClient.java)
support this API illustration; they are source-review baselines, not a target upgrade.

## What not to modernise

- **Do not convert an aggregate to a record merely for syntax.** Preserve identity, mutation
  or immutable replacement semantics, and the persistence contract.
- **Do not close a required plugin extension point.** An open interface or a deliberate
  `non-sealed` branch can preserve it; sealing alone supplies neither discovery nor lifecycle.
- **Do not replace a Domain Model with functions merely for fashion.** Pure functions over
  immutable state can enforce invariants; define the authoritative state and commit boundary.
- **Do not convert a working Transaction Script into a Domain Model** because records and
  sealed types exist. The decision criterion is rule interaction, not language features
  (`domain-logic-organization`).

See [Java 21 pattern switch](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html)
for exhaustiveness and null behavior, and [Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
for entity/access requirements. Structured concurrency APIs remain version-sensitive;
consult the project's target release before adding an API or preview flags.
For absence intent versus enforcement, see [Optional's Java 21 API note](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html)
and [JLS 21 expression statements](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.8),
which allow a method result to be discarded.
