---
name: java-ddd-use-cases
description: >-
  Implement or review Java application actions using the catalog reference's
  category, cast-member, genre, video and media use cases. Use for command/output
  records, Default implementations, validation and exception differences, gateway
  sequencing, media cleanup and Mockito unit tests. Preserves the reference's
  behavior; excludes domain implementation, infrastructure, authorization and
  transaction protocols absent from that source.
---

# Java DDD Use Cases

Implement or review one application action using the actual catalog application's
contracts. The technical authority is `C:/git/ddd-example/application`, revision
`8d964ce4106c2299164e28980ae7553e2afbdc92`. The packaged source templates preserve
that snapshot for use without the original checkout. Read domain collaborators
only to understand the calls; this skill does not authorize changing domain or
infrastructure implementation.

Use [service-layer-design](../service-layer-design/SKILL.md) for the application package map, responsibility boundary
and the three independent base types. This skill owns the 23 concrete actions,
their commands, outputs, collaboration order and tests. Do not add a command bus,
transaction wrapper, actor/tenant context, authorization policy, outbox, retries or
idempotency protocol as if they were demonstrated by this application.

## Choose the action before copying a pattern

1. Inspect the target build, application package, relevant domain gateway and
   existing tests. The source uses Gradle 7.6, records, the cast-member sealed
   hierarchy and Vavr 0.10.4. Its `buildSrc` targets Java 17; the shared convention
   does not pin the application compiler release. These assets use Java 17 syntax
   without preview features. Preserve the target toolchain and dependencies; do not
   upgrade them to fit an example. See the precise prerequisites in
   [testing and source fidelity](references/testing-and-source.md).
2. Select the matching action in [action contracts](references/action-contracts.md).
   Read that action's complete source directory, including its abstract contract,
   `Default...` implementation and any command/output records. The table routes all
   23 actions; no synthetic order example substitutes for their distinct behavior.
3. Preserve the chosen family's public signatures, factory overloads, messages,
   constructor guards and sequence. All five cast-member contracts are sealed and
   their defaults non-sealed. Category, genre and video contracts/defaults are
   ordinary abstract/concrete classes. Do not generalize either modifier policy.
4. Implement only the requested application slice. Reuse existing domain types and
   gateways. Map inputs and outputs in the application without Spring, HTTP, JPA or
   Spring Data types. For a new business action, distinguish the selected reference
   shape from requirements still missing. Ask only when a consequential decision
   cannot be resolved from the task and target; do not invent new invariants or
   error semantics.
5. Run the relevant application tests and inspect the result and meaningful forbidden
   side effects. Read [testing and source fidelity](references/testing-and-source.md)
   before adapting the executable test assets. State checks actually run and limits
   of unit-test evidence.

## Preserve the differences that affect callers

- Category create/update return `Either<Notification, Output>` for validation and
  failures captured by `Try` around the gateway write. Missing category on update
  still throws `NotFoundException`; lookup failures are outside that `Try`.
- Cast-member and genre create/update accumulate validation with `Notification`
  and throw `NotificationException`; their gateway writes propagate failures.
  Genre verifies category IDs before persistence. Keep the source's size-based
  comparison and its limitations visible rather than claiming stronger validation.
- Video create/update validate associations and the domain object before storage.
  Their media helper catches `Throwable`; creation attempts `clearResources`,
  update does not. Failure is not proof of database or in-memory rollback.
- Get actions map absence to `NotFoundException`. Delete actions delegate without a
  preflight lookup. List actions pass the domain query through and map the returned
  `Pagination`; empty pages remain successful results.
- Records do not add validation or copying beyond their actual factory bodies.
  Null collections, boxed video fields, raw resource bytes and omitted media have
  observable consequences. Preserve the documented behavior when fidelity is the
  task; identify an anomaly separately before changing its contract.

For video create/update/delete, downloads, uploads or encoding-status commands,
read [video and media lifecycle](references/video-and-media.md) before editing.
In particular, omitted resources in a full video update clear existing media;
upload changes only its selected slot. A matching `PENDING` status still persists
the video, while an unmatched resource ID does not.

## Source assets and tests

The required service-layer-design package (`^1.3.0`) supplies these complete sources.
Read the matching base before adapting an action and the test support before using
the source tests. Reuse compatible types already in the target instead of duplicating
them. The three production bases are independent abstract classes; none extends another.

| Complete source                                                                                                                                | Contract and use                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [UseCase.java](../service-layer-design/assets/application/src/main/java/com/robsonkades/admin/catalogo/application/UseCase.java)               | `UseCase<IN, OUT>` declares `OUT execute(IN anIn)`                                                                                                                                        |
| [UnitUseCase.java](../service-layer-design/assets/application/src/main/java/com/robsonkades/admin/catalogo/application/UnitUseCase.java)       | `UnitUseCase<IN>` declares `void execute(IN anIn)`                                                                                                                                        |
| [NullaryUseCase.java](../service-layer-design/assets/application/src/main/java/com/robsonkades/admin/catalogo/application/NullaryUseCase.java) | `NullaryUseCase<OUT>` declares `OUT execute()`; none of the 23 reference actions extends it                                                                                               |
| [UseCaseTest.java](../service-layer-design/assets/application/src/test/java/com/robsonkades/admin/catalogo/application/UseCaseTest.java)       | Shared application test support: Mockito extension, unit-test tag and identifier helpers; preserve the callback caveat in [testing and source fidelity](references/testing-and-source.md) |

The [production asset root](assets/application/src/main/java/com/robsonkades/admin/catalogo/application/)
contains all 75 action source files, unchanged from the reference. Use the action
table to load only the requested package. Do not copy all actions into a target
merely because the complete templates are available.

The [test asset root](assets/application/src/test/java/com/robsonkades/admin/catalogo/application/)
contains the 23 source test classes, with six supplemental cases in their matching
action suites. Use the matching action test when implementing or reviewing it;
the [supplemental case routes](references/testing-and-source.md) identify tests for
collection checks, resource replacement, cleanup, media status and byte-array
ownership. Combine the selected tests with the shared `UseCaseTest` linked above.

Application tests retain Mockito for gateway collaborators and use real aggregates,
identifiers, notifications and media objects. The user requires a descriptive
`@DisplayName` on **every applied unit-test method**; catalog examples use English.
The original source did not have these annotations. For strict timestamp comparisons,
reconstruct the starting aggregate with fixed historical dates through its real `with(...)` factory. Keep
the comparison; do not sleep, mock clocks or change production time behavior.
Keep tests simple and focused on observable outcomes.

Use the target project's existing domain for application work. For a missing reference
declaration such as `AggregateRoot`, or an offline reference replay, the optional
java-ddd package (`^1.2.0`) and its required specialists provide the
[complete domain source index](../java-ddd/references/source-index.md). This skill
suggests that bundle; it does not install it automatically. The optional
java-ddd-testing package (`^1.2.0`, also required by that hub) supplies the exact
[UnitTest.java](../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java)
and [Fixture.java](../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/Fixture.java)
sources. Before replaying tests without the original checkout, make those packages
available and follow the build prerequisites in [testing and source fidelity](references/testing-and-source.md).
The domain-only no-mock policy does not remove Mockito from these application tests.
Infrastructure wiring, transaction proof and external
resource guarantees require separately requested evidence and work.

Deliver the implemented action and its tests, or concrete review findings with
source locations and consequences. Report source-faithful limitations, intentional
adaptations and validation results without claiming a gateway mock proves durable
persistence, atomic cleanup or measured improvement in agent behavior.
