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
returns rows; Remote Facade over a fine-grained service). A design of individually
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

1. **Answer the nine inputs** for the module — not for the system. Different modules
   legitimately reach different answers.
2. **Choose the logic organisation first.** It constrains everything downstream
   (`domain-logic-organization`).
3. **Choose the data-source pattern** consistent with it (`data-source-patterns`).
4. **Add only the patterns a named force requires.** Each addition must trace to an input.
5. **Check the composition** against the conflicts list in the references. Fix the friction
   by removing a pattern, not by adding an adapter between them.
6. **Write down the choices with their forces**, so the next person can re-open a decision
   on evidence (`architecture-decision-making`).

## Selection rules

```text
Rules do not interact; work is per-transaction
        → Transaction Script + Table Data Gateway.
          Add a Service Layer only if a use case writes twice.

Rules interact; invariants span objects; schema is yours
        → Domain Model (entities with behaviour) + Data Mapper (JPA) +
          Repository per aggregate + Service Layer for the transaction.

Rules interact; schema is owned elsewhere or must diverge
        → Domain Model + separate persistence model + explicit Mapper.
          Pay the mapping; you are buying independence.

Mostly CRUD; entity ≈ table; you own the schema
        → Active Record. No repository abstraction, no service layer,
          no DTO for internal use. Say it is deliberate.

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
        → Remote Facade + DTO. Both, always; one without the other is
          either a chatty API or a leaked model.

A remote boundary is being CONSIDERED
        → module boundary first; distribute only for a named driver
          (distribution-boundaries).

Multi-request conversation state
        → place it per item (session-state-strategies), not as a
          session by default.
```

## Composition rules

- **Domain Model implies a Unit of Work and an Identity Map**, whether you write them or the
  ORM provides them. Design as if they are there, because they are
  (`orm-behavioral-patterns`).
- **Repository implies an aggregate.** A repository without one is a per-table DAO with a
  fashionable name (`repository-pattern`).
- **Remote Facade implies DTOs.** A coarse operation returning domain objects re-couples the
  caller to the model, and the facade's whole purpose was one round trip with a stable
  payload.
- **Optimistic Offline Lock implies an identity field, a version and a conflict experience.**
  The first two are mechanical; the third is where implementations fail.
- **Service Layer implies a transaction boundary.** Without one it is a forwarding
  convention, and forwarding conventions become god services
  (`service-layer-design`).
- **Table Module implies set-based operations** that bypass the domain model's invariants —
  legitimate, and it must be named and bounded, not accidental.
- Reads and writes may use different patterns, and in any non-trivial system they should.
  This is the most under-applied composition in enterprise architecture and the one that
  resolves most performance–purity arguments (`architecture-and-performance`).

## Conflicts to check for

```text
Domain Model + repositories returning rows/DTOs
        → the model is never loaded, so its invariants never run.

Domain Model + a repository per table
        → the aggregate boundary does not exist; any part can be
          written without the whole's rules.

Active Record + a Repository abstraction + DTOs everywhere
        → paying a Data Mapper's price for Active Record's coupling.
          Choose one position.

Transaction Script + a rich domain model half-built
        → two homes for every rule; the rule will be in the wrong one.

Remote Facade + fine-grained service methods behind it
        → the facade forwards call-for-call and the chattiness moved
          inside; latency is unchanged.

Aggregate + bulk updates that skip the version
        → optimistic locking is silently defeated
          (offline-concurrency-control).

Lazy Load + entities crossing a boundary
        → LazyInitializationException, or Open Session In View and its
          costs.

Coarse-Grained Lock + a large aggregate
        → contention. Resize the aggregate; do not weaken the lock.

Distribution + a shared database
        → one service with a network inside it.
```

## References

- [Selection criteria](references/selection-criteria.md) — the nine inputs turned into
  questions with observable answers, worked selections for four common system shapes, and
  the decisions that should differ per module rather than per system. Read when starting a
  module or reviewing a proposed set of patterns.
- [Reference architectures and the relationship graph](references/reference-architectures.md)
  — four complete compositions traced end to end (rich domain, transaction script, remote
  API, read/write split), the pattern relationship graph showing which pattern implies
  which, and the consequences of each composition stated concretely. Read when assembling an
  architecture or explaining an existing one.
