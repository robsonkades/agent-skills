# Application boundaries and source evidence

Read this when assigning responsibilities, checking dependencies, or deciding whether
a proposed addition belongs to the demonstrated application layer.

## Authority and coverage

The sole technical and organizational reference is `ddd-example/application` at commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`. The authoring checkout was
`C:/git/ddd-example`. Paths below are relative to that repository; `application/`
contains the authoritative implementations and tests. The build files listed below are
supporting evidence for that module's declared dependencies.

At this snapshot, the application contains 78 main Java files: three root base classes,
23 abstract action contracts, 23 defaults, 11 commands and 18 outputs. Tests contain
23 action suites and `UseCaseTest`, with 103 `@Test` methods. Source inventory and
reading do not establish that the tests pass on another environment.

The project explicitly makes the observed patterns normative, including the differences
between category, cast member, genre and video. The separate requirement for descriptive
`@DisplayName` on every applied unit test is an intentional addition. Fixed historical
dates in reconstruction-based temporal tests are also an explicitly approved adaptation.
Neither requirement is claimed to be present in the original tests.

## Responsibilities visible in the source

| Owner                 | Demonstrated responsibilities                                                                                                                                                                                     | Concrete source anchors                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application root      | Three independent abstract execution shapes; no framework lifecycle or dispatch                                                                                                                                   | `application/src/main/java/com/robsonkades/admin/catalogo/application/{UseCase,UnitUseCase,NullaryUseCase}.java`                                                                                       |
| Abstract action       | Bind the base's input/output types; preserve cast-member sealing                                                                                                                                                  | `category/create/CreateCategoryUseCase.java`, `castmember/create/CreateCastMemberUseCase.java`, `video/media/update/UpdateMediaStatusUseCase.java`                                                     |
| Default action        | Read command/query fields, convert IDs, obtain aggregates or projections, check referenced IDs, invoke domain operations, validate, persist/map results, and perform the action's demonstrated media coordination | `genre/create/DefaultCreateGenreUseCase.java`, `video/create/DefaultCreateVideoUseCase.java`                                                                                                           |
| Command record        | Hold the actual action inputs and expose its source factories/accessors; no new generic command abstraction                                                                                                       | `category/create/CreateCategoryCommand.java`, `video/create/CreateVideoCommand.java`                                                                                                                   |
| Output record         | Map the returned domain object/projection/resource into the action-specific result                                                                                                                                | `category/retrieve/get/CategoryOutput.java`, `video/retrieve/list/VideoListOutput.java`, `video/media/get/MediaOutput.java`                                                                            |
| Imported domain types | Supply aggregate operations, identifiers, validation/error types, query/pagination types and gateway contracts consumed by the application                                                                        | Imports and calls throughout the defaults; `CategoryGateway`, `CastMemberGateway`, `GenreGateway`, `VideoGateway`, `MediaResourceGateway` are imported from `com.robsonkades.admin.catalogo.domain...` |
| Action test           | Exercise a default with real domain objects and mocked gateway collaborators; assert the demonstrated outcomes and interactions                                                                                   | `application/src/test/java/com/robsonkades/admin/catalogo/application/category/delete/DeleteCategoryUseCaseTest.java`                                                                                  |

Except for the full root/test paths, action anchors above are relative to
`application/src/main/java/com/robsonkades/admin/catalogo/application/`.

An application action contract is an **abstract class**, not an interface. A default
extends that contract. The gateway dependency is the existing **domain-owned contract**,
not a new application interface, a concrete repository, or another use case. The
application source declares no gateway interfaces or implementations. Do not relocate
or recreate imported domain types to make an application package look self-contained.

Constructor dependencies across the defaults are only the five gateway types listed
above. All are `private final` fields initialized with `Objects.requireNonNull`.
Per-call input and state are local. This organization is source evidence; it does not
prove that the gateway implementations are stateless, thread-safe or globally atomic.

## Preserve responsibilities without overgeneralizing

- **Delegation still includes application work.** Genre/video defaults query
  `existsByIds`, compose notifications and report missing references. Do not move
  these steps into a newly invented domain service, or reject every conditional as
  misplaced business logic. Preserve the reference's exact division of work.
- **Validation is not uniform.** Category create/update return
  `Either<Notification, ...>`; cast-member, genre and video actions have their own
  exception paths. Domain `Notification` is invocation-local. The chosen action
  determines the contract; there is no universal application result wrapper.
- **An output need not erase domain vocabulary.** Category retrieval retains
  `CategoryID`; cast-member outputs retain `CastMemberType`; video retrieval retains
  rating and media types. Preserve those signatures instead of introducing HTTP DTOs.
- **A short action is still a use case.** Category/cast-member/genre deletion forwards
  a converted ID directly to the gateway. Their list actions map gateway pagination.
  The source retains separate abstract/default pairs and matching tests for these.
- **Media coordination has action-specific limits.** Video creation attempts
  `clearResources` after a caught failure; video update and upload do not share that
  same cleanup contract. Video deletion calls deletion and then cleanup in sequence.
  None of these facts proves atomicity, durable delivery or rollback of prior effects.
  Preserve the precise flow using `java-ddd-use-cases`; do not add an outbox,
  compensation framework or transaction annotation to fill an assumed gap.
- **Fluent call sites are already explicit.** Records use the observed
  `with`/`from` factories, and domain mutation calls may chain. A new builder,
  command bus, generic CRUD superclass or umbrella service would change the reference
  rather than reproduce it.

There is no application source for controllers, adapter implementations, DI wiring,
authorization, transaction demarcation, event publication or injected clocks. This
statement is scoped to the inspected application module; it makes no claim that those
concerns are absent from the whole project. If a task requires one, request its reference
or explicit rule and keep the application work within the known contract.

## Build evidence and limits

| Evidence                                           | Observed setting                                                                      | Application consequence                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `application/build.gradle`                         | `java-conventions` and `java-library`; `implementation(project(":domain"))`           | Application compiles against the existing domain module; no direct infrastructure dependency is declared here |
| `application/build.gradle`                         | `testImplementation(project(path: ':domain', configuration: 'testClasses'))`          | Action tests can reuse domain test fixtures                                                                   |
| `buildSrc/src/main/groovy/java-conventions.gradle` | `io.vavr:vavr:0.10.4`                                                                 | Keep the reference's Vavr contract, including category `Either`/`Try`                                         |
| Same convention                                    | JUnit Jupiter API/engine `5.9.2`; Mockito JUnit Jupiter `5.0.0`; `useJUnitPlatform()` | Preserve JUnit/Mockito application tests and the `unitTest` tag                                               |
| `gradle/wrapper/gradle-wrapper.properties`         | Gradle `7.6`                                                                          | Do not silently upgrade the wrapper to validate a copied example                                              |
| `buildSrc/build.gradle`                            | Source/target compatibility `JavaVersion.VERSION_17`                                  | This declaration is for buildSrc; it does not by itself pin the application's compiler release                |

Java 17 is the authoring compatibility baseline for these patterns: the action source
uses records and sealed/non-sealed classes. The inspected application/convention files
do not declare an application toolchain or `--release`. Inspect the target compiler,
runtime and resolved dependencies before applying code, and report any mismatch instead
of silently modernizing or backporting the pattern. No preview API is required by the
provided support classes.

The four support assets preserve the corresponding source files, with normalized line
endings and a final newline. Their three main classes need only Java; `UseCaseTest` needs the existing
domain `Identifier` and the JUnit/Mockito dependencies above. Detailed action assets and
test adaptations are maintained by `java-ddd-use-cases`.

## Evidence to report

A useful review identifies an actual mismatch, such as `UnitUseCase` extending
`UseCase<IN, Void>`, `GetCategoryByIdUseCase` moved to a flat `query` package,
a newly introduced `CategoryService`, or a Spring repository injected into a default.
Show the matching source contract and the smallest correction that preserves behavior.

When the proposed pattern has no reference example, the result is a precise missing
contract, not a guessed implementation. A successful compilation establishes signature
compatibility; mocked gateway tests establish only the exercised action behavior.
Neither demonstrates real storage, security or transaction guarantees.
