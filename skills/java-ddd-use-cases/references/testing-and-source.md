# Testing and source fidelity

Read when adapting an action's test, compiling the source assets or checking whether
a proposed change preserves the reference. These resources support implementation
and review; they are not evidence that an agent using the skill will always produce
the right result.

## Provenance and portable assets

Technical authority: `C:/git/ddd-example/application` at revision
`8d964ce4106c2299164e28980ae7553e2afbdc92`. Source-relative paths are recorded below;
the installed production/test assets do not require that absolute checkout path.
For application behavior use the assets and the target's actual collaborators,
not a different DDD recipe. If updating to a later source revision, explicitly
compare the selected action and tests before treating it as the same contract.

| Asset or evidence                                                                                     | Purpose and original source                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Production assets](../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/)  | All 75 source files beneath application main packages category, castmember, genre and video: 23 abstract contracts, 23 defaults, 11 commands and 18 outputs          |
| [Source test assets](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/) | All 23 matching test classes from application/src/test/java; 103 original test methods, with the adaptations below                                                   |
| [Shared application sources](../SKILL.md#source-assets-and-tests)                                     | Required service-layer-design package: direct links to the three independent bases and UseCaseTest; combine with this skill's actions or reuse matching target types |
| application/build.gradle                                                                              | Domain implementation dependency and domain testClasses dependency; application applies java-conventions and java-library                                            |
| buildSrc/src/main/groovy/java-conventions.gradle                                                      | Vavr 0.10.4; JUnit Jupiter API/engine 5.9.2; mockito-junit-jupiter 5.0.0; JaCoCo 0.8.8; JUnit Platform test tasks and unitTest tag filter                            |
| buildSrc/build.gradle and gradle/wrapper/gradle-wrapper.properties                                    | Java 17 source/target for buildSrc; Gradle 7.6 wrapper. These do not pin every application compile task's release                                                    |

Production templates are complete source copies, not abbreviated snippets. Keep
their package-relative paths and adapt only the requested vocabulary when generating
a different action. The original names, error text, overloads, collection choices,
imports and modifier differences are intentional fidelity points. Do not modify
the reference checkout to make an example pass.

Source test adaptations in this skill:

- Add a descriptive `@DisplayName` to each of the 103 test methods, as explicitly
  required by the user. The catalog examples use English. Original tests had no
  DisplayName; this is not an observed upstream convention. Supplemental tests
  also have DisplayName.
- Replace only arrangements that compare updatedAt strictly with fixed historical
  reconstruction: three Category update tests, one CastMember update test, three
  Genre update tests and five Video update tests. The 12 original `isBefore`
  assertions are unchanged. No sleeps, clock mocks, production changes or weakened
  timestamp assertions are involved.
- Remove redundant Portuguese checklist comments in two Category test files. Keep
  test data and messages, including Portuguese strings, as source fixtures.
- Preserve original test method names and their assertions. Some source names are
  misleading: the update-video failure method says it should clear resources but
  asserts **zero** cleanup calls; its DisplayName describes that actual assertion.
  Several category method names mention an exception although they inspect Left.

Do not treat a copied test name as stronger evidence than its executable assertion.
The six supplemental methods are new teaching tests inside their matching action
suites, not tests found in the source. They preserve its package layout,
UseCaseTest inheritance, `@Mock` gateway fields and `@InjectMocks` use case.

## Compile and run in a suitable target or isolated fixture

For application work in a target project, reuse its existing domain types, compatible
application bases and test fixtures. In a new action's tests, use simple real domain
objects with known valid data rather than inventing domain behavior. Supplemental
cases reuse the source fixture style where applicable.

For a reference replay without the original checkout, assemble these prerequisites:

- The 75 action sources and 23 test classes in this skill, plus the three bases and
  `UseCaseTest` from required service-layer-design `^1.3.0`; use the
  [direct source links](../SKILL.md#source-assets-and-tests).
- The optional java-ddd package `^1.2.0` with its required specialists, using the
  [complete domain source index](../../java-ddd/references/source-index.md) for all
  49 production sources, including `AggregateRoot`, identifiers and gateways. That
  bundle is suggested, not installed by this skill; make it available explicitly.
- The exact [UnitTest.java](../../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java)
  and [Fixture.java](../../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/Fixture.java)
  from java-ddd-testing `^1.2.0`, available through that hub or separately. `Fixture`
  needs JavaFaker 1.0.2. `UnitTest` is domain test support; application tests still
  extend `UseCaseTest`.
- Vavr 0.10.4, JUnit Jupiter API/engine 5.9.2 and mockito-junit-jupiter 5.0.0, with
  their transitive dependencies. These libraries and a compatible build toolchain
  are separate prerequisites; the skill packages contain Java sources, not jars
  or a standalone build. Fully offline execution needs those dependencies available
  locally as well.

Keep the package-relative layout and compile the indexed domain sources with the
78 application production sources. Make the domain test support visible to the
application test classpath alongside `UseCaseTest` and the 23 action test classes.
The reference build exports the domain's `testClasses` artifact for this purpose;
reuse it if available, or configure an isolated source fixture with the same classpath
relationship. The bundled Java sources do not require `C:/git/ddd-example` to exist.

The source uses Java 17 language features without preview syntax. Application build
compatibility must still be checked against the target's toolchain. An explicit
`--release 17` compilation is a useful asset check when using a compatible JDK;
do not mistake the source's buildSrc setting for an application toolchain declaration.
The review environment provides Corretto 19.0.2 for the Gradle 7.6 fixture. This is
an execution environment, not a requirement to upgrade a target to Java 19.

When the authorized target or isolated fixture has the reference's Gradle module
layout and wrapper, run the narrowest relevant test, then the application suite when
adapting the whole asset set:

```powershell
./gradlew.bat --no-daemon :application:test --tests '*UpdateCategoryUseCaseTest'
./gradlew.bat --no-daemon :application:test --tests '*GetMediaUseCaseTest'
./gradlew.bat --no-daemon :application:test
```

Use `./gradlew` on a shell/platform with that wrapper. The reference also exposes
`:application:unitTests` with the `unitTest` tag filter. These commands create build
outputs in the invoked project; run them in the target authorized for work or an
isolated validation copy, not the authoritative read-only checkout. An application
test task can compile domain test fixtures without executing the domain suite;
report the tasks and test counts actually executed. No infrastructure service or
Spring context is needed by these unit tests.

## Mockito, real objects and useful assertions

The source's UseCaseTest carries `@ExtendWith(MockitoExtension.class)` and
`@Tag("unitTest")`, exposes `getMocks()`, and has helpers converting Identifier
collections to strings. It also implements BeforeEachCallback with a Mockito.reset
body, but only MockitoExtension is registered by its annotation. Do not claim
merely implementing that callback registers a reset hook on the test instance.
Preserve the support asset and inspect actual registration before depending on the
callback. The tests' usual per-method lifecycle and Mockito extension supply fresh
gateway mocks without proving that custom callback executed.

Use `@Mock` for gateways and `@InjectMocks` for the default implementation
under test. Use actual Category, CastMember, Genre, Video, IDs, Notification and
media objects. Keep the domain-only no-mock rule scoped to domain tests; replacing
application Mockito with a new fake persistence layer is not source reproduction.

Assert the outcome and relevant collaborator boundary. The source uses
`returnsFirstArg`, `argThat`, ArgumentCaptor, `verify` and `times(0)` to check saved
state or forbidden writes. Do not assert every internal method call. When comparing
before and after, reconstruct or copy a separate real aggregate instead of letting
the mock return the only baseline object by reference. Separate "gateway update
not called" from "the object did not mutate"; the source does not guarantee both.

Select the matching test subdirectory from the same relative action package as its
production code. Category has 18 original tests; castmember 15; genre 20; video's
five ordinary actions 36 and its three media actions 14, for 103 total. The six
supplemental cases distinguish:

| When changing this behavior                                             | Read and run the matching test suite                                                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size-only category existence comparison; equal-size wrong IDs pass      | [CreateGenreUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/genre/create/CreateGenreUseCaseTest.java)                   |
| Full update with no resources clears all existing media slots           | [UpdateVideoUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/video/update/UpdateVideoUseCaseTest.java)                   |
| One VIDEO upload preserves the four unrelated media slots               | [UploadMediaUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/video/media/upload/UploadMediaUseCaseTest.java)             |
| A matching PENDING status still calls videoGateway.update               | [UpdateMediaStatusUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/video/media/update/UpdateMediaStatusUseCaseTest.java) |
| Creation cleanup failure escapes instead of wrapping the original error | [CreateVideoUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/video/create/CreateVideoUseCaseTest.java)                   |
| Media retrieval retains Resource's mutable byte array in its output     | [GetMediaUseCaseTest](../assets/application/src/test/java/com/robsonkades/admin/catalogo/application/video/media/get/GetMediaUseCaseTest.java)                      |

These are observable preservation checks, including source limitations; they are
not a recommendation to introduce those limitations in an unrelated design. Do
not infer transaction interception, database rollback, durable deletion, successful
external cleanup or event delivery from gateway mocks. State separately what was
compiled, what tests ran, which behavior was only walked through, and any agent
evaluation that was actually executed.
