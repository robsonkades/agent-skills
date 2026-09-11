---
name: gof-pattern-thinking
description: >
  Reasoning from a design problem to a design, where a Gang-of-Four pattern is one possible
  outcome and "no pattern" is an equally valid one: naming the forces, identifying what
  varies and along how many axes, walking the alternatives ladder from language feature up
  to architecture, and pricing the indirection before adopting it. Use gof-pattern-selection
  to shortlist unresolved choices once the forces are understood. Use when a pattern
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
because a force demands them. The two failures this exists to prevent are the design that names
a pattern before it has a problem, and the design that reinvents one badly because the vocabulary
was refused.

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
Alternatives   relevant options below, direct implementation first
    ↓
Decision       lowest justified lifecycle cost among viable options
    ↓
Consequences   what got worse, written down
```

Skipping straight to Decision is what "cargo cult" means concretely. A design that cannot
identify a concrete variation, collaboration or boundary has not justified the indirection.
Adapters and facades can earn their place through compatibility or a stable subsystem boundary
without forecasts of new variants.

Java compatibility is a decision constraint: inspect compiler release/toolchains and dependencies.
[Records became final in Java 16](https://openjdk.org/jeps/395),
[sealed types in Java 17](https://openjdk.org/jeps/409), and
[pattern switch in Java 21](https://openjdk.org/jeps/441). Do not introduce
preview features or upgrade a project to fit an example. On older targets, compare supported
language features and ordinary method dispatch. Missing evidence keeps a forecast or performance
benefit conditional, rather than turning it into an assumed requirement.

## Workflow

Reuse the request, caller code, tests, wiring and change history before asking for context.
Inspect ordinary use, relevant extension/lifecycle use and misuse or failure behavior before
choosing implementation structure. Separate required contracts and project conventions from
preferences and forecasts. Ask only about unresolved constraints that could change the decision;
state minor reversible assumptions and continue independent investigation.

1. **State the problem with no pattern name in it.** "Adding a payment provider touches five
   classes and a `switch` in each" is a problem. "We need a Strategy" is a conclusion wearing a
   problem's clothes. If the problem is unclear, investigate the observed behavior and intended
   outcome; keep a recommendation conditional on material missing evidence.
2. **Name the forces and material tension.** Patterns can resolve competing forces, but may also
   encode a stable collaboration or safety boundary. If the direct implementation already satisfies
   the forces with lower lifecycle/debugging cost, keep it.
3. **Identify axes of variation and evidence.** Two present variants are strong evidence, but a
   single implementation can still sit behind a justified external, ownership, security or testing
   boundary. Price forecast variation explicitly (`java-dry-kiss-yagni`).
4. **Compare relevant alternatives** below, starting with the direct implementation. The ladder
   is a search aid, not a universal cost ranking: configuration, DI and function values can compose.
   Include materially different ownership, extension or lifecycle choices even when a lower rung
   works. A focused caller sketch or contract check can resolve uncertainty without a full redesign.
   Read [references/alternatives-ladder.md](references/alternatives-ladder.md) for the rung
   definitions and worked eliminations.
5. **If a pattern is selected, name its consequences out loud** — the indirection, the extra
   lifecycle, the dispatch site that moved out of sight, the thing that got harder to read. If
   none can be named, the pattern is not yet understood well enough to adopt.
6. **Deliver a proportionate decision:** problem, evidence, chosen mechanism, relevant alternative,
   consequence and verification. State any remaining assumption and what would change the choice.
   Stop when the evidence supports a decision; “no change” needs no catalogue-wide elimination report.
7. **Re-check the boundary.** If the collaboration crosses a process, the local pattern's
   guarantees do not travel with it (`gof-patterns-and-distribution`).

## The alternatives ladder

```text
0  Nothing              keep it direct when no force requires indirection
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
THEN compare a function value with a named role object. Preserve public contracts,
     metadata, stable identity and resource lifecycle; one method alone does not
     establish that a lambda supplies the same contract.

IF variation is along two or more independent axes
THEN compare composition to a subclass cross-product. Keep a small hierarchy when
     substitutability and shared invariants justify it; do not multiply classes mechanically.

IF the set of variants is closed and you own all of them
THEN compare sealed types/switch against method dispatch, accounting for Java version,
     state-owned behavior and type-versus-operation evolution (gof-patterns-in-modern-java).

IF the set of variants is open to code you will never see
THEN define an extension contract and discovery/selection/lifecycle policy.
     An injected implementation or registry may suffice; a factory is not mandatory.

IF the "variation" is data — rates, limits, endpoints, flags
THEN compare a value/table/enum or validated configuration with the existing design.
     Choose from actual identity, validation and change-approval requirements;
     data alone does not require external configuration or runtime reload.

IF the pattern is being adopted for performance
THEN state the proposed mechanism and measure against a baseline; a pattern name
     proves neither overhead nor speedup, and caching/sharing can avoid work
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
  trade; stable boundaries, testability and ownership can justify it even if wiring rarely changes.
- **A lifecycle appears.** Creational patterns, Flyweight, Proxy and Singleton each introduce
  "who makes this, when, and how many" — and with it the thread-safety and
  initialization-order questions. Direct construction also needs ownership and safe publication;
  the pattern may centralize an existing responsibility rather than create it.
- **The type count rises faster than the behaviour count.** Two variants behind an interface is
  more declarations to navigate. Count only added complexity, and weigh boundary guarantees;
  type ratios are not a quality metric and more variants are not required to justify a seam.
- **Stack traces and debugging sessions get longer.** Decorator stacks and handler chains are
  read at 3 a.m. by someone who did not write them.
- **Tests can overuse seams.** Mock-only tests can pass while composition is broken.
  Keep contract and integration checks where wiring or collaborator semantics matter (`java-test-doubles`).

## Review checklist

- [ ] The problem is stated in observable terms, with no pattern name in it
- [ ] The forces and material tension/boundary are named
- [ ] What varies is identified, with its axes and today's cardinality
- [ ] Relevant simpler alternatives were compared; mechanisms can combine without visiting every rung
- [ ] The pattern's consequences are written down, including what got worse
- [ ] Every one-implementation interface has a concrete boundary, authority or testability reason
- [ ] Data-only variation preserves identity, validation and change controls; configuration is an option
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
