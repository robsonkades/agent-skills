# Worked example: designing and evolving a settlement API

## Before

The first draft of a small library other teams will call:

```java
public class GatewayImpl {
    public String doProcess(String merchant, String amt, String curr,
            int window, boolean async, boolean notify) { ... }
    public Map<String, Object> getData(String id) { ... }
}
```

## Analysis

- Names come from the implementation (`doProcess`, `getData`), so a caller cannot predict
  behaviour or find the API by searching for domain words ("settle").
- `String amt` plus `String curr` is a data clump with no validation home; `int window`
  has an undocumented unit; two adjacent booleans make call sites unreadable
  (`doProcess(m, "10.00", "EUR", 2, true, false)` — which `true`?).
- `Map<String, Object>` as a return type ends discoverability: the type system cannot
  tell the caller what the next call is, and every key is an undocumented contract.
- Everything is `public`, including the implementation class — the whole thing is now
  published surface.

## After — v1.0

```java
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
    }
}

public record SettlementRequest(String merchantId, Money amount, Duration settlementWindow) {
    public SettlementRequest {
        if (settlementWindow.isNegative()) {
            throw new IllegalArgumentException("settlementWindow must not be negative");
        }
    }
}

public record SettlementReceipt(String settlementId, Money settledAmount) {}

public interface SettlementGateway {
    SettlementReceipt settle(SettlementRequest request);
}
```

The interface and records are the exported package; `GatewayImpl` becomes package-private
(or lives in an unexported package under JPMS). Verb from the domain; parameter object
with its validation in the compact constructor; `Duration` instead of a unitless `int`;
the booleans are gone — asynchronous settlement, if ever needed, will be a differently
named method rather than a flag. `settle` returns a `SettlementReceipt`, so completion on
the result leads the caller to the next facts (`settlementId()`, `settledAmount()`)
without documentation.

## Evolving to v1.1

Two requests arrive: look up a past receipt, and add caller-controlled idempotency.

**Receipt lookup** must not pretend “unsupported” means “not found.” Returning empty from a
default implementation would be behaviour existing implementors never authorized and could cause
callers to settle twice. Add a separate capability:

```java
public interface ReceiptLookup {
    Optional<SettlementReceipt> findReceipt(String settlementId);
}
```

This is additive for old binaries and implementations. Composition roots can expose an object that
implements both capabilities; clients requiring lookup declare that requirement instead of probing
or receiving a fabricated absence. A `default` method is appropriate only when one implementation
is semantically correct for every existing implementation, not merely convenient.

**Idempotency key**—the naive record edit breaks more than its constructor:

```java
// v1.1 draft — WRONG as the only constructor:
public record SettlementRequest(String merchantId, Money amount,
        Duration settlementWindow, String idempotencyKey) { ... }
```

Adding a component changes the canonical constructor, component shape, generated equality/hash and
`toString`; old record-pattern deconstructions fail to compile. Retaining an old delegating
constructor preserves that one binary entry point, not the whole record contract. Making the key
nullable also weakens the new invariant, and generating a new key inside each call cannot deduplicate
a client retry. Add an explicit opt-in request and capability instead:

```java
public record IdempotencyKey(String value) {
    public IdempotencyKey { Objects.requireNonNull(value); }
}

public record IdempotentSettlementRequest(
        SettlementRequest settlement, IdempotencyKey idempotencyKey) {
    public IdempotentSettlementRequest {
        Objects.requireNonNull(settlement);
        Objects.requireNonNull(idempotencyKey);
    }
}

public interface IdempotentSettlementGateway extends SettlementGateway {
    SettlementReceipt settleIdempotently(IdempotentSettlementRequest request);
}
```

Existing implementations and callers remain valid; implementations opt in when they can persist the
key and result atomically enough for the documented retry semantics. The caller must reuse the key
for the same logical operation. Idempotency owns the storage/failure protocol; this skill owns the
compatible capability shape.

## Trade-offs

- Three public records instead of loose parameters: more types to document and to hold
  compatible forever. `Money` in particular may belong to a shared module, not this
  library — publishing it here means two libraries can never disagree about it.
- Capability interfaces add types and require composition/configuration; a client that needs both
  must request both or use an aggregate facade.
- A second request type avoids weakening v1.0 but duplicates part of the conceptual operation.
  A major release may unify the model after a measured migration.

## Verification

- japicmp (or Revapi) comparing v1.1 against v1.0 reports only additions—no removed or changed
  signatures.
- The v1.0 test suite runs unmodified against v1.1 and passes.
- Representative v1.0 client binaries run without recompilation, and downstream sources recompile.
- Contract tests prove that repeated calls with one caller-supplied idempotency key yield the
  specified outcome; compilation checks alone cannot establish that behaviour.
