# Domain reference contracts

Read for domain package placement, core type implementation, exceptions and utilities.
The sole technical source is `C:/git/ddd-example/domain`, inspected on 2026-10-19 at
clean commit `8d964ce4106c2299164e28980ae7553e2afbdc92`. The absolute path records
provenance; it is not an installation prerequisite. Source paths below are relative
to this module. `D/` abbreviates
`src/main/java/com/robsonkades/admin/catalogo/domain/`, and `T/` abbreviates the
corresponding `src/test/java/com/robsonkades/admin/catalogo/domain/` directory.

The contracts below are transcribed from that source, not alternative DDD designs.
Use them with the [complete domain sources](source-index.md) when the checkout is
unavailable or an implementation/import is needed. For behavior not covered here, in
those sources or by the specialist references, request the relevant source or a business
decision rather than guessing. When the user supplies a changed reference, inspect its
current affected files and distinguish changed behavior from this recorded snapshot.

## Package and build shape

Append these suffixes to the target's established base package. Preserve its business
names; do not copy `com.robsonkades.admin.catalogo` into an unrelated organization.

| Package suffix              | Reference contents                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain`                    | `ValueObject`, `Identifier`, `Entity`, `AggregateRoot`                                                                                           |
| `domain.category`           | `Category`, `CategoryID`, `CategoryGateway`, `CategoryValidator`                                                                                 |
| `domain.castmember`         | `CastMember`, `CastMemberID`, `CastMemberGateway`, `CastMemberValidator`, `CastMemberType`                                                       |
| `domain.genre`              | `Genre`, `GenreID`, `GenreGateway`, `GenreValidator`                                                                                             |
| `domain.video`              | `Video`, `VideoID`, `VideoGateway`, `VideoValidator`; media/resource types, media Gateway, search/preview records, enums and `VideoMediaCreated` |
| `domain.validation`         | `Error`, `ValidationHandler`, `Validator`                                                                                                        |
| `domain.validation.handler` | `Notification`, `ThrowsValidationHandler`                                                                                                        |
| `domain.exceptions`         | `NoStacktraceException`, `DomainException`, `NotificationException`, `NotFoundException`, `InternalErrorException`                               |
| `domain.events`             | `DomainEvent`, `DomainEventPublisher`                                                                                                            |
| `domain.pagination`         | `Pagination<T>`, `SearchQuery`                                                                                                                   |
| `domain.utils`              | `IdUtils`, `InstantUtils`, `CollectionUtils`                                                                                                     |

The four aggregate packages organize behavior by domain concept, not separate global
`entities`, `identifiers`, `validators` and `gateways` directories. `Genre` refers to
categories through `List<CategoryID>`; `Video` uses sets of typed category, genre and
cast-member IDs. Media and video-specific types stay in the video package. Follow
`java-ddd-aggregates` for the exact ownership and collection contracts.

The build evidence is the module's `build.gradle`, plus the owning repository's
`buildSrc/build.gradle` and `buildSrc/src/main/groovy/java-conventions.gradle`.
`buildSrc` sets source/target compatibility to Java 17. The shared Java conventions
declare Vavr 0.10.4 and JUnit Jupiter 5.9.2; they also expose Mockito 5.0.0 to tests.
The domain adds JavaFaker 1.0.2 for tests. No Mockito imports or mock use were found
in domain tests; an available dependency is not permission to use it. The production
domain imports the JDK and its own packages, even though its build inherits Vavr.
Inspect the target build before running it; do not infer a pinned domain toolchain
from `buildSrc` compatibility or add those dependencies to a new target automatically.

## Core implementation

The following is an API index, not a standalone Java compilation unit. Consult the
behavior table before implementing these signatures:

```text
public abstract class ValueObject
public abstract class Identifier extends ValueObject
    public abstract String getValue()

public abstract class Entity<ID extends Identifier>
    protected final ID id
    private final List<DomainEvent> domainEvents
    protected Entity(ID id)
    protected Entity(ID id, List<DomainEvent> domainEvents)
    public abstract void validate(ValidationHandler handler)
    public ID getId()
    public List<DomainEvent> getDomainEvents()
    public void publishDomainEvents(DomainEventPublisher publisher)
    public void registerEvent(DomainEvent event)
    public boolean equals(Object o)
    public int hashCode()

public abstract class AggregateRoot<ID extends Identifier> extends Entity<ID>
    protected AggregateRoot(ID id)
    protected AggregateRoot(ID id, List<DomainEvent> events)
```

| Source                       | Implementation contract                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D/ValueObject.java`         | Empty abstract class. No members, equality, hashing or validation implementation.                                                                                                                                                                                                                                                                                                      |
| `D/Identifier.java`          | Extends `ValueObject`; declares only abstract `String getValue()`. Concrete IDs own their factories, validation and equality.                                                                                                                                                                                                                                                          |
| `D/Entity.java` constructors | One-argument constructor delegates with `null` events. Reject a null ID using `Objects.requireNonNull(id, "'id' should not be null")`. Store the ID. Initialize events with a new `ArrayList` of supplied events, or of `Collections.emptyList()` when null. This copies the list, not each event.                                                                                     |
| `D/Entity.java` identity     | `getId()` returns `id`. Equality accepts the same instance, rejects null or a different runtime class, then compares `getId().equals(other.getId())`. Hash uses `Objects.hash(getId())`. Do not include mutable attributes or use `instanceof` equality across subclasses.                                                                                                             |
| `D/Entity.java` validation   | Declare abstract `void validate(ValidationHandler handler)`. The base constructor does not invoke it. The concrete aggregate chooses validation timing.                                                                                                                                                                                                                                |
| `D/Entity.java` events       | `getDomainEvents()` returns `Collections.unmodifiableList(domainEvents)`, a live view. `registerEvent(null)` and `publishDomainEvents(null)` do nothing. Non-null registration appends. Publication iterates in list order and clears only after every call returns. A thrown publisher exception propagates and prevents clearing; no retry, rollback or delivery guarantee is added. |
| `D/AggregateRoot.java`       | Both protected constructors forward to the corresponding `Entity` constructor. Adds no fields, methods, validation, persistence or version mechanism.                                                                                                                                                                                                                                  |

The ID classes are concrete classes named `CategoryID`, `CastMemberID`, `GenreID` and
`VideoID`, not records or strings in the root generic parameter. Use
`java-ddd-value-objects` for their exact factory overloads and per-type value semantics.
`java-ddd-domain-events` owns publication details and the media-event trigger; do not
implement a second event buffer in `AggregateRoot`.

## Exception hierarchy and observable failure contracts

All source paths in this section are `D/exceptions/<Type>.java`. These contracts are
part of the reference, including empty messages and shared error lists. Do not add a
new error enum, status code, defensive copy or generalized exception framework.

```text
RuntimeException
└── NoStacktraceException
    ├── InternalErrorException
    └── DomainException
        ├── NotificationException
        └── NotFoundException
```

| Type and entry point                                                                 | Exact behavior                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoStacktraceException(String message)`                                              | Public constructor delegates to `(message, null)`.                                                                                                                                                 |
| `NoStacktraceException(String message, Throwable cause)`                             | Public constructor calls `super(message, cause, true, false)`: suppression enabled, writable stack trace disabled. No performance claim follows from this choice.                                  |
| `DomainException` constructor                                                        | Protected `(String, List<Error>)`; calls `super(message)` and stores the supplied list in `protected final List<Error> errors` without copying. `getErrors()` returns that same list.              |
| `DomainException.with(Error error)`                                                  | Returns a new `DomainException(error.message(), List.of(error))`.                                                                                                                                  |
| `DomainException.with(List<Error> errors)`                                           | Returns a new `DomainException("", errors)`. Do not synthesize the first error's message or join messages.                                                                                         |
| `NotificationException(String message, Notification notification)`                   | Public constructor passes `message` and `notification.getErrors()` to `DomainException`. The error list remains shared; later notification changes can be visible.                                 |
| `NotFoundException` constructor                                                      | Protected `(String, List<Error>)`; delegates to `DomainException`.                                                                                                                                 |
| `NotFoundException.with(Class<? extends AggregateRoot<?>> aggregate, Identifier id)` | Message is `"%s with ID %s was not found".formatted(aggregate.getSimpleName(), id.getValue())`; errors are `Collections.emptyList()`. Do not infer that every `DomainException` contains an error. |
| `NotFoundException.with(Error error)`                                                | Message is `error.message()`; errors are `List.of(error)`.                                                                                                                                         |
| `InternalErrorException` constructor and `with(String, Throwable)`                   | Protected constructor delegates to `super(message, cause)`; the public static factory preserves both inputs. It is a direct `NoStacktraceException` subclass, not a `DomainException`.             |

`Error` is the record `Error(String message)` in `D/validation/Error.java`, with no
extra fields or validation. Use its explicit import when Java's `java.lang.Error`
would be ambiguous. Error contents, order and wrapping are controlled by the selected
handler. `java-ddd-domain-services` documents the distinct `Notification` and
`ThrowsValidationHandler` paths; do not assume they preserve exceptions identically.

Null checks already present in a type must remain, and absent checks must not be
invented as reference behavior. For example, `Entity` rejects null IDs directly;
it does not turn that failure into a `NotificationException`. When a new requested
nullability policy conflicts with these contracts, identify the conflict and clarify it.

## Utilities and shared data

The three utilities are `public final` classes with private constructors and static
methods. Preserve their small contracts rather than introducing injected clocks, an
ID service, a general mapper or a validation framework.

| Source and signature                                                                               | Exact implementation behavior                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D/utils/IdUtils.java`: `String uuid()`                                                            | `UUID.randomUUID().toString().toLowerCase().replace("-", "")`. Generated IDs are lowercase and have no hyphens. `from(String)` in an ID wraps the supplied value according to that ID; it does not call this generator.                           |
| `D/utils/InstantUtils.java`: `Instant now()`                                                       | `Instant.now().truncatedTo(ChronoUnit.MICROS)`. This is wall-clock time; do not promise strict monotonicity or advance time artificially in tests.                                                                                                |
| `D/utils/CollectionUtils.java`: `<IN, OUT> Set<OUT> mapTo(Set<IN> list, Function<IN, OUT> mapper)` | Returns null for null input. Otherwise streams, maps and collects with `Collectors.toSet()`. It does not promise order, an immutable set, preservation of duplicate mapped values or a specific set implementation.                               |
| `D/utils/CollectionUtils.java`: `<T> Set<T> nullIfEmpty(Set<T> values)`                            | Returns null for null/empty input, otherwise the same set instance. No copy or normalization of elements.                                                                                                                                         |
| `D/pagination/SearchQuery.java`                                                                    | Record components: `int page`, `int perPage`, `String terms`, `String sort`, `String direction`. No constructor validation or defaults.                                                                                                           |
| `D/pagination/Pagination.java`                                                                     | Record components: `int currentPage`, `int perPage`, `long total`, `List<T> items`. No constructor validation/copy. `<R> Pagination<R> map(Function<T, R>)` maps `items.stream().map(mapper).toList()` and preserves all three pagination fields. |

Time behavior has an observed exception: `Category.update(...)` assigns `Instant.now()`
directly after its activation/deactivation logic. Other category lifecycle methods use
`InstantUtils.now()`. Do not claim all timestamps in the source have microsecond precision
or silently normalize this method. Keep the method being followed explicit.

Search/page semantics beyond these records and the Gateway declarations, such as page
origin, valid sort values and maximum page size, are not established by this domain
module. Use `java-ddd-repositories` for those ports and request missing semantics.

## Domain tests and verification evidence

`T/UnitTest.java` supplies `@Tag("unitTest")`; tests such as `T/EntityTest.java`,
`T/category/CategoryTest.java` and the genre, cast-member and video tests exercise real
objects. `EntityTest` uses concrete dummy types and a publisher lambda, not Mockito.
New or revised unit test methods must additionally carry `@DisplayName` as required by
the user. For timestamp transitions, the user also requires fixed past dates supplied
through existing `with(...)` factories instead of sleeps or mocks. Production time
implementations remain unchanged. Follow `java-ddd-testing` for implementation and
assertion style.

Verify source correspondence before changing any contract: equality at `Entity`,
message/errors/cause at the specific exception factory, null/empty/alias behavior at
utilities, and lifecycle tests at the affected aggregate. A meaningful regression
check should expose a consequential change; do not manufacture one test per class or
getter. Written examples and static inspection are not executed runtime tests or
behavioral evaluations of an agent using this skill.
