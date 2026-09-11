---
name: gof-pattern-selection
description: >
  Getting from a stated design problem to a candidate pattern, or to no pattern, without
  choosing by familiarity. The second of two stages: it assumes the forces are named and the
  alternatives ladder has already been walked (gof-pattern-thinking), and supplies the
  mapping. Covers the discriminating questions that actually separate the twenty-three
  patterns, a selection matrix mapping design problems to candidates with their simpler
  alternatives, the relationship graph showing which patterns imply, replace or combine with
  which, and the compositions that reinforce or fight each other. Use when someone asks
  which pattern fits, when two candidate patterns both seem to fit, when patterns already
  chosen are producing friction, or when an existing design must be explained as a set of
  decisions. Does not cover telling lookalike patterns apart (gof-pattern-confusion), any
  individual pattern's guidance (the gof-* skills), or enterprise and architectural pattern
  selection (pattern-selection-and-composition).
---

# Pattern Selection

## Purpose

Turn a problem statement into a shortlist. This skill assumes the reasoning discipline is already
in place — the problem is stated without a pattern name, the forces are known, the alternatives
ladder has been walked (`gof-pattern-thinking`). What remains is the mapping, and the mapping is
worth writing down because the discriminating questions are few and the wrong ones are asked often.

Output the selected approach (including no pattern), any meaningful competing candidate and why
the simplest viable alternative was retained or rejected. Do not invent rejected options.
Reuse settled forces, consumer examples and project conventions. If they are incomplete, inspect
available callers and design evidence; ask only for missing extension, lifecycle or failure
requirements that could change the choice. A small discriminating check can resolve uncertainty.
State the contract to preserve, what would change the recommendation and proportionate validation;
a selection is not completed implementation and does not require a new checklist or ADR.

Java 17 supports records and sealed classes; type-pattern switch is final in Java 21 (earlier
versions require the applicable preview support). Inspect target toolchains/framework versions;
use ordinary polymorphism or existing compatible constructs without assuming upgrades.

## The discriminating questions

Use these questions to narrow the relevant dimension; they are not sufficient conditions.

```text
1. What kind of problem is it?
     creating something          → creational family
     an interface or structure   → structural family
     behaviour or interaction    → behavioural family

2. What varies, and along how many axes?
     no variation or other force → no pattern
     one axis, one behaviour     → Strategy (often a function value)
     two independent dimensions  → Bridge
     which concrete type         → factory; Factory Method if subclass creation hook
     a whole family of types     → Abstract Factory

3. What boundary must be handled?
     an incompatible interface   → Adapter
     subsystem complexity/workflow → Facade, regardless of authorship
     a process                   → distributed contracts also need review
                                   (gof-patterns-and-distribution)

4. Same interface in and out?
     yes, behaviour added, stackable      → Decorator
     yes, access controlled               → Proxy
     no, different interface              → Adapter or Facade

5. What interaction contract is needed?
     interchangeable policy      → Strategy; selection may be internal
     lifecycle-dependent legality/behavior → State; transitions may be requested externally
     a chain of candidates       → Chain of Responsibility
     a hub owning the protocol   → Mediator
     subscribers notified of changes → Observer; listeners may be known

6. Is the structure recursive, or a stable set of types?
     recursive part/whole        → Composite
     stable types, growing ops   → Visitor (or compatible exhaustive dispatch)
     growing types, stable ops   → compare polymorphism with the existing extension/fallback contract
```

## The decision tree, used honestly

```text
Is there a real, present variation or a named force?
  no  → no pattern. Stop.
  yes ↓

Would a language feature, composition, a function value, DI,
configuration or a framework mechanism resolve it?
  yes → retain it if consumer/lifecycle contracts fit; state consequences and validation, then stop.
  no  ↓

Which family? (question 1)
  ↓
Which discriminator? (questions 2–6)
  ↓
Shortlist of 1–3 candidates
  ↓
If their roles remain ambiguous, use gof-pattern-confusion
  ↓
Name the consequences you are accepting, then decide.
```

Two failure modes this ordering prevents: entering at "which family" without having established
that anything varies, and leaving with a name but no statement of what got worse.

## Decision rules

```text
IF two patterns both seem to fit
THEN they may be alternatives or complementary roles. Ask what the caller
     must not know, who owns lifecycle/dispatch and whether the patterns
     compose before declaring the problem under-specified
     (gof-pattern-confusion).

IF the shortlist is empty
THEN the problem may not be an object-design problem at all: it may be
     a data problem (configuration), a boundary problem (architecture),
     or a workload problem (measure first).

IF the selected pattern introduces shared state, hidden control flow,
identity/copy semantics or remote access
THEN read its "when it is not" and failure modes. Risk comes from the
     mechanism and context, not membership in a fixed six-pattern list.

IF the design already has patterns and they are producing friction
THEN check the conflict list and identify which force is no longer served.
     Simplification, boundary translation or an explicit composition may
     be correct; do not prescribe removal before diagnosis.

IF a pattern is chosen because a similar module uses it
THEN that is precedent, not a reason. Re-derive it, or state that the
     consistency itself is the justification.

IF the same selection is being made repeatedly across modules
THEN reuse the existing convention. Document a missing shared decision only
     when it helps future choices; consequential ADRs follow project conventions
     (architecture-decision-making).
```

## Compositions that work, and pairs that fight

```text
Reinforcing
  Composite + Visitor            a tree, and operations over it
  Composite + Iterator           traversal separated from structure
  Abstract Factory + Builder     the family creates; the builder assembles
  Command + Memento              local undo where restoring owned state is sufficient
  Command + Chain                a request offered to handlers in turn
  State + Command                requested actions drive validated transitions
  Strategy + Template Method     an inherited skeleton may also call injected policies
  Decorator + Proxy              a stack of behaviour over a controlled subject
  Adapter + Bridge               an adapter translates an incompatible backend contract
  Observer + Mediator            the hub notifies; participants do not couple

Fighting
  Global static Singleton + isolated tests hidden mutable state defeats the seam
  Observer + assumed ordering     ordering is absent unless the implementation contracts it
  Decorator + identity checks    wrappers change `==`/runtime type; equality needs an explicit policy
  Flyweight + unsafe shared state mutation leaks across unrelated callers
  Visitor + a growing type set   review required specialization, fallback and compatibility
  Mediator + duplicate owners    competing decisions for the same protocol transition
  Remote proxy + per-item calls  may add avoidable network round trips
  Template Method + open         base changes may break external extension contracts
    subclassing
  Prototype + new-entity intent  accidentally retaining the original's id/version
```

These are composition opportunities and conflict signals, not proof that a pattern must be added
or removed. Inspect the actual contract and retain an adequate existing design.

## References

- [Selection matrix](references/selection-matrix.md) — design problems in the left column, the
  candidate patterns, the simpler alternatives that usually win, and the criterion that decides
  between them. The primary lookup table; read it when a problem is stated and a shortlist is
  needed.
- [Relationship graph](references/relationship-graph.md) — which patterns imply, replace, combine
  with or are commonly mistaken for which, expressed as a graph with the reason on each edge, plus
  the composition and conflict details behind the summary above. Read when two patterns interact,
  or when explaining an existing design.
