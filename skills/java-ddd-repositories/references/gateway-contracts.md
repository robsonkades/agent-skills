# Gateway contracts and placement

Read when adding or reviewing a domain port. Evidence is exclusively
`ddd-example/domain`, commit `8d964ce4106c2299164e28980ae7553e2afbdc92`.
Paths below are relative to
`domain/src/main/java/com/robsonkades/admin/catalogo/domain/`. When reproducing or
checking a port, open its linked complete Java file, including package/import lines.
The code blocks below remain source excerpts; referenced types are the existing
domain classes, `java.util.List` and `java.util.Optional`.

## Aggregate ports

[category/CategoryGateway.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/CategoryGateway.java)
lives beside `Category`, `CategoryID` and
`CategoryValidator`. It imports domain `pagination.Pagination` and
`pagination.SearchQuery`:

```java
public interface CategoryGateway {

    Category create(Category aCategory);

    void deleteById(CategoryID anId);

    Optional<Category> findById(CategoryID anId);

    Category update(Category aCategory);

    Pagination<Category> findAll(SearchQuery aQuery);

    List<CategoryID> existsByIds(Iterable<CategoryID> ids);
}
```

[genre/GenreGateway.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreGateway.java)
uses the same pagination types and its own aggregate/ID:

```java
public interface GenreGateway {

    Genre create(Genre aGenre);

    void deleteById(GenreID anId);

    Optional<Genre> findById(GenreID anId);

    Genre update(Genre aGenre);

    Pagination<Genre> findAll(SearchQuery aQuery);

    List<GenreID> existsByIds(Iterable<GenreID> ids);
}
```

[castmember/CastMemberGateway.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberGateway.java)
also retains the concrete domain types:

```java
public interface CastMemberGateway {

    CastMember create(CastMember aCastMember);

    void deleteById(CastMemberID anId);

    Optional<CastMember> findById(CastMemberID anId);

    CastMember update(CastMember aCastMember);

    Pagination<CastMember> findAll(SearchQuery aQuery);

    List<CastMemberID> existsByIds(Iterable<CastMemberID> ids);
}
```

[video/VideoGateway.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoGateway.java)
differs in both query and return types. The preview is a
domain record, not a partially loaded `Video`:

```java
public interface VideoGateway {

    Video create(Video aVideo);

    void deleteById(VideoID anId);

    Optional<Video> findById(VideoID anId);

    Video update(Video aVideo);

    Pagination<VideoPreview> findAll(VideoSearchQuery aQuery);

}
```

These are independent interfaces, not subclasses of a common CRUD abstraction.
Preserve `create`/`update` returning the aggregate, `deleteById` returning `void`,
and lookup returning `Optional`. The signatures contain no revision argument,
technical persistence ID, transaction object, Spring Data type or declared checked
exception. Do not rename the ports to `Repository` to fit an external convention.

`existsByIds` is not a boolean check and does not return aggregates. Preserve
`Iterable<ID>` as input and `List<ID>` as output. The domain declarations alone do
not establish ordering, duplicate handling, null/empty-input behavior, or atomic
consistency with a later operation. `VideoGateway` has no equivalent method.

## Media resource port

[video/MediaResourceGateway.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/MediaResourceGateway.java)
is a separate capability in the same domain
package. It does not extend `VideoGateway`:

```java
public interface MediaResourceGateway {

    AudioVideoMedia storeAudioVideo(VideoID anId, VideoResource aResource);

    ImageMedia storeImage(VideoID anId, VideoResource aResource);

    Optional<Resource> getResource(VideoID anId, VideoMediaType type);

    void clearResources(VideoID anId);
}
```

Preserve the two different media result types and the `Optional<Resource>` lookup.
There is no `MultipartFile`, cloud SDK object, URL-only result, byte stream or
framework resource in this contract. The port does not declare which media types
each store accepts, overwrite/cleanup semantics, storage locations, checksum
verification, retry behavior or encoding completion. Do not invent them from the
names. The aggregate's media transitions and events are separate domain behavior.

## What signatures cannot settle

| Evidence in the domain                            | Supported conclusion                                       | Decision still requiring evidence                                      |
| ------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Separate `create` and `update` methods            | Keep separate operations and aggregate return types        | Collision, missing-update or upsert behavior                           |
| `Optional<Aggregate>` or `Optional<Resource>`     | The API can express absence                                | Which conditions produce absence, null-handling or failure translation |
| `void deleteById(ID)` / `void clearResources(ID)` | No result value is declared                                | Missing-target, repeated-call, partial-failure or durability behavior  |
| `Pagination<VideoPreview>`                        | Listing exposes the domain projection                      | SQL shape, lazy loading, ordering or freshness                         |
| No revision/lock method                           | The domain supplies no explicit concurrency token/protocol | Whether any adapter prevents lost updates                              |

Do not convert an unknown failure into `Optional.empty()` or promise an exception
class based on its existence elsewhere in the domain. The interfaces contain no
implementation or exception mapping. If a task needs one of these decisions, ask
for the intended behavior and authorized evidence; the current domain-only source
does not answer it.
