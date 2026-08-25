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
public record Money(BigDecimal amount, Currency currency) {}

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

Two requests arrive: look up a past receipt, and pass an idempotency key.

**Receipt lookup** — added as a `default` method so existing implementations keep
compiling and linking:

```java
public interface SettlementGateway {
    SettlementReceipt settle(SettlementRequest request);

    default Optional<SettlementReceipt> findReceipt(String settlementId) {
        return Optional.empty();
    }
}
```

The compatibility cost is behavioural, not binary: an old implementation now answers
`findReceipt` with `Optional.empty()` — code its author never reviewed. Here "no receipt
found" is an honest degraded answer, so the default is acceptable; a default that
returned fabricated data would not be, and the method would have to wait for 2.0 or throw
`UnsupportedOperationException` as a documented opt-in.

**Idempotency key** — the naive move breaks callers:

```java
// v1.1 draft — WRONG as the only constructor:
public record SettlementRequest(String merchantId, Money amount,
        Duration settlementWindow, String idempotencyKey) { ... }
```

Adding a component changes the canonical constructor's signature: old binaries throw
`NoSuchMethodError`, and old record-pattern deconstructions fail to compile
(`incorrect number of nested patterns`). The compatible version keeps the old signature
as a delegating constructor:

```java
public record SettlementRequest(String merchantId, Money amount,
        Duration settlementWindow, String idempotencyKey) {
    /** v1.0 signature; a key is generated when absent. */
    public SettlementRequest(String merchantId, Money amount, Duration settlementWindow) {
        this(merchantId, amount, settlementWindow, null);
    }
}
```

Old constructor callers link and compile; clients that deconstruct the record with a
pattern still break at their next recompile, and the release notes must say so. If the
type is expected to grow again, this is the point to add a builder — mechanics in
java-fluent-apis.

## Trade-offs

- Three public records instead of loose parameters: more types to document and to hold
  compatible forever. `Money` in particular may belong to a shared module, not this
  library — publishing it here means two libraries can never disagree about it.
- The `default` method makes the interface no longer a pure contract; implementors who
  _should_ override `findReceipt` get no compiler nudge.
- `idempotencyKey` as nullable `String` keeps v1.0 callers working at the cost of an
  optional-shaped field; the honest modelling (a required key) is deferred to 2.0.

## Verification

- japicmp (or Revapi) comparing v1.1 against v1.0 reports only additions — no removed or
  changed signatures.
- The v1.0 test suite runs unmodified against v1.1 and passes.
- The overload check: `settle` has no overloads, and none were added — a second
  `settle(SettlementRequest, String key)` overload was rejected in favour of the record
  component precisely to keep the call-site meaning unambiguous.
