---
name: enterprise-application-architecture
description: >
  The entry point for reasoning about an enterprise application's architecture: what makes
  these systems distinctive (data that outlives the code, concurrent users, integration,
  rules that change), the forces that shape every decision, how the kind of application
  changes the answers, and which specific skill answers which question. Use when starting on
  an unfamiliar enterprise codebase, when designing a new application or module and the
  first structural decisions are open, when someone asks "how should this system be
  structured", when a design review has no shared vocabulary, when a decision needs to be
  located ("is this a persistence question or a domain question?"), or when an architecture
  must be explained to people who did not build it. Does not itself contain the pattern
  guidance — it routes to it — and does not cover team or delivery process.
---

# Enterprise Application Architecture

## Purpose

Give an enterprise application's architecture a starting point that is not a diagram: the
forces that actually shape these systems, the small number of decisions that determine
everything else, and where to find each one.

What makes enterprise applications their own discipline is not size. It is a specific
combination: **data that outlives the application**, many concurrent users who do not know
about each other, business rules that are arbitrary and change, and integration with systems
nobody controls. Every pattern in this family exists to handle some part of that.

## The forces

```text
Business complexity      rules that are arbitrary, interacting, and revised
Data complexity          a schema that outlives the code, and often
                         predates it and is owned by someone else
Concurrency              users editing the same data over minutes, not
                         milliseconds
Consistency              which invariants must hold immediately, and which
                         may hold eventually
Performance              round trips, transaction duration, read/write
                         asymmetry
Availability             what still works when a dependency does not
Integration              systems you cannot change and cannot trust
Organisation             who owns what, who deploys when
Maintainability          the system will be edited by people who did not
                         write it, for a decade
Operability              what happens at 3 a.m., and who can diagnose it
```

Every decision below trades some of these against others. A design that claims to satisfy
all of them has deferred a cost, not avoided one.

## The decisions that determine everything else

In a useful discovery order, not a universal dependency chain. Existing constraints often require
iteration—for example, concurrency or a fixed schema may reshape aggregate and transaction choices.

```text
1. Where do business rules live?        → domain-logic-organization
2. How does code reach the database?    → data-source-patterns
3. Where is the transaction boundary?   → enterprise-transactions
4. What are the aggregates? (if a
   domain model)                        → domain-logic-organization,
                                          repository-pattern
5. How are concurrent edits handled?    → offline-concurrency-control
6. How are reads served?                → query-objects-and-specifications
7. What crosses each boundary?          → remote-facade-and-dto,
                                          layering-and-boundaries
8. Which boundaries are remote?         → distribution-boundaries
```

Use these as discovery questions for the affected use case, not evidence that an existing
choice is defective. Prioritize the decisions that change the required outcome.

## Workflow for an unfamiliar system

Start with the supplied business/consumer use case, desired outcome, acceptance criteria and
binding constraints, including approved architecture decisions. Reuse repository and runtime
evidence before asking; clarify only missing facts that change the choice or handoff. For a
new module, inspect the surrounding contracts and supported framework before inventing structure.

1. **Compare actual decisions with documented intent**: where the rules are,
   what the repositories return, where `@Transactional` appears, whether versioning exists,
   whether reads use the write model. Trace representative call paths and effective transaction
   configuration; annotation presence alone does not prove a boundary is active. Observed behavior
   does not override a requirement or establish that a deviation was accepted. Inspect the
   project's Java/framework/database versions before handing off version-sensitive advice;
   this routing skill imposes no Java baseline or upgrade.
2. **Identify the application's kind** (`references/application-types.md`) — a batch-heavy
   integration hub and a transactional web application have different right answers, and
   applying one's architecture to the other is a common source of accidental complexity.
3. **Locate the pain**: what is slow, what breaks, what is expensive to change. Use evidence
   — files touched per feature, query counts, incident history.
4. **Route only the relevant question**, carrying existing evidence and constraints to its owner
   (`references/navigating-the-family.md`); do not restart the investigation at each handoff.
5. **Record the rationale proportionately** (`architecture-decision-making`). Consequential
   decisions or project policy can warrant an ADR; routine orientation or an adequate existing
   choice may need only a short explanation, not a new architecture record.

Deliver a short map of selected or retained decisions: required outcome, observed evidence,
inferred force, unresolved constraint, specialist handoff and an acceptance check that could
confirm or change the choice. Stop routing once the bounded question, owner and check are clear;
an explanation or supported no-change outcome is valid. A routed plan is not implemented architecture.
If workload or implementation evidence is unavailable, keep the architecture proposal conditional
and identify the smallest missing trace, representative use case or owner answer needed.

## Decision rules

```text
Starting a new module and the structure is open
        → use the eight decisions as a discovery guide, revisiting them
          as constraints emerge. Check an existing reference architecture
          against the forces and honor binding project constraints
          (pattern-selection-and-composition).

An unfamiliar codebase, and the question is "how is this built?"
        → the seven-question description in
          pattern-selection-and-composition, then this family's skills
          for anything that looks wrong.

Something is slow
        → use the supplied operation/workload evidence to localize the cause
          (performance-methodology). Route measured query/call multipliers,
          resource hold intervals or data-boundary costs to
          architecture-and-performance; do not infer an architectural defect
          from latency alone.

Something is expensive to change
        → count files touched per feature, then look for excessive
          layering, a god class or a missing boundary
          (enterprise-architecture-smells).

Something is wrong under concurrency
        → decide whether the conflict is inside a transaction
          (enterprise-transactions) or across a user's thinking time
          (offline-concurrency-control). They have different answers.

A rewrite is being proposed
        → architecture-refactoring-paths for a pattern change;
          legacy-enterprise-modernization for a system-level programme.
          Compare retention, targeted changes and replacement where the choice
          remains open, including compatibility, coexistence and recovery cost.
          Do not reopen an accepted target without relevant new evidence.

A pattern name is being used as a justification
        → identify the force or binding constraint it answers
          (architecture-decision-making).
```

## Rules

- **Enterprise architecture is decided by forces, not by fashion.** A pattern is the output
  of reasoning about a problem; a pattern without a relevant force or binding constraint is
  a preference, not an engineering justification.
- Data often outlives an application and may predate it. Destructive schema/data semantics can be
  highly irreversible, while additive schemas can evolve safely; classify reversibility instead of
  ranking every schema decision as the hardest
  (`architecture-decision-making`).
- **Different modules of one application legitimately have different architectures.** A
  pricing engine and an admin CRUD screen have different forces; forcing one structure onto
  both is a major source of accidental complexity.
- Reads and writes can have different requirements. Separate models/projections when measured query
  shape or invariant needs justify synchronization, mapping and consistency cost
  (`query-objects-and-specifications`).
- **Layers and tiers have different costs.** Source boundaries can still impose widespread API and
  build migration; a network adds partial failure and operations. Process boundaries are expensive
  but reversible through consolidation or strangling (`distribution-boundaries`).
- Frameworks implement many of these patterns already. Knowing which — and what their
  versions actually guarantee — prevents both rebuilding them and relying on guarantees
  nobody makes (`patterns-and-modern-frameworks`).
- **The cost of an architecture is paid in change.** Judge a design by what a typical feature
  costs alongside its required user, correctness and operational outcomes; measure change cost
  from history rather than treating a file count alone as a defect.
- For an existing production system, prefer compatible, verifiable increments when coexistence
  is viable. A bounded cutover may fit the actual constraints better; make its consumer and
  recovery contract explicit (`architecture-refactoring-paths`).

## References

- [Kinds of enterprise application](references/application-types.md) — transactional,
  workflow, data-intensive, integration, reporting, batch and event-driven systems: the
  forces that dominate each, the architectural answers that follow, and how a system that is
  several of these at once should be split. Read when the system's character is unclear or
  when one architecture is being applied uniformly.
- [Navigating this family](references/navigating-the-family.md) — the full map of skills in
  this family, organised by the question they answer, with the symptom that should send you
  to each and the boundaries between neighbours. Read when locating a decision, or when
  something is wrong and it is not clear which discipline owns it.
