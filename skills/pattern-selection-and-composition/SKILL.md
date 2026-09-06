---
name: pattern-selection-and-composition
description: >
  Choosing enterprise patterns from forces rather than familiarity, and combining them into
  an architecture whose parts reinforce rather than fight each other: the selection criteria
  that discriminate, the compositions that work, the pairs that conflict, and the
  relationship graph. Use when a design is starting and the patterns are about to be chosen
  by habit, when a pattern name is proposed before the problem is stated, when two chosen
  patterns produce friction, when a reference architecture is being copied wholesale, when
  someone asks which enterprise patterns a new module should use, or when an architecture
  must be explained as a set of decisions. Does not cover the individual patterns' guidance,
  whether the framework provides one (patterns-and-modern-frameworks), or detecting overuse
  (enterprise-architecture-smells).
---

# Pattern Selection and Composition

## Purpose

Derive an architecture from forces, and check that its parts fit. Patterns are the _output_
of reasoning about a problem, never the input — "we will use a domain model with
repositories and DTOs" stated before the forces are known is a preference, and it will be
defended rather than tested.

The second half matters as much: patterns interact. Some pairs reinforce each other (Domain
Model with Unit of Work and Identity Map); some fight (Domain Model with a repository that
returns rows on its invariant-enforcing write path; a facade that leaves remote calls chatty). A design of individually
defensible choices can still be incoherent.

## The selection inputs

```text
Business complexity      do the rules interact? how many are conditional
                         on other rules?
Data complexity          does the object model diverge from the schema?
                         who owns the schema?
Work shape               per-instance decisions, or set-shaped work?
Concurrency              conflicts within a transaction, or across a
                         user's thinking time?
Transaction scope        one write, several writes, or across a boundary?
Distribution             one process, or several? whose driver?
Performance              round-trip budget; read/write asymmetry
Team and lifespan        who maintains it, for how long, at what size
Operational constraints  deploy cadence, ownership, regulatory limits
```

Everything below is derived from these. If a pattern cannot be traced back to one of them,
it has no justification yet.

## Workflow

1. **Inspect evidence for the relevant inputs** for the module — not just the system.
   Reuse accepted constraints and existing code. Record consequential unknowns and investigate
   the smallest missing basis; do not require nine new answers for a small decision.
2. **Start with logic organisation, then iterate with fixed schema, transaction, concurrency and
   delivery constraints.** It constrains many downstream choices but is not a one-way dependency
   (`domain-logic-organization`).
3. **Choose the data-source pattern** consistent with it (`data-source-patterns`).
4. **Add only the patterns a named force requires.** Each addition must trace to an input.
5. **Check the composition** against the conflicts list in the references. Fix the friction
   by removing unjustified machinery or correcting boundaries. An adapter is justified when
   independently owned contracts must coexist; measure its cost instead of forbidding it.
6. **Write down the choices with their forces**, so the next person can re-open a decision
   on evidence (`architecture-decision-making`).

## Selection rules

These are candidates to compare with the existing design, not mandatory stacks. Schema
ownership does not alone require duplicate object models; use explicit mapping when the
semantic/API independence gained justifies conversion and synchronization costs.

```text
Rules do not interact; work is per-transaction
        → Transaction Script + Table Data Gateway.
          Add a Service Layer when transaction, authorization, orchestration or a stable use-case
          boundary earns it—not from a write-count threshold.

Rules interact; invariants span objects; schema is yours
        → Domain Model (entities with behaviour) + Data Mapper (JPA) +
          Repository per aggregate + Service Layer for the transaction.

Rules interact; schema is owned elsewhere or must diverge
        → Domain Model + separate persistence model + explicit Mapper.
          Pay the mapping; you are buying independence.

Mostly CRUD; entity ≈ table; you own the schema
        → consider Active Record where the record owns persistence, or a
          simple mapper/repository-backed CRUD design already supported by the stack.
          Add service/DTO boundaries only for a named contract or policy.

Work is set-shaped (bulk recalculation, indexation, reporting)
        → SQL in a gateway, beside whatever the write side uses.
          Not a domain model looping over objects.

Reads are slow because they go through the write model
        → add a read model (projections/query objects). This is the most
          common missing pattern in otherwise good designs.

Concurrent edits across a user's thinking time
        → Optimistic Offline Lock, coarse-grained at the aggregate.
          Pessimistic only when the lost work is expensive.

A remote boundary exists
        → define coarse-enough operations and an explicit wire contract.
          A dedicated DTO is usual; a stable schema-generated or immutable
          boundary type can already satisfy that role.

A remote boundary is being CONSIDERED
        → module boundary first; distribute only for a named driver
          (distribution-boundaries).

Multi-request conversation state
        → place it per item (session-state-strategies), not as a
          session by default.
```

## Composition rules

- **ORM-backed Domain Models commonly use Unit of Work and Identity Map.** A domain model
  alone implies neither; explicit SQL, immutable models and event persistence can differ.
  Inspect actual persistence semantics rather than inventing ORM behavior
  (`orm-behavioral-patterns`).
- **Repository provides collection-like access to domain objects.** When adopting DDD
  aggregates, organize domain repositories around aggregate roots and protect their mutation
  boundaries; absence of aggregates alone does not make a Repository a DAO (`repository-pattern`).
- **Remote Facade implies DTOs.** A coarse operation returning domain objects re-couples the
  caller to the model, and the facade's whole purpose was one round trip with a stable
  payload.
- **Optimistic Offline Lock implies an identity field, a version and a conflict experience.**
  The first two are mechanical; the third is where implementations fail.
- **Service Layer defines an application operation boundary.** Transaction ownership,
  authorization, orchestration and multiple callers can justify it; read-only or remote
  operations need not start a database transaction
  (`service-layer-design`).
- **Set-based operations need explicit invariant and concurrency handling.** Table Module
  can own business rules over tabular data; it does not inherently bypass every invariant.
- Reads and writes may use different patterns when query and invariant forces diverge.
  This is the most under-applied composition in enterprise architecture and the one that
  resolves most performance–purity arguments (`architecture-and-performance`).

## Conflicts to check for

```text
Domain Model + repositories returning rows/DTOs
        → check write paths for bypassed invariants; separate read projections are compatible.

DDD aggregate + independent write repositories for its child tables
        → inspect whether child writes bypass root invariants; table-oriented
          infrastructure alone does not prove the aggregate boundary is broken.

Active Record + a Repository abstraction + DTOs everywhere
        → paying a Data Mapper's price for Active Record's coupling.
          Choose one position.

Transaction Script + a rich domain model half-built
        → two homes for every rule; the rule will be in the wrong one.

Remote Facade + fine-grained service methods behind it
        → compatible for local calls: aggregating them is the facade's purpose.
          If calls remain remote, inspect the remaining network hops and latency.

Aggregate + bulk updates that skip the version
        → optimistic locking is silently defeated
          (offline-concurrency-control).

Lazy Load + entities crossing a boundary
        → LazyInitializationException, or Open Session In View and its
          costs.

Coarse-Grained Lock + a large aggregate
        → measure contention and invariant scope before resizing; splitting an
          atomic invariant introduces a coordination problem, not a free optimization.

Distribution + a shared database
        → coupled schema, availability and ownership. This may be a deliberate
          transitional or jointly owned architecture; it does not by itself prove
          one service, but it weakens independent evolution.
```

## References

Return the selected/rejected composition, the relevant evidence and constraints, its main
trade-off, and a concrete validation or reconsideration condition. Do not infer a performance
improvement from pattern names; inspect versions and measure the target implementation.

- [Selection criteria](references/selection-criteria.md) — the nine inputs turned into
  questions with observable answers, worked selections for four common system shapes, and
  the decisions that should differ per module rather than per system. Read when starting a
  module or reviewing a proposed set of patterns.
- [Reference architectures and the relationship graph](references/reference-architectures.md)
  — four complete compositions traced end to end (rich domain, transaction script, remote
  API, read/write split), the pattern relationship graph showing which pattern implies
  which, and the consequences of each composition stated concretely. Read when assembling an
  architecture or explaining an existing one.
