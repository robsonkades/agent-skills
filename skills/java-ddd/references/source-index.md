# Complete domain source index

Read when implementing a reference type, resolving one of its imports, or checking a
signature against complete Java source. This index covers all **49 production types**
in the sole reference `C:/git/ddd-example/domain`, inspected on 2026-10-19 at clean
commit `8d964ce4106c2299164e28980ae7553e2afbdc92`. The original checkout is not required
to read the shipped files. `D/` means
`src/main/java/com/robsonkades/admin/catalogo/domain/` within that reference module.

Each row links to one canonical, complete source file. The hub and its required
specialists retain the source package and implementation; line endings and a final
newline may differ. The four aggregate assets and `CategoryID` keep their existing
locations. Do not create duplicate base classes or reconstruct missing imports from
prose when an indexed source is available. Use the owning specialist for adaptation
rules, and preserve the target's established business vocabulary and base package.

These are Java source assets, not a standalone build: compile the affected files with
their indexed dependencies using the target's inspected build and compatible Java
baseline. The reference uses Java 17-compatible constructs; see
[reference conventions](project-conventions.md) for the build evidence and its limits.
Do not add frameworks, alter validation timing or change source contracts to resolve an
import. For an explicitly changed user-designated reference, inspect the changed source
and distinguish it from this snapshot.

## Common bases, exceptions and utilities — `java-ddd` (12)

| Reference source                           | Complete Java asset                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `D/AggregateRoot.java`                     | [AggregateRoot.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java)                              |
| `D/Entity.java`                            | [Entity.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java)                                            |
| `D/Identifier.java`                        | [Identifier.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java)                                    |
| `D/ValueObject.java`                       | [ValueObject.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java)                                  |
| `D/exceptions/DomainException.java`        | [DomainException.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/exceptions/DomainException.java)               |
| `D/exceptions/InternalErrorException.java` | [InternalErrorException.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/exceptions/InternalErrorException.java) |
| `D/exceptions/NoStacktraceException.java`  | [NoStacktraceException.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/exceptions/NoStacktraceException.java)   |
| `D/exceptions/NotFoundException.java`      | [NotFoundException.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/exceptions/NotFoundException.java)           |
| `D/exceptions/NotificationException.java`  | [NotificationException.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/exceptions/NotificationException.java)   |
| `D/utils/CollectionUtils.java`             | [CollectionUtils.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/CollectionUtils.java)                    |
| `D/utils/IdUtils.java`                     | [IdUtils.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/IdUtils.java)                                    |
| `D/utils/InstantUtils.java`                | [InstantUtils.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/InstantUtils.java)                          |

## Aggregate roots — `java-ddd-aggregates` (4)

| Reference source               | Complete Java asset                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `D/category/Category.java`     | [Category.java](../../java-ddd-aggregates/assets/reference/category/Category.java)       |
| `D/castmember/CastMember.java` | [CastMember.java](../../java-ddd-aggregates/assets/reference/castmember/CastMember.java) |
| `D/genre/Genre.java`           | [Genre.java](../../java-ddd-aggregates/assets/reference/genre/Genre.java)                |
| `D/video/Video.java`           | [Video.java](../../java-ddd-aggregates/assets/reference/video/Video.java)                |

## Identifiers and value types — `java-ddd-value-objects` (12)

| Reference source                   | Complete Java asset                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D/category/CategoryID.java`       | [CategoryID.java](../../java-ddd-value-objects/assets/java/CategoryID.java)                                                                          |
| `D/castmember/CastMemberID.java`   | [CastMemberID.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberID.java)     |
| `D/castmember/CastMemberType.java` | [CastMemberType.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberType.java) |
| `D/genre/GenreID.java`             | [GenreID.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreID.java)                    |
| `D/video/VideoID.java`             | [VideoID.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoID.java)                    |
| `D/video/AudioVideoMedia.java`     | [AudioVideoMedia.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/AudioVideoMedia.java)    |
| `D/video/ImageMedia.java`          | [ImageMedia.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/ImageMedia.java)              |
| `D/video/Resource.java`            | [Resource.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/Resource.java)                  |
| `D/video/VideoResource.java`       | [VideoResource.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoResource.java)        |
| `D/video/MediaStatus.java`         | [MediaStatus.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/MediaStatus.java)            |
| `D/video/Rating.java`              | [Rating.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/Rating.java)                      |
| `D/video/VideoMediaType.java`      | [VideoMediaType.java](../../java-ddd-value-objects/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaType.java)      |

## Gateways, search and pagination — `java-ddd-repositories` (9)

| Reference source                      | Complete Java asset                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D/category/CategoryGateway.java`     | [CategoryGateway.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/CategoryGateway.java)        |
| `D/castmember/CastMemberGateway.java` | [CastMemberGateway.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberGateway.java)  |
| `D/genre/GenreGateway.java`           | [GenreGateway.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreGateway.java)                 |
| `D/video/VideoGateway.java`           | [VideoGateway.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoGateway.java)                 |
| `D/video/MediaResourceGateway.java`   | [MediaResourceGateway.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/MediaResourceGateway.java) |
| `D/video/VideoSearchQuery.java`       | [VideoSearchQuery.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoSearchQuery.java)         |
| `D/video/VideoPreview.java`           | [VideoPreview.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoPreview.java)                 |
| `D/pagination/Pagination.java`        | [Pagination.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/pagination/Pagination.java)                |
| `D/pagination/SearchQuery.java`       | [SearchQuery.java](../../java-ddd-repositories/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/pagination/SearchQuery.java)              |

## Events — `java-ddd-domain-events` (3)

| Reference source                     | Complete Java asset                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `D/events/DomainEvent.java`          | [DomainEvent.java](../../java-ddd-domain-events/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEvent.java)                   |
| `D/events/DomainEventPublisher.java` | [DomainEventPublisher.java](../../java-ddd-domain-events/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEventPublisher.java) |
| `D/video/VideoMediaCreated.java`     | [VideoMediaCreated.java](../../java-ddd-domain-events/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaCreated.java)        |

## Validation — `java-ddd-domain-services` (9)

| Reference source                                    | Complete Java asset                                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D/validation/Error.java`                           | [Error.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Error.java)                                             |
| `D/validation/ValidationHandler.java`               | [ValidationHandler.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/ValidationHandler.java)                     |
| `D/validation/Validator.java`                       | [Validator.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Validator.java)                                     |
| `D/validation/handler/Notification.java`            | [Notification.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/Notification.java)                       |
| `D/validation/handler/ThrowsValidationHandler.java` | [ThrowsValidationHandler.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/ThrowsValidationHandler.java) |
| `D/category/CategoryValidator.java`                 | [CategoryValidator.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/CategoryValidator.java)                       |
| `D/castmember/CastMemberValidator.java`             | [CastMemberValidator.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberValidator.java)                 |
| `D/genre/GenreValidator.java`                       | [GenreValidator.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreValidator.java)                                |
| `D/video/VideoValidator.java`                       | [VideoValidator.java](../../java-ddd-domain-services/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoValidator.java)                                |

## Domain test support and application boundary

The sixth required specialist, [java-ddd-testing](../../java-ddd-testing/SKILL.md),
owns domain test sources and support, including `UnitTest` and `Fixture`. Test sources
are outside the 49 production types above. Domain tests use real domain objects without
mocks; every unit test method must have a meaningful `@DisplayName`. Read that
specialist before adapting or running the domain test assets.

Application bases (`UseCase`, `UnitUseCase`, `NullaryUseCase`) and shared `UseCaseTest`
support belong to `service-layer-design`. Action-specific sources belong to
[java-ddd-use-cases](../../java-ddd-use-cases/SKILL.md); start there for a separately
requested application operation. These sources are outside this domain inventory.
This hub retains its six domain dependencies and does not make application
orchestration part of a domain-only request.
