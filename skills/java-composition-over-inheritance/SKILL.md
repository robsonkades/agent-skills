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

0. **Inspect the compatibility and ownership boundary.** Check compiler release/toolchains,
   CI runtime, external subclasses and separately deployed clients before changing `extends`
   or `permits`. The worked example uses Java 21 without preview; sealed types require
   Java 17+, and pattern switches require Java 21+ without preview. On an older target, use
   ordinary composition/polymorphism rather than upgrading or enabling preview implicitly.
   Reuse the stated goals and project conventions; identify the caller or recurring change
   the new relationship would help. Ask only for missing contracts that materially change
   the decision. A sound existing design needs no migration.
1. **Name what is being inherited.** A contract (the subtype _is_ usable wherever the base
   is), implementation (code reuse only), or both. For reuse without substitutability,
   consider holding the other object in a field and forwarding; preserve existing public
   entry points through a compatible migration rather than silently removing a supertype.
2. **If the variants form a closed set you own**, consider a sealed interface. Put stable
   variant-owned behavior on the implementations; use an exhaustive `switch` when operations
   evolve more often than variants. Recompilation finds newly uncovered cases; a `default`
   or covering supertype pattern can still compile, so review its semantics. Already compiled
   clients can encounter `MatchException` when a new value matches no applicable case.
3. **If behaviour varies along more than one independent axis**, inspect the supported combinations.
   When N×M classes or override-order knowledge appears, consider keeping one axis as a hierarchy
   and composing the others as policies. A tiny supported product may still be
   clearer as named subtypes.
4. **If genuine substitutability remains**, inheritance is an option — weigh the shared
   implementation against its evolution coupling, using the legitimate shapes below.
   When choosing it, design and document for it: specify self-use, keep
   overridable surface minimal.
5. **Decide with evidence.** Read
   [references/decision-model.md](references/decision-model.md) for the fragile-base risk
   heuristics, the decision table and the false positives. For executing a migration off a
   hierarchy, read [references/worked-refactoring.md](references/worked-refactoring.md).

## Rules

- For a new API with no extension contract, use `final`, `sealed`, or a
  non-exported/package-private boundary as appropriate. Restricting an already published
  class can break existing subclasses; missing extension documentation is not proof that
  none exist. Framework proxies and bytecode tools can require non-final classes; treat
  that as an explicit runtime contract with tests.
- Do not introduce calls to overridable methods from a constructor: they may observe
  incomplete subclass state. Inspect existing framework hooks before changing their
  lifecycle. Self-use of overridable methods elsewhere must be
  documented, because subclasses will depend on it either way.
- A subclass that overrides a promised operation to do nothing or throw is evidence the base
  contract is too broad. Restructure code you own; for a platform contract that explicitly
  permits optional operations, document and test the chosen partial behavior instead of
  pretending the exception cannot occur.
- Records are implicitly final and cannot declare a superclass: they extend `java.lang.Record`.
  They can implement open or sealed interfaces; seal only when the family should be closed.
- Inheritance is justified when substitutability holds under a stable documented contract and
  shared implementation/state is worth its evolution coupling. Common sound shapes include a
  framework template explicitly designed for extension and a shallow sealed abstract base for a
  closed same-module family; exception classification and compatibility adapters can also be
  contract hierarchies without sharing algorithms.
- Composition has costs — forwarding boilerplate, distinct identity (`wrapper != wrapped`),
  possible equality/listener mismatches and fluent returns that may expose the delegate.
  An inherited interface default can also bypass the delegate's override of that operation.
  Inspect method dispatch and test those contracts before dismantling a working hierarchy;
  do not present delegation as free.

## Deliverable

Name the observed coupling or contract issue (or why no change is needed), ownership/compatibility constraints, chosen
relationship and the trade-off that rules out the closest alternative. For a migration,
map old entry points to new ones and distinguish preserved behavior from policy changes;
report characterization checks actually run. If callers or subclass contracts are unavailable,
state the missing evidence and keep claims of safe replacement conditional.
Stop once the relationship decision and affected consumer checks are supported; report
separate policy changes or unresolved migration work without presenting a design as implemented.

## References

- [Decision model](references/decision-model.md) — inheritance vs composition vs sealed
  hierarchy decision table, fragile-base risk heuristics, and false positives that look
  like abuse but are sound. Read before recommending a restructure.
- [Worked refactoring](references/worked-refactoring.md) — a payment-fee inheritance
  hierarchy replaced by a sealed type plus composed policy, with what got worse. Read
  when executing such a migration.
