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

The most valuable thing this skill does is often to prevent the mapping entirely — a large
share of mapped hierarchies in enterprise code exist to share fields, not to express a
subtype relationship, and composition maps better and reads better.

## The three strategies

```text
Single table          one table, all subtypes, a discriminator column.
(SINGLE_TABLE)        Subtype-specific columns must be nullable.

Class table           one table per class in the hierarchy, joined by the
(JOINED)              shared primary key. Normalised; each read joins
                      through the levels.

Concrete table        one table per concrete subtype, each with every
(TABLE_PER_CLASS)     column. No shared table, so polymorphic queries are
                      a UNION and shared foreign keys are impossible.
```

## Workflow

1. **Challenge the hierarchy.** Do subtypes differ in _behaviour_, or only in which fields
   are populated? Field-only differences are a case for composition or a nullable-free
   design, not for inheritance.
2. **Count the shape.** How many subtypes, how many columns each, how many are
   subtype-specific? Single table's cost is exactly the count of subtype-specific columns.
3. **Establish the query mix.** Mostly polymorphic reads ("all payments") favour single
   table; mostly per-subtype reads with heavy write integrity favour joined.
4. **Establish whether the database must enforce the subtype's required fields.** If yes,
   single table is out unless you are prepared to write check constraints.
5. **Establish the evolution rate.** A hierarchy that gains a subtype every quarter pays a
   migration per subtype under joined and concrete table, and an `ALTER TABLE ADD COLUMN`
   under single table.
6. **Decide, and pin the discriminator values** explicitly, so a class rename is not a data
   migration.

## Decision rules

```text
Subtypes differ only in which fields are set; no distinct behaviour
        → not a hierarchy. Use one type with an enum and, where the
          optional groups are cohesive, an embedded value or a JSON
          column for the variant part.

Few subtypes, few subtype-specific columns, polymorphic queries common,
performance matters
        → SINGLE_TABLE. Fastest reads, no joins, simplest queries.
          Pay with nullable columns and weak database-level constraints.

Many subtype-specific columns, or the database must enforce them, or
subtypes are large and distinct
        → JOINED. Normalised and constrained; pay a join per level on
          read and an insert per level on write.

Subtypes are genuinely unrelated in storage terms, never queried
polymorphically, and no other table needs a foreign key to the base
        → TABLE_PER_CLASS. Rarely the right answer; it forbids a shared
          foreign key and makes polymorphic queries a UNION.

The hierarchy is deep (3+ levels)
        → flatten it first. Depth multiplies joins under JOINED and
          nullable columns under SINGLE_TABLE, and deep hierarchies are
          usually modelling error rather than domain truth.

Variation is per-tenant or per-configuration, and new variants must ship
without a deploy
        → not inheritance at all: data-driven variation, with the
          variant part in a serialized LOB (orm-structural-mapping).
```

## Rules

- **Single table's real cost is constraint loss, not disk.** Every subtype-specific column
  must be nullable, so the database cannot enforce "a `CardPayment` must have a
  `card_last4`". Recover it with check constraints conditioned on the discriminator, or
  accept that only application code enforces it — and that bulk imports bypass it.
- **Joined's real cost is the join per level on every read, including polymorphic ones**,
  plus an insert per level on write. It is usually acceptable; it becomes painful on a list
  screen that reads the whole hierarchy at volume, and that is a measurable question, not a
  matter of taste (`architecture-and-performance`).
- Concrete table per class forbids a foreign key from any other table to the base type,
  because there is no base table to point at. If anything references the hierarchy
  polymorphically, this strategy is already excluded.
- **Set discriminator values explicitly** (`@DiscriminatorValue("CARD")`). The default is the
  entity name, which means a class rename silently invalidates every existing row.
- Polymorphic queries under single table are just a `WHERE` on the discriminator — cheap.
  Under joined they touch every table; under concrete table they are a `UNION ALL` over
  every subtype table, and the optimiser handles that far less well.
- A hierarchy that only shares fields wants `@MappedSuperclass` (shared mapping, no
  polymorphism, no base table) or composition. `@MappedSuperclass` is under-used and is
  exactly right for audit columns and shared identifiers.
- Adding a subtype costs: an `ALTER TABLE ADD COLUMN` (single table, nullable, online in
  most engines); a new table plus a foreign key (joined); a new table (concrete). Changing
  strategy later costs a full data migration in every direction — this is a one-way
  decision and deserves the corresponding analysis (`architecture-decision-making`).
- Indexing differs materially: under single table, indexes on subtype-specific columns are
  mostly null and should usually be filtered/partial indexes; under joined, each level
  indexes its own columns naturally.
- The domain question comes first. If `PremiumCustomer` and `StandardCustomer` differ only
  in a discount rate, they are one type with a policy, and no mapping strategy will make the
  subtype earn its keep (`domain-logic-organization`).

## References

- [Strategy comparison](references/strategy-comparison.md) — the three strategies with
  their DDL, their generated SQL for the queries that matter, measured cost profiles,
  constraint enforcement including conditional check constraints, indexing under each, and
  the alternatives to inheritance with the shape that replaces it. Read when choosing a
  strategy or justifying an existing one.
- [Schema evolution](references/schema-evolution.md) — what adding, removing, splitting or
  moving a subtype costs under each strategy; discriminator value management and renames;
  migrating between strategies with an expand/contract sequence; and the read-model options
  when the write-side mapping is right but reads are expensive. Read before changing a
  hierarchy that has data in it.
