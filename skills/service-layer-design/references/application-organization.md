# Application organization

Read this when locating an action, creating its files, or reviewing package and class
placement. This map reproduces the source snapshot identified in
[service boundaries](service-boundaries.md#authority-and-coverage).

## Roots and action packages

The source package prefix is `com.robsonkades.admin.catalogo.application`.
Main and test Java roots mirror that package path.

```text
application/
  src/main/java/com/robsonkades/admin/catalogo/application/
    UseCase.java
    UnitUseCase.java
    NullaryUseCase.java
    category/{create,update,delete,retrieve/get,retrieve/list}/
    castmember/{create,update,delete,retrieve/get,retrieve/list}/
    genre/{create,update,delete,retrieve/get,retrieve/list}/
    video/{create,update,delete,retrieve/get,retrieve/list}/
    video/media/{get,upload,update}/
  src/test/java/com/robsonkades/admin/catalogo/application/
    UseCaseTest.java
    (matching aggregate/action paths)
```

Brace notation abbreviates real directories; it is not a new package naming syntax.
There are no shared application `service`, `impl`, `command`, `dto`, `query` or
`port` buckets in this reference. Preserve the aggregate/action boundary and colocate
the following artifacts.

## Complete action inventory

For each row, append `.java` to the named classes. The implementation's exact name is
`Default` plus the abstract contract name, in the **same package**. A dash means that
the reference defines no such record; it does not invite a placeholder.

| Action package             | Abstract contract          | Command record             | Output record            |
| -------------------------- | -------------------------- | -------------------------- | ------------------------ |
| `category/create`          | `CreateCategoryUseCase`    | `CreateCategoryCommand`    | `CreateCategoryOutput`   |
| `category/update`          | `UpdateCategoryUseCase`    | `UpdateCategoryCommand`    | `UpdateCategoryOutput`   |
| `category/delete`          | `DeleteCategoryUseCase`    | —                          | —                        |
| `category/retrieve/get`    | `GetCategoryByIdUseCase`   | —                          | `CategoryOutput`         |
| `category/retrieve/list`   | `ListCategoriesUseCase`    | —                          | `CategoryListOutput`     |
| `castmember/create`        | `CreateCastMemberUseCase`  | `CreateCastMemberCommand`  | `CreateCastMemberOutput` |
| `castmember/update`        | `UpdateCastMemberUseCase`  | `UpdateCastMemberCommand`  | `UpdateCastMemberOutput` |
| `castmember/delete`        | `DeleteCastMemberUseCase`  | —                          | —                        |
| `castmember/retrieve/get`  | `GetCastMemberByIdUseCase` | —                          | `CastMemberOutput`       |
| `castmember/retrieve/list` | `ListCastMembersUseCase`   | —                          | `CastMemberListOutput`   |
| `genre/create`             | `CreateGenreUseCase`       | `CreateGenreCommand`       | `CreateGenreOutput`      |
| `genre/update`             | `UpdateGenreUseCase`       | `UpdateGenreCommand`       | `UpdateGenreOutput`      |
| `genre/delete`             | `DeleteGenreUseCase`       | —                          | —                        |
| `genre/retrieve/get`       | `GetGenreByIdUseCase`      | —                          | `GenreOutput`            |
| `genre/retrieve/list`      | `ListGenreUseCase`         | —                          | `GenreListOutput`        |
| `video/create`             | `CreateVideoUseCase`       | `CreateVideoCommand`       | `CreateVideoOutput`      |
| `video/update`             | `UpdateVideoUseCase`       | `UpdateVideoCommand`       | `UpdateVideoOutput`      |
| `video/delete`             | `DeleteVideoUseCase`       | —                          | —                        |
| `video/retrieve/get`       | `GetVideoByIdUseCase`      | —                          | `VideoOutput`            |
| `video/retrieve/list`      | `ListVideosUseCase`        | —                          | `VideoListOutput`        |
| `video/media/get`          | `GetMediaUseCase`          | `GetMediaCommand`          | `MediaOutput`            |
| `video/media/upload`       | `UploadMediaUseCase`       | `UploadMediaCommand`       | `UploadMediaOutput`      |
| `video/media/update`       | `UpdateMediaStatusUseCase` | `UpdateMediaStatusCommand` | —                        |

This accounts for all 75 action files, plus the three root bases = 78 main files.
`java-ddd-use-cases` is the authority for each row's full signature, record fields,
factory overloads, validation, errors and execution order.

## Selecting the base and preserving modifiers

- The four delete contracts extend `UnitUseCase<String>`.
- `UpdateMediaStatusUseCase` extends `UnitUseCase<UpdateMediaStatusCommand>`.
- The other 18 actions extend `UseCase<IN, OUT>` with their actual types.
  A query input is still a `UseCase`; do not invent a separate query hierarchy.
- `NullaryUseCase<OUT>` declares only `OUT execute()` and is unused by these actions.
  An instruction to retain this base is not evidence for a new nullary action.
- All five cast-member contracts are `public sealed abstract class` with a
  `permits Default...UseCase` clause, and their defaults are `public non-sealed class`.
  All other action contracts are `public abstract class` and their defaults are
  `public class`. Do not apply cast-member sealing across all aggregates.

Choose by the matched source action, not by an aesthetic preference for interfaces,
functional types, a shared CRUD superclass, or a single service per aggregate.
An action whose input, output or modifiers are unresolved needs its concrete source
pattern or an explicit project decision.

## Tests and portable support

Each action has a test class in the matching test package, extending `UseCaseTest`.
Normally its name is the abstract action name plus `Test`. One source naming difference
is intentional to preserve: `video/retrieve/list/ListVideoUseCaseTest.java` exercises
`DefaultListVideosUseCase` (singular `Video` in the test name, plural `Videos` in the
action contract). There are 23 suites plus the shared base.

The four common support files are provided under this skill's `assets/application/`
tree and linked from `SKILL.md`. Detailed action sources and adapted action tests are
provided by `java-ddd-use-cases`; the two asset trees use the same application package
root and do not duplicate support classes. The assets are source material, not a
standalone Gradle project or permission to replace an existing target tree wholesale.

Keep the existing domain dependency and test-fixture dependency. If those types or the
required libraries are missing, obtain the corresponding project source/build contract
instead of creating substitute domain objects, gateway implementations or a new build.
