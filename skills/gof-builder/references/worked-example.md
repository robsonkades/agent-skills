# Worked example: a payment instruction

Five components, one optional, and a cross-field rule: a beneficiary is identified by an IBAN
_or_ by an internal account id, never both and never neither.

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

Three problems. `(amount, debtor, iban)` and `(amount, debtor, creditor)` differ only in the
third parameter's type, so a refactor that changes `AccountId` to a `String` silently selects
the wrong overload. Adding one optional field doubles the constructor count. And there is
nowhere to express "IBAN or account id, not both", because each overload sees only one of them.

## Step 1 — model the choice, not the fields

The cross-field rule disappears if the alternatives are one component:

```java
public sealed interface Beneficiary permits Iban, InternalAccount {
    record Iban(String value) implements Beneficiary {
        public Iban {
            if (!IbanFormat.isValid(value)) throw new IllegalArgumentException("invalid IBAN");
        }
    }
    record InternalAccount(AccountId id) implements Beneficiary {}
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
new PaymentInstruction(amount, debtor, new Iban(iban), valueDate, Optional.empty());
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

## Step 4 — staged, when the type is public API

If this instruction is a published SDK type, move the required set to compile time:

```java
PaymentInstruction.builder()
    .amount(Money.of("120.00", EUR))
    .debtor(debtorId)
    .to(new Iban("DE89370400440532013000"))
    .valueDate(Instant.now(clock))   // last required step returns the optional stage
    .reference("INV-2291")
    .build();
```

`build()` does not exist on the earlier stages, so omitting `debtor` fails to compile rather
than at runtime. The cost is four extra interfaces and a fixed call order — worth it for a type
constructed by people who cannot read your validation code, rarely worth it inside one module.

## Test data builder

Production and tests want different defaults. A test builder starts valid and lets a test name
only the field under test:

```java
public final class APaymentInstruction {
    private Money amount = Money.of("10.00", EUR);
    private Beneficiary beneficiary = new Iban("DE89370400440532013000");
    private Instant valueDate = Instant.parse("2026-01-15T00:00:00Z");

    public static APaymentInstruction valid() { return new APaymentInstruction(); }
    public APaymentInstruction withAmount(Money amount) { this.amount = amount; return this; }
    public PaymentInstruction build() { ... }
}
```

```java
var overLimit = APaymentInstruction.valid().withAmount(Money.of("1000000.00", EUR)).build();
```

The value is that adding a required component to `PaymentInstruction` breaks one file rather
than forty tests. Note the fixed `valueDate`: a test fixture that calls `Instant.now()` makes
tests depend on wall-clock time (`java-test-design`).

## What changed

| Version                  | Call-site readability | Illegal states reachable           | Cost               |
| ------------------------ | --------------------- | ---------------------------------- | ------------------ |
| Telescoping constructors | Poor                  | Yes — both identifiers, or neither | 4 constructors     |
| Sealed `Beneficiary`     | Same                  | No — the choice is one type        | 3 small types      |
| Record + builder         | Good                  | No                                 | 1 builder class    |
| Staged builder           | Good, guided          | No — enforced at compile time      | 4 extra interfaces |

The largest single improvement was step 1, which is not the Builder pattern at all.
