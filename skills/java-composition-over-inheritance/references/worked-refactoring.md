# Worked refactoring: a fee hierarchy to sealed type + composition

## Before

A payment-fee calculator grown by subclassing:

The before/after blocks are compilable package-private declarations when placed together in
`Fees.java` with `import java.math.BigDecimal;` and `import java.math.RoundingMode;`.
Compile with `javac --release 21 Fees.java` on JDK 21+; no dependencies or preview flags.
They have no main method and intentionally omit production input validation.

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
  implementation changes to round each component before adding, some inputs produce a
  different result without any subclass edit. The international `0.12` case below exposes
  this; it does not imply every subclass or amount changes.
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

Contract mapping: `CardFee` uses a domestic `Card` with `none()`, `InternationalCardFee`
uses an international `Card` with `none()`, and `PromotionalCardFee` uses a domestic `Card`
with `promotionalRate(new BigDecimal("0.5"))`. The new combination discounts the entire
international fee, including surcharge: for `100.00`, it yields `2.20`, versus `2.95` if
only the base fee were discounted. That combination needs a business decision; it is not
preserved behavior. Boleto and Pix are also new cases with no old implementation here.

The rewritten switch uses only Java 21-final language features. Unnamed patterns (`_`) became
final in Java 22, so using them here without a version label would silently raise the example's
minimum JDK. Production code must additionally validate non-null/non-negative amounts, factor
ranges, currency and scale; this example isolates dispatch equivalence rather than defining a
complete monetary contract.

## Trade-offs — what got worse

- **Uncovered variants are loud on recompilation.** Adding a direct `ApplePay` variant requires
  updating this `permits` list and this switch. Other switches with an applicable broader
  pattern or explicit `default` may still compile; review whether their fallback is acceptable.
  Already compiled consumers are not repaired by recompilation elsewhere and can fail with
  `MatchException` if no case applies; coordinated deployment/versioning still matters.
- **Closed to outsiders.** A partner module can no longer add a payment method. If the
  variant set is genuinely open, this refactoring is wrong — keep an interface.
- **Behaviour moved away from data.** Fee logic for all methods now lives in one switch
  rather than next to each variant; a very long switch would argue for methods on the
  sealed types instead.
- The migration itself: every construction site of the old subclasses changed.

## Verification

- Add a temporary permitted variant without a matching case and compile: this switch must
  fail exhaustiveness checking. Inspection alone is not an executed compiler check.
- Characterisation tests written against the old hierarchy's `total` (one per concrete
  class, using the construction mapping above) retain their expected values against
  `FeeSchedule` before deletion. For international `0.12`, rounding the final sum yields
  `0.01`, but rounding each component first yields `0.00`; this catches the self-use change
  described above (test mechanics: java-refactoring).
- Test promotional × international, Boleto and Pix separately as new policy, not evidence
  of equivalence. Retain null/invalid-input behavior only if it is part of the old contract;
  do not silently combine stricter validation with a behavior-preserving migration.
