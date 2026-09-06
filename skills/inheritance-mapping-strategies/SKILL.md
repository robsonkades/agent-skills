---
name: inheritance-mapping-strategies
description: >
  Mapping a subtype hierarchy onto tables — single table, class table (joined), concrete
  table per class — and deciding whether the hierarchy should exist at all. Use when an
  @Inheritance strategy is being chosen, when a single-table mapping is forcing every
  subtype's columns to be nullable, when a joined mapping's polymorphic query joins six
  tables to render a list, when adding a subtype requires a migration, when a discriminator
  column has drifted from the class names, when polymorphic queries are slow or return the
  wrong rows, when a hierarchy exists only to share three fields, or when composition would
  serve better than subtyping. Does not cover associations, identity and value mapping
  (orm-structural-mapping), where the mapping instructions live (metadata-mapping), the
  runtime fetch behaviour (orm-behavioral-patterns), or the domain question of whether
  subtypes model the business correctly (domain-logic-organization).
---

# Inheritance Mapping Strategies

## Purpose

Choose a subtype mapping with its query cost, its constraint capability and its evolution
cost all on the table, and challenge the hierarchy itself first. Inheritance is the sharpest
edge of the impedance mismatch: relational schemas have no subtypes, so every strategy is a
compromise, and the compromise is a schema commitment that costs a migration to revisit.

Challenge hierarchies introduced only to share fields, but do not infer that a data-oriented
subtype is invalid: substitutability and distinct invariants matter as well as methods.

Inspect Java release/toolchain, persistence API (`javax` versus `jakarta`), provider/version,
dialect, generated SQL and managed migrations first. Guidance is checked against Jakarta
Persistence 3.2; TABLE_PER_CLASS support is optional there. Examples are partial sketches,
not complete entities. Java sealed types require 17, pattern-switch requires 21 without
preview; neither requires upgrading the target project.

## The three strategies

```text
Single table          one table, all subtypes, a discriminator column.
(SINGLE_TABLE)        Subtype-specific columns are commonly nullable;
                      discriminator-aware CHECK constraints can enforce groups.

Class table           one table per class in the hierarchy, joined by the
(JOINED)              shared primary key. Subtype entity loads generally join
                      through mapped levels; projections may not.

Concrete table        one table per concrete subtype, each with every
(TABLE_PER_CLASS)     column. No shared table, so polymorphic queries are
                      typically UNIONs or separate queries. An ordinary
                      FK cannot target the hierarchy without a base table.
```

## Workflow

1. **Challenge the hierarchy.** Do subtypes differ in _behaviour_, or only in which fields
   are populated? Inspect substitutability and invariants; field-only differences invite comparison with
   composition but do not alone disprove a subtype.
2. **Count the shape.** How many subtypes, how many columns each, how many are
   subtype-specific? Measure populated row width, indexes, constraints and query plans; column count alone
   does not determine cost.
3. **Establish the query mix.** Mostly polymorphic reads ("all payments") favour single
   table; mostly per-subtype reads with heavy write integrity favour joined.
4. **Establish whether the database must enforce the subtype's required fields.** If yes,
   single table is out unless you are prepared to write check constraints.
5. **Establish the evolution rate.** A hierarchy that gains a subtype every quarter pays a
   migration per subtype under joined and concrete table, and may require columns, discriminator checks and indexes under single table.
6. **Decide, and pin the discriminator values** explicitly, so a class rename is not a data
   migration.

## Decision rules

```text
Subtypes only share fields and have no distinct substitution/invariant contract
        → compare composition or mapped-superclass reuse. An enum with embedded
          groups may fit; JSON requires explicit validation/query/index trade-offs.

Few subtypes, few subtype-specific columns, polymorphic queries common,
performance matters
        → SINGLE_TABLE often minimizes joins for polymorphic reads. Confirm
          row width, indexes, predicates and workload before claiming speed.
          Pay with nullable columns and weak database-level constraints.

Many subtype-specific columns, or the database must enforce them, or
subtypes are large and distinct
        → JOINED. Normalised and constrained; measure joins for entity loads and inserts across mapped tables;
          base projections need not load every subtype.

Subtypes are genuinely unrelated in storage terms, never queried
polymorphically, and no other table needs a foreign key to the base
        → TABLE_PER_CLASS. Rarely the right answer; an ordinary FK needs a single referenced table;
          hierarchy-wide queries usually require UNIONs or separate queries.

The hierarchy is deep (3+ levels)
        → inspect mapped levels and actual fields/SQL before flattening.
          Depth can add joins; it does not itself add SINGLE_TABLE columns.

Variation is per-tenant or per-configuration, and new variants must ship
without a deploy
        → not inheritance at all: data-driven variation, with the
          variant part in a serialized LOB (orm-structural-mapping).
```

## Rules

- **Single table's real cost includes constraint complexity, not just disk.** Columns may remain
  nullable at the column level while discriminator-aware `CHECK` constraints enforce “a
  `CardPayment` must have `card_last4`.” Verify ORM-generated DDL and bulk/import paths, or
  accept that only application code enforces it — and that bulk imports bypass it.
- **Joined entity materialization often joins mapped levels/subtypes**, while base-only
  projections can avoid them; writes span the tables holding the entity state. It is usually acceptable; it becomes painful on a list
  screen that reads the whole hierarchy at volume, and that is a measurable question, not a
  matter of taste (`architecture-and-performance`).
- Concrete table per class has no single base table for an ordinary polymorphic foreign key.
  Alternatives such as separate subtype FKs, a registry/base identity table or application-level
  integrity add complexity; price them before excluding the strategy.
- **Pin stored discriminator values** where used (`@DiscriminatorValue("CARD")`). For a
  STRING discriminator the default is the entity name; an unpinned entity name follows the
  class name. Preserve existing values during renames, including explicit entity/table names.
- Query costs depend on selected attributes, predicates, fetches and provider SQL. A root
  SINGLE_TABLE query need not filter the discriminator at all; fewer joins do not guarantee
  a cheap plan. Inspect plans and representative workload before comparing strategies.
- A hierarchy that only shares fields wants `@MappedSuperclass` (shared mapping, no
  polymorphism, no base table) or composition. `@MappedSuperclass` is under-used and is
  exactly right for audit columns and shared identifiers.
- Adding a subtype may need new columns/checks/indexes (single table), a new mapped table
  and FK (joined), or a concrete table. Locking and scan/rewrite costs depend on the exact
  database/version and DDL; additive does not mean online. Changing
  strategy later usually requires a substantial data migration. It is expensive, not literally
  one-way; use expand/contract, reconciliation and rollback/forward-fix analysis
  (`architecture-decision-making`).
- Choose indexes from predicates and selectivity. Partial/filtered indexes can help sparse
  subtype data where supported and where the query implies their predicate; inspect the
  generated, possibly parameterized SQL and plan.
- The domain question comes first. If `PremiumCustomer` and `StandardCustomer` differ only
  in a discount rate, they are one type with a policy, and no mapping strategy will make the
  subtype earn its keep (`domain-logic-organization`).

For a recommendation, report query/DDL evidence, the integrity and migration trade-offs,
and the targeted validation that would confirm it. Without plans or workload data, keep
performance conclusions conditional.

## References

- [Strategy comparison](references/strategy-comparison.md) — the three strategies with
  their DDL, their generated SQL for the queries that matter, query-cost hypotheses,
  constraint enforcement including conditional check constraints, indexing under each, and
  the alternatives to inheritance with the shape that replaces it. Read when choosing a
  strategy or justifying an existing one.
- [Schema evolution](references/schema-evolution.md) — what adding, removing, splitting or
  moving a subtype costs under each strategy; discriminator value management and renames;
  migrating between strategies with an expand/contract sequence; and the read-model options
  when the write-side mapping is right but reads are expensive. Read before changing a
  hierarchy that has data in it.
