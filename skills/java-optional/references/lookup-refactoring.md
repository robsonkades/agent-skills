# Worked example: a pricing lookup path

A checkout service resolves the effective price for a SKU: promotional price if one is
running, else the customer's contract price, else the list price. No price at all is a
data error that must abort the checkout.

This is a fictional teaching fixture, not an observed project audit or performance measurement.
Code blocks are partial Java 21 snippets: supply imports, ports, `Price`, exception and annotation
types. `Price` must enforce a non-null amount; otherwise `map(Price::amount)` turns an invalid
present price into empty and misreports it as a missing price.

## Before

```java
public BigDecimal effectivePrice(String customerId, String sku) {
    Price p = promotions.priceFor(sku);          // null when no promotion
    if (p == null) {
        p = contracts.priceFor(customerId, sku); // null when no contract
    }
    if (p == null) {
        p = catalogue.listPrice(sku);            // null when unknown SKU
    }
    if (p == null) {
        return null;                             // caller's problem now
    }
    return p.amount();
}
```

Assumed callers in this fixture: one checks for null and throws, one checks and substitutes
`BigDecimal.ZERO` (a free checkout waiting to happen), one does not check.

## Analysis

Three lookups where absence is a **normal outcome** — exactly Optional's case — feeding
one point where absence is a **failure** (an unpriceable SKU must not reach payment).
The shown null-based version leaves that transition to callers (a null-based implementation
could also enforce it centrally), so every caller re-decides it and
one of them decided wrong. This example chooses Optional lookup returns and resolves the
fallback/failure contract in one place. An existing nullable port can instead retain its signature
while a conditional or local adapter enforces the same policy; port migration is not required to
fix the checkout's missing-price behavior.

## After

```java
// Ports now state absence in the signature:
Optional<Price> priceFor(String sku);                       // promotions
Optional<Price> priceFor(String customerId, String sku);    // contracts
Optional<Price> listPrice(String sku);                      // catalogue

public BigDecimal effectivePrice(String customerId, String sku) {
    return promotions.priceFor(sku)
            .or(() -> contracts.priceFor(customerId, sku))  // runs only if no promotion
            .or(() -> catalogue.listPrice(sku))             // runs only if no contract
            .map(Price::amount)
            .orElseThrow(() -> new MissingPriceException(sku));
}
```

`or` keeps the fallbacks lazy — the contract lookup (a repository call) happens only when
no promotion exists. `orElse`-style eager evaluation here would query all three sources
on every call. The return type is now `BigDecimal`, never null: callers lose the
possibility of handling absence, which is the point — absence was never theirs to handle.

## Where null stays

Inside the catalogue adapter, the per-request path hits an in-memory index thousands of
times per pricing batch:

```java
private final Map<String, Price> index;         // built at load time

@Nullable
private Price lookup(String sku) {              // private, hot, locally checked
    return index.get(sku);
}

public Optional<Price> listPrice(String sku) {  // Optional at the boundary only
    return Optional.ofNullable(lookup(sku));
}
```

Wrapping a present private lookup adds an allocation candidate; empty-instance reuse, call paths
and JIT elimination determine actual allocation. No allocation profile is supplied here. When cost
motivates a change, profile the real pricing batch, keeping versions, workload, bytes/op and escape
behavior with the result. This example keeps the private null contract for local simplicity, not a
demonstrated speedup. Preserve adequate existing code without inventing either allocation savings
or a benchmark prerequisite for the missing-price correction.

## Trade-offs

- Port signatures changed (`Price` → `Optional<Price>`): a source- and binary-incompatible change for
  existing callers and implementers that use those descriptors. Inspect the actual consumer/release
  boundary; even one service may have separately built consumers. Preserve a published API or plan
  its migration explicitly.
- The zero-substituting caller's behaviour changed from "silently free" to "aborts
  checkout". That is the bug being fixed, but it is a behaviour change to announce.
- `MissingPriceException` now defines the checkout's failure mode once. Callers that legitimately
  treat missing prices as normal need a suitable query/result contract; reuse an adequate existing
  one or compare a separate query with the current failure handling instead of forcing a new API.
- Two idioms now coexist in the adapter (null privately, Optional publicly). The comment
  and the `@Nullable` annotation are load-bearing; without them the mix looks like
  inconsistency instead of a decision.

## Verification

- Tests for each fallback tier: promotion wins over contract, contract over list price.
- A test asserting the contract source is **not consulted** when a promotion exists
  (mock verification) — this pins the laziness of `or`, which an eager refactoring would
  silently break.
- A test for the unknown SKU asserting `MissingPriceException`, replacing the three
  divergent caller behaviours.
- Propagated lookup failures and invalid null Optional/Price results must remain distinct from
  normal absence; do not catch and flatten them merely to try the next source.
- If performance motivates the change, profile the representative batch before and after and
  retain the measured scope. No performance result is implied by these illustrative tests.
