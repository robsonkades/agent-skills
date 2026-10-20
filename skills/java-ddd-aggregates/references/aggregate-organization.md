# Aggregate organization and ownership

Read when placing a root and its associated types or reviewing references between
aggregates. The sole technical source is `ddd-example/domain`, revision
`8d964ce4106c2299164e28980ae7553e2afbdc92`. Paths below are relative to that module;
the captured contracts are usable without a machine-specific checkout.
For every production type in this layout, use the
[complete domain source index](../../java-ddd/references/source-index.md). It maps
all 49 source files to their canonical assets across the hub and specialists.

## Package by aggregate

The observed main package is `com.robsonkades.admin.catalogo.domain`. Preserve a
target project's namespace while following this structure:

```text
domain/
  Entity.java
  AggregateRoot.java
  Identifier.java
  ValueObject.java
  category/
    Category.java
    CategoryID.java
    CategoryValidator.java
    CategoryGateway.java
  genre/
    Genre.java
    GenreID.java
    GenreValidator.java
    GenreGateway.java
  castmember/
    CastMember.java
    CastMemberID.java
    CastMemberValidator.java
    CastMemberGateway.java
    CastMemberType.java
  video/
    Video.java
    VideoID.java
    VideoValidator.java
    VideoGateway.java
    VideoSearchQuery.java
    VideoPreview.java
    VideoMediaCreated.java
    ImageMedia.java
    AudioVideoMedia.java
    MediaResourceGateway.java
    Resource.java
    VideoResource.java
    MediaStatus.java
    VideoMediaType.java
    Rating.java
  validation/
  exceptions/
  events/
  utils/
  pagination/
```

This layout groups the root with its ID, validator, Gateway and local vocabulary.
The `events` package contains the shared event interfaces; the concrete
`VideoMediaCreated` record is in `video`, beside its producer. Do not create a
parallel `entities`, `identifiers`, `validators` or `gateways` tree for these local
types. Shared foundation behavior stays at the domain root or in the existing
cross-cutting packages.

## Root and relationship contracts

| Root         | Base type                     | Other aggregate references                             | State held inside the root                               |
| ------------ | ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `Category`   | `AggregateRoot<CategoryID>`   | None                                                   | Name, description, active flag and lifecycle timestamps  |
| `Genre`      | `AggregateRoot<GenreID>`      | `List<CategoryID>`                                     | Name, active flag and lifecycle timestamps               |
| `CastMember` | `AggregateRoot<CastMemberID>` | None                                                   | Name, `CastMemberType` and timestamps                    |
| `Video`      | `AggregateRoot<VideoID>`      | `Set<CategoryID>`, `Set<GenreID>`, `Set<CastMemberID>` | Metadata, flags, timestamps, image and audio/video media |

Do not embed a `Category` entity in `Genre` or load a `CastMember` from a `Video`
method. These relationships use IDs; the domain does not check referenced existence
by calling a Gateway. The reference provides no nested child-entity aggregate
example. If a task depends on such a boundary, obtain the missing rule/reference
instead of inventing child lifecycle or cross-root transactional behavior.

Before adding a root or resolving its base types, read the canonical
[AggregateRoot.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java),
[Entity.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java),
[Identifier.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java)
and [ValueObject.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java)
in the optional `java-ddd` hub. Reuse them instead of duplicating a foundation in
the aggregate package.

`AggregateRoot<ID extends Identifier>` extends `Entity<ID>` and contributes only
protected constructors forwarding the ID and optional events. Concrete roots are
ordinary mutable classes, not records or Spring components. The inherited equality
requires the same runtime class and equal typed ID; changing name or other state
does not change identity. Do not regenerate root equality from its mutable fields.

Use the established `validate(ValidationHandler)` override to construct the local
validator and invoke `validate()`. Full handler/error mechanics belong to
`java-ddd-domain-services`; factory timing belongs to
[factories and lifecycle](java-lifecycle-pattern.md).

## Ownership is specific to the path

| Path                                             | Collection behavior                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Genre.newGenre`                                 | Starts with a new mutable `ArrayList`                                                                 |
| Full `Genre.with(...)` / protected constructor   | Retains the supplied list reference; no null normalization or copy                                    |
| `Genre.with(existing)`                           | Copies categories to a new `ArrayList`                                                                |
| `Genre.update(...)`                              | Replaces categories with a new `ArrayList`; null becomes an empty mutable list                        |
| `Genre.getCategories()`                          | Unmodifiable view of the stored list; not a snapshot                                                  |
| `Video.newVideo(...)` and full `Video.with(...)` | Constructor retains supplied sets, including null                                                     |
| `Video.with(existing)`                           | Copies the three ID sets into new `HashSet` instances                                                 |
| `Video.update(...)`                              | Each private setter copies a non-null set into a new `HashSet`; null becomes `Collections.emptySet()` |
| Video ID-set getters                             | Unmodifiable views when present, empty sets for null fields                                           |

These are observed contracts, not a blanket claim of defensive copying. A caller
holding a list/set passed to a retaining constructor can still affect that root.
For a new implementation that requires faithful reproduction, preserve the chosen
path; for a request to change ownership, make the behavioral change explicit and
obtain the missing requirement. Never silently replace a view with `List.copyOf`
or normalize every null: that changes supported paths and failures.

`Genre` uses a list, so additions retain duplicates and order. `addCategory(null)`,
`removeCategory(null)` and `addCategories(null/empty)` are no-ops. Other
`addCategories` calls add all entries; there is no element filtering or deduplication.
Removing a non-null absent ID still updates `updatedAt`. Video's relationships are
sets; do not transfer Genre's multiplicity to them.

## Evidence map

- `src/main/java/com/robsonkades/admin/catalogo/domain/{Entity,AggregateRoot}.java`:
  inheritance, identity and the pending-event list.
- `src/main/java/com/robsonkades/admin/catalogo/domain/category/Category.java`:
  root state, explicit validation and lifecycle methods.
- `src/main/java/com/robsonkades/admin/catalogo/domain/genre/Genre.java`:
  ID relationships, mutable list operations and ownership differences.
- `src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMember.java`:
  root-local enum and constructor/update validation.
- `src/main/java/com/robsonkades/admin/catalogo/domain/video/Video.java`:
  ID sets, media, update methods and copy behavior.
- `src/test/java/com/robsonkades/admin/catalogo/domain/genre/GenreTest.java`:
  category additions/removal and null/empty no-op expectations.

No ORM mapping, locking strategy, database transaction or application orchestration
is inferred from this domain-only evidence.
