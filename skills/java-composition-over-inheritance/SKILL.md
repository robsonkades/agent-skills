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

Pick the cheapest relationship that does the job. Implementation inheritance is the
strongest coupling Java offers: a subclass depends not only on the base class's contract
but on its self-use — which methods call which, in what order, touching what state — none
of which the compiler checks and most of which is undocumented. This skill exists to
prevent two failures: reuse-by-extends that turns every base-class edit into a minefield,
and dogmatic decomposition that replaces a sound three-class hierarchy with a swarm of
delegating wrappers.

## Workflow

1. **Name what is being inherited.** A contract (the subtype _is_ usable wherever the base
   is), implementation (code reuse only), or both. Reuse without substitutability is the
   case to eliminate: hold the other object in a field and forward.
2. **If the variants form a closed set you own**, model them as a sealed interface with
   record implementations and dispatch with exhaustive `switch` — no `default`, so the
   compiler finds every dispatch site when a variant is added.
3. **If behaviour varies along more than one axis**, never encode axes as subclass layers
   (the N×M explosion). One axis may stay a hierarchy or sealed set; the others become
   composed strategy fields.
4. **If genuine substitutability remains**, inheritance is right — see the rule below for
   the three legitimate shapes. Design and document for it: specify self-use, keep
   overridable surface minimal.
5. **Decide with evidence.** Read
   [references/decision-model.md](references/decision-model.md) for the fragile-base risk
   heuristics, the decision table and the false positives. For executing a migration off a
   hierarchy, read [references/worked-refactoring.md](references/worked-refactoring.md).

## Rules

- A class not designed for extension is `final` or `sealed`. "Design and document for
  inheritance or else prohibit it" (Effective Java) is the default posture, not an option.
- Never call an overridable method from a constructor: it runs against a subclass whose
  fields are not yet initialised. Self-use of overridable methods elsewhere must be
  documented, because subclasses will depend on it either way.
- A subclass that overrides a method to do nothing, or to throw, is inheriting a contract
  it does not honour — restructure; do not ship the override.
- Records compose but never extend: a record is implicitly final and cannot extend a
  class. A family of record variants is expressed as a sealed interface they implement.
- Inheritance is genuinely right in three shapes: a subtype substitutable under a stable,
  documented base contract; a framework template contract explicitly designed for
  extension (servlet, test base, adapter skeletons); and a sealed abstract base carrying
  real shared state and behaviour for a closed set of subclasses.
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
