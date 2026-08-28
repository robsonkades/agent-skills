# Concept, mechanism and selection

## The three levels

```text
Concept     "the discount calculation varies by campaign"
            — a statement about the domain. Almost always true, and
              it is what you defend in a design discussion.

Mechanism   how the variation is expressed in Java. Interchangeable,
            and the choice should be made on ergonomics, not on
            whether the result "looks like the pattern".

Selection   how the right one is chosen at runtime. Independent of the
            mechanism, and where most of the defects live.
```

Arguments about Strategy are usually arguments about the mechanism while both sides agree about
the concept. Naming the level resolves them.

## Mechanism: lambda or named type

| Criterion                                      | Lambda / method reference | Named type |
| ---------------------------------------------- | ------------------------- | ---------- |
| One operation                                  | ✓                         | ✓          |
| Two or more operations (`apply` + `supports`)  | ✗                         | ✓          |
| Selected by a key from data                    | Awkward                   | ✓          |
| Needs injection or its own dependencies        | ✗                         | ✓          |
| Must be decorated (cached, timed, retried)     | Possible, unreadable      | ✓          |
| Appears by name in stack traces and profiles   | ✗ — `lambda$foo$3`        | ✓          |
| Has its own tests and its own reason to change | Possible                  | ✓          |
| Supplied by the caller                         | ✓                         | Heavy      |
| Defined at the call site, used once            | ✓                         | ✗          |

The diagnosability row is under-weighted. A calculation that will appear in a flame graph, a thread
dump or an error report should have a class name; `PricingService.lambda$price$2` in a production
stack trace costs more time than the class would have cost to write
(`flame-graph-analysis`).

```java
// a functional interface with a domain name — the middle ground
@FunctionalInterface
public interface DiscountRule {
    Money discountFor(Order order);
}

// implementations may be lambdas where they are trivial…
DiscountRule none = order -> Money.ZERO;

// …and classes where they are not
final class TieredVolumeDiscount implements DiscountRule { /* named, injected, tested */ }
```

Declaring a domain-named functional interface rather than reusing `Function<Order, Money>` costs
one file and buys a name at every call site, in every profile, and in every error.

## Selection mechanisms

| Mechanism                                     | Fails how                                                             |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `if/else` chain on a code                     | Silently falls through to the last `else`; grows without bound        |
| `Map<Key, Strategy>`                          | Missing key returns `null` unless handled — handle it                 |
| Sealed key + exhaustive `switch`              | Cannot fail; a new key breaks compilation. Best when closed           |
| Injected `List<Strategy>` + `supports()`      | Order matters and is implicit; two may match                          |
| Injected `Map<String, Strategy>` (bean names) | The key is a bean name — a rename silently changes behaviour          |
| `ServiceLoader`                               | Class-path dependent; no compile-time guarantee; ordering unspecified |

```java
// keyed by something the strategy declares, validated at startup
@Bean
Map<ShippingMethod, ShippingCost> shippingCosts(List<ShippingCost> strategies) {
    var byMethod = strategies.stream()
            .collect(toMap(ShippingCost::method, identity(),
                           (a, b) -> { throw new DuplicateStrategy(a.method()); }));
    var missing = EnumSet.allOf(ShippingMethod.class);
    missing.removeAll(byMethod.keySet());
    if (!missing.isEmpty()) throw new MissingStrategies(missing);      // fail at startup
    return byMethod;
}
```

Two guarantees for the price of six lines: a duplicate key fails the build's startup test rather
than silently winning, and a method with no strategy is discovered at deploy rather than by the
first customer who chooses it.

Binding to Spring bean names (`Map<String, Strategy>`) is convenient and fragile: the key becomes a
bean name, so renaming a class changes behaviour, and nothing in the code says which names are
expected.

## The constants test

```java
// three "strategies"
class StandardShipping implements ShippingCost {
    public Money cost(Order o) { return Money.of("4.99"); }
}
class ExpressShipping implements ShippingCost {
    public Money cost(Order o) { return Money.of("12.99"); }
}
class OvernightShipping implements ShippingCost {
    public Money cost(Order o) { return Money.of("24.99"); }
}
```

These are not three algorithms; they are one algorithm and three numbers. The test: **if the
implementations' bodies differ only in literals, it is data.**

```yaml
shipping:
  rates:
    STANDARD: 4.99
    EXPRESS: 12.99
    OVERNIGHT: 24.99
```

The saving is not the three classes. It is that a rate change becomes a configuration change
rather than a deployment, and that the rates are visible in one place instead of spread across a
package.

The inverse mistake also exists: pushing genuine branching logic into configuration until the
config file is a programming language with no type checking. The line is whether the difference is
a value or a computation.

## Statelessness

```java
// the bug: correct in a unit test, wrong under concurrency
class TieredDiscount implements DiscountRule {
    private Money accumulated = Money.ZERO;              // shared across every request
    public Money discountFor(Order order) {
        accumulated = accumulated.plus(tierFor(order));  // two threads, interleaved
        return accumulated;
    }
}
```

Strategies are selected once and shared. Any mutable field is shared by every concurrent caller,
and the symptom — one customer's discount influenced by another's order — is intermittent,
unreproducible and reaches production.

The rules: fields are `final` and immutable; per-call state is a parameter or a context object; if
a strategy genuinely needs per-invocation scratch space, allocate it inside the method.

An exception worth naming: a strategy holding an immutable configuration object or an injected
collaborator is fine — that is not per-call state.

## The shared contract test

```java
abstract class DiscountRuleContractTest {
    protected abstract DiscountRule rule();

    @Test void never_returns_a_negative_discount() { ... }
    @Test void never_exceeds_the_order_total() { ... }
    @Test void returns_zero_for_an_empty_order() { ... }
    @Test void is_safe_for_concurrent_use() { ... }
    @Property void is_deterministic_for_the_same_order(@ForAll("orders") Order o) { ... }
}

class TieredVolumeDiscountTest extends DiscountRuleContractTest { ... }
class CampaignDiscountTest extends DiscountRuleContractTest { ... }
```

Every strategy inherits the specification. Adding an invariant to the contract makes every
non-conforming implementation fail at once, which is the only mechanism that keeps a growing set of
strategies honest — the fifth one written by someone who never read the first four is exactly where
"discount exceeds order total" appears.

This is one of the few cases where an inheritance-based test base class is clearly right: the
subclass supplies a value and inherits a specification (`java-composition-over-inheritance`).

## Strategy versus its neighbours, briefly

| Question                                       | Answer                                  |
| ---------------------------------------------- | --------------------------------------- |
| Chosen by the caller, does not change itself   | Strategy                                |
| Changes as the object's own state changes      | State (`gof-state`)                     |
| Two independent hierarchies varying together   | Bridge (`gof-bridge`)                   |
| A fixed sequence with varying steps            | Template Method (`gof-template-method`) |
| Several may apply, in order, until one handles | Chain of Responsibility                 |
| The variation is which object to instantiate   | Factory Method (`gof-factory-method`)   |
