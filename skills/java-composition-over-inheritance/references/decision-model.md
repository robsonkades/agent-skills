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

Sealed hierarchies are a middle ground the older advice predates: closed polymorphism
gives exhaustive checking that open inheritance cannot, and variant-specific data that a
flat strategy field cannot. The residual trade is the expression problem in one sentence —
a sealed set makes _new operations_ local (one more switch) and _new variants_ loud when all
consumers are recompiled; separately evolved binaries may reach a synthetic fallback and throw
`MatchException`. An open hierarchy makes new variants local and new operations expensive.
Pick by which kind of change and deployment boundary the domain actually produces.

## Fragile-base risk heuristics

Use these as evidence dimensions, not a score threshold. One severe contract violation can
justify change; several low-risk signals in a closed stable hierarchy may not.

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
- **Interface extension.** `interface A extends B` primarily extends a contract and carries no
  instance representation. Default methods can still introduce self-use, conflict and binary
  evolution concerns, so inspect them rather than assuming implementation-free inheritance.
- **Exception hierarchies.** `DomainException extends RuntimeException` and its children
  carry no algorithmic self-use; the hierarchy exists for `catch` selection.
- **Stable, closed, working hierarchies.** Low change pressure and no defect evidence reduce the
  expected payoff, but do not excuse a security, integrity or substitutability violation whose
  failure is merely rare. Compare demonstrated risk with migration cost
  (java-dry-kiss-yagni owns that economics).

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

## Language constraints that affect the decision

- A direct permitted subtype of a sealed type must be in the same named module; in the unnamed
  module it must be in the same package. Sealing is therefore also a release/ownership choice.
- Exhaustive switches are source checks at compilation time, not a promise that independently
  deployed old clients understand a newly added subtype.
- Records are implicitly final and are useful leaves, but mutable record components still leak
  mutability; sealed + record does not itself establish value semantics.

See [JLS §8.1.6](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.1.6),
[JLS §13.4.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html#jls-13.4.2), and
[JLS §8.10](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10).
