# Detection: coupling chain or data access?

The common shorthand — call methods only on `this`, parameters, objects you create, and your own
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
- **Intermediate type use is evidence.** Trace why a `ShippingFeeCalculator` uses `Membership`:
  an import alone may be unused or refer to a directly constructed collaborator. Conversely,
  `var` and inferred chains need no explicit import. Inspect actual calls and declared contracts.
- **Shape changes ripple.** If renaming or splitting `Address` produces compile errors in
  files that do not mention shipping or addresses in their name or API, those files were
  coupled through chains.
- **The chain crosses a module or aggregate boundary.** Check whether it reaches a private
  component or uses a published collaborator/projection. Root-owned internal navigation can be
  appropriate; crossing the boundary is not itself proof that the public contract was bypassed.

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

The `getFirst()` illustration requires Java 21 and throws on an empty list; Java 17 callers
can use `get(0)` with an explicit empty-input contract. Stream callbacks can still navigate
entities and perform I/O; dataflow syntax does not certify a pure pipeline.

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

A forwarding method earns its place by protecting a stable owned query or boundary. Names
such as `shippingDestination()` can express that intent, but neither `customerCity()` nor
any other name proves or disproves it; demonstrate the internal change hidden from callers.

## When not to apply the law at all

- Query and reporting code: its output mirrors structure by requirement.
- Serialisation, persistence mapping, view rendering: boundary projections.
- Code owned and consumed inside one cohesive package where the types demonstrably co-change —
  coupling costs less, though aggregate invariants and runtime I/O can still make navigation bad.
- A fix that adds more public methods than it removes call-site knowledge needs a clear
  compensating boundary benefit; raw method counts alone cannot settle it.

## API references

- [Original Demeter object formulation](https://www2.ccs.neu.edu/research/demeter/demeter-method/LawOfDemeter/object-formulation.html)
  includes computed immediate parts; the shorthand is not a complete formal checker.
- [Java 21 List.getFirst](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html#getFirst()>)
  documents availability and empty-list failure.
- [Java 17 Stream](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/stream/Stream.html)
  specifies callback and pipeline behavior; it does not promise domain encapsulation.
