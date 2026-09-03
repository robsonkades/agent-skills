# Detection: coupling chain or data access?

The formal rule — call methods only on `this`, parameters, objects you create, and your own
fields — is a proxy. What it protects is narrower and more useful: **a class should not
depend on the internal composition of its collaborators.** Test chains against that, not
against dot counts.

## Heuristics that indicate real coupling

- **The caller branches or mutates on the navigated result.** `if (order.getCustomer()
.getAddress().getCountry() == BR) …` makes a decision three shapes away. Structural coupling is
  real; placement depends on policy ownership. An application service coordinating aggregates
  may own the decision even though it should consume a narrower projection.
- **The same chain appears at several call sites.** One navigation at an assembly point is
  wiring; the identical three-step walk in five services means five classes break when the
  middle type changes.
- **Imports betray it.** A `ShippingFeeCalculator` that imports `Membership` — a type it
  never receives or returns — reached it by navigation. Types that appear only mid-chain
  are pure structural knowledge.
- **Shape changes ripple.** If renaming or splitting `Address` produces compile errors in
  files that do not mention shipping or addresses in their name or API, those files were
  coupled through chains.
- **The chain crosses a module or aggregate boundary.** Inside one aggregate, navigation is
  the aggregate root doing its job; from outside, it dissolves the boundary.

## False positives — chains that are fine

| Chain                                                                          | Why it is not a violation                                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChargeRequest.charge(id, amount).captureMode(MANUAL).build()`                 | Fluent builder: every call returns the same conceptual object; no second object's structure is exposed. Design questions about it belong to java-fluent-apis. |
| `orders.stream().filter(Order::isOpen).map(Order::total).toList()`             | Stream pipeline: each call transforms a value; the "chain" is dataflow, not navigation.                                                                       |
| `response.body().items().getFirst().sku()` on records you defined for this API | The shape is the wire/projection contract, so coupling is intentional; still handle empty items and schema/version evolution.                                 |
| A mapper building `OrderSummaryDto` from the domain graph                      | Boundary code whose entire job is projecting one structure into another. Hiding the structure from it defeats it.                                             |
| `assertThat(result.receipt().lines()).hasSize(2)` in a test                    | Assertions pin structure deliberately — that is what makes them fail when structure changes.                                                                  |
| `Optional.map(...).filter(...).orElseThrow()`                                  | Same as streams: value transformation on one conceptual value.                                                                                                |

The recurring distinction: **collaborators hide representation; data/projection types publish a
shape.** The law guards encapsulation of the former. Data chains still carry schema coupling and
edge cases; they are not automatically good, only a different review question.

## The dogmatic failure mode

Mechanically eliminating every chain produces delegation layers:

```java
// Order
public String customerCity() { return customer.getAddress().getCity(); }
// Customer
public String addressCity() { return address.getCity(); }
```

Now `Order` has a forwarding method per navigated leaf, `Customer` mirrors `Address`'s
API, and a change to `Address` still ripples — through the wrappers instead of the call
sites, plus the wrappers themselves. This is the Middle Man smell. The chain was one
problem; the wrapper layer is N problems with the same coupling.

A forwarding method earns its place only when it states something the owner genuinely
means — `order.shippingDestination()` is `Order`'s own concept; `order.customerCity()` is
someone else's chain with a name on it.

## When not to apply the law at all

- Query and reporting code: its output mirrors structure by requirement.
- Serialisation, persistence mapping, view rendering: boundary projections.
- Code owned and consumed inside one cohesive package where the types demonstrably co-change —
  coupling costs less, though aggregate invariants and runtime I/O can still make navigation bad.
- Any case where the fix adds more public methods than it removes call-site knowledge.
