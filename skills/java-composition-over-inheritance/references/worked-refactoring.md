# Worked refactoring: a fee hierarchy to sealed type + composition

## Before

A payment-fee calculator grown by subclassing:

```java
abstract class FeeCalculator {
    final BigDecimal total(BigDecimal amount) {          // template method
        return round(base(amount).add(surcharge(amount)));
    }
    abstract BigDecimal base(BigDecimal amount);
    BigDecimal surcharge(BigDecimal amount) { return BigDecimal.ZERO; }
    BigDecimal round(BigDecimal value) { return value.setScale(2, RoundingMode.HALF_EVEN); }
}

class CardFee extends FeeCalculator {
    @Override BigDecimal base(BigDecimal amount) { return amount.multiply(new BigDecimal("0.029")); }
}

class InternationalCardFee extends CardFee {
    @Override BigDecimal surcharge(BigDecimal amount) { return amount.multiply(new BigDecimal("0.015")); }
}

class PromotionalCardFee extends CardFee {
    @Override BigDecimal base(BigDecimal amount) { return super.base(amount).multiply(new BigDecimal("0.5")); }
}
```

## Analysis

- **Self-use.** `total` calls overridable `base`, `surcharge` and `round`. When the base
  team later changed `total` to round each component before adding, every subclass's
  behaviour shifted with no change to any subclass file.
- **Two axes multiplied.** Payment method (card, boleto, pix) and pricing adjustment
  (standard, international, promotional) are independent, but the hierarchy encodes their
  product: an international promotional card needs
  `InternationalPromotionalCardFee`, and its author must know which overrides compose in
  which order (`super.base(...)` is load-bearing).
- **The variant set is closed.** The business, not third parties, decides which payment
  methods exist. Open extension is a cost being paid for nothing.

## After

Variants become a sealed set; the orthogonal axis becomes a composed policy:

```java
sealed interface PaymentMethod permits Card, Boleto, Pix {}
record Card(String network, boolean international) implements PaymentMethod {}
record Boleto() implements PaymentMethod {}
record Pix() implements PaymentMethod {}

@FunctionalInterface
interface FeeAdjustment {
    BigDecimal apply(BigDecimal fee);
    static FeeAdjustment none() { return fee -> fee; }
    static FeeAdjustment promotionalRate(BigDecimal factor) { return fee -> fee.multiply(factor); }
}

final class FeeSchedule {
    private static final BigDecimal CARD_RATE = new BigDecimal("0.029");
    private static final BigDecimal INTERNATIONAL_SURCHARGE = new BigDecimal("0.015");
    private static final BigDecimal BOLETO_FLAT = new BigDecimal("3.49");

    private final FeeAdjustment adjustment;

    FeeSchedule(FeeAdjustment adjustment) { this.adjustment = adjustment; }

    BigDecimal feeFor(PaymentMethod method, BigDecimal amount) {
        BigDecimal fee = switch (method) {           // no default: exhaustive on purpose
            case Card card -> {
                var base = amount.multiply(CARD_RATE);
                yield card.international()
                        ? base.add(amount.multiply(INTERNATIONAL_SURCHARGE))
                        : base;
            }
            case Boleto ignored -> BOLETO_FLAT;
            case Pix ignored -> BigDecimal.ZERO;
        };
        return adjustment.apply(fee).setScale(2, RoundingMode.HALF_EVEN);
    }
}
```

"International" stopped being a subclass and became data on `Card`; "promotional" stopped
being a subclass and became a composed `FeeAdjustment`. The former product of axes is now
a sum of variants plus one strategy field.

The rewritten switch uses only Java 21-final language features. Unnamed patterns (`_`) became
final in Java 22, so using them here without a version label would silently raise the example's
minimum JDK. Production code must additionally validate non-null/non-negative amounts, factor
ranges, currency and scale; this example isolates dispatch equivalence rather than defining a
complete monetary contract.

## Trade-offs — what got worse

- **New variants are loud on recompilation.** Adding `ApplePay` means editing `permits` and every
  source switch over `PaymentMethod`. Already compiled consumers are not repaired by that
  property and can fail with `MatchException`; coordinated deployment/versioning still matters.
- **Closed to outsiders.** A partner module can no longer add a payment method. If the
  variant set is genuinely open, this refactoring is wrong — keep an interface.
- **Behaviour moved away from data.** Fee logic for all methods now lives in one switch
  rather than next to each variant; a very long switch would argue for methods on the
  sealed types instead.
- The migration itself: every construction site of the old subclasses changed.

## Verification

- The switch has no `default` branch — adding a variant must fail compilation at every
  dispatch site. This is checkable by inspection.
- Characterisation tests written against the old hierarchy's `total` (one per concrete
  class, including the rounding of `10.05`-style inputs) pass unchanged against
  `FeeSchedule` before the old classes are deleted (test mechanics: java-refactoring).
- `InternationalCardFee` behaviour equivalence includes the promotional × international
  combination the old design could not express without a fourth class — covered by a new
  test, marked as new behaviour, not preserved behaviour.
