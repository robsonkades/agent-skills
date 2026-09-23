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
cost all on the table. A Java subtype hierarchy does not determine one portable relational
representation: each strategy trades query shape against constraints and schema evolution.
Revisiting a populated mapping can require a migration even when the Java change is small.

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

Concrete table        one table per concrete entity class, including a concrete
(TABLE_PER_CLASS)     root, each with its own and inherited columns. No table contains
                      all hierarchy rows; polymorphic queries typically use UNIONs
                      or separate queries. A root table alone is not a hierarchy FK target.
```

## Workflow

Reuse the consumer queries, existing schema/constraints, public subtype contracts and change
goal before choosing annotations. Keep a mapping that already satisfies them. Ask only about
unresolved query, integrity or rollout requirements that could change the recommendation;
continue inspecting SQL and mappings while those answers are pending.

1. **Check the hierarchy's contract.** Inspect substitutability, identity and invariants as
   well as behaviour. Field-only differences invite comparison with composition but do not
   alone disprove a subtype or justify breaking existing consumers.
2. **Count the shape.** How many subtypes, how many columns each, how many are
   subtype-specific? Measure populated row width, indexes, constraints and query plans; column count alone
   does not determine cost.
3. **Establish the query mix.** Include selected fields, root versus subtype queries, write
   paths and incoming references. Compare a projection or index within the existing mapping
   with changing storage; polymorphic entity reads often favour single table, while joined
   can simplify subtype-local constraints. Check the actual provider SQL and database plan.
4. **Establish whether the database must enforce the subtype's required fields.** If yes,
   single table is out unless you are prepared to write check constraints.
5. **Establish the evolution rate.** A hierarchy that gains a subtype every quarter pays a
   migration per subtype under joined and concrete table, and may require columns, discriminator checks and indexes under single table.
6. **Decide or retain the mapping, and pin discriminator values** where used, so a class
   rename need not migrate data. Verify the relevant reads/writes/constraints and rollout
   contract; stop when the requirement is met. Record what missing evidence or workload
   change would warrant revisiting a conditional recommendation.

## Decision rules

```text
Subtypes only share fields and have no distinct substitution/invariant contract
        → compare composition or mapped-superclass reuse. An enum with embedded
          groups may fit; JSON requires explicit validation/query/index trade-offs.

Few subtypes, few subtype-specific columns, polymorphic queries common,
performance matters
        → SINGLE_TABLE often minimizes joins for polymorphic reads. Confirm
          row width, indexes, predicates and workload before claiming speed.
          Pay with nullable columns and explicit conditional-constraint design.

Many subtype-specific columns, or the database must enforce them, or
subtypes are large and distinct
        → compare JOINED's subtype-local constraints with SINGLE_TABLE checks
          and the actual workload. Joined FKs alone do not prove sibling
          exclusivity or base-row completeness; verify required invariants.
          Base projections need not load every subtype.

Subtypes are genuinely unrelated in storage terms, never queried
polymorphically, and no other table needs a foreign key to the base
        → TABLE_PER_CLASS. Rarely the right answer; an ordinary FK needs a single referenced table;
          hierarchy-wide queries usually require UNIONs or separate queries.

The hierarchy is deep (3+ levels)
        → inspect mapped levels and actual fields/SQL before flattening.
          Depth can add joins; it does not itself add SINGLE_TABLE columns.

Variation is per-tenant or per-configuration, and new variants must ship
without a deploy
        → compare data-driven policy/composition using supported operations.
          Choose relational fields/rows versus JSON or serialized data from
          validation, query/index, update and compatibility needs; configuration
          alone does not implement new behaviour (orm-structural-mapping).
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
- For mapping reuse without a subtype contract, compare `@MappedSuperclass` (shared
  mapping, no entity-root polymorphism or base table) with composition. Audit fields and
  shared identifiers can fit it; do not remove a legitimate persistent hierarchy merely
  because its fields look similar.
- Adding a subtype may need new columns/checks/indexes (single table), a new mapped table
  and FK (joined), or a concrete table. Locking and scan/rewrite costs depend on the exact
  database/version and DDL; additive does not mean online. Changing
  strategy later usually requires a substantial data migration. It is expensive, not literally
  one-way; use expand/contract, reconciliation and rollback/forward-fix analysis
  (`architecture-decision-making`). When SQL changes mapped state or reclassifies rows,
  include existing persistence contexts, optimistic versions and configured caches in the
  cutover plan; see the schema-evolution reference.
- Choose indexes from predicates and selectivity. Partial/filtered indexes can help sparse
  subtype data where supported and where the query implies their predicate; inspect the
  generated, possibly parameterized SQL and plan.
- If `PremiumCustomer` and `StandardCustomer` differ only in a configurable discount rate
  and have no distinct substitution/invariant contract, one type with a policy may be enough.
  Preserve actual business and consumer distinctions; hand off unresolved domain meaning to
  `domain-logic-organization`.

For a recommendation or no-change result, report query/DDL evidence, the integrity and
migration trade-offs, actual checks and any targeted validation still needed. Without plans
or workload data, keep performance conclusions conditional; a proposed migration is not
completed implementation.

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
