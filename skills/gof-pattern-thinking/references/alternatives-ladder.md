# The alternatives ladder

Each rung is defined by the force it resolves and the force it does **not**. Start with the
existing/direct implementation and compare materially relevant alternatives, including different
ownership or extension contracts. Rungs overlap and are not a measured cost ordering; there is no
need to visit every rung or stop at the first viable one. Examples are partial: Discount uses
Java 17, while pattern-switch state dispatch requires Java 21 without preview. Money, domain
states/exceptions and imports are project-specific; inspect the target baseline before choosing a mechanism.

## Rung definitions

| Rung                    | Resolves                                                              | Fails to resolve                                                         |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0 Nothing               | Existing implementation already satisfies the forces                  | Demonstrated change, compatibility or ownership problems                 |
| 1 Language feature      | Closed variant sets, value semantics, exhaustiveness at compile time  | Variants supplied by code you do not compile                             |
| 2 Composition           | Delegation with explicit ownership; independent roles                 | Does not by itself define selection or lifecycle policy                  |
| 3 Function value        | Single-operation behavior; can capture state/collaborators            | Multiple operations or an explicit identity/lifecycle may need an object |
| 4 Dependency injection  | Wiring, scopes and substitution, including injected runtime selectors | Does not itself define selection policy or family consistency            |
| 5 Configuration         | Variation whose content is data                                       | Variation whose content is control flow                                  |
| 6 Framework mechanism   | Established lifecycle/extension point                                 | Must verify ordering, error handling, coverage and observability         |
| 7 GoF pattern           | A documented collaboration addressing concrete forces                 | Does not supply distributed delivery/failure guarantees                  |
| 8 Architectural pattern | Boundaries, consistency, failure, deployment                          | Object-level collaboration inside one component                          |

Two rungs deserve their own warning:

- **Rung 3 is not a demotion of rung 7.** A lambda passed as a `PricingRule` _is_ Strategy; the
  design intent survives, the class hierarchy does not. Say "Strategy, as a function" in the
  review — the name is how the next reader recognises the shape.
- **Rung 5 needs a change policy.** If implementations differ only in constants, compare a
  value/table/enum or validated configuration with the existing types. Preserve supported identities,
  invariants and approval/rollout controls. External configuration and runtime reload add ownership
  and failure modes; neither follows merely from the variation being data.

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
axis is one; the rules need no mutable per-call state. Rung 3 resolves the same force:

```java
public record Discount(String code, UnaryOperator<Money> rule) {
    public Discount {
        Objects.requireNonNull(code);
        Objects.requireNonNull(rule);
    }
    static Discount percentage(String code, BigDecimal pct) {
        Objects.requireNonNull(pct);
        if (pct.signum() < 0 || pct.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("fraction must be between 0 and 1");
        }
        return new Discount(code, m -> m.minus(m.times(pct)));
    }
    static Discount none() { return new Discount("NONE", UnaryOperator.identity()); }
}
```

Here pct is an immutable captured fraction (0.20 means 20%), so the lambda is not capture-free.
Money must define currency, rounding, negative-subtotal and null policies. A record does not make
an arbitrary captured rule thread-safe or provide useful value equality/serialization for lambdas.
Imports: BigDecimal, Objects and UnaryOperator. Validate money semantics in the target domain.

**When this elimination is wrong:** if a discount must also expose `description()`,
`isApplicableTo(Order)` and a serialised form, it is a multi-operation role — keep the
interface. A function value with three companions bolted on is a worse interface.

## Worked elimination 2 — Abstract Factory collapses to dependency injection

Proposed: `PersistenceFactory` with `PostgresPersistenceFactory` and `InMemoryPersistenceFactory`,
each creating a matched `OrderRepository` + `CustomerRepository` + `UnitOfWork`.

The force is _family consistency_: never a Postgres repository beside an in-memory unit of work.
A container can select a deployment-wide matched configuration, but profiles and qualifiers do
not prove family consistency: combinations can be active together and resources can use different
transaction managers. Verify allowed configurations, shared resource identity and wiring tests.
If selection is deployment-wide, a factory only called by the container may add no useful seam.

**When this elimination is wrong:** when the family must be chosen _per request_ (per tenant,
per region, per document format), use an injected selector/factory/registry with an explicit policy.
DI can wire that runtime collaboration; it is not an alternative that makes runtime choice impossible.

## Worked elimination 3 — State collapses to a language feature

Proposed: `OrderState` interface with four implementations, each with `pay()`, `ship()`,
`cancel()` throwing where illegal.

The variant set is closed and owned. A sealed hierarchy plus an exhaustive `switch` on the
transition checks coverage of the static state type for this operation. It does not prove legal
transitions, side effects, concurrency or coverage of other events:

```java
sealed interface OrderState permits Draft, Paid, Shipped, Cancelled {}

static OrderState onPayment(OrderState current, Clock clock) {
    Objects.requireNonNull(clock);
    return switch (Objects.requireNonNull(current)) {
        case Draft d -> new Paid(clock.instant());
        case Paid p -> throw new IllegalTransition(p, "pay");
        case Shipped s -> throw new IllegalTransition(s, "pay");
        case Cancelled c -> throw new IllegalTransition(c, "pay");
    };
}
```

**When this elimination is wrong:** when states are contributed by plugins, or when each state
carries substantial behaviour of its own rather than just a transition table. Then the closed
set is inappropriate for plugins; substantial state-owned behavior can justify dispatch even when
closed. Add a transition matrix test and preserve serialized/public contracts (`gof-state`).

## Worked elimination 4 — Chain of Responsibility collapses to a framework mechanism

Proposed: a hand-rolled `Handler` chain for authentication, rate limiting, tenant resolution and
audit on inbound HTTP.

Inspect the framework extension points before duplicating their lifecycle and composition.
For authentication/authorization, use Spring Security or an appropriately ordered servlet filter
chain; MVC HandlerInterceptor is not an equivalent security boundary because handler/path matching
can differ. Select hooks for rate limiting, tenant context and audit from required dispatch coverage,
async/error handling, context cleanup and ordering; observability is not automatic.

**When this elimination is wrong:** when the chain is a _domain_ pipeline — underwriting rules,
fraud checks, document transforms — with a domain-shaped result. Frameworks have no concept of
that, and forcing it into filters couples business rules to the transport.

## Worked elimination 5 — Singleton collapses to nothing at all

Proposed: `ConfigManager.getInstance()`, because "configuration should exist once".

Uniqueness was never the requirement; _access_ was. One instance created at the composition root
and injected can give the required scoped sharing and explicit ownership. Correct static holder
initialization is safe under Java class initialization; mutable contents still need synchronization
in either design. Multiple containers/class loaders may create separate instances. Rung 4, or rung
0 if the value can simply be passed.

**When this elimination is wrong:** when an explicit globally reachable instance or canonical token
within a class-loader scope is the actual contract. State the scope and access constraint.
Each ServiceLoader instance maintains its own provider caches; two instances using the same class
loader do not thereby share a provider instance. Discovery does not establish JVM-wide uniqueness;
actual provider construction, ownership and plugin lifecycles need separate evidence (`gof-singleton`).

## Worked elimination that failed — Decorator stayed

Proposed: retry, timeout, metrics and caching around an outbound client.

Rung 6 is checked first: inspect the actual HTTP client, request factory, timeout configuration
and enabled observation/metrics integration. A builder alone proves none of these guarantees;
verify the required timeout phases and emitted observations before treating those responsibilities
as supplied by the framework. If those checks pass, retry and caching may remain, both **composable in an
order the caller chooses**. Cache outside retry checks once before the retry sequence; retry
outside cache can check each attempt. Either caches failures only if the cache policy does so.
Define eligible results/errors, keys, TTL and duplicate-safe retry before selecting order.
Function composition or framework wrappers can also implement Decorator; a named class stack
is useful when explicit configuration, lifecycle or diagnostics justify it. Document and test the order
(`gof-decorator`).

The lesson generalises: a pattern survives the ladder when the force is _composition of
same-shaped behaviour whose order carries meaning_, or _independent variation across two roles_.
Other stable collaboration or boundary requirements can justify a pattern too; do not turn these
examples into an exhaustive list of acceptable motives.

Primary sources: [Java 21 pattern switch](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html),
[JLS 17 lambda capture](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.27.2),
[ServiceLoader 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ServiceLoader.html),
and [Spring MVC interceptor security boundary](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/interceptors.html).
