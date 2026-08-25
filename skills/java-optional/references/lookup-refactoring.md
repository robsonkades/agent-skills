# Worked example: a pricing lookup path

A checkout service resolves the effective price for a SKU: promotional price if one is
running, else the customer's contract price, else the list price. No price at all is a
data error that must abort the checkout.

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

Callers, found by inspection: one checks for null and throws, one checks and substitutes
`BigDecimal.ZERO` (a free checkout waiting to happen), one does not check.

## Analysis

Three lookups where absence is a **normal outcome** — exactly Optional's case — feeding
one point where absence is a **failure** (an unpriceable SKU must not reach payment).
The null-based version cannot express that transition, so every caller re-decides it and
one of them decided wrong. The fix is not "wrap everything": it is to put Optional on the
lookup returns, resolve the fallback chain in one place, and end the chain with a throw so
the failure semantics stop being the caller's guess.

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

Wrapping the private `lookup` itself would allocate an Optional per index probe in a loop
that runs per line item. Escape analysis may eliminate those allocations; on a batch this
size, "may" is not a basis for either decision — the team ran the allocation profile,
found Optional-per-probe measurable, and kept the private path null-based with the
contract stated by `@Nullable` (java-null-safety). Had the profile shown nothing, keeping
Optional throughout for uniformity would have been the right call. The measurement
decides; the default without one is the simpler code you already have.

## Trade-offs

- Port signatures changed (`Price` → `Optional<Price>`): a source-incompatible change for
  every implementer and caller — cheap inside one service, a versioning event on a
  published API.
- The zero-substituting caller's behaviour changed from "silently free" to "aborts
  checkout". That is the bug being fixed, but it is a behaviour change to announce.
- `MissingPriceException` now defines the failure mode once. Callers that legitimately
  wanted "is this priceable?" semantics need a separate query method rather than catching
  the exception — flow control by exception would be the next smell.
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
- The allocation claim re-checked after the change: profile the pricing batch before and
  after; keep the numbers with the commit.
