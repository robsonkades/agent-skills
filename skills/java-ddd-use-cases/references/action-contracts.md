# Application action contracts

Read when choosing an action family, implementing its contract/default pair or
reviewing records, mapping, validation, absence and gateway sequencing. Every row
links to a complete source package under the installed skill. Copy or adapt the
selected package only after reading all of its files. Original relative paths are
`application/src/main/java/com/robsonkades/admin/catalogo/application/<row path>`;
provenance and test adaptations are in [testing and source fidelity](testing-and-source.md).

## All 23 actions

`UseCase<IN, OUT>` and `UnitUseCase<IN>` are independent abstract bases supplied by
service-layer-design. The reference also defines `NullaryUseCase<OUT>`, but none
of these actions extends it. Every row has both the named abstract contract and a
`Default` implementation with that name prefixed by `Default`.

| Package and complete sources            | Contract                 | Input → output                                                        | Main collaboration                                                           |
| --------------------------------------- | ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [category/create][category-create]      | CreateCategoryUseCase    | CreateCategoryCommand → Either of Notification / CreateCategoryOutput | New category, explicit validation, gateway create                            |
| [category/update][category-update]      | UpdateCategoryUseCase    | UpdateCategoryCommand → Either of Notification / UpdateCategoryOutput | Lookup, mutate, explicit validation, gateway update                          |
| [category/delete][category-delete]      | DeleteCategoryUseCase    | String → void                                                         | CategoryGateway.deleteById                                                   |
| [category/retrieve/get][category-get]   | GetCategoryByIdUseCase   | String → CategoryOutput                                               | Lookup and detail mapping                                                    |
| [category/retrieve/list][category-list] | ListCategoriesUseCase    | SearchQuery → Pagination of CategoryListOutput                        | findAll and pagination map                                                   |
| [castmember/create][member-create]      | CreateCastMemberUseCase  | CreateCastMemberCommand → CreateCastMemberOutput                      | Notification callback around newMember, then create                          |
| [castmember/update][member-update]      | UpdateCastMemberUseCase  | UpdateCastMemberCommand → UpdateCastMemberOutput                      | Lookup, Notification callback around update, then persist                    |
| [castmember/delete][member-delete]      | DeleteCastMemberUseCase  | String → void                                                         | CastMemberGateway.deleteById                                                 |
| [castmember/retrieve/get][member-get]   | GetCastMemberByIdUseCase | String → CastMemberOutput                                             | Lookup and detail mapping                                                    |
| [castmember/retrieve/list][member-list] | ListCastMembersUseCase   | SearchQuery → Pagination of CastMemberListOutput                      | findAll and pagination map                                                   |
| [genre/create][genre-create]            | CreateGenreUseCase       | CreateGenreCommand → CreateGenreOutput                                | Category existence check, newGenre, addCategories, create                    |
| [genre/update][genre-update]            | UpdateGenreUseCase       | UpdateGenreCommand → UpdateGenreOutput                                | Lookup, category existence check, update, persist                            |
| [genre/delete][genre-delete]            | DeleteGenreUseCase       | String → void                                                         | GenreGateway.deleteById                                                      |
| [genre/retrieve/get][genre-get]         | GetGenreByIdUseCase      | String → GenreOutput                                                  | Lookup and detail mapping                                                    |
| [genre/retrieve/list][genre-list]       | ListGenreUseCase         | SearchQuery → Pagination of GenreListOutput                           | findAll and pagination map                                                   |
| [video/create][video-create]            | CreateVideoUseCase       | CreateVideoCommand → CreateVideoOutput                                | Validate associations and video, store media, create                         |
| [video/update][video-update]            | UpdateVideoUseCase       | UpdateVideoCommand → UpdateVideoOutput                                | Lookup, validate associations and updated video, store/replace media, update |
| [video/delete][video-delete]            | DeleteVideoUseCase       | String → void                                                         | Delete video, then clear resources                                           |
| [video/retrieve/get][video-get]         | GetVideoByIdUseCase      | String → VideoOutput                                                  | Lookup and complete detail mapping                                           |
| [video/retrieve/list][video-list]       | ListVideosUseCase        | VideoSearchQuery → Pagination of VideoListOutput                      | findAll returns VideoPreview rows; map them                                  |
| [video/media/get][media-get]            | GetMediaUseCase          | GetMediaCommand → MediaOutput                                         | Parse media type, getResource, map bytes/metadata                            |
| [video/media/upload][media-upload]      | UploadMediaUseCase       | UploadMediaCommand → UploadMediaOutput                                | Lookup video, store selected resource, update selected media slot, persist   |
| [video/media/update][media-update]      | UpdateMediaStatusUseCase | UpdateMediaStatusCommand → void                                       | Match video/trailer resource ID, apply status, persist when matched          |

For the eight video/media actions, also read [video and media lifecycle](video-and-media.md).
The source templates are executable Java with the stated prerequisites, not
pseudocode. They retain complete overloads and imports; the table is navigation,
not a substitute implementation.

## Shared shape, with deliberate exceptions

All five cast-member contracts are `sealed abstract`, permit their matching
default, and those defaults are `non-sealed`. All other contracts/defaults in the
table are plain abstract/concrete classes. All implementation dependencies are
private final fields assigned through `Objects.requireNonNull` in constructors.
Dependencies are domain-owned gateways, never infrastructure classes. Preserve
parameter ordering: video creation takes category, cast-member, genre, media,
video gateways; video update takes video, category, cast-member, genre, media.

Use the observed command factories rather than adding a fluent builder. Commands
are records with `with(...)` factories and no compact constructors. The factories
usually directly forward values. Genre's `with(..., Boolean isActive, ...)` alone
normalizes a null active flag to `true`; direct record construction uses primitive
`boolean`. Lists, sets and resource objects are not defensively copied by commands.
Adding validation/copies can change accepted inputs, aliasing or exception timing.
Treat such changes as separate requirements, not automatic record improvements.

Create/update outputs contain a String `id`. Preserve every existing overload:
category outputs accept either String or Category; cast-member outputs accept
CastMemberID or CastMember; CreateGenreOutput accepts String or Genre whereas
UpdateGenreOutput accepts Genre; video create/update outputs accept Video.
Get/list mappers differ deliberately:

- Category detail/list retain a `CategoryID` field. Detail has `updatedAt`; list
  omits it. Both contain name, description, active state, createdAt and deletedAt.
- Cast-member detail/list use String ID, name and `CastMemberType`. Detail has
  createdAt and updatedAt; list has only createdAt.
- Genre detail/list use String ID, name, active state and `List<String>` category
  IDs mapped with `stream().map(CategoryID::getValue).toList()`. Detail includes
  updatedAt; list omits it. Both include createdAt and deletedAt.
- Video list includes id, title, description, createdAt and updatedAt, with
  overloads for Video and VideoPreview. The gateway's list path uses VideoPreview.
  Video detail/media output shapes are described in the video reference.

Do not replace the domain query or Pagination with Spring Data types. List actions
forward the query unchanged and apply `Pagination.map`; they do not impose extra
sorting, filtering, limits or staleness policy. No generic dispatcher, dummy output
for void actions or second query gateway is demonstrated.

## Category: Either for validation and captured write failures

Create extracts fields, constructs `Category.newCategory`, explicitly validates it
into a fresh Notification, returns Left when errors exist, and otherwise calls its
private create helper. That helper uses
`Try(() -> categoryGateway.create(category)).toEither().bimap(Notification::create, CreateCategoryOutput::from)`.
Update converts the ID, loads the existing category, calls
`category.update(...).validate(notification)`, then returns Left or uses the
equivalent gateway-update helper. Preserve this conversion of captured write
failures even though it shares the notification channel with validation errors.

The lookup occurs outside `Try`: missing state throws
`NotFoundException.with(Category.class, id)`; lookup failures propagate. Neither
case becomes a Left or an insertion. A rejected update can leave the loaded
in-memory object mutated. No call to the write gateway is not proof that the
object reverted, and a failure notification is not proof of database rollback.

## Cast member: self-validation through a Notification callback

Create calls `notification.validate(() -> CastMember.newMember(name, type))`, then
throws `NotificationException("Could not create Aggregate CastMember", notification)`
if errors exist; otherwise it maps the result of `castMemberGateway.create`.
Update loads first, captures `member.update(name, type)` through the notification,
throws with `"Could not update Aggregate CastMember %s"` formatted with the ID,
or persists and maps the returned member. The typed `CastMemberType` is already in
the command. Do not move this family to Category's Either API or add a string parser.

The aggregate validates itself during its factory/update; the application callback
collects its validation exception. Gateway writes are outside that callback and
their failures propagate. Absence uses `NotFoundException.with(CastMember.class, id)`.
Mutation before rejection is not undone by the notification.

## Genre: ordered category checks and domain validation

Create converts the command's category String list to CategoryIDs, appends the
existence-check notification, then captures `Genre.newGenre(name, active)` with
`notification.validate`. If errors exist, throw
`NotificationException("Could not create Aggregate Genre", notification)`.
Otherwise call `genre.addCategories(ids)`, then create and map the gateway result.

Update converts IDs before loading the genre. After successful lookup, append
category-check errors, capture `genre.update(name, active, ids)` through the
notification, then throw with `"Could not update Aggregate Genre %s"` or call
the update gateway. It does not short-circuit domain validation merely because an
association is missing, so association errors precede domain errors. Update may
already have mutated the loaded object when it rejects. Gateway lookup/write
failures and existence-check failures are not broadly translated to notifications.

The actual existence check skips an empty list. For a nonempty list, call
`categoryGateway.existsByIds(ids)` once. Only when the **sizes differ**, copy the
requested list, `removeAll(retrievedIds)`, join remaining values with `", "`, and
append `"Some categories could not be found: %s"`. This is not a general set-equality
check: equal-size wrong IDs pass; duplicates can make sizes differ with an empty
missing-ID message. Do not silently deduplicate Genre's list or strengthen the
comparison during faithful reproduction. Null command categories fail at
`categories.stream()` before the helper's null guard could help.

## Lookup, delete and empty results

Aggregate get/update use typed IDs and domain NotFoundException; ID construction
may itself fail before a gateway call. Category, cast-member and genre delete
simply call `deleteById(typedId)` without checking existence. They do not call an
aggregate's deactivate method. Missing deletion is tolerated only insofar as the
gateway returns normally; this application does not prove adapter idempotency.
Get/list/delete gateway failures propagate. Empty list pages preserve pagination
metadata and return normally. See the video reference for its extra deletion step.

[category-create]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/category/create/
[category-update]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/category/update/
[category-delete]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/category/delete/
[category-get]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/category/retrieve/get/
[category-list]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/category/retrieve/list/
[member-create]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/castmember/create/
[member-update]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/castmember/update/
[member-delete]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/castmember/delete/
[member-get]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/castmember/retrieve/get/
[member-list]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/castmember/retrieve/list/
[genre-create]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/genre/create/
[genre-update]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/genre/update/
[genre-delete]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/genre/delete/
[genre-get]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/genre/retrieve/get/
[genre-list]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/genre/retrieve/list/
[video-create]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/create/
[video-update]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/update/
[video-delete]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/delete/
[video-get]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/retrieve/get/
[video-list]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/retrieve/list/
[media-get]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/media/get/
[media-upload]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/media/upload/
[media-update]: ../assets/application/src/main/java/com/robsonkades/admin/catalogo/application/video/media/update/
