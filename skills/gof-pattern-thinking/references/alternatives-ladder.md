# The alternatives ladder

Each rung is defined by the force it resolves and the force it does **not**. Climb only when the
current rung fails a force you can name.

## Rung definitions

| Rung                    | Resolves                                                             | Fails to resolve                                                                 |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0 Nothing               | Everything, when the variation is hypothetical                       | Duplication that has already appeared three times                                |
| 1 Language feature      | Closed variant sets, value semantics, exhaustiveness at compile time | Variants supplied by code you do not compile                                     |
| 2 Composition           | Reuse without a substitutability claim; independent lifecycles       | Selecting _which_ collaborator at runtime                                        |
| 3 Function value        | One-axis behavioural variation, per-call selection                   | Variants with state, multiple operations, or a name worth having in stack traces |
| 4 Dependency injection  | Wiring, lifecycle, test substitution                                 | Selection that depends on the _argument_, not on the deployment                  |
| 5 Configuration         | Variation whose content is data                                      | Variation whose content is control flow                                          |
| 6 Framework mechanism   | Cross-cutting composition the framework already orders and observes  | Domain-shaped variation the framework has no concept of                          |
| 7 GoF pattern           | Independent variation across two collaborating roles                 | Anything that crosses a process boundary                                         |
| 8 Architectural pattern | Boundaries, consistency, failure, deployment                         | Object-level collaboration inside one component                                  |

Two rungs deserve their own warning:

- **Rung 3 is not a demotion of rung 7.** A lambda passed as a `PricingRule` _is_ Strategy; the
  design intent survives, the class hierarchy does not. Say "Strategy, as a function" in the
  review — the name is how the next reader recognises the shape.
- **Rung 5 is the most under-used.** A large share of "Strategy" and "Abstract Factory"
  hierarchies in enterprise code encode values — a rate, a limit, a URL, a retry count — as
  types. When every implementation differs only in constants, the design wanted a table.

## Worked elimination 1 — Strategy collapses to a function value

Proposed: `interface DiscountStrategy` with `PercentageDiscount`, `FixedDiscount`,
`NoDiscount`.

```java
// Rung 7 as proposed
public interface DiscountStrategy {
    Money apply(Money subtotal);
}
```

Each implementation is one expression, holds no collaborators, and is selected per order. The
axis is one; the variants are stateless. Rung 3 resolves the same force:

```java
public record Discount(String code, UnaryOperator<Money> rule) {
    static Discount percentage(String code, BigDecimal pct) {
        return new Discount(code, m -> m.minus(m.times(pct)));
    }
    static Discount none() { return new Discount("NONE", UnaryOperator.identity()); }
}
```

**When this elimination is wrong:** if a discount must also expose `description()`,
`isApplicableTo(Order)` and a serialised form, it is a multi-operation role — keep the
interface. A function value with three companions bolted on is a worse interface.

## Worked elimination 2 — Abstract Factory collapses to dependency injection

Proposed: `PersistenceFactory` with `PostgresPersistenceFactory` and `InMemoryPersistenceFactory`,
each creating a matched `OrderRepository` + `CustomerRepository` + `UnitOfWork`.

The force is _family consistency_: never a Postgres repository beside an in-memory unit of work.
In a container-managed application, consistency already comes from the wiring: one
`@Configuration` per profile creates the matched set, and no code can mix them because no code
constructs them. Rung 4 resolves it, and the factory interface adds a level of indirection that
only the container would ever call.

**When this elimination is wrong:** when the family must be chosen _per request_ (per tenant,
per region, per document format), the container cannot decide it — the selection is data-driven
at runtime, and a factory keyed by that data is the honest structure.

## Worked elimination 3 — State collapses to a language feature

Proposed: `OrderState` interface with eight implementations, each with `pay()`, `ship()`,
`cancel()` throwing where illegal.

The variant set is closed and owned. A sealed hierarchy plus an exhaustive `switch` on the
transition gives the same behaviour and adds compile-time proof that no transition was
forgotten:

```java
sealed interface OrderState permits Draft, Paid, Shipped, Cancelled {}

static OrderState onPayment(OrderState current) {
    return switch (current) {
        case Draft d -> new Paid(clock.instant());
        case Paid p -> throw new IllegalTransition(p, "pay");
        case Shipped s -> throw new IllegalTransition(s, "pay");
        case Cancelled c -> throw new IllegalTransition(c, "pay");
    };
}
```

**When this elimination is wrong:** when states are contributed by plugins, or when each state
carries substantial behaviour of its own rather than just a transition table. Then the closed
set is a lie and the switch becomes a god method (`gof-state`).

## Worked elimination 4 — Chain of Responsibility collapses to a framework mechanism

Proposed: a hand-rolled `Handler` chain for authentication, rate limiting, tenant resolution and
audit on inbound HTTP.

The framework already owns request-scoped composition, ordering, exception translation and
observability. A hand-rolled chain re-implements ordering badly and is invisible to the
framework's metrics and tracing. Rung 6 resolves it: servlet filters or `HandlerInterceptor`,
ordered explicitly.

**When this elimination is wrong:** when the chain is a _domain_ pipeline — underwriting rules,
fraud checks, document transforms — with a domain-shaped result. Frameworks have no concept of
that, and forcing it into filters couples business rules to the transport.

## Worked elimination 5 — Singleton collapses to nothing at all

Proposed: `ConfigManager.getInstance()`, because "configuration should exist once".

Uniqueness was never the requirement; _access_ was. One instance created at the composition root
and injected gives uniqueness as a consequence of wiring, keeps the type testable, and removes
the initialisation-order and visibility questions the static holder introduces. Rung 4, or rung
0 if the value can simply be passed.

**When this elimination is wrong:** when uniqueness must hold for code that cannot be injected
into — a JVM-wide agent, a `ServiceLoader` provider, an enum constant used as a strategy token.
Those are narrow and identifiable (`gof-singleton`).

## Worked elimination that failed — Decorator stayed

Proposed: retry, timeout, metrics and caching around an outbound client.

Rung 6 was tried first: the HTTP client builder supplies timeouts and metrics, so those two came
off the ladder immediately. Retry and caching remained, and both had to be **composable in an
order the caller chooses** — caching outside retry means a cached failure; retry outside caching
means the cache is consulted once per attempt. No lower rung expresses "same interface, stacked,
order-significant". Decorator stayed, and the order was documented as part of the contract
(`gof-decorator`).

The lesson generalises: a pattern survives the ladder when the force is _composition of
same-shaped behaviour whose order carries meaning_, or _independent variation across two roles_.
Otherwise a lower rung usually wins.
