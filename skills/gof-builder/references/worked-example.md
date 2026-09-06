# Worked example: a payment instruction

Five components, one optional, and a cross-field rule: a beneficiary is identified by an IBAN
_or_ by an internal account id, never both and never neither.

Java 17 partial examples, without preview features. Supply `java.time.Instant`, `java.util.*`
and project value types Money/AccountId; both are assumed immutable and validated. IbanFormat
is an existing project validator, not supplied payment-validation code. Nest the builder in the
PaymentInstruction record; alternatives and test-fixture sketches are not one compilation unit.

## Before — telescoping constructors

```java
public class PaymentInstruction {
    public PaymentInstruction(Money amount, AccountId debtor, String iban) { ... }
    public PaymentInstruction(Money amount, AccountId debtor, AccountId creditor) { ... }
    public PaymentInstruction(Money amount, AccountId debtor, String iban, Instant valueDate) { ... }
    public PaymentInstruction(Money amount, AccountId debtor, String iban,
                              Instant valueDate, String reference) { ... }
}
```

The overloads already exclude supplying both identifiers in one call, but a null third argument
is ambiguous. Changing a call-site argument from AccountId to String can select another overload;
changing both declarations to String produces duplicate signatures. Optional combinations can grow
the overload set. Shared constructor/factory validation can enforce invariants; a builder is not
required for that. Model the beneficiary choice to make intent explicit across every path.

## Step 1 — model the choice, not the fields

The cross-field rule disappears if the alternatives are one component:

```java
public sealed interface Beneficiary permits Beneficiary.Iban, Beneficiary.InternalAccount {
    record Iban(String value) implements Beneficiary {
        public Iban {
            Objects.requireNonNull(value, "iban");
            if (!IbanFormat.isValid(value)) throw new IllegalArgumentException("invalid IBAN");
        }
    }
    record InternalAccount(AccountId id) implements Beneficiary {
        public InternalAccount { Objects.requireNonNull(id, "accountId"); }
    }
}
```

This is worth doing before reaching for a builder: it removes one optional field, one
validation rule and one class of mistake. Several "we need a builder" problems are really "we
modelled a choice as two nullable fields" problems.

## Step 2 — the record with its invariants

```java
public record PaymentInstruction(Money amount, AccountId debtor, Beneficiary beneficiary,
                                 Instant valueDate, Optional<String> reference) {

    public PaymentInstruction {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(debtor, "debtor");
        Objects.requireNonNull(beneficiary, "beneficiary");
        Objects.requireNonNull(valueDate, "valueDate");
        reference = reference == null ? Optional.empty() : reference;
        if (amount.isNegativeOrZero()) {
            throw new IllegalArgumentException("amount must be positive, was " + amount);
        }
    }
}
```

Four required components of four distinct types, one optional. At this size a builder is still
optional — but the call site is already showing strain:

```java
new PaymentInstruction(amount, debtor, new Beneficiary.Iban(iban), valueDate, Optional.empty());
```

## Step 3 — the builder

```java
public static Builder builder() { return new Builder(); }

public static final class Builder {
    private Money amount;
    private AccountId debtor;
    private Beneficiary beneficiary;
    private Instant valueDate;
    private String reference;

    public Builder amount(Money amount) { this.amount = amount; return this; }
    public Builder debtor(AccountId debtor) { this.debtor = debtor; return this; }
    public Builder to(Beneficiary beneficiary) { this.beneficiary = beneficiary; return this; }
    public Builder valueDate(Instant valueDate) { this.valueDate = valueDate; return this; }
    public Builder reference(String reference) { this.reference = reference; return this; }

    public PaymentInstruction build() {
        var missing = new ArrayList<String>();
        if (amount == null) missing.add("amount");
        if (debtor == null) missing.add("debtor");
        if (beneficiary == null) missing.add("beneficiary");
        if (valueDate == null) missing.add("valueDate");
        if (!missing.isEmpty()) {
            throw new IllegalStateException("missing required: " + String.join(", ", missing));
        }
        return new PaymentInstruction(amount, debtor, beneficiary, valueDate,
                                      Optional.ofNullable(reference));
    }
}
```

Two properties to keep:

- `build()` reports **every** missing field, not the first. A caller fixing them one exception
  at a time is a bad afternoon.
- All value invariants stay in the record. `build()` only adds what the record cannot see —
  here, nothing beyond presence. If the builder later grows a rule the record could enforce, it
  belongs in the record.

## Step 4 — a staged API when missing-step mistakes justify it

The builder above intentionally permits arbitrary setter order and validates at runtime.
A different entrypoint can expose staged interfaces, sketched below; their implementation is
omitted and must delegate to the same constructor. Being a public SDK alone does not require stages.

```java
public interface AmountStep { DebtorStep amount(Money amount); }
public interface DebtorStep { BeneficiaryStep debtor(AccountId debtor); }
public interface BeneficiaryStep { DateStep to(Beneficiary beneficiary); }
public interface DateStep { OptionalStep valueDate(Instant date); }
public interface OptionalStep {
    OptionalStep reference(String reference);
    PaymentInstruction build();
}
// A separately implemented stagedBuilder() returns AmountStep, not the Builder above.
```

Its intended call site would be:

```java
PaymentInstruction.stagedBuilder()
    .amount(Money.of("120.00", EUR))
    .debtor(debtorId)
    .to(new Beneficiary.Iban("DE89370400440532013000"))
    .valueDate(Instant.now(clock))   // last required step returns the optional stage
    .reference("INV-2291")
    .build();
```

Through this staged API, build() is unavailable on earlier steps. The sketch adds five interfaces
and a fixed order; callers can still pass null or invalid values, so runtime checks remain.
Compile a skipped-step caller against the implemented API before claiming that protection.

## Test data builder

Production and tests want different defaults. A test builder starts valid and lets a test name
only the field under test:

```java
public final class APaymentInstruction {
    private Money amount = Money.of("10.00", EUR);
    private AccountId debtor = AccountId.of("test-debtor"); // adapt to the project's factory
    private Beneficiary beneficiary = new Beneficiary.Iban("DE89370400440532013000");
    private Instant valueDate = Instant.parse("2026-01-15T00:00:00Z");

    public static APaymentInstruction valid() { return new APaymentInstruction(); }
    public APaymentInstruction withAmount(Money amount) { this.amount = amount; return this; }
    public PaymentInstruction build() {
        return new PaymentInstruction(amount, debtor, beneficiary, valueDate, Optional.empty());
    }
}
```

```java
var overLimit = APaymentInstruction.valid().withAmount(Money.of("1000000.00", EUR)).build();
```

Defaults reduce unrelated fixture edits, but tests of a new requirement must still supply and
assert its meaningful values; convenient defaults can hide missing coverage. The fixed valueDate
avoids wall-clock dependence, but time-relative rules need a fixed Clock aligned with the fixture.

## What changed

| Version                  | Call-site readability | Illegal states reachable                                                         | Cost                             |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| Telescoping constructors | Context-dependent     | Null/invalid values unless constructor validates; both IDs excluded by overloads | overload set                     |
| Sealed `Beneficiary`     | Explicit choice       | Null/invalid payloads rejected by constructors                                   | 3 small types                    |
| Record + builder         | Named setters         | Product invariants checked at runtime                                            | 1 builder class                  |
| Staged API sketch        | Guided order          | Missing steps prevented through stage types; invalid values still runtime        | 5 interfaces plus implementation |

Step 1 encodes the exclusive choice structurally; validation still rejects a null beneficiary
or invalid component values. This improvement does not require Builder.
