---
name: metadata-mapping
description: >
  Expressing the object-to-schema mapping as metadata rather than hand-written code: where
  the mapping lives (annotations, external XML, programmatic), what reflection costs versus
  generated code, and how metadata drifts from the schema it describes. Use when persistence
  annotations accumulate on a domain class that is supposed to be framework-free, when the
  same mapping is expressed twice, when a schema change is discovered at runtime instead of
  at startup, when ddl-auto generates a schema in an environment that has migrations, when
  string literals name columns across the codebase, or when a fully metadata-driven model is
  proposed. Does not cover the mapping decisions themselves (orm-structural-mapping,
  inheritance-mapping-strategies) runtime ORM behaviour (orm-behavioral-patterns), or
  migrating from one mapping approach to another (architecture-refactoring-paths).
---

# Metadata Mapping

## Purpose

Decide where mapping information lives and what generates it, and keep it honest about the
schema it describes. Metadata mapping is what makes an ORM possible: the mapping is data,
read by a generic engine, instead of a per-class translation someone wrote. That is a large
win and it has three recurring costs — the metadata sits on the domain class, it is checked
late, and it drifts.

## The choices

```text
Annotations on the class      the mapping lives with the code it maps.
                              Discoverable, refactor-safe, and it couples
                              the class to the persistence framework.

External metadata (orm.xml)   the class stays clean; the mapping is a
                              separate artefact that can vary per
                              deployment. Costs discoverability and is
                              not refactor-safe.

Programmatic configuration    mapping built in code at startup (Spring
                              Data JDBC dialects, jOOQ, MyBatis, a
                              hand-written Data Mapper). Most explicit,
                              most verbose.

Generated code                a build step produces the mapping or the
                              accessors from a source of truth — the
                              schema (jOOQ), the entities (JPA static
                              metamodel), or an interface (MapStruct).
```

## Workflow

1. **Pick the source of truth for the schema, once.** Migrations own the schema; the
   mapping describes it. The reverse — annotations generating the schema — is only viable
   in development.
2. **Decide whether the domain class may carry the metadata.** This is the layering
   question, and the honest answer depends on whether a separate domain model exists at all
   (`data-source-patterns`).
3. **Validate mapping/schema compatibility in CI and suitable startup environments.** Strict
   startup validation can intentionally reject mixed-version rolling deploys or restricted
   production credentials; decide where it is safe and keep a pre-deploy compatibility gate.
4. **Remove string literals** from anything that names a column or attribute — generated
   metamodels and constants exist so that a rename is a compile error.
5. **Check for duplicated mapping.** The same fact stated in annotations, in a migration,
   in a DTO mapper and in a view is four places to update and three places to be wrong.
6. **Resist metadata-driven behaviour** unless a stated driver requires it; see the decision
   rules.

## Decision rules

```text
Entities are the persistence model, the team is small, the stack is JPA
        → annotations. The default, and the coupling is honest because
          the class IS the persistence model.

A separate framework-free domain model exists
        → the metadata belongs on the persistence model (row/entity),
          not on the domain type. If annotations are appearing on the
          domain class, one of the two models is redundant.

The same classes must map differently per deployment or per tenant
        → external metadata or programmatic configuration. This is the
          case orm.xml was designed for and it is rare.

Column and attribute names appear as strings in queries or projections
        → generate a metamodel and use it. A rename must be a compile
          error, not a runtime one.

The schema is the source of truth and is owned elsewhere
        → generate from the schema (jOOQ-style). The build then fails
          when the schema changes under you, which is the point.

Mapping between two object shapes (entity ↔ DTO)
        → generated mapper, or explicit hand-written code. Reflection
          -based deep mappers hide field mismatches until runtime.

Someone proposes storing the model definition as data so new fields
need no deploy
        → require the driver in writing. This buys deploy-free change
          and costs type safety, validation, testability and every
          IDE affordance (enterprise-architecture-smells).
```

## Rules

- **Migrations own the schema; mapping metadata describes it.** `hibernate.ddl-auto` set to
  anything other than `validate` or `none` outside development means two things generate
  the schema, and the one that wins depends on startup order.
- Use `validate` where startup failure is an acceptable control and permissions expose enough
  metadata. For rolling deployment, validate both old and new application versions against the
  expanded schema before rollout; do not discover incompatibility by replacing all healthy pods.
- **Startup validation is not complete validation.** It checks tables, columns and types; it
  does not check nullability the way you would want, nor constraints, nor indexes, nor
  defaults. A schema diff in CI covers the rest.
- Annotations on domain classes are a real coupling and a defensible one. What is not
  defensible is claiming a framework-free domain while the domain classes carry
  `@Entity` — decide which architecture you have and record it
  (`layering-and-boundaries`).
- **Unchecked string literals naming columns or attributes are a runtime-failure risk.** JPQL text,
  `Sort.by("cusotmerId")`, projections by name, native queries: all fail at runtime, some
  only on a rarely used path. Generate the JPA static metamodel and use `Order_.CUSTOMER`
  style constants where the API allows it.
- Reflection/enhancement/accessor costs are provider, mapping and runtime specific. Metadata parsing
  is primarily startup work, while field access, dirty checking and materialization remain hot-path
  concerns. Do not infer significance; measure startup and query/allocation profiles
  startup if it matters (`startup-cds-crac-leyden`).
- Bytecode enhancement changes real behaviour, not just performance: lazy attribute
  loading, dirty tracking without snapshots, and lazy `@ManyToOne` that actually works on
  the inverse side. It is a build-time step with its own debugging cost — adopt it for a
  named reason, not by default.
- Duplicated mapping is the drift generator. When the same fact — a column's name, a
  length, a nullability — is stated in a migration, an annotation and a DTO mapping, expect
  them to disagree within a year. Make one of them generated from another.
- **Metadata-driven models trade compile-time safety for deploy-free change**, and the trade
  is much worse than it looks: no type checking, no refactoring, no IDE, no unit tests
  worth the name, and an interpreter you now maintain. Reach for it only where variation is
  genuinely per-tenant and unbounded, and even then confine it to a leaf
  (`orm-structural-mapping` on serialized LOB).

## References

- [Where mapping metadata lives](references/metadata-sources.md) — annotations, orm.xml,
  programmatic and generated mappings compared on coupling, refactor safety,
  discoverability and per-deployment variability; the mixed strategy that works
  (annotations plus an override file); metamodel generation; and mapping between object
  shapes. Read when choosing where the mapping should live, or when annotations are
  accumulating somewhere they should not.
- [Generation and drift](references/generation-and-drift.md) — schema validation at startup
  and what it does not catch, a schema diff in CI, generating code from the schema versus
  generating the schema from code, bytecode enhancement's real effects, and the recurring
  drift scenarios with their detection. Read when a mapping mismatch reached production, or
  when setting up the build's guardrails.
