---
name: gof-pattern-thinking
description: >
  Reasoning from a design problem to a design, where a Gang-of-Four pattern is one possible
  outcome and "no pattern" is an equally valid one: naming the forces, identifying what
  varies and along how many axes, walking the alternatives ladder from language feature up
  to architecture, and pricing the indirection before adopting it. The first of two stages —
  run this, then gof-pattern-selection maps the result to a shortlist. Use when a pattern
  name is proposed before the problem is stated, when a review must judge whether an
  abstraction earns its place, when factories and strategies have accumulated that trace to
  no requirement, when an indirection needs pricing, or when a design is starting and the
  vocabulary is about to be chosen by habit. Does not cover the individual patterns (the
  gof-* skills), telling lookalike patterns apart (gof-pattern-confusion), the misuse
  catalogue (gof-pattern-antipatterns), enterprise/PoEAA patterns
  (pattern-selection-and-composition), or SOLID as a framing (java-solid).
---

# Pattern Thinking

## Purpose

Produce the simplest design that survives the change the system will actually see. A pattern is
a named set of _consequences_, not a named structure — adopting one means accepting its costs
because a force demands them. The two failures this exists to prevent are opposite and equally
common: the design that names a pattern before it has a problem, and the design that reinvents
one badly because the vocabulary was refused.

The output of this reasoning is frequently **no pattern**. That is a result, not a failure to
find one.

## The order of reasoning

```text
Problem        what breaks, or is about to, in observable terms
    ↓
Context        where it occurs — layer, lifetime, process, boundary
    ↓
Forces         the concerns that compete: change rate, coupling,
               performance, testability, concurrency, compatibility
    ↓
Variation      what varies, along how many axes, and against what
    ↓
Alternatives   the ladder below, cheapest rung first
    ↓
Decision       the cheapest rung that resolves the forces
    ↓
Consequences   what got worse, written down
```

Skipping straight to Decision is what "cargo cult" means concretely. A design that cannot
answer _Variation_ has not earned any structural pattern, because every structural GoF pattern
buys the ability to vary something independently and pays for it in indirection.

## Workflow

1. **State the problem with no pattern name in it.** "Adding a payment provider touches five
   classes and a `switch` in each" is a problem. "We need a Strategy" is a conclusion wearing a
   problem's clothes. If the first sentence cannot be written, there is nothing to design yet.
2. **Name the forces and material tension.** Patterns can resolve competing forces, but may also
   encode a stable collaboration or safety boundary. If the direct implementation already satisfies
   the forces with lower lifecycle/debugging cost, keep it.
3. **Identify axes of variation and evidence.** Two present variants are strong evidence, but a
   single implementation can still sit behind a justified external, ownership, security or testing
   boundary. Price forecast variation explicitly (`java-dry-kiss-yagni`).
4. **Walk the alternatives ladder** below and stop at the first rung that resolves the forces.
   Read [references/alternatives-ladder.md](references/alternatives-ladder.md) for the rung
   definitions and worked eliminations.
5. **If a pattern is selected, name its consequences out loud** — the indirection, the extra
   lifecycle, the dispatch site that moved out of sight, the thing that got harder to read. If
   none can be named, the pattern is not yet understood well enough to adopt.
6. **Re-check the boundary.** If the collaboration crosses a process, the local pattern's
   guarantees do not travel with it (`gof-patterns-and-distribution`).

## The alternatives ladder

```text
0  Nothing              inline it; the variation is not real yet
1  Language feature     record, sealed interface + exhaustive switch,
                        enum, generics, Optional, method reference
2  Composition          hold a collaborator in a field and delegate
3  Function value       Function/Predicate/Supplier/Consumer, or a
                        single-method domain interface, passed as a lambda
4  Dependency injection the container selects and wires the variant
5  Configuration        the variation is data, not code
6  Framework mechanism  filter chain, interceptor, event listener,
                        converter registry, client builder
7  GoF pattern          a named structure with named consequences
8  Architectural pattern the problem is a boundary problem, not an
                        object problem (ports and adapters, CQRS, saga)
```

Rungs 1–6 are not "avoiding patterns" — several of them _are_ the pattern, expressed through a
mechanism that already exists. A `Comparator` lambda is Strategy. A servlet filter chain is
Chain of Responsibility. The distinction that matters is **design intent versus implementation
mechanism**: recognising the intent is what keeps the design legible; hand-building the
classical structure when rungs 1–6 already supply the mechanism is what makes it bloated.

## Decision rules

```text
IF the problem statement contains a pattern name
THEN restate it as what breaks, and re-decide from the restatement.

IF one implementation exists and no second is scheduled
THEN do not claim runtime variability. Still retain a structural pattern
     when it enforces dependency direction, translates a foreign protocol,
     narrows authority or creates an intentional failure-injection seam.

IF variation is one axis and each variant is one behaviour
THEN rung 3 — a function value — before Strategy classes.

IF variation is along two or more independent axes
THEN one axis as types, the others composed. Never as subclass layers.

IF the set of variants is closed and you own all of them
THEN sealed interface + exhaustive switch, and re-examine Visitor,
     State and Strategy against it (gof-patterns-in-modern-java).

IF the set of variants is open to code you will never see
THEN an interface, and usually a creational pattern to select it.

IF the "variation" is data — rates, limits, endpoints, flags
THEN configuration. Class-per-value is the commonest false pattern.

IF the pattern is being adopted for performance
THEN measure first; indirection is a cost, not a benefit
     (java-performance, jmh-microbenchmarks).

IF the collaboration crosses a process boundary
THEN the design problem is failure semantics, not object structure
     (gof-patterns-and-distribution).

IF the pattern would exist to make failure or nondeterminism testable
THEN first remove hidden ambient dependencies where possible. A seam over
     an external system, clock or nondeterministic source may itself be the
     correct production boundary (java-test-design).
```

## What a pattern costs — price these before adopting

- **A dispatch site moves out of sight.** After Strategy, State, Visitor or Chain of
  Responsibility, "what runs here" is answered by wiring rather than by reading. That is the
  trade, and it pays only when the wiring changes more often than the reading.
- **A lifecycle appears.** Creational patterns, Flyweight, Proxy and Singleton each introduce
  "who makes this, when, and how many" — and with it the thread-safety and
  initialisation-order questions a plain `new` does not have.
- **The type count rises faster than the behaviour count.** Two variants behind an interface is
  three types where there was one; the ratio improves only if variants keep arriving.
- **Stack traces and debugging sessions get longer.** Decorator stacks and handler chains are
  read at 3 a.m. by someone who did not write them.
- **Tests gain seams and lose reality.** More seams mean more mock-based tests, which pass
  while the composed whole is broken (`java-test-doubles`).

## Review checklist

- [ ] The problem is stated in observable terms, with no pattern name in it
- [ ] The forces and material tension/boundary are named
- [ ] What varies is identified, with its axes and today's cardinality
- [ ] Rungs 0–6 were each rejected for a stated reason
- [ ] The pattern's consequences are written down, including what got worse
- [ ] Every one-implementation interface has a concrete boundary, authority or testability reason
- [ ] The variation is code, not data that belongs in configuration
- [ ] Any performance claim rests on a measurement, not on structure
- [ ] If the collaboration crosses a process, failure semantics are designed, not inherited

## References

- [The alternatives ladder](references/alternatives-ladder.md) — each rung defined by the force
  it resolves and the force it fails to resolve, five worked eliminations where a proposed
  pattern collapsed into a lower rung, and one where it correctly did not. Read when deciding
  whether a pattern is justified.
- [Pattern inventory](references/pattern-inventory.md) — the 23 patterns in one table: category,
  the primary design problem each solves, misuse risk, boundary class, and the skill that owns
  it. Read to locate the right skill, or to check that a proposed pattern addresses the problem
  actually at hand.
