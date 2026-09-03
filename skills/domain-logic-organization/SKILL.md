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

Decide where business logic goes, on evidence about the logic itself. This is the highest
consequence decision in an enterprise application: it determines what a change costs for
the rest of the system's life, and it is routinely made by habit — a domain model because
the team read about aggregates, or a service class because the previous project had one.

The two failures are symmetrical and equally common. A rich domain model over five CRUD
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
   _interaction_, not rule count, is the deciding evidence.
2. **Check for shared state across operations.** If six operations must each maintain the
   same invariant, that invariant wants an owner (Domain Model). If each operation stands
   alone, procedures are cheaper and clearer.
3. **Check the shape of the work.** Per-instance decisions favour a Domain Model.
   Set-shaped work — recalculate every line in a batch, apply a rate change to a million
   rows — favours Table Module or plain SQL. Object hydration can add major allocation and
   round-trip cost; measure the workload rather than assuming a ratio
   (`architecture-and-performance`).
4. **Check the volatility.** Rules that change monthly reward the organisation that makes a
   change local. Rules that have not changed in five years reward the one with least
   ceremony.
5. **Decide per module, not per system.** A pricing engine and an admin CRUD screen in the
   same application should not use the same organisation, and forcing them to is a
   significant source of accidental complexity.
6. **Write down the criterion that would flip the decision** — "if the third conditional
   discount rule arrives, this becomes a domain model" — so the re-decision happens on
   evidence rather than after the third production incident.

## Decision rules

```text
Data in, validate, write out; rules do not interact; a few branches
        → Transaction Script. The domain model here is pure cost.

Rules interact: rule B's applicability depends on rule A's outcome, and
there are more than a handful
        → Domain Model. This is the condition the pattern exists for.
          Interaction is what makes procedures duplicate each other.

An invariant must hold across several operations that update the same
data
        → Domain Model, with the invariant enforced by the object that
          owns the data (ddd-style aggregate boundary).

Logic is genuinely per-table and set-shaped; the platform gives strong
record-set tooling; reporting and bulk updates dominate
        → Table Module, or SQL owned by a gateway. Do not load a million
          objects to change a rate.

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
- **The anaemic domain model is a real cost, not a purity complaint** — but only where a
  domain model was the right choice. Entities of getters and setters plus a service holding
  the rules is a Transaction Script with an expensive mapping layer attached: you pay the
  domain model's price and receive its benefits nowhere. Either move the rules into the
  objects or stop paying for the objects.
- A Transaction Script is not a lesser architecture. For non-interacting rules it is
  clearer, faster, easier to test and easier to delete. Choose it deliberately and say so,
  so the next reader knows it was a decision.
- Transaction Scripts often fail through duplicated or inconsistent rules. Even two occurrences
  can be material when correctness or change frequency is high; use divergence and change cost,
  not an occurrence threshold.
- Domain Models fail in three ways worth watching for: aggregates too large to load, logic
  that leaked into services anyway, and read paths forced through the write model. All
  three are visible in the query log before they are visible in the design.
- Table Module is dismissed too quickly in Java, where record-set tooling is weaker than
  the platforms it was written for — but its idea survives as a gateway or a service that
  owns set-based SQL for one table, and that is frequently the right home for bulk work
  next to a domain model doing per-instance work.
- Reads and writes may use different organisations when their forces differ. Protect invariants
  through the model on the write path; serve reads with projections or SQL
  (`query-objects-and-specifications`).
- Do not decide from the persistence pattern. Active Record does not compel Transaction
  Script and JPA does not compel a domain model; the organisation of logic and the
  data-access pattern are separate choices that constrain but do not determine each other.
- A rewrite is rarely the answer to "we chose wrong". These organisations coexist per
  module, and the migration paths are incremental
  (`architecture-refactoring-paths`).

## References

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
