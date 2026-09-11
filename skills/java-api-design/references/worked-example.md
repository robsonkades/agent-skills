# Worked example: designing and evolving a settlement API

These are partial API sketches, not one executable compilation unit. Records require
Java 16+; use the project's supported release and ordinary classes on older targets.
For compilation, put each public type in its own file in the same package and import
`java.math.BigDecimal`, `java.time.Duration`, and the used `java.util` types. Ellipses
mark omitted implementations; domain invariants beyond those shown remain to be specified.

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

Start with the consumer contract, before replacing declarations. In this **unpublished draft**,
the established need is synchronous settlement with a receipt; async and notification flags
were speculative. If they already serve supported callers, retain or migrate those behaviors
explicitly instead of deleting them during API cleanup.

The ordinary caller should be able to express the operation using the proposed types:

```java
Money amount = new Money(new BigDecimal("10.00"), Currency.getInstance("EUR"));
SettlementRequest request = new SettlementRequest("merchant-42", amount, Duration.ofDays(2));
SettlementReceipt receipt = gateway.settle(request);
String settlementId = receipt.settlementId();
```

Here `gateway` is a borrowed collaborator; the call site does not create or close its transport.
The three required request values have distinct roles/types and no optional construction steps,
so a constructor is enough. A named factory would earn its place for different creation meanings;
a builder for meaningful optional choices. Neither a staged builder nor a settlement DSL solves
a demonstrated problem here. Revisit that decision if actual consumer cases introduce those needs.

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
        Objects.requireNonNull(merchantId);
        Objects.requireNonNull(amount);
        Objects.requireNonNull(settlementWindow);
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

Misuse checks: `new SettlementRequest("merchant-42", amount, 2)` must fail compilation because
the window has no unit. A null required value must fail construction with `NullPointerException`;
a negative `Duration` must fail with `IllegalArgumentException`. Those local checks happen before
submission. They do not establish remote failure handling, settlement correctness or retry safety.

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

An advanced caller opts into that capability explicitly:

```java
static SettlementReceipt submitWithKey(IdempotentSettlementGateway gateway,
        SettlementRequest request, IdempotencyKey persistedOperationKey) {
    return gateway.settleIdempotently(
            new IdempotentSettlementRequest(request, persistedOperationKey));
}
```

The caller obtains `persistedOperationKey` from the logical operation's durable state and reuses
it for a permitted retry with the same request. A new random key on each attempt compiles but
defeats deduplication. The capability contract must specify retention, same-key/different-payload
handling and uncertain outcomes; this call site alone is not an implementation of that protocol.

## Trade-offs

- Three public records instead of loose parameters: more types to document and to hold
  compatible forever. `Money` in particular may belong to a shared module, not this
  library — publishing it here means two libraries can never disagree about it.
- Capability interfaces add types and require composition/configuration; a client that needs both
  must request both or use an aggregate facade.
- A second request type avoids weakening v1.0 but duplicates part of the conceptual operation.
  A major release may unify the model after a measured migration.

## Verification

Acceptance checks to run on a concrete implementation; these are not recorded test results:

- Compile the ordinary and advanced call sites; reject the unitless-window caller. Execute
  constructor checks for null required values, negative windows and valid zero/positive windows.
- japicmp (or Revapi) comparing v1.1 against v1.0 reports only additions—no removed or changed
  signatures.
- The v1.0 test suite runs unmodified against v1.1 and passes.
- Representative v1.0 client binaries run without recompilation, and downstream sources recompile.
- Contract tests prove that repeated calls with one caller-supplied idempotency key yield the
  specified outcome; compilation checks alone cannot establish that behaviour.
