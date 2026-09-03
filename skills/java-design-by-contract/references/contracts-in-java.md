# Contracts in Java 25

## Mapping contract elements to language mechanisms

| Contract element                                                     | First choice                                                                                                                                                                                       | When that is impossible                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Precondition on a value's _shape_ (positive, non-empty, well-formed) | A validating type: record with compact-constructor checks — the precondition disappears from every signature that uses the type                                                                    | Explicit check at method entry, throwing `IllegalArgumentException`/`NullPointerException` with expected and actual |
| Precondition on the _receiver's state_ ("must be open")              | Model states as types (sealed `Open`/`Closed` with the method only on `Open`)                                                                                                                      | `IllegalStateException` at entry, named in `@throws`                                                                |
| Class invariant                                                      | Constructor/factory establishes it; immutable state prevents ordinary mutators from violating it. JEP 513 (Java 25) permits argument checks before `super(...)` but does not prevent `this` escape | Every mutator prepares then commits valid state; assertion or unconditional internal check according to consequence |
| Postcondition                                                        | A test per documented guarantee; unconditional check where unsafe continuation would corrupt durable/security-critical state                                                                       | `assert` for cheap diagnostics in controlled runs                                                                   |
| Contract of an operation with several _expected_ outcomes            | Sealed result type; each variant is one outcome's postcondition; exhaustive `switch` (no `default`) makes adding a variant a compile error at every caller                                         | —                                                                                                                   |

A type-carried invariant is stronger across ordinary typed construction paths: it cannot be
forgotten at a second call site and documents itself in signatures. It is not absolute proof
across unsafe reflection, custom deserialization, ORM hydration or corrupted persisted data.
Its costs: one more type and mapping/versioning surface; wrapping may allocate, though escape
analysis can eliminate some short-lived objects, so measure a performance-sensitive path.

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

- `@throws` for failures a caller is expected to anticipate is API. Adding a new failure
  condition to behavior narrows the contract; documenting an already observable unchecked
  failure may instead be a clarification, while adding a checked exception is source-breaking.
  Classify the behavioral and compatibility change separately.
- Do not document incidental behaviour (iteration order, an accidental tolerance for
  null) unless you intend to promise it forever; once written, callers may rely on it.
- In a JSpecify `@NullMarked` scope, unannotated type uses are non-null by default for compliant
  tooling; outside such a declared convention, silence is ambiguity, not a portable non-null
  contract.

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
- **A subtype used only concretely** can hide a violation in current call sites, but remains a
  broken substitutability claim. Prefer composition or a narrower honest supertype rather than a
  comment saying it must never be upcast.

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

## Runtime and language references

- [JEP 513: Flexible Constructor Bodies](https://openjdk.org/jeps/513)
- [JLS §8.8.7: constructor bodies](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.8.7)
- [JLS §14.10: assertions](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.10)
- [JSpecify nullness specification](https://jspecify.dev/docs/spec/)
