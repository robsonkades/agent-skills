# Worked example: shipping cost, through three mechanisms

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
code — `"EXPRES"` from a partner integration — produced free shipping, silently, for four months.

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
    PICKUP,   order -> Money.ZERO,
    EXPRESS,  order -> order.weightKg() > rates.heavyThreshold()
                       ? rates.expressHeavy() : rates.expressBase(),
    FREIGHT,  order -> freightRates.forZone(order.destinationZone())
                       .times(hundredKilogramUnits(order.weightKg())));
```

The named functional interface — rather than `Function<Order, Money>` — costs one file and gives
every call site a domain name.

## Step 3 — named types, when more was required

Three requirements arrived that lambdas served badly:

- Support wanted to know **which rule produced a charge**, in the log line and in a metric tag.
- Freight needed to declare **whether it applies at all** to a destination, so the checkout could
  hide the option.
- Freight needed injected collaborators and its own tests.

```java
public interface ShippingCost {
    ShippingMethod method();
    boolean appliesTo(Order order);
    Money costFor(Order order);
}

@Component
public final class FreightShippingCost implements ShippingCost {

    private final FreightRates rates;
    private final ZoneCatalogue zones;          // injected — a lambda cannot hold these

    @Override public ShippingMethod method() { return FREIGHT; }

    @Override public boolean appliesTo(Order order) {
        return zones.supportsFreight(order.destinationZone()) && order.weightKg() >= 30;
    }

    @Override public Money costFor(Order order) {
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
    return byMethod;
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

Three failures that used to be free shipping are now exceptions:

- An unknown method — the original bug. `ShippingMethod` is an enum parsed at the boundary, so an
  invalid code from a partner is rejected at the edge with the list of valid values; the map lookup
  is the second line of defence.
- A method with no strategy — caught at startup, not in production.
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

Correct in every test, wrong under concurrency: two threads interleaving the check and the
assignment produce a rate from one order applied to another's zone. It appeared as a handful of
mispriced freight orders per day with no reproducible pattern.

The fix was to remove the field and let the rate lookup be cached in `FreightRates` — a
purpose-built, thread-safe cache — rather than in the strategy. The rule that prevents it:
**strategies are stateless; caching belongs in a collaborator designed for it**
(`caching-strategies`).

## The contract test

```java
abstract class ShippingCostContractTest {
    protected abstract ShippingCost strategy();
    protected abstract Order applicableOrder();

    @Test void cost_is_never_negative() { ... }

    @Test void method_matches_the_strategy_bean_registered_for_it() { ... }

    @Test void costFor_is_deterministic() {
        var order = applicableOrder();
        assertThat(strategy().costFor(order)).isEqualTo(strategy().costFor(order));
    }

    @Test void is_safe_for_concurrent_use() {
        var order = applicableOrder();
        var expected = strategy().costFor(order);
        var results = runConcurrently(32, () -> strategy().costFor(differentZoneOrder()));
        assertThat(strategy().costFor(order)).isEqualTo(expected);   // unaffected by other threads
    }
}
```

The concurrency test is the one that would have caught the freight bug before it shipped, and it
costs nothing to inherit once written. When a fifth strategy is added by someone who has never read
the first four, this base class is the specification they must satisfy.

## Result

```text
Before                                After
────────────────────────────────────  ───────────────────────────────────
unknown method → free shipping        unknown method → an exception, and
                                        an enum rejection at the boundary
rates in code, changed by deploy      rates in configuration
"which rule charged this?" — unknown  a metric tag and a log field
adding a method → edit one method     adding a method → one class, and
  and hope                              startup fails if it is forgotten
a stateful calculation, untested      a contract test every strategy passes
  for concurrency
```

What got worse: the calculation for a single order is no longer readable in one method. That is the
trade Strategy always makes, and it pays here because the set is open and the selection is data.
For four fixed branches that never grew, the original `switch` — with a `default` that threw —
would have been the better answer.
