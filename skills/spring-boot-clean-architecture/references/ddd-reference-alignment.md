# Apply the catalog DDD reference conventions

Read when implementing a slice based on the user-designated `ddd-example-master`
project or preserving an application that follows its structure. The inspected local
reference was `C:/Users/robso/Downloads/ddd-example-master/ddd-example-master`, with
base package `com.robsonkades.admin.catalogo`. This path records provenance; the skill
must remain usable without that checkout. Inspect the target's corresponding files
before treating this snapshot as its current contract.

## Map the actual slice

`settings.gradle` includes `domain`, `application` and `infrastructure`.
`application/build.gradle` depends on `domain`; `infrastructure/build.gradle` depends
on both. Under the common base package, preserve these observed names and owners:

| Responsibility                | Reference location and shape                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain state and identity     | `domain.category.Category extends AggregateRoot<CategoryID>`; `CategoryID` extends `Identifier` and defines value equality. Domain validation stays with the domain.                                     |
| Persistence contract          | `domain.category.CategoryGateway`; its signatures use domain types, including `Pagination`, `SearchQuery` and `Optional<Category>`.                                                                      |
| Application operation         | `application.category.create.CreateCategoryUseCase` is an abstract class extending `UseCase<IN, OUT>`; its operation is `execute`. `DefaultCreateCategoryUseCase` implements it.                         |
| Input and output              | `CreateCategoryCommand` and `CreateCategoryOutput` are records in the same `application.category.create` package, with the existing `with`/`from` factories.                                             |
| HTTP entry and representation | `infrastructure.api.controllers.CategoryController` implements `infrastructure.api.CategoryAPI`; HTTP models and `CategoryApiPresenter` reside under `infrastructure.category.models` and `.presenters`. |
| Persistence implementation    | `infrastructure.category.CategoryMySQLGateway` implements the domain gateway; `CategoryJpaEntity` and Spring Data `CategoryRepository` reside in `.category.persistence`.                                |
| Composition                   | `infrastructure.configuration.usecases.CategoryUseCaseConfig` registers plain application implementations with `@Bean`.                                                                                  |

Extend the established feature/operation package when adding a neighboring use case.
Do not rename it to the fixture's `PlaceOrder`, move its inner gateway to Spring Data,
or replace `Default...UseCase` with a generic service simply to match an example.
Preserve each family's modifiers: `CreateCategoryUseCase` is plain abstract, while
`CreateCastMemberUseCase` is sealed abstract and permits its non-sealed default
implementation. Neither shape is universal across this source. Changing who can
extend a use case requires a separate design reason. Build modules and suffixes are
local conventions, while inward dependencies are the architectural constraint.

## Preserve the operation's result and failure contract

`CreateCategoryUseCase` returns `Either<Notification, CreateCategoryOutput>`.
`DefaultCreateCategoryUseCase` validates before calling the gateway and also maps a
caught gateway failure into a notification. `CategoryController` folds that result
into the existing HTTP response. By contrast, `CreateGenreUseCase` returns
`CreateGenreOutput`, and its default implementation throws `NotificationException`
for accumulated validation errors. Inspect each operation and its callers; neither
style describes every use case in the reference.

Keep return types, factories and error mappings compatible during a boundary change.
If repairing the distinction between a validation rejection and infrastructure failure,
make the changed error behavior explicit and verify its consumers. A returned failure
does not automatically cause a surrounding transaction to roll back. `CategoryApiPresenter`
maps returned results; its name does not require an application callback presenter.

## Separate source conventions from fixture and runtime claims

The shipped boundary fixture independently demonstrates policy ownership and local
transaction behavior on Java 25 / Boot 4.1.1. Its `PlaceOrder`, `Ledger`, order/receipt
rules and transaction entry are teaching choices, not classes extracted from this DDD
checkout. Adapt its checks to the real package graph and actual use-case entry.

The inspected reference pins Boot **2.7.7** in `infrastructure/build.gradle` and Gradle
**7.6** in the wrapper. `buildSrc/build.gradle` sets Java **17** source/target compatibility
for the build-logic project; the shared `java-conventions.gradle` does not establish an
application-wide compiler release/toolchain. Do not claim a resolved application JDK
from that setting alone. `CategoryJpaEntity` imports `javax.persistence`. Preserve the
target's supported imports and build until a separately scoped upgrade changes them;
copying Boot 4 fixture imports is not a migration plan.

Source inspection supports this naming and dependency map, not a successful target
build. Before claiming a delivered slice works, run its relevant domain/application,
wiring and persistence checks with the target's toolchain and isolated dependencies.
`CategoryJpaEntity` has no `@Version` field: an aggregate class and separate JPA model
alone establish no lost-update protection. Verify the required concurrency mechanism
when the changed use case depends on it.
