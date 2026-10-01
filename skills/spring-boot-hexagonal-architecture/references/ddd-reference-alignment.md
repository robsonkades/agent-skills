# Map ports and adapters in the catalog DDD reference

Read when following the user-designated `ddd-example-master` project or adding an
adapter to an application with those conventions. The inspected reference was
`C:/Users/robso/Downloads/ddd-example-master/ddd-example-master`; the path is provenance,
not a prerequisite for using this skill. Reconfirm the corresponding target code when
available. Its base package is `com.robsonkades.admin.catalogo`.

## Identify contracts by role and preserve their names

The build declares `domain`, `application` and `infrastructure` modules. Application
depends on domain; infrastructure depends on both. Here, an inner-owned port may live
in the domain module: “application-owned” describes the inside's contract ownership,
not a rule that every interface must move to a package literally named `application`.

| Conversation or mechanism   | Observed reference types                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Driving HTTP adapter        | `infrastructure.api.controllers.CategoryController implements infrastructure.api.CategoryAPI`. The API interface describes HTTP; it is not the inner input port.                                                                                                   |
| Inner input contract        | Abstract `application.category.create.CreateCategoryUseCase` extends `UseCase<CreateCategoryCommand, Either<Notification, CreateCategoryOutput>>`; `execute` is implemented by `DefaultCreateCategoryUseCase`. Command/output records share the operation package. |
| Driven persistence contract | `domain.category.CategoryGateway` exchanges `Category`, `CategoryID`, `Optional`, and domain pagination/query types.                                                                                                                                               |
| Driven adapter              | `infrastructure.category.CategoryMySQLGateway implements CategoryGateway`. Its Spring Data collaborator is `infrastructure.category.persistence.CategoryRepository`; its persistence model is `CategoryJpaEntity`.                                                 |
| Outer composition           | `infrastructure.configuration.usecases.CategoryUseCaseConfig` constructs the plain default use cases with the domain gateway and exposes their abstract contracts as beans.                                                                                        |

Retain these names and packages for a matching slice. Do not rename `CategoryGateway`
to a generic `RepositoryPort`, expose the Spring Data repository inward, or introduce
`port.in`/`port.out` packages solely to copy a hexagonal diagram. The abstract use-case
contract is an adequate input boundary here; an extra interface is conditional on a
real consumer or decoration need. Preserve modifiers per family: category creation
is plain abstract, while `CreateCastMemberUseCase` is sealed abstract and its default
implementation is non-sealed. Do not normalize either form across the project.

The source's category creation returns `Either<Notification, CreateCategoryOutput>`;
genre creation returns its output and can throw `NotificationException`. Preserve
the operation-specific absence, result and error contracts when adding another entry
or adapter. `DefaultCreateCategoryUseCase` also converts caught gateway failures into
notifications, which its HTTP consumer maps alongside validation failures. If that
distinction needs repair, test the changed consumer/retry/rollback behavior explicitly
instead of silently replacing all outcomes with the fixture's exception convention.

## Verify substitution and completion beyond the package map

Use the reference's domain gateway as the seam for fake/real contract checks. Exercise
the methods' actual absence, mapping, paging, failure and concurrency guarantees; a
new implementation that compiles does not necessarily preserve them. The category
JPA entity has no `@Version` field, so its separate persistence model alone provides
no evidence of lost-update prevention.

In `infrastructure.video.DefaultVideoGateway`, annotated `create`/`update` call `save`,
which saves the JPA entity and invokes `publishDomainEvents(this.eventService::send)`.
`infrastructure.services.impl.RabbitEventService` sends through Rabbit operations.
This observed call path is not a durable atomic outbox: neither the local transaction
annotation nor the port shape proves that a database commit and broker publication
survive all failure windows together. Preserve the promised completion contract during
adapter work and test the required recovery behavior separately when durable delivery
is in scope. Do not present this reference as evidence of exactly-once delivery.

## Apply the right version and example scope

The reference pins Boot **2.7.7**, Gradle **7.6**, and uses `javax.persistence` in its
category JPA model. Java **17** source/target settings appear in `buildSrc/build.gradle`
for build logic; the shared Java convention plugin does not pin an application-wide
release/toolchain. Inspect the actual application compiler/runtime before making a
compatibility claim. Preserve target imports and dependency generations; a namespace
or Boot upgrade is separate work.

The skill's Java 25 / Boot 4.1.1 contract fixture is an independent pedagogical example,
with its own order vocabulary, ports and H2 assumptions. Transfer the relevant test
idea to the target's gateway and real wiring, while preserving existing class names,
method signatures, error outcomes and build structure. Source inspection verifies this
map only; an executable target claim requires that target's relevant tests and supported
environment. The fixture's passing tests cannot substitute for those checks.
