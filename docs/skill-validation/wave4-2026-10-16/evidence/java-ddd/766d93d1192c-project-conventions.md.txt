# Reference conventions and adaptation

Read when creating or moving Java classes, reviewing package placement, or adapting
the family to an existing repository. The source is the user-provided
`ddd-example-master` catalog example, inspected on 2026-09-30. Paths below are relative
to that example, not files required to exist in a target application. Its root project
is named `netflix`; its base package is `com.robsonkades.admin.catalogo`.

## Verified reference shape

The Gradle modules are `domain`, `application` and `infrastructure`. Source dependencies
point inward: application uses domain; infrastructure wires application and domain.
The sample fixes Java 17 for `buildSrc`, Boot 2.7.7 and Gradle 7.6; its application
subprojects do not explicitly pin a toolchain/release. Its `javax.persistence` imports must
not be copied into a target that uses `jakarta.persistence`, or changed as an incidental
part of a DDD task. Inspect the target's build rather than inferring its version from
folder names. The sample includes Vavr; a framework-free domain is not necessarily
a dependency-free build.

Append these suffixes to the target's established base package, without introducing
the example's organization or catalog vocabulary into another business:

| Responsibility                      | Observed package suffix                                | Observed class/API                                                                                       |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Domain building blocks              | `domain`                                               | `Entity<ID extends Identifier>`, `AggregateRoot<ID>`, `Identifier`, `ValueObject`                        |
| Root, identity and persistence port | `domain.category`                                      | `Category`, `CategoryID`, `CategoryGateway`, `CategoryValidator`                                         |
| Validation                          | `domain.validation`                                    | `ValidationHandler` and notification/exception handling                                                  |
| Application base                    | `application`                                          | `UseCase<IN, OUT>`, `UnitUseCase<IN>`, `NullaryUseCase<OUT>`                                             |
| Creation                            | `application.category.create`                          | `CreateCategoryUseCase`, `DefaultCreateCategoryUseCase`, `CreateCategoryCommand`, `CreateCategoryOutput` |
| Update                              | `application.category.update`                          | `UpdateCategoryUseCase`, `DefaultUpdateCategoryUseCase` and corresponding command/output                 |
| Queries                             | `application.category.retrieve.get` / `.retrieve.list` | Action-specific query use cases and outputs                                                              |
| HTTP contract and controller        | `infrastructure.api` / `.api.controllers`              | `CategoryAPI`, `CategoryController`                                                                      |
| Category persistence adapter        | `infrastructure.category`                              | `CategoryMySQLGateway`                                                                                   |
| JPA persistence details             | `infrastructure.category.persistence`                  | `CategoryJpaEntity`, `CategoryRepository`                                                                |
| Bean composition                    | `infrastructure.configuration.usecases`                | `CategoryUseCaseConfig`                                                                                  |

Check concrete evidence in `domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/`,
`application/src/main/java/com/robsonkades/admin/catalogo/application/category/` and
`infrastructure/src/main/java/com/robsonkades/admin/catalogo/infrastructure/`.

`Category` extends `AggregateRoot<CategoryID>`. Construction uses a private constructor,
`newCategory(...)` for new identity/lifecycle, and `with(...)` for reconstruction or copy.
`CategoryID.unique()` creates identity; `from(String)` wraps an existing one, and
`getValue()` exposes its representation. Preserve that distinction: reading storage
must not create a new ID or timestamp. Transitions use business verbs such as
`activate()` and `deactivate()`. IDs of other roots are typed: genre/video reference
categories by `CategoryID`, not by giving callers unrestricted mutable root graphs.

Use-case contracts are **abstract classes**. Category contracts are plain abstract;
cast-member contracts demonstrate sealed contracts with non-sealed default implementations.
Preserve the affected family instead of normalizing modifiers. Commands
and outputs are records; `execute(...)`, `with(...)` and `from(...)` appear in their
contracts. Category creation/update uses Vavr `Either<Notification, ...>`; other paths
use exceptions. Preserve the affected path's contract or migrate its callers explicitly;
do not pretend the example defines one universal failure policy.

Tests include `CategoryTest`, `CreateCategoryUseCaseTest` and `CategoryMySQLGatewayTest`.
Application tests use Mockito, while persistence tests use Spring/JPA support. The
installed foundation's preference for in-memory gateways is an alternative testing
choice, not a description of this repository. Pick a double by the contract being
tested; a shared-reference fake can hide a missing save.

## Installed foundation variants

The user's installed foundation also demonstrates the same architectural family with
`<Action><Root>CommandOutput`, sealed abstract use-case contracts permitting
`Default...`, `<Root>GatewayImpl`, `.gateway.persistence`, `<Root>RestController` and
`<Root>JpaRepository`. The reference itself also uses sealed/non-sealed contracts in
some families. These are valid **local variants**, not reasons to rename the
reference's `CreateCategoryOutput`, `CategoryMySQLGateway` or `CategoryRepository`.
Neither the installed foundation nor a project overlay is required to use this package.

For new code, follow the chosen target's adjacent class family consistently. Prefer
`final` for parameters, immutable fields and injected dependencies; use `var` only
where the initializer makes the type evident. Preserve deliberate extension points:
do not mechanically make an abstract/non-sealed use-case implementation final when
its actual proxy/decorator design needs subclassing. Add nullability annotations only
using the target's established library and package policy.

## Preserve shape without reproducing defects

The example is evidence of names and implementation, not a correctness oracle:

- Some aggregates allow an invalid candidate followed by explicit `validate`; other
  methods validate after mutation. Characterize that contract before migration. For
  new operations that promise rejection leaves state unchanged, validate a candidate
  before committing fields/events, or return an explicit invalid draft outside the
  valid aggregate lifecycle.
- `ValueObject` is an empty base. `Resource` exposes a mutable `byte[]`; extending the
  base or using a record does not establish value equality or deep immutability.
  Verify equality, copying and accessor behavior for each actual type.
- `CategoryJpaEntity.toAggregate()` restores persisted audit timestamps through
  `Category.with(...)`. Keep this behavior; do not substitute `now()` during reads.
  No root `@Version` was found in the inspected mappings. That absence is not proof
  that concurrent writes preserve invariants; inspect locking/constraints and test
  the real persistence mechanism before claiming it.
- `DefaultVideoGateway` saves JPA state and invokes `publishDomainEvents` with a
  Rabbit sender inside the transactional method, before database commit. This does
  not establish atomic database/broker delivery. A durable integration requirement
  needs a verified mechanism, such as state plus outbox in one transaction followed
  by replay-safe delivery. Preserve simpler local-event handling when durability is
  not required.

Do not silently fix the reference repository while authoring or applying a skill to
another target. Explain a relevant limitation and implement improvements only within
the user's requested application and behavioral scope.
