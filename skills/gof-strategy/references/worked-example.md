# Worked example: shipping cost, through three mechanisms

Hypothetical Java 17 teaching example; the stages define alternative interfaces, not one compilable
file. Money, Order, registry exceptions and test helpers are application types; JUnit/AssertJ snippets
need the project's dependencies. Validate nonnegative finite weights and currency/rounding rules.
Tests below assume immutable orders and a fixed pricing/configuration snapshot.

## Before

```java
public Money shippingCost(Order order) {
    String method = order.shippingMethod();
    if ("STANDARD".equals(method)) {
        return Money.of("4.99");
    } else if ("EXPRESS".equals(method)) {
        return order.weightKg() > 20 ? Money.of("24.99") : Money.of("12.99");
    } else if ("FREIGHT".equals(method)) {
        return freightRates.forZone(order.destinationZone())
                .times(BigDecimal.valueOf(Math.ceil(order.weightKg() / 100.0)));
    } else if ("PICKUP".equals(method)) {
        return Money.ZERO;
    }
    return Money.ZERO;                       // ← the bug
}
```

The final `return Money.ZERO` is the defect that motivated the change: a typo in a shipping method
code such as `"EXPRES"` from a partner integration would produce free shipping silently.

## Step 1 — separate the data from the algorithms

Two of the four branches are numbers, not algorithms:

```yaml
shipping:
  flat-rates:
    STANDARD: 4.99
    PICKUP: 0.00
  express:
    base: 12.99
    heavy: 24.99
    heavy-threshold-kg: 20
```

That leaves two genuine algorithms — express (a threshold rule) and freight (a per-zone,
per-hundred-kilogram calculation) — plus a flat-rate lookup. This step usually removes more
"strategies" than the pattern adds.

## Step 2 — lambdas, while that is all it needs

```java
@FunctionalInterface
public interface ShippingCost {
    Money costFor(Order order);
}
```

```java
Map<ShippingMethod, ShippingCost> costs = Map.of(
    STANDARD, order -> rates.flat(STANDARD),
    PICKUP,   order -> rates.flat(PICKUP),
    EXPRESS,  order -> order.weightKg() > rates.heavyThreshold()
                       ? rates.expressHeavy() : rates.expressBase(),
    FREIGHT,  order -> freightRates.forZone(order.destinationZone())
                       .times(hundredKilogramUnits(order.weightKg())));
```

The named functional interface — rather than `Function<Order, Money>` — costs one file and gives
every call site a domain name.

With the initial configuration, preserve the existing prices: express uses the heavy rate strictly
above 20 kg, and `hundredKilogramUnits(weight)` retains `BigDecimal.valueOf(Math.ceil(weight / 100.0))`.
Both flat methods read their configured rates, including a nonzero pickup rate if configured.

## Step 3 — named types, when more was required

Suppose three requirements make a cohesive named implementation useful (lambdas can capture
dependencies and carry metadata through a registration too):

- Support wanted to know **which rule produced a charge**, in the log line and in a metric tag.
- Freight needed to declare **whether it applies at all** to a destination, so the checkout could
  hide the option.
- Freight needed injected collaborators and its own tests.

Destination eligibility is an explicit new requirement in this stage. The mechanism change does
not introduce a minimum freight weight or alter the calculation; specify any such business change
separately and test it. Include a supported destination below 30 kg to catch an invented threshold.

This is an alternative interface for the example, not a compatible mutation of a published
functional API. Adding independent abstract methods breaks lambda source use; an old implementation
may still load and serve old calls but fail when a new unimplemented method is invoked. For external
consumers, compare a separate registration/adapter, meaningful compatible defaults or a versioned
transition. Metadata and a predicate can accompany the original calculation function.

```java
public interface ShippingCost {
    ShippingMethod method();
    boolean appliesTo(Order order);
    Money costFor(Order order);
}

@Component
public final class FreightShippingCost implements ShippingCost {

    private final FreightRates rates;
    private final ZoneCatalogue zones;          // collaborator shared under its own concurrency contract

    public FreightShippingCost(FreightRates rates, ZoneCatalogue zones) {
        this.rates = java.util.Objects.requireNonNull(rates);
        this.zones = java.util.Objects.requireNonNull(zones);
    }

    @Override public ShippingMethod method() { return FREIGHT; }

    @Override public boolean appliesTo(Order order) {
        return zones.supportsFreight(order.destinationZone());
    }

    @Override public Money costFor(Order order) {
        if (!appliesTo(order)) throw new ShippingMethodNotAvailable(method(), order.destinationZone());
        return rates.forZone(order.destinationZone())
                    .times(hundredKilogramUnits(order.weightKg()));
    }
}
```

`STANDARD` and `PICKUP` stayed as a single `FlatRateShippingCost` parameterised by method, because
they are one algorithm over configuration — three classes for three numbers would have been the
mistake the first step removed.

## Selection, with the failure defined

```java
@Bean
Map<ShippingMethod, ShippingCost> shippingCosts(List<ShippingCost> strategies) {
    var byMethod = strategies.stream().collect(toMap(ShippingCost::method, identity(),
            (a, b) -> { throw new DuplicateShippingStrategy(a.method()); }));

    var missing = EnumSet.allOf(ShippingMethod.class);
    missing.removeAll(byMethod.keySet());
    if (!missing.isEmpty()) throw new MissingShippingStrategies(missing);
    return Map.copyOf(byMethod);
}
```

```java
public Money shippingCost(Order order) {
    var strategy = costs.get(order.shippingMethod());
    if (strategy == null) {
        throw new UnsupportedShippingMethod(order.shippingMethod(), costs.keySet());
    }
    if (!strategy.appliesTo(order)) {
        throw new ShippingMethodNotAvailable(order.shippingMethod(), order.destinationZone());
    }
    return strategy.costFor(order);
}
```

The design now distinguishes three failures; only unknown-method free shipping was demonstrated
in the original code:

- An unknown method — the original bug. `ShippingMethod` is an enum parsed at the boundary, so an
  invalid code from a partner is rejected at the edge with the list of valid values; the map lookup
  is the second line of defence.
- A required method with no strategy — caught when the registry factory runs. This example requires
  all enum methods; exercise the required validation before readiness rather than relying on lazy creation.
- A method that does not apply to this order — a distinct error, because "we do not ship freight to
  that zone" is a different answer from "we do not know that method".

## The bug found under load

The first `FreightShippingCost` cached the last zone's rate in a field:

```java
private Zone lastZone;
private Money lastRate;          // shared by every request thread

public Money costFor(Order order) {
    if (!order.destinationZone().equals(lastZone)) {
        lastZone = order.destinationZone();
        lastRate = rates.forZone(lastZone);
    }
    return lastRate.times(...);   // may be another zone's rate
}
```

Two threads can interleave the fields: thread A publishes zone A then pauses before its rate is
written; another call for A can observe a null or stale rate. Distinct-zone calls can also overwrite
the rate before the original call uses it. This is a reproducible hypothesis, not a reported incident.

The fix was to remove the field and let the rate lookup be cached in `FreightRates` — a
purpose-built, thread-safe cache — rather than in the strategy. The rule that prevents it:
**per-call state must not leak; caching needs an explicit concurrency and consistency contract**
(`caching-strategies`).

## The contract test

```java
abstract class ShippingCostContractTest {
    protected abstract ShippingCost strategy();
    protected abstract Order applicableOrder();
    protected abstract Order differentApplicableZoneOrder();
    protected abstract Money expectedCost(Order order);

    @Test void cost_is_never_negative() { ... }

    @Test void method_matches_the_strategy_bean_registered_for_it() { ... }

    @Test void costFor_is_deterministic() {
        var shared = strategy(); // same instance and fixed collaborators for both calls
        var order = applicableOrder();
        assertThat(shared.costFor(order)).isEqualTo(shared.costFor(order));
    }

    @Test void is_safe_for_concurrent_use() {
        var shared = strategy();
        var a = applicableOrder();
        var b = differentApplicableZoneOrder(); // for zone-sensitive rules use distinct expected costs
        var expectedA = expectedCost(a); // independent fixed-rate fixture, not shared.costFor(a)
        var expectedB = expectedCost(b);
        runConcurrently(32, index -> { // helper starts tasks together, joins, propagates every failure
            boolean first = index % 2 == 0;
            assertThat(shared.costFor(first ? a : b)).isEqualTo(first ? expectedA : expectedB);
        });
    }
}
```

The mixed-zone check observes every result on the same instance, unlike checking only a final
recalculation. It can expose races but does not force all interleavings; add a deterministic schedule
for a known defect and inspect the ownership argument. Declare the extra fixture/helper methods
in the concrete test suite; this block is a test design, not an executed proof.

## Result

```text
Before                                After
────────────────────────────────────  ───────────────────────────────────
unknown method → free shipping        unknown method → an exception, and
                                        an enum rejection at the boundary
rates in code, changed by deploy      rates in configuration
"which rule charged this?" — unknown  a metric tag and a log field
adding a method → edit branches       adding an enum method → update implementation/registration;
                                        required registry validation catches omissions
a stateful calculation, untested      shared contract checks to run for every strategy
  for concurrency
```

What got worse: the calculation for a single order is no longer readable in one method. That is the
trade to assess here. ShippingMethod remains a closed enum even though bean implementations can vary;
the registry does not make the key domain open.
For four fixed branches with no extension requirement, retaining a bounded `if/else` or `switch`
with explicit unknown-method failure may be adequate.

For public interface evolution, see [JLS 17 interface binary compatibility](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html#jls-13.5.4)
and [JVM interface invocation](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-6.html#jvms-6.5.invokeinterface).
