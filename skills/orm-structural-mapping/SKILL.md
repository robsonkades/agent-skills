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

Choose structural mappings from the identity, lifecycle and storage contracts they must serve.
Changing persisted keys, representation or constraints can require a data migration;
metadata or helper changes may leave deployed data unchanged. These patterns are where the impedance mismatch
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

Association Table      a many-to-many becomes a third table. Link attributes
Mapping                may belong to an association entity or an owned value.

Dependent Mapping      a child's write lifecycle belongs to its parent;
                       an entity child still has an identifier.

Embedded Value         a value object typically becomes owner-table columns.
                       No independent persistent identity or lifecycle.

Serialized LOB         a graph is stored as one JSON/XML/binary column.
                       Opaque binary and native queryable JSON have different costs.
```

## Workflow

Start with the requested decision or defect and the affected mappings. Preserve an adequate
design; use only the steps relevant to its identity, writes, queries or schema contract.

1. **Choose identity with lifecycle and storage topology**, because generation constrains batching,
   sharding and when equality can be stable. It need not precede every domain decision.
2. **For each association, name the owner** — the side that writes the foreign key — and
   make both sides consistent in memory; mapping ownership differs from domain ownership.
3. **Decide identity per concept, not per table.** Whether something is a dependent child,
   an embedded value or an entity in its own right is a domain question with a schema
   consequence.
4. **For a value-storage decision, identify required queries, indexes and reports.**
   Compare portability, constraints, update granularity and database JSON support;
   querying alone does not decide embedded columns versus JSON.
5. **Predict and inspect the write statements** for a scalar edit, collection addition and
   removal. Distinguish child-row deletes, link-table recreation and order-column updates;
   a Java `List` alone does not predict the SQL.
6. **Check deployed nullability and constraints against the required invariant.**
   Distinguish final enforcement from compatible nullable staging during a migration;
   annotations alone do not establish what the database enforces.

## Decision rules

```text
Identifier for a normal entity
        → preserve a suitable existing key. For a new choice, compare a supported
          sequence, IDENTITY, assigned UUID or stable natural/composite key from
          identity timing, topology, key width and actual insert/index workload.
          IDENTITY/auto-increment can constrain batching
          and generated-key retrieval depending on database, driver and ORM
          version—measure the actual insert path for a high-volume table.

Identity must be known before the row exists (event id, correlation,
client-generated)
        → assigned identifier from the domain's creation path. It can stabilize
          id-based equality before persistence; still define equals/hashCode and
          repository newness explicitly (orm-behavioral-patterns).

Natural key that is stable, small and never changes
        → usable when its immutability and uniqueness are real contracts.
          Compare referencing-key width and change propagation with a surrogate
          plus a unique constraint; do not replace an adequate key merely by rule.

Two entities, one reference
        → foreign key mapping. Identify the owning mapping attribute.
          Bidirectional is a convenience; keep both sides in sync in a
          relationship helper, usually on the aggregate root.

Many-to-many with nothing else to say
        → association table mapping, no entity class.

Many-to-many where the link has a domain attribute (when, by whom, quantity,
role) or independent lifecycle
        → consider an association entity for independently identified or queried
          links; an owner-bound value collection can also carry attributes.
          Choose from lifecycle, mutation/query needs and actual collection SQL.

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

- Keep an entity's established primary key unchanged after persistence, including identity
  derived through `@MapsId`. Reassigning an identifying relationship is not an ordinary foreign-key
  update. Choose explicit link replacement or an independently identified relationship from the
  domain lifecycle; see the identity reference before changing the mapping.
- **The owning side is the mapping attribute that controls the foreign key/join table**, which is
  not always the object residing in the table that physically stores the FK. Only changes to the
  owning mapping update that relationship. Inverse collection changes can still cascade
  persistence or orphan removal, so an inconsistent graph may cause missing links or
  constraint failures, not simply a no-op. Keep both sides consistent through one helper.
- Bidirectional associations are a cost: two references to keep in step, two ways to load,
  and a serialisation cycle. Map an association bidirectionally only when both traversal
  directions are actually used.
- An association entity gives a link persistent identity and entity query/mutation semantics.
  An owned value collection can carry link attributes without independent identity; database-owned
  metadata need not become application state. Inspect affected mappings and callers when changing
  representation. Do not introduce an entity solely because an attribute might someday appear.
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
- Enforce database-owned invariants with deployed constraints, including mandatory values and
  uniqueness relied on across writers. Application checks alone leave bypass paths; domain-only
  rules still need their owning boundary (`domain-logic-organization`).
- Assess migration and reader/writer compatibility when persisted representation or enforcement
  changes. A mapping-only repair need not migrate data (`architecture-decision-making`).

Before choosing version-sensitive mappings, inspect the Java toolchain, persistence API,
provider, enhancement settings, dialect and schema migrations. Examples are partial mappings,
not standalone applications. Return the relevant decision and evidence, or explain why the
existing mapping is adequate. For a changed write or reload contract, include the expected
SQL/constraints and a focused flush-clear-reload check that would expose that defect. Missing
provider or schema evidence means the recommendation remains conditional; do not upgrade
the project to make an example work.

## References

- [Identity and associations](references/identity-and-associations.md) — identifier
  generation strategies with their batching, sharding and equality consequences; owning
  versus inverse sides and inconsistent links; association entities versus owned link values;
  collection mapping and delete-then-insert; and the query cost of each
  shape. Read when mapping a relationship or choosing a key.
- [Embedding and serialisation](references/embedding-and-serialization.md) — embedded
  values as records, converters for single-column types, dependent mapping and its
  lifecycle rules, serialized LOB with the JSON-column trade-off stated honestly, indexing
  and migrating JSON, and how to promote a LOB to columns when the requirement changes.
  Read when mapping a value type or considering a JSON column.
