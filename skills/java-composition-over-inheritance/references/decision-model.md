# Decision model: inheritance, composition, or sealed hierarchy

## Decision table

| Situation                                                        | Choose                                                                                | Because                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Reuse of behaviour, no substitutability claim                    | Composition + forwarding                                                              | Coupling limited to the delegate's public contract                              |
| Closed set of variants you own, dispatch varies by variant       | Sealed interface + records + exhaustive `switch`                                      | Compiler enforces exhaustiveness; adding a variant surfaces every dispatch site |
| Variants share real state and helper behaviour, set still closed | Sealed abstract base class                                                            | Shared fields live once; hierarchy stays closed to strangers                    |
| Open extension by code you will never see                        | Interface (+ default methods), possibly an abstract skeleton documented for extension | Third parties need a contract, not your implementation                          |
| Behaviour varies on 2+ independent axes                          | One axis as types, others as composed strategies                                      | N×M subclasses otherwise; N+M objects instead                                   |
| Cross-cutting add-on behaviour (retry, metrics, caching)         | Decorator over a shared interface                                                     | Stackable at runtime; base type untouched                                       |

Sealed hierarchies are the middle ground the older advice predates: closed polymorphism
gives exhaustive checking that open inheritance cannot, and variant-specific data that a
flat strategy field cannot. The residual trade is the expression problem in one sentence —
a sealed set makes _new operations_ cheap (one more switch) and _new variants_ loud (every
switch fails to compile until updated); an open hierarchy makes new variants cheap and new
operations expensive. Pick by which kind of change your domain actually produces.

## Fragile-base risk heuristics

Score an existing `extends` against these; two or more is a restructuring candidate.

- **Self-use of overridable methods.** Base methods call other overridable methods. A
  subclass overriding one silently changes the behaviour of the others — the classic
  `HashSet.addAll` calls `add` trap. Grep the base for calls to its own non-final,
  non-private methods.
- **Base and subclasses owned by different teams or released separately.** Every base
  release is an unreviewed change to the subclasses.
- **`protected` mutable fields.** Subclasses depend on representation, not contract; the
  base can no longer change its own state layout.
- **Overrides that call `super.method()` at a required point.** The base's algorithm has
  leaked into every subclass; forgetting the call is a silent bug.
- **Overrides that weaken or disable base behaviour** (empty bodies,
  `UnsupportedOperationException`). The is-a claim is already false.
- **Depth over two, or a subclass count that grows with the product of features** —
  `InternationalPremiumCardFee` names two axes multiplied into one class.

## False positives — `extends` that should stay

- **Framework template contracts.** Extending a class the framework documents for
  extension (a servlet, an `AbstractProcessor`, a test base class, an adapter skeleton
  like `AbstractList`) is using the framework as designed. The fragile-base risk is real
  but priced in and managed by the framework's compatibility promises.
- **A shallow sealed abstract base you own entirely.** Two or three subclasses, same
  module, same maintainer, shared state genuinely common — the coupling is confined and
  the compiler knows the whole set. Dismantling it into delegation adds forwarding for no
  risk reduction.
- **Interface extension.** `interface A extends B` inherits contract only; none of the
  implementation-coupling arguments apply.
- **Exception hierarchies.** `DomainException extends RuntimeException` and its children
  carry no algorithmic self-use; the hierarchy exists for `catch` selection.
- **Stable, closed, working hierarchies.** A hierarchy that has not caused a bug and has
  not changed in a year is not a refactoring target because a principle exists. The cost
  of migration is real; the benefit is speculative (java-dry-kiss-yagni owns that
  economics).

## Costs of the composition side — check before recommending

- **Forwarding boilerplate**: every delegated method restated; a method added to the
  delegate's interface does not automatically appear on the wrapper.
- **Lost identity**: the wrapper and the wrapped object are different objects. `equals`
  comparisons, identity-keyed maps and listener registration that captured `this` inside
  the delegate all cross the boundary wrongly (the "self problem" — the delegate cannot
  call back into the wrapper).
- **No self-type**: a base returning `this` for chaining returns the base type; Java has
  no self-type to recover the wrapper's type without recursive generics.
- **Object-graph plumbing**: dependencies must be constructed and wired where a subclass
  got them implicitly.

If these costs dominate and the base contract is stable and documented, keeping
inheritance is the correct engineering decision — record it as such.
