---
name: java-composition-over-inheritance
description: >
  Choosing between inheritance, composition and sealed hierarchies in Java: fragile base
  classes, self-use of overridable methods, subclass explosion, the costs of delegation and
  decoration, sealed types with exhaustive switch as the modern middle ground, and the cases
  where inheritance is genuinely right. Use when reviewing an `extends` between classes you
  maintain, when a base-class change broke subclasses, when variants multiply along more
  than one axis, or when designing a new hierarchy. Does not cover behavioural
  substitutability formalism (java-design-by-contract) or the SOLID framing of LSP
  (java-solid).
---

# Composition over Inheritance

## Purpose

Pick the cheapest relationship that does the job. Implementation inheritance is one of the
strongest source-level couplings Java offers: a subclass depends not only on the base contract
but on its self-use — which methods call which, in what order, touching what state — none
of which the compiler checks and most of which is undocumented. This skill exists to
prevent two failures: reuse-by-extends that turns every base-class edit into a minefield,
and dogmatic decomposition that replaces a sound three-class hierarchy with a swarm of
delegating wrappers.

## Workflow

1. **Name what is being inherited.** A contract (the subtype _is_ usable wherever the base
   is), implementation (code reuse only), or both. Reuse without substitutability is the
   case to eliminate: hold the other object in a field and forward.
2. **If the variants form a closed set you own**, consider a sealed interface. Put stable
   variant-owned behavior on the implementations; use an exhaustive `switch` when operations
   evolve more often than variants. Recompilation finds missing cases, while already compiled
   clients can instead encounter `MatchException` after incompatible hierarchy evolution.
3. **If behaviour varies along more than one independent axis**, calculate the subtype product.
   When N×M classes or override-order knowledge appears, keep at most one axis as a hierarchy
   and compose the others as policies. Correlated axes with a tiny closed product may still be
   clearer as named subtypes.
4. **If genuine substitutability remains**, inheritance is right — see the rule below for
   the three legitimate shapes. Design and document for it: specify self-use, keep
   overridable surface minimal.
5. **Decide with evidence.** Read
   [references/decision-model.md](references/decision-model.md) for the fragile-base risk
   heuristics, the decision table and the false positives. For executing a migration off a
   hierarchy, read [references/worked-refactoring.md](references/worked-refactoring.md).

## Rules

- An externally subclassable class not designed for extension should be `final`, `sealed`, or
  hidden behind a non-exported/package-private boundary. Framework proxies and bytecode tools
  can require non-final classes; treat that as an explicit runtime contract with tests.
- Never call an overridable method from a constructor: it runs against a subclass whose
  fields are not yet initialised. Self-use of overridable methods elsewhere must be
  documented, because subclasses will depend on it either way.
- A subclass that overrides a promised operation to do nothing or throw is evidence the base
  contract is too broad. Restructure code you own; for a platform contract that explicitly
  permits optional operations, document and test the chosen partial behavior instead of
  pretending the exception cannot occur.
- Records compose but never extend: a record is implicitly final and cannot extend a
  class. A family of record variants is expressed as a sealed interface they implement.
- Inheritance is justified when substitutability holds under a stable documented contract and
  shared implementation/state is worth its evolution coupling. Common sound shapes include a
  framework template explicitly designed for extension and a shallow sealed abstract base for a
  closed same-module family; exception classification and compatibility adapters can also be
  contract hierarchies without sharing algorithms.
- Composition has costs — forwarding boilerplate, lost identity (`wrapper != wrapped`, so
  `equals` and listener registration break across the boundary), no self-type for chained
  returns. Count them before dismantling a working hierarchy; do not present delegation
  as free.

## References

- [Decision model](references/decision-model.md) — inheritance vs composition vs sealed
  hierarchy decision table, fragile-base risk heuristics, and false positives that look
  like abuse but are sound. Read before recommending a restructure.
- [Worked refactoring](references/worked-refactoring.md) — a payment-fee inheritance
  hierarchy replaced by a sealed type plus composed policy, with what got worse. Read
  when executing such a migration.
