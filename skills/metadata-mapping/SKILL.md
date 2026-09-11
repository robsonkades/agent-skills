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
win with recurring costs: metadata can couple domain types to persistence APIs, defer checks
until runtime, and drift from its schema.

## The choices

```text
Annotations on the class      the mapping lives with the code it maps.
                              Discoverable, but string values can drift; it couples
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

These mechanisms can coexist: generated row types can feed explicit mappers, and XML can
override annotations. Identify the authority for each fact and the contract between stages.

## Workflow

Inspect the JDK/compiler, JPA namespace/version, ORM/provider, annotation processors,
database dialect and schema deployment pipeline first. Examples are partial; this skill
does not authorize upgrading the stack to match its documentation sources.

Start with the requested mapping decision or changed contract. Reuse existing configuration
and validation evidence; an adequate mapping or narrow API explanation can close with no
change. Apply the steps and checks relevant to that scope, reporting any specific unresolved
compatibility obligation without inventing a migration, generator or full CI matrix.

1. **Pick the schema deployment authority.** Versioned migrations should control shared
   production schemas. Model-generated DDL can be reviewed into migrations; avoid independent
   automatic startup mutation competing with the migration history.
2. **Decide whether the domain class may carry the metadata.** This is the layering
   question, and the honest answer depends on whether a separate domain model exists at all
   (`data-source-patterns`).
3. **Validate mapping/schema compatibility in CI and suitable startup environments.** Strict
   startup validation can intentionally reject mixed-version rolling deploys or restricted
   production credentials; decide where it is safe and keep a pre-deploy compatibility gate.
4. **Prefer typed generated references where supported.** Regeneration exposes removed/renamed
   members at compile time when used. Remaining strings/constants need validation; moving a
   string into a constant does not make its value schema-checked.
5. **Check which repeated facts must agree.** Domain, wire, persistence and schema contracts
   may intentionally differ. Identify redundant assertions of the same fact and validate
   required agreements or conversions; do not merge models or delete independent constraints
   merely because a field appears in several places.
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
          domain class, investigate the leak or an accepted coupling rather than
          inferring that either model is redundant.

The same classes must map differently per deployment or per tenant
        → external metadata or programmatic configuration. This is the
          mapping-variability case; tenant selection/isolation still needs
          a supported provider and persistence-unit contract.

Column and attribute names appear as strings in queries or projections
        → use typed generated references where possible; validate remaining
          string-based queries against the target mapping/schema.

The schema is the source of truth and is owned elsewhere
        → generate from a pinned schema (jOOQ-style), regenerate in CI and
          compile consumers; test compatibility with the deployed schema too.

Mapping between two object shapes (entity ↔ DTO)
        → generated mapper, or explicit hand-written code. Reflection
          -based deep mappers hide field mismatches until runtime.

Someone proposes storing the model definition as data so new fields
need no deploy
        → require the driver in writing. This buys deploy-free change
          and moves validation and compatibility checks into a versioned
          runtime schema/interpreter (enterprise-architecture-smells).
```

## Rules

- **Use one schema mutation authority.** Spring Boot uses `spring.jpa.hibernate.ddl-auto`;
  Hibernate's native setting is `hibernate.hbm2ddl.auto`. Avoid `update/create/create-drop`
  competing with migrations on shared data. Disposable test databases may deliberately
  generate schemas; model-generated scripts reviewed into migrations are another valid path.
- Use `validate` where startup failure is an acceptable control and permissions expose enough
  metadata. For a mapping/schema change in a rolling deployment, validate affected old/new
  application contracts against the expanded schema, reusing applicable evidence; do not
  discover incompatibility by replacing all healthy pods.
- **Startup validation is not complete validation.** It checks tables, columns and types; it
  does not check nullability the way you would want, nor constraints, nor indexes, nor
  defaults comprehensively across providers/dialects. A schema diff covers only the objects
  and properties its extraction includes; exercise permissions, queries and writes separately.
- Annotations on domain classes are a real coupling and a defensible one. What is not
  defensible is claiming a framework-free domain while the domain classes carry
  `@Entity` — decide which architecture you have and record it
  (`layering-and-boundaries`).
- **Unchecked string literals naming columns or attributes are a runtime-failure risk.** JPQL text,
  `Sort.by("cusotmerId")`, projections by name, native queries: invalid names can fail at runtime, some
  only on a rarely used path. Generate the JPA static metamodel and use `Order_.CUSTOMER`
  style constants only when supplied by the chosen processor; they are not the portable
  typed metamodel contract and string-consuming APIs still need execution/validation tests.
- Reflection/enhancement/accessor costs are provider, mapping and runtime specific. Metadata parsing
  is primarily startup work, while field access, dirty checking and materialization remain hot-path
  concerns. Do not infer significance; measure startup and query/allocation profiles
  where it matters (`startup-cds-crac-leyden`).
- Bytecode enhancement changes real behaviour, not just performance: lazy attribute
  loading, inline dirty tracking, and support for lazy inverse `@OneToOne` in applicable
  Hibernate mappings. Feature flags, mutable types and provider/version matter; do not
  assume all snapshots disappear or all associations become lazy. Enhancement has its own debugging cost — adopt it for a
  named reason, not by default.
- Repeated facts can drift, but migration DDL, persistence mapping and API validation can
  intentionally express different contracts. Identify which facts must agree; generate or
  test those agreements instead of deleting independent constraints by counting repetitions.
- **Metadata-driven models trade compile-time safety for deploy-free change**, and the trade
  includes an interpreter and runtime validation you must maintain. Versioned schemas,
  bounded field/type limits and contract tests remain possible and necessary. Require a
  concrete variability driver and confine dynamic behavior where practical
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
