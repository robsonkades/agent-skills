# Concept, mechanism and selection

## The three levels

```text
Concept     "the discount calculation varies by campaign"
            — a statement about the domain. Almost always true, and
              it is what you defend in a design discussion.

Mechanism   how the variation is expressed in Java. Preserve required
            operations, lifecycle and public API compatibility before
            comparing ergonomics or resemblance to the pattern.

Selection   how the right one is chosen at runtime. Independent of the
            mechanism, and where most of the defects live.
```

Arguments about Strategy are usually arguments about the mechanism while both sides agree about
the concept. Naming the level resolves them.

## Mechanism: lambda or named type

| Criterion                                        | Lambda / method reference             | Named type                   |
| ------------------------------------------------ | ------------------------------------- | ---------------------------- |
| One operation                                    | ✓                                     | ✓                            |
| Independent abstract operations on one interface | ✗                                     | ✓                            |
| Selected by a key from data                      | Map/registration metadata             | ✓                            |
| Needs injection or its own dependencies          | Captured references                   | ✓                            |
| Must be decorated (cached, timed, retried)       | Function composition                  | ✓                            |
| Appears by name in stack traces and profiles     | Named method references/tags can help | Named methods/types can help |
| Has its own tests and its own reason to change   | Possible                              | ✓                            |
| Supplied by the caller                           | ✓ for a functional contract           | ✓ for the required contract  |
| Defined at the call site, used once              | ✓                                     | Local class is possible      |

Choose a diagnostic identity that operators can use: named methods/types or bounded metric/log
metadata. A lambda's captured dependencies still need correct lifetime and thread-safety contracts;
capture does not copy or freeze the referenced objects
(`flame-graph-analysis`).

A functional interface may also have default/static methods. A registration can pair an applicability
predicate, a calculation function and metadata without adding abstract operations to the calculation
interface. Prefer a cohesive implementation when those parts must enforce shared invariants; neither
form removes the need to validate inputs and applicability at the operation's actual boundary.

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
one file and supplies domain vocabulary at typed call sites; it does not guarantee a label in every
optimized profile or exception trace.

## Selection mechanisms

| Mechanism                                     | Fails how                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `if/else` chain on a code                     | Unknown handling may be omitted; an explicit bounded chain can be adequate           |
| `Map<Key, Strategy>`                          | Missing key returns `null` unless handled — handle it                                |
| Sealed key + exhaustive `switch`              | Checks known cases at compilation; null, binary evolution and branch failures remain |
| Injected `List<Strategy>` + `supports()`      | Order matters and is implicit; two may match                                         |
| Injected `Map<String, Strategy>` (bean names) | Generated bean names may change on rename; explicit names are separate contracts     |
| `ServiceLoader`                               | Class-path/module discovery can fail lazily; define business precedence explicitly   |

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
    return Map.copyOf(byMethod); // freeze the validated registry; strategies need their own contracts
}
```

When this factory runs, duplicate and missing required keys fail. Ensure context tests exercise
it and required validation runs before readiness; lazy bean creation can otherwise defer discovery.
This example requires every enum member. For deployments with optional methods, validate the explicit
required set instead; absent optional entries still need a defined unsupported-selection outcome.

Binding to Spring bean names (`Map<String, Strategy>`) is convenient and fragile: the key becomes a
bean name; renaming can change generated names, while explicitly named beans keep their name.
Use stable domain keys and test the required configured set.

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

Rates become visible together. Avoiding a deployment additionally requires an approved reload and
distribution mechanism; startup-loaded configuration still needs restart. Validate currency, range,
rounding and version consistency, not merely YAML syntax.

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

Strategies may be shared or confined. This accumulator leaks previous-order state even sequentially
unless accumulation is the intended contract, and concurrent calls add races. Reproduce with distinct
orders and controlled interleavings; it is not inherently unreproducible.

Keep per-call scratch state local or explicitly owned. Stateful algorithms are valid with a declared
lifetime, synchronization/confinement and failure policy; final references alone do not imply deep immutability.

Injected collaborators also need thread-safety/lifetime guarantees. Determinism must include the
pricing/configuration snapshot, clock and other inputs on which the operation depends.

## The shared contract test

Partial test sketches use JUnit and jqwik-style annotations; use the project's existing test stack
and generators rather than adding dependencies solely for this example.

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

Only test invariants the domain actually promises. Determinism/concurrent use require suitable fixed
inputs and sharing contracts. Ensure every implementation is registered in the test suite; parameterized
contract tests or reusable assertions can serve the same purpose. A finite test does not prove thread safety.

This is one of the few cases where an inheritance-based test base class is clearly right: the
subclass supplies a value and inherits a specification (`java-composition-over-inheritance`).

## Strategy versus its neighbours, briefly

| Question                                                         | Answer                                  |
| ---------------------------------------------------------------- | --------------------------------------- |
| Interchangeable policy, possibly selected internally             | Strategy                                |
| Lifecycle governs legal operations/transitions                   | State (`gof-state`)                     |
| Abstraction and implementation mechanisms evolve independently   | Bridge (`gof-bridge`)                   |
| A fixed sequence with varying steps                              | Template Method (`gof-template-method`) |
| Several may apply, in order, until one handles                   | Chain of Responsibility                 |
| An overridable creator method lets subclasses select the product | Factory Method (`gof-factory-method`)   |

Bridge and Strategy can share a delegation structure; distinguish the responsibility being separated,
not the number of hierarchies. A constructor function or keyed supplier map is a creation mechanism,
but does not by itself constitute GoF Factory Method.

Sources: [JLS 17 lambdas and capture](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.27),
[functional-interface contracts](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.8),
[local class declarations](https://docs.oracle.com/javase/specs/jls/se17/html/jls-14.html#jls-14.3),
[ServiceLoader discovery](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ServiceLoader.html),
[Spring bean collection injection](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html),
and [Java 21 pattern switch](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html).
