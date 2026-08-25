# Contracts in Java 25

## Mapping contract elements to language mechanisms

| Contract element                                                     | First choice                                                                                                                                                                               | When that is impossible                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Precondition on a value's _shape_ (positive, non-empty, well-formed) | A validating type: record with compact-constructor checks — the precondition disappears from every signature that uses the type                                                            | Explicit check at method entry, throwing `IllegalArgumentException`/`NullPointerException` with expected and actual |
| Precondition on the _receiver's state_ ("must be open")              | Model states as types (sealed `Open`/`Closed` with the method only on `Open`)                                                                                                              | `IllegalStateException` at entry, named in `@throws`                                                                |
| Class invariant                                                      | Constructor establishes it; immutability preserves it for free. JEP 513 (Java 25) lets subclass constructors validate _before_ `super(...)`, so no object ever exists in a violating state | Every mutator re-establishes it before returning; an `assert` at mutator exit                                       |
| Postcondition                                                        | A test per documented guarantee                                                                                                                                                            | `assert` at the return point, for guarantees whose violation would surface far away                                 |
| Contract of an operation with several _expected_ outcomes            | Sealed result type; each variant is one outcome's postcondition; exhaustive `switch` (no `default`) makes adding a variant a compile error at every caller                                 | —                                                                                                                   |

A type-carried invariant is strictly stronger than a checked one: it cannot be forgotten
at a second construction site, and it documents itself in every signature. Its costs: one
more type to name and maintain, allocation per wrap (usually negligible; measure before
arguing), and friction at serialisation and mapping edges where frameworks want bare
primitives.

## The Javadoc contract

The contract is the promise, not a description of the current code:

```java
/**
 * Reserves {@code quantity} units against available stock.
 *
 * @param quantity the amount to reserve; must not be {@code null}
 * @return a new level with the reservation applied; available() decreases by
 *         exactly {@code quantity.units()}
 * @throws InsufficientStockException if {@code quantity.units() > available()}
 */
```

- `@throws` for every exception a _caller is expected to anticipate_ — that list is API.
  Adding a new `@throws` condition later is a contract narrowing (callers that used to
  succeed now fail): treat it as a breaking change, not a doc fix.
- Do not document incidental behaviour (iteration order, an accidental tolerance for
  null) unless you intend to promise it forever; once written, callers may rely on it.
- Silence is also a contract: an undocumented parameter is conventionally non-null in a
  JSpecify `@NullMarked` scope — adopt it so the convention is checkable rather than
  folklore.

## Behavioural subtyping — the rules and their concrete violations

An override stands in for the supertype's contract wherever the supertype is expected.
It may **require less and promise more**, never the reverse. Java's compiler enforces
none of this beyond return-type covariance and checked-`throws` narrowing.

Violations that compile cleanly:

- **Strengthened precondition**: `DiscountPolicy.discountFor(Order)` documents "any
  order; may be empty"; `LoyaltyDiscount` overrides it and throws
  `IllegalArgumentException` on empty orders. Every caller holding a `DiscountPolicy`
  is now one implementation-swap away from a crash.
- **Weakened postcondition**: the interface promises a value in `[0, order.total()]`;
  an override returns a discount larger than the total, and the checkout that
  subtracted it goes negative.
- **Weakened invariant via mutation**: a subclass adds a mutator that puts the object
  in a state the base class's methods assume impossible (the classic
  `Rectangle`/`Square` failure, in whatever domain shape it arrives).
- **Unchecked-exception widening**: `throws` narrowing is compiler-checked only for
  checked exceptions; an override that starts throwing a new unchecked exception on
  inputs the contract accepted is a strengthened precondition in disguise.

## Detection heuristics

- An override containing a validation the supertype's method neither performs nor
  documents.
- `instanceof` checks in _callers_ of a polymorphic method — callers have learnt that
  implementations differ in contract, and are compensating.
- Javadoc saying "must" or "should" about parameters with no corresponding check or
  `@throws` — a contract asserted but not enforced anywhere.
- The same `if (x <= 0) throw` repeated at every method taking the same conceptual value
  — an invariant begging to be a type.
- `assert` on a parameter of a `public` method — a precondition demoted to a sometimes-
  comment.
- A sealed hierarchy consumed only through `default`-bearing switches — variant
  contracts exist but totality is never checked.

## False positives

- **A stricter requirement in a _new_ method** on the subtype (not an override) breaks
  nothing: nobody calls it through the supertype. The subtyping rules bind inherited
  contracts only.
- **An override that throws more precisely** — same condition, more specific type whose
  supertype the contract already declared — is not a strengthened precondition; the set
  of rejected inputs is unchanged.
- **`UnsupportedOperationException` from an interface's documented-optional operation**
  (`List.add` on `List.of(...)` results) is within contract _because the interface says
  so_; the smell is designing new interfaces with optional operations, not implementing
  existing ones.
- **Constructor `requireNonNull` on values "already validated" at the boundary** is not
  redundant defence: the constructor is establishing its own invariant, independent of
  any particular caller's discipline. Where boundary validation itself belongs is
  java-defensive-programming's territory.
- **Documented weakening in a subtype used directly** (never through the supertype) is
  tolerable in application code you control end-to-end — record that the type must not
  be handed out as its supertype, and expect the constraint to rot.

## When not to apply

- Do not wrap every primitive in the codebase. A type earns its existence when the
  invariant travels — crosses method or module boundaries. A loop index does not.
- Do not chase full DbC ceremony (invariant checks on entry _and_ exit of every method)
  in ordinary business code; that is what immutability plus constructor validation
  already gives you at a fraction of the noise.
- Postcondition `assert`s in hot paths are usually free when disabled, but their
  _expressions_ must be side-effect-free and cheap to keep enabled in CI — an assert
  that sorts a list to check sortedness changes timing under `-ea` and hides races.
- Private helpers inside a class share the class's invariant; contracting them
  individually is paperwork. The contract surface is the public API.
