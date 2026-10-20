---
name: java-ddd-aggregates
description: >-
  Implement and review Java domain aggregates using the ddd-example domain contract.
  Use when organizing aggregate packages, implementing typed roots, new/with factories,
  validation timing, lifecycle methods, cross-aggregate IDs or collection ownership.
  Covers Category, Genre, CastMember and Video patterns with domain unit checks;
  application orchestration, persistence adapters and concurrency protocols are outside scope.
---

# Java DDD Aggregates

## Purpose and authority

Implement the domain aggregate patterns captured from `ddd-example/domain`. This is
the technical reference for this skill, not one optional DDD style among competing
examples. Preserve its differences between aggregates. Do not replace them with a
generic Order model, a richer base class, immutable roots, automatic validation,
transaction annotations or a new persistence version field.

The packaged references contain the relevant contracts and source provenance; the
authoring machine's `C:\git\ddd-example\domain` path is not a runtime prerequisite.
Inspect the target domain and build before editing. If a requested business rule or
new aggregate family has no counterpart in the supplied evidence, ask a focused
question about the missing rule or reference family. Keep unknown behavior explicit.

## Workflow

1. **Map the aggregate to the reference.** Identify its root, typed ID, validator,
   Gateway interface and associated values/enums in one aggregate package. Keep
   other roots as typed IDs. Read
   [aggregate organization](references/aggregate-organization.md) when introducing
   a root, deciding package placement or reviewing a relationship.
2. **Select the actual lifecycle family.** Read
   [factories and lifecycle](references/java-lifecycle-pattern.md) before changing
   construction, reconstruction, copying, validation or transitions. `Category` and
   `Video` expose external validation; `Genre` and `CastMember` call `selfValidate()`
   in their constructor and after assigning updated fields. An exception from the
   latter does **not** undo those assignments. Preserve the selected family's
   contract rather than standardizing these paths.
   When implementing or reproducing a root, read its complete production template:
   [Category](assets/reference/category/Category.java),
   [Genre](assets/reference/genre/Genre.java),
   [CastMember](assets/reference/castmember/CastMember.java) or
   [Video](assets/reference/video/Video.java). Follow its full signatures, checks,
   method ordering and clock calls; use the lifecycle reference for dependencies
   and adaptation rules. Do not infer missing code from the summary tables.
   Resolve imported and same-package types through the
   [complete domain source index](../java-ddd/references/source-index.md), which
   covers all 49 production types across the hub and specialists. These sibling
   resources require the optional `java-ddd` hub and owning specialists to be
   available; installing this aggregate skill alone does not supply them. The
   four root templates are not a standalone Java source set or build.
3. **Separate new state, restored state and copies.** `newCategory`, `newGenre`,
   `newMember` and `newVideo` generate an ID and read time once. Full `with(...)`
   restores the supplied facts. Copy `with(existing)` has aggregate-specific
   collection and pending-event behavior. `Category.clone()` is a separate,
   shallow-copy path; do not silently substitute it for `with(...)`.
4. **Implement the observed transition.** Keep mutable private state, `final`
   parameters, the actual constructor visibility, typed IDs and methods returning
   `this` where the reference does. Preserve activation/deactivation, audit fields,
   null handling and list/set behavior. Unmodifiable accessors do not establish
   defensive ownership of constructor arguments. Fluent calls do not supply rollback.
5. **Verify observable domain behavior.** Use real roots, IDs, values and validation
   handlers. Every domain unit test must have a meaningful `@DisplayName`; use no
   mocks, spies, Mockito or framework context. Read
   [focused verification](references/verification.md) for executable examples and
   cases that distinguish the lifecycle families. Assert the contract at the point
   it actually runs, without adding business constraints absent from the reference.
   When checking those paths against the reference module, use
   [AggregateLifecycleTest.java](assets/AggregateLifecycleTest.java) with its stated
   prerequisites.

## Scope and handoffs

- `java-ddd` supplies the canonical foundation sources. Before introducing a root
  or resolving its typed ID, read
  [AggregateRoot.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java),
  [Entity.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java),
  [Identifier.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java)
  and [ValueObject.java](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java).
  Reuse this foundation and its exceptions/utilities; root identity follows the
  inherited ID-based equality.
- `java-ddd-value-objects` owns concrete IDs and media/value semantics.
  Preserve each ID factory's behavior instead of passing strings between roots.
- `java-ddd-domain-services` owns validators and validation handlers. A validator
  reports the root's current state and performs no Gateway call.
- `java-ddd-repositories` owns the domain Gateway interfaces. Aggregates do not call
  those interfaces; adapter implementation remains outside this domain-only task.
- `java-ddd-domain-events` owns buffering, publication and media event semantics.
  Read it when changing pending events; a successful domain method is not proof of
  delivery or persistence.
- `java-ddd-testing` owns the broader domain testing conventions.

Keep Spring/JPA/HTTP, application use cases, transactions, brokers and database
concurrency mechanisms outside this skill's implementation. The source domain has
no aggregate version field or locking protocol. A request for such guarantees needs
separate scope and evidence; a domain unit test cannot establish them.

## Deliverable and compatibility

For implementation, deliver the affected root and supporting domain changes, identify
the reference family followed, and report executed checks. For review, show the
source method and the behavioral mismatch before proposing a correction. Preserve
adequate code and separate unknown business requirements from observed differences.

Keep the target Java and dependency versions. The reference build inspected for
this review declares JUnit Jupiter 5.9.2 but no explicit Java toolchain/release in
its shared conventions. The bundled verification class uses Java 17-compatible
source; that is an example compatibility target, not a claim about the reference's
declared Java baseline. Do not upgrade a project to apply this skill.
