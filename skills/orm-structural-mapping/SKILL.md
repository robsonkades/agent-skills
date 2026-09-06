---
name: orm-structural-mapping
description: >
  Mapping the structure of an object model onto tables: Identity Field, Foreign Key Mapping,
  Association Table Mapping, Dependent Mapping, Embedded Value and Serialized LOB. Use when
  choosing an identifier strategy or when a generated identity breaks batching, when a
  bidirectional association updates the wrong side and no foreign key is written, when a
  many-to-many link already has attributes, when child rows are given repositories of their
  own, when a value type is flattened into columns or hidden in a JSON column, or when a
  collection is deleted and reinserted on every save. Does not cover subtype mapping
  (inheritance-mapping-strategies), where the mapping lives (metadata-mapping), runtime
  fetch behaviour (orm-behavioral-patterns), or which data-access pattern to use in the
  first place (data-source-patterns).
---

# ORM Structural Mapping

## Purpose

Get the structural mapping decisions right at the point where they are cheap, because each
one becomes a data migration afterwards. These patterns are where the impedance mismatch
actually lives: an object has references, a table has foreign keys; an object may contain a
value, a table has columns; an object graph has ownership, a schema has constraints.

The failure this prevents is mapping by autocompletion — `@ManyToMany` because there are two
collections, `@GeneratedValue` because it was in the tutorial, a JSON column because the
shape was awkward — and discovering the consequences at production volume.

## The patterns

```text
Identity Field         the object carries the row's primary key, so the
                       mapper can find the row again. Choice of key type
                       and generation is a schema-level commitment.

Foreign Key Mapping    an object reference becomes a foreign key column.
                       The owning side writes it; the other side is a view.

Association Table      a many-to-many becomes a third table. The moment
Mapping                that table needs an attribute, it is an entity.

Dependent Mapping      a child's write lifecycle belongs to its parent;
                       an entity child still has an identifier.

Embedded Value         a value object typically becomes owner-table columns.
                       No independent persistent identity or lifecycle.

Serialized LOB         a graph is stored as one JSON/XML/binary column.
                       Opaque binary and native queryable JSON have different costs.
```

## Workflow

1. **Choose identity with lifecycle and storage topology**, because generation constrains batching,
   sharding and when equality can be stable. It need not precede every domain decision.
2. **For each association, name the owner** — the side that writes the foreign key — and
   make both sides consistent in memory; mapping ownership differs from domain ownership.
3. **Decide identity per concept, not per table.** Whether something is a dependent child,
   an embedded value or an entity in its own right is a domain question with a schema
   consequence.
4. **Ask of every value-shaped type whether it will ever be queried, indexed or reported
   on.** Compare portability, constraints, update granularity and database JSON support;
   querying alone does not decide embedded columns versus JSON.
5. **Predict and inspect the write statements** for a scalar edit, collection addition and
   removal. Distinguish child-row deletes, link-table recreation and order-column updates;
   a Java `List` alone does not predict the SQL.
6. **Check nullability and constraints follow the model.** A mapping that requires
   nullable columns for values the domain says are mandatory has moved an invariant out of
   the database and into hope.

## Decision rules

```text
Identifier for a normal entity
        → a database sequence with an allocation size, or a UUID (v7 or
          another time-ordered form) if identity must exist before insert
          or across systems. IDENTITY/auto-increment can constrain batching
          and generated-key retrieval depending on database, driver and ORM
          version—measure the actual insert path for a high-volume table.

Identity must be known before the row exists (event id, correlation,
client-generated)
        → assigned identifier, generated in the constructor. Simplifies
          equals/hashCode enormously (orm-behavioral-patterns).

Natural key that is stable, small and never changes
        → usable, and it removes a join in some cases. Rare: most
          "natural" keys change eventually. Prefer a surrogate key plus a
          unique constraint on the natural one.

Two entities, one reference
        → foreign key mapping. Identify the owning mapping attribute.
          Bidirectional is a convenience; keep both sides in sync in a
          relationship helper, usually on the aggregate root.

Many-to-many with nothing else to say
        → association table mapping, no entity class.

Many-to-many where the link has a domain attribute (when, by whom, quantity,
role) or independent lifecycle
        → an entity. Retrofitting this later is a migration; the cost of
          starting with it includes identity, lifecycle and repository/query cost.

A child that is never referenced from outside its parent and dies with it
        → dependent mapping: choose cascades and orphan removal to enforce
          the write lifecycle. Read projections need not create a child write repository.

A value with no identity: Money, Address, DateRange, Coordinates
        → embedded value, columns in the owner's table. Prefer this to
          three loose primitives.

A structure that is genuinely opaque to the database: a rendered
document, an audit snapshot, a third-party payload, a variable form
          → serialized LOB / JSON column. Accept vendor-specific query/index
          support, coarse update semantics and harder relational constraints/migrations.

The same structure is later needed in a WHERE clause or a report
        → compare relational promotion with supported JSON query/index options.
          Choose from constraints, query plans and migration costs.
```

## Rules

- **The owning side is the mapping attribute that controls the foreign key/join table**, which is
  not always the object residing in the table that physically stores the FK. Only changes to the
  owning mapping update that relationship. Inverse collection changes can still cascade
  persistence or orphan removal, so an inconsistent graph may cause missing links or
  constraint failures, not simply a no-op. Keep both sides consistent through one helper.
- Bidirectional associations are a cost: two references to keep in step, two ways to load,
  and a serialisation cycle. Map an association bidirectionally only when both traversal
  directions are actually used.
- A many-to-many link with domain attributes or lifecycle is usually clearer as an association entity. The association table
  becomes an entity with its own identity, and code that treated it as a set must change.
  Do not introduce it solely because an attribute might someday appear; use actual lifecycle,
  querying and evolution requirements.
- Collection SQL depends on ownership, entity versus value elements, row identifiers and
  order semantics. Inspect SQL before replacing a `List` with a `Set`; preserve required
  duplicates and ordering. Mutate managed collections through an identity-based diff,
  not an automatic clear-and-repopulate operation.
- Embedded values remove loose primitives without introducing independent entity identity.
  Record embeddables require a supporting ORM/API version; Java record syntax alone is
  insufficient. A basic single-valued embed typically uses owner columns; collection or
  secondary-table mappings have different storage shapes.
- Nullability of embedded values is subtle: if every column is null, the ORM may hand back
  an object with null fields or a null object depending on version and configuration. If
  the value is optional, decide and test which.
- **Distinguish opaque LOBs from native JSON.** JSON can have database queries, indexes,
  validation and SQL migrations. Compare those capabilities with relational constraints,
  portability and actual plans. Whole-value ORM writes need concurrency protection;
  logical JSON path updates do not imply physically independent writes.
- Dependent mapping concerns write lifecycle. A child entity can have an id and appear in
  read-only reports while mutations remain governed by its parent. Independent mutation
  commands or reassignment requirements warrant revisiting the boundary
  (`repository-pattern`).
- Constraints belong in the schema. A mapping that produces nullable columns for mandatory
  values, or that omits a unique constraint the domain relies on, has moved enforcement to
  application code, where a bulk import will bypass it (`domain-logic-organization`).
- Every one of these decisions is a migration once data exists. Spend proportionate analysis now
  (`architecture-decision-making`).

Before choosing version-sensitive mappings, inspect the Java toolchain, persistence API,
provider, enhancement settings, dialect and schema migrations. Examples are partial mappings,
not standalone applications. Return the selected ownership/lifecycle, expected SQL and
constraints, plus a flush-clear-reload test that would expose the specific defect. Missing
provider or schema evidence means the recommendation remains conditional; do not upgrade
the project to make an example work.

## References

- [Identity and associations](references/identity-and-associations.md) — identifier
  generation strategies with their batching, sharding and equality consequences; owning
  versus inverse sides with the silent no-op; association table mapping and the moment it
  becomes an entity; collection mapping and delete-then-insert; and the query cost of each
  shape. Read when mapping a relationship or choosing a key.
- [Embedding and serialisation](references/embedding-and-serialization.md) — embedded
  values as records, converters for single-column types, dependent mapping and its
  lifecycle rules, serialized LOB with the JSON-column trade-off stated honestly, indexing
  and migrating JSON, and how to promote a LOB to columns when the requirement changes.
  Read when mapping a value type or considering a JSON column.
