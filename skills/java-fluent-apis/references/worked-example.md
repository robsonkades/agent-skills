# Worked example: a charge-request API

A payment client constructs charge requests. Two parameters are required (customer,
amount); capture mode, statement descriptor and idempotency key are optional.

## Before

```java
public final class ChargeRequest {
    public ChargeRequest(String customerId, BigDecimal amount, String currency) { /* ... */ }

    public ChargeRequest(String customerId, BigDecimal amount, String currency,
                         String statementDescriptor) { /* ... */ }

    public ChargeRequest(String customerId, BigDecimal amount, String currency,
                         String statementDescriptor, String idempotencyKey,
                         boolean captureImmediately) { /* ... */ }
}
```

A production call site:

```java
var request = new ChargeRequest(customerId, amount, "BRL", idempotencyKey,
        statementDescriptor, true);
```

## Analysis

- Six parameters, three optional — over the builder threshold (≥4 with ≥2 optional).
- Three adjacent `String` parameters. The call site above compiles with the idempotency key
  in the statement-descriptor slot; the bug surfaces as truncated bank statements, not as a
  compile error.
- Each new optional parameter has been adding a constructor overload — the telescoping
  pattern proper, not the harmless two-overload pair.
- Cross-field rules ("manual capture requires an idempotency key") have nowhere to live.

## After: required-in-factory, optional-in-builder

Required parameters go in the entry factory — cheaper than staging, and they still cannot
be forgotten. Optional ones become named calls with defaults. `build()` owns every
cross-field rule.

```java
public final class ChargeRequest {
    private final CustomerId customerId;
    private final Money amount;
    private final CaptureMode captureMode;
    private final String statementDescriptor;   // null = provider default
    private final String idempotencyKey;        // null = no retry protection

    private ChargeRequest(Builder b) {
        this.customerId = b.customerId;
        this.amount = b.amount;
        this.captureMode = b.captureMode;
        this.statementDescriptor = b.statementDescriptor;
        this.idempotencyKey = b.idempotencyKey;
    }

    public static Builder charge(CustomerId customerId, Money amount) {
        return new Builder(customerId, amount);
    }

    public Optional<String> statementDescriptor() {
        return Optional.ofNullable(statementDescriptor);
    }
    // remaining accessors elided

    public static final class Builder {
        private final CustomerId customerId;
        private final Money amount;
        private CaptureMode captureMode = CaptureMode.AUTOMATIC;
        private String statementDescriptor;
        private String idempotencyKey;

        private Builder(CustomerId customerId, Money amount) {
            this.customerId = Objects.requireNonNull(customerId, "customerId");
            this.amount = Objects.requireNonNull(amount, "amount");
        }

        public Builder captureMode(CaptureMode mode) {
            this.captureMode = Objects.requireNonNull(mode, "mode");
            return this;
        }

        public Builder statementDescriptor(String text) {
            this.statementDescriptor = text;
            return this;
        }

        public Builder idempotencyKey(String key) {
            this.idempotencyKey = key;
            return this;
        }

        public ChargeRequest build() {
            if (statementDescriptor != null && statementDescriptor.length() > 22) {
                throw new IllegalStateException("statement descriptor over 22 characters");
            }
            if (captureMode == CaptureMode.MANUAL && idempotencyKey == null) {
                throw new IllegalStateException("manual capture requires an idempotency key");
            }
            return new ChargeRequest(this);
        }
    }
}
```

The call site, one call per line so breakpoints and stack-trace lines land on individual
calls:

```java
var request = ChargeRequest.charge(customerId, Money.of("290.00", "BRL"))
        .statementDescriptor("LOJA CENTRO")
        .idempotencyKey(requestId)
        .captureMode(CaptureMode.MANUAL)
        .build();
```

`Money` and `CustomerId` are records — one role per type, so the transposition bug is now a
compile error everywhere, not only inside the builder.

## The staged variant, if required-at-compile-time must be total

```java
public interface CustomerStage { AmountStage customer(CustomerId id); }

public interface AmountStage { OptionsStage amount(Money amount); }

public interface OptionsStage {
    OptionsStage captureMode(CaptureMode mode);
    OptionsStage statementDescriptor(String text);
    OptionsStage idempotencyKey(String key);
    ChargeRequest build();
}
```

One hidden class implements all three; the entry point returns `CustomerStage`, and
`build()` is unreachable until both required stages have run.

## Trade-offs

Honest, against the factory-plus-builder above:

- Three public interfaces for two required parameters; the surface grows linearly with
  required parameters.
- Making "manual capture requires an idempotency key" a _compile-time_ rule needs further
  stage types; as written it still lives in `build()` — staging rarely captures cross-field
  rules, only presence and order.
- Promoting an optional parameter to required later inserts a stage: source-breaking for
  every caller that stored an intermediate stage type, binary-breaking for any implementor.
  The factory-plus-builder version absorbs the same change by moving one parameter into
  `charge(...)` — still breaking, but one method, not an interface family.

Here the API is internal to one codebase, so the factory-plus-builder wins: the missing-key
failure is a unit-test-time exception with a clear message, and evolution stays open.

## Verification

- Recompile every module that constructs `ChargeRequest`; delete the old public
  constructors only once no caller remains (search for `new ChargeRequest(`).
- If the artefact is published, run a binary-compatibility check (for example japicmp)
  against the previous release — removed constructors and changed return types must be a
  deliberate major-version decision, not a surprise.
- Add tests that drive `build()` through each invalid combination and assert the message
  names the missing or offending field.
- Confirm formatting: chains one call per line in the touched call sites.
