# Query, projection and resource types

Read when implementing or reviewing the values crossing a Gateway. Evidence is
`ddd-example/domain` at commit `8d964ce4106c2299164e28980ae7553e2afbdc92`.
Paths are relative to `domain/src/main/java/com/robsonkades/admin/catalogo/domain/`.
When copying or checking SearchQuery, VideoSearchQuery, Pagination or VideoPreview,
open the linked complete Java files below. Java snippets remain source excerpts
with imports/packages omitted; use the named domain types and Java `List`, `Set`,
`Instant` and `Function` imports as appropriate.

## Search criteria

[pagination/SearchQuery.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/pagination/SearchQuery.java)
is the query for Category, Genre and CastMember:

```java
public record SearchQuery(
        int page,
        int perPage,
        String terms,
        String sort,
        String direction
) {
}
```

[video/VideoSearchQuery.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoSearchQuery.java)
adds typed-ID filters in this order:

```java
public record VideoSearchQuery(
        int page,
        int perPage,
        String terms,
        String sort,
        String direction,
        Set<CastMemberID> castMembers,
        Set<CategoryID> categories,
        Set<GenreID> genres
) {
}
```

These records have no custom constructors, defaults, validation or normalization.
Preserve `String` sort/direction and the actual collection types. Do not silently
convert filters to strings/lists, copy or normalize the sets, clamp page sizes,
reject negative pages, or assume a page-index origin. Empty versus null filters,
AND/OR matching, permitted sort fields and case/accent matching are not defined in
these domain declarations. Ask when implementing behavior that depends on them.

## Pagination and projection

[pagination/Pagination.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/pagination/Pagination.java)
stores page metadata and maps items:

```java
public record Pagination<T>(
        int currentPage,
        int perPage,
        long total,
        List<T> items
) {

    public <R> Pagination<R> map(final Function<T, R> mapper) {
        final List<R> aNewList = this.items.stream()
                .map(mapper)
                .toList();

        return new Pagination<>(currentPage(), perPage(), total(), aNewList);
    }
}
```

`map` transforms the supplied items and carries `currentPage`, `perPage` and
`total` into a new `Pagination<R>`. It does not recompute `total` from page size,
perform another query or change pagination metadata. The record constructor does
not copy or validate its input list; do not describe every `Pagination` instance
as a deep immutable snapshot or add such behavior while reproducing the source.

[video/VideoPreview.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoPreview.java)
contains precisely these fields and a conversion from a
real Video:

```java
public record VideoPreview(
        String id,
        String title,
        String description,
        Instant createdAt,
        Instant updatedAt
) {

    public VideoPreview(final Video aVideo) {
        this(
                aVideo.getId().getValue(),
                aVideo.getTitle(),
                aVideo.getDescription(),
                aVideo.getCreatedAt(),
                aVideo.getUpdatedAt()
        );
    }
}
```

Preserve `String id` even though `VideoGateway.findById` receives `VideoID`.
The projection excludes media, relation IDs, rating, publication flags and other
aggregate state. Do not add those fields or construct a writable Video from a
preview by fabricating missing values. The constructor accepts a Video, but the
Gateway interface does not require listing implementations to load one first.

## Media resource values

`video/VideoResource.java` combines a media type with content and metadata:

```java
public record VideoResource(
        VideoMediaType type,
        Resource resource
) {

    public static VideoResource with(final VideoMediaType type, final Resource resource) {
        return new VideoResource(type, resource);
    }
}
```

Neither its canonical construction nor `with` adds validation. The enum in
`video/VideoMediaType.java` contains `VIDEO`, `TRAILER`, `BANNER`, `THUMBNAIL` and
`THUMBNAIL_HALF`; its `of(String)` searches names ignoring case and returns an
`Optional<VideoMediaType>`. This does not establish which values each storage
method accepts.

`video/Resource.java` extends `ValueObject`. Its private constructor and
`with(byte[] content, String checksum, String contentType, String name)` factory
require each argument to be non-null. Accessors are `content()`, `checksum()`,
`contentType()` and `name()`. It stores and exposes the same byte array: no
defensive copy, checksum computation or MIME validation occurs in this class.
Do not claim that declaring it a value object makes the bytes immutable. For
construction, equality and ownership details of Resource, ImageMedia and
AudioVideoMedia, use `java-ddd-value-objects`.

The reference has no content stream, byte limit, allowed-MIME policy or checksum
algorithm in these types. Preserve their established signatures. If an additional
policy is necessary, obtain the requirement before inventing it or changing the
domain model.
