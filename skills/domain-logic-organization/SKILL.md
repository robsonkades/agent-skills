---
name: domain-logic-organization
description: >
  Choosing where business rules live — Transaction Script, Domain Model or Table Module —
  from the shape of the logic rather than from convention, and recognising when the choice
  made no longer fits. Use when starting a new module and the "standard" layered structure
  is about to be applied by default, when a service class has grown past a thousand lines of
  procedural steps, when entities have only getters and setters and every rule sits in a
  service, when the same business rule is implemented in three places, when a domain model
  is proposed for CRUD screens, when set-based updates are being rewritten as object loops,
  or when a report needs data that the aggregate boundary makes expensive to reach. Does not
  cover the application service that wraps whichever choice you make (service-layer-design),
  the persistence patterns underneath it (data-source-patterns, repository-pattern),
  transaction boundaries (enterprise-transactions), or the migration between organisations
  once chosen (architecture-refactoring-paths).
---

# Domain Logic Organization

## Purpose

Decide where business logic goes, on evidence about the logic itself. This consequential
decision in an enterprise application affects what a change costs for
the rest of the system's life, and it is routinely made by habit — a domain model because
the team read about aggregates, or a service class because the previous project had one.

Two failures recur. A rich domain model over five CRUD
screens buys mapping code, aggregate loads and a learning curve to protect invariants that
do not exist. A procedural service layer over genuinely interacting rules produces the same
rule written four times, each slightly different, discovered when they disagree in
production.

## The three organisations

```text
Transaction Script     one procedure per business transaction; data is
                       structures; logic is steps. Cost grows with rule
                       interaction, not with rule count.

Domain Model           objects with data and behaviour, mirroring the
                       business; invariants enforced by the objects that
                       own them. Costs a mapping layer and a load path.

Table Module           one class per table (or per record type) holding
                       the logic for all rows of that table; operates
                       over a record set rather than per-instance.
                       Set-oriented, close to the data, no identity map.
```

The distinction that matters is not "objects versus procedures" but **where an invariant is
enforced**: in every procedure that touches the data, in the object that owns the data, or
in the table class that owns the set.

## Workflow

1. **Inventory the rules, not the entities.** List the actual business rules, then mark
   which ones depend on other rules or on state the operation must first establish. Rule
   _interaction_, not rule count, is the deciding evidence. Reuse existing use-case tests,
   decisions and change history; inspect callers and observed change or load costs before
   asking for missing evidence. Retain an adequate organization when no material problem
   or new requirement justifies changing it.
2. **Check for shared state across operations.** If six operations must each maintain the
   same invariant, identify one logical owner: a shared policy may suffice, while a Domain
   Model can own interacting state transitions. Check all writers, not just public methods.
   If each operation stands alone, procedures are often cheaper and clearer.
3. **Check the shape of the work.** Per-instance decisions favour a Domain Model.
   Set-shaped work — recalculate every line in a batch, apply a rate change to a million
   rows — favours Table Module or plain SQL. Object hydration can add major allocation and
   round-trip cost; measure the workload rather than assuming a ratio
   (`architecture-and-performance`).
4. **Check the volatility.** Rules that change monthly reward the organisation that makes a
   change local. Rules that have not changed in five years reward the one with least
   ceremony.
5. **Decide per module, not per system.** A pricing engine and an admin CRUD screen may
   benefit from different organisations. Require evidence for uniformity rather than
   forcing either sameness or difference.
6. **Write down the criterion that would flip the decision** — for example, independent
   pricing operations repeatedly diverge on one stateful invariant. Rule count alone is
   not that criterion. Record the selected or retained owner, a material alternative,
   preserved caller/transaction behavior and a validation case. Distinguish checks performed
   from proposed checks; use an ADR for consequential decisions under project conventions,
   not every routine grouping choice. A recommendation is not an implemented migration.

## Decision rules

```text
Data in, validate, write out; rules do not interact; a few branches
        → Transaction Script. The domain model here is pure cost.

Rules interact and coordinating their state across operations is costly
        → Consider Domain Model with explicit invariant ownership; compare
          a shared policy/function when stateful objects add no benefit.

An invariant must hold across several operations that update the same
data
        → Give the invariant one logical owner; a Domain Model can enforce
          object transitions, while constraints and transaction/concurrency
          rules must also protect competing writers.

Logic is genuinely per-table and set-shaped; the platform gives strong
record-set tooling; reporting and bulk updates dominate
        → Table Module, or set-based SQL through a suitable existing
          repository/gateway. Preserve invariant and concurrency semantics;
          do not hydrate objects solely to express a set operation.

Complex logic on data owned and shaped by someone else (mainframe, vendor
schema, partner feed)
        → Domain Model plus a translation layer, so the foreign shape does
          not become the model (legacy-enterprise-modernization).

Mostly CRUD with a handful of validations, screens map to tables
        → Transaction Script or Active Record. Both are honest; the
          domain model is not (data-source-patterns).

Cannot tell yet, module is new and small
        → Transaction Script. It is the cheapest to write and the cheapest
          to convert once the rules reveal their shape
          (architecture-refactoring-paths).
```

## Rules

- Rule interaction, invariant ownership, volatility and set/per-entity work are evidence—not a
  universal count threshold. A dependency map or examples of duplicated decisions are stronger
  than saying “the domain is complex,” but “a dozen rules” does not mechanically select a model.
- **The anaemic domain model is a cost question, not a purity complaint** — but only where
  a domain model was the right choice. Trace whether callers can bypass or duplicate a
  stateful invariant. Data-only ORM entities can serve deliberate scripts and shared policies;
  their mapping may still pay for itself. Move rules or remove structure only when the
  resulting ownership and change cost improve, preserving required persistence behavior.
- A Transaction Script is not a lesser architecture. For non-interacting rules it is
  often simpler to change and test. Choose it deliberately and say so,
  so the next reader knows it was a decision.
- Transaction Scripts often fail through duplicated or inconsistent rules. Even two occurrences
  can be material when correctness or change frequency is high; use divergence and change cost,
  not an occurrence threshold.
- Domain Models fail in three ways worth watching for: aggregates too large to load, logic
  that leaked into services anyway, and read paths forced through the write model.
  Load amplification is visible in traces/query logs; leaked business decisions require
  source and change-history inspection as well.
- Table Module is dismissed too quickly in Java, where record-set tooling is weaker than
  the platforms it was written for — but its idea survives as a gateway or a service that
  owns set-based SQL for one table, and that is frequently the right home for bulk work
  next to a domain model doing per-instance work.
- Reads and writes may use different organisations when their forces differ. Preserve write
  invariants; use projections or SQL when they avoid unnecessary model loads, and retain bounded
  entity reads when appropriate (`query-objects-and-specifications`).
- Do not decide from the persistence pattern. Active Record does not compel Transaction
  Script and JPA does not compel a domain model; the organisation of logic and the
  data-access pattern are separate choices that constrain but do not determine each other.
- A rewrite is rarely the answer to "we chose wrong". These organisations coexist per
  module, and the migration paths are incremental
  (`architecture-refactoring-paths`).

## References

For implementation changes, inspect compiler/runtime, Spring/JPA versions, persistence access
strategy and transaction proxy configuration. Examples are partial sketches with fixture types
omitted; the JdbcClient variant needs Spring 6.1+ and Java 17+, while sealed/pattern constructs
have the release requirements stated below. Preserve the target rather than upgrading it.
When rules or workload evidence are missing, document the provisional choice and the smallest
example/measurement that could change it.

- [Transaction Script and Table Module](references/transaction-script-and-table-module.md)
  — both patterns worked properly: how to keep scripts from becoming a god service, where
  their duplication actually appears, Table Module's modern Java form, and the honest
  ceiling of each. Read when the logic is thin or set-shaped, or when a service class has
  outgrown its structure.
- [Domain Model](references/domain-model.md) — what makes a model rich rather than
  anaemic, invariants and their enforcement point, the aggregate load cost, the failure
  modes (giant aggregate, leaked logic, read path through the write model), and how to tell
  a real domain model from an object-shaped script. Read before proposing a domain model,
  and when auditing one that is not paying off.
