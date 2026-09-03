# Worked example: a charge-request API

A payment client constructs charge requests. Customer, amount and a caller-stable idempotency key
are required; capture mode and statement descriptor are optional. Treating the key as optional
would make retry safety depend on a stylistic builder call.

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

- Six positional parameters with multiple optional/defaulted roles make call sites ambiguous.
- Three adjacent `String` parameters. The call site above compiles with the idempotency key
  in the statement-descriptor slot; the bug surfaces as truncated bank statements, not as a
  compile error.
- Each new optional parameter has been adding a constructor overload — the telescoping
  pattern proper, not the harmless two-overload pair.
- Idempotency is an operation contract, not a manual-capture option: every retryable charge
  creation needs the same caller-generated key across attempts.

## After: required-in-factory, optional-in-builder

Required parameters go in the entry factory — cheaper than staging, and they still cannot
be forgotten. Optional ones become named calls with defaults. `build()` owns every
cross-field rule.

```java
public final class ChargeRequest {
    private final CustomerId customerId;
    private final Money amount;
    private final IdempotencyKey idempotencyKey;
    private final CaptureMode captureMode;
    private final String statementDescriptor;   // null = provider default

    private ChargeRequest(Builder b) {
        this.customerId = b.customerId;
        this.amount = b.amount;
        this.idempotencyKey = b.idempotencyKey;
        this.captureMode = b.captureMode;
        this.statementDescriptor = b.statementDescriptor;
    }

    public static Builder charge(
            CustomerId customerId, Money amount, IdempotencyKey idempotencyKey) {
        return new Builder(customerId, amount, idempotencyKey);
    }

    public Optional<String> statementDescriptor() {
        return Optional.ofNullable(statementDescriptor);
    }
    // remaining accessors elided

    public static final class Builder {
        private final CustomerId customerId;
        private final Money amount;
        private final IdempotencyKey idempotencyKey;
        private CaptureMode captureMode = CaptureMode.AUTOMATIC;
        private String statementDescriptor;

        private Builder(
                CustomerId customerId, Money amount, IdempotencyKey idempotencyKey) {
            this.customerId = Objects.requireNonNull(customerId, "customerId");
            this.amount = Objects.requireNonNull(amount, "amount");
            this.idempotencyKey = Objects.requireNonNull(idempotencyKey, "idempotencyKey");
        }

        public Builder captureMode(CaptureMode mode) {
            this.captureMode = Objects.requireNonNull(mode, "mode");
            return this;
        }

        public Builder statementDescriptor(String text) {
            this.statementDescriptor = text;
            return this;
        }

        public ChargeRequest build() {
            if (statementDescriptor != null && statementDescriptor.length() > 22) {
                throw new IllegalStateException("statement descriptor over 22 characters");
            }
            return new ChargeRequest(this);
        }
    }
}
```

The call site, one call per line so breakpoints and stack-trace lines land on individual
calls:

```java
var request = ChargeRequest.charge(
                customerId, Money.of("290.00", "BRL"), IdempotencyKey.of(requestId))
        .statementDescriptor("LOJA CENTRO")
        .captureMode(CaptureMode.MANUAL)
        .build();
```

`Money`, `CustomerId` and `IdempotencyKey` are validated role types, so transposition is a
compile error and key presence is mandatory. The key's value must originate at the operation
caller and remain stable across retries; generating it inside `build()` would defeat deduplication.

## The staged variant, if required-at-compile-time must be total

```java
public interface CustomerStage { AmountStage customer(CustomerId id); }

public interface AmountStage { IdempotencyStage amount(Money amount); }

public interface IdempotencyStage { OptionsStage idempotencyKey(IdempotencyKey key); }

public interface OptionsStage {
    OptionsStage captureMode(CaptureMode mode);
    OptionsStage statementDescriptor(String text);
    ChargeRequest build();
}
```

One hidden class implements all four; the entry point returns `CustomerStage`, and `build()` is
unreachable until all required stages have run. The factory already provides that guarantee more
cheaply here; staging is shown only to expose its cost for APIs that truly require ordered gradual
construction.

## Trade-offs

Honest, against the factory-plus-builder above:

- Four public interfaces for three required parameters; the surface grows linearly with
  required parameters.
- Staging captures presence and order, not arbitrary cross-field rules among options; encoding
  those requires a branching state graph whose API and compatibility cost grows quickly.
- Promoting an optional parameter to required later inserts a stage: source-breaking for
  every caller that stored an intermediate stage type, binary-breaking for any implementor.
  The factory-plus-builder version absorbs the same change by moving one parameter into
  `charge(...)` — still breaking, but one method, not an interface family.

Here the factory-plus-builder wins even for a published API: required values are compile-time
arguments without exposing intermediate stage types, while optional evolution stays relatively
open.

## Verification

- Recompile every module that constructs `ChargeRequest`; delete the old public
  constructors only once no caller remains (search for `new ChargeRequest(`).
- If the artefact is published, run a binary-compatibility check (for example japicmp)
  against the previous release — removed constructors and changed return types must be a
  deliberate major-version decision, not a surprise.
- Add tests for every local and cross-field invariant, repeated `build()` behavior, and defensive
  copies of mutable inputs; assert stable failure codes/types rather than brittle prose when the
  API is published.
- Confirm formatting: chains one call per line in the touched call sites.
