# Video and media lifecycle

Read before implementing or reviewing video create/update/delete, video outputs,
media retrieval/upload or encoding-status handling. The complete implementation
packages are routed from the [action table](action-contracts.md). The application
source is the authority; domain methods below explain actual collaborators, not
permission to redesign them or implement an adapter.

## Inputs, validation and associations

CreateVideoCommand carries title, description, Integer launchedAt, Double duration,
Boolean opened/published, String rating, three `Set<String>` associations
(categories, genres, members), and five nullable Resources (video, trailer, banner,
thumbnail, thumbnailHalf). UpdateVideoCommand adds String id first. Both provide
full and no-resource `with(...)` overloads plus `getVideo/getTrailer/getBanner/
getThumbnail/getThumbnailHalf` returning `Optional.ofNullable` for media only.
Record accessors still expose the original values. No builder, null normalization,
defensive copy or patch-presence flag is present.

Both defaults map rating with `Rating.of(value).orElse(null)`, map a non-null launch
integer with `Year.of`, and map each association set with its typed ID factory into
a Set. A null association fails at `stream()` before validation; a null boxed
duration/opened/published fails on unboxing into the domain method. Out-of-range
years can fail in Year.of. Do not promise every invalid input becomes a Notification.

Create appends category, genre and cast-member existence errors in that order,
constructs `Video.newVideo(...)`, and explicitly calls `video.validate(notification)`.
Update parses the inputs, loads the existing Video (or throws NotFoundException),
then performs the same ordered checks, calls `video.update(...)`, and explicitly
validates. Either throws NotificationException with
`"Could not create Aggregate Video"` or `"Could not update Aggregate Video"` before
media/storage if errors exist. Domain update occurs even when association errors
were appended; a failure does not restore the loaded object's previous state.

Each nonempty association set calls its own gateway's `existsByIds` once; empty
sets skip it. As with Genre, the comparison is only `ids.size() != retrievedIds.size()`.
Only then does a copied list remove retrieved IDs and generate
`"Some %s could not be found: %s"`, using labels `categories`, `genres`, `cast members`.
Equal sizes are not proof of equal membership. Set iteration does not establish
a portable order for multiple missing IDs; do not invent a sorting guarantee.
Exceptions from parsing, lookup or existence checks occur outside the media catch.

## Creation and full update: exact sequence and limits

The operation runs the following sequence. Steps 1–5 occur inside the private
create/update helper's `try`; step 6 occurs outside that helper:

1. Store optional VIDEO with `storeAudioVideo`.
2. Store optional TRAILER with `storeAudioVideo`.
3. Store optional BANNER, THUMBNAIL, THUMBNAIL_HALF in that order with `storeImage`.
4. Each present Resource is wrapped as `VideoResource.with(type, resource)` using
   the video's ID. Each absent resource becomes `null`.
5. Chain `updateVideoMedia`, `updateTrailerMedia`, `updateBannerMedia`,
   `updateThumbnailMedia`, `updateThumbnailHalfMedia`, then pass the resulting
   Video to `videoGateway.create` or `videoGateway.update`.
6. Map the gateway-returned Video to the output's String ID outside the helper.

This fluent chain is actual mutable domain behavior, not a builder. It replaces
**all five media slots**. The no-resource UpdateVideoCommand overload therefore
clears existing media in the aggregate; it does not mean "leave media unchanged."
The application calls no gateway delete for individual replaced media, so resource
replacement does not prove that old external files were removed. A metadata-only
patch preserving resources would be a new contract requiring an explicit decision.

The catch and cleanup behavior is deliberately asymmetric:

| Operation | Failure behavior in the media/persistence helper                                                       | What is not established                                                  |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Create    | Catch Throwable; call `clearResources(videoId)`; then throw InternalErrorException with original cause | Atomic cleanup, removal of any created database row, successful rollback |
| Update    | Catch Throwable; throw InternalErrorException with original cause; no clearResources call              | Restoration of old fields/media or cleanup of newly stored resources     |

Both use the exact message
`"An error on create video was observed [videoId:%s]"`, including the create wording
on update. Preserve it in faithful implementation and report the mismatch separately.
If creation's `clearResources` itself throws, that failure escapes before the
InternalErrorException is constructed; the source does not preserve both failures
with suppression or retry cleanup. Earlier parsing/validation failures do not enter
this helper. Output mapping outside the helper is also outside its catch.

The domain's media update methods change updatedAt; pending audio/video media
register VideoMediaCreated events on the aggregate. These application actions do
not publish or clear domain events. Domain event creation is not evidence of an
outbox, message delivery or exactly-once processing. Do not replace these method
calls with setters that bypass their real side effects.

## Delete, get and list

DeleteVideo converts the String ID, calls `videoGateway.deleteById`, then
`mediaResourceGateway.clearResources`. There is no lookup, finally block or catch.
If deletion fails, cleanup is not attempted. If cleanup fails after deletion, its
failure propagates; no restoration is attempted. Normal return for an absent ID
depends on the gateway's behavior and does not prove general idempotency.

GetVideoById maps the gateway Video or throws `NotFoundException.with(Video.class, id)`.
VideoOutput includes String id; createdAt/updatedAt; title/description; primitive
int launchedAt (Year.getValue), double duration and boolean opened/published;
Rating; `Set<String>` categories/genres/castMembers; ImageMedia banner/thumbnail/
thumbnailHalf; and AudioVideoMedia video/trailer. Domain optionals become nullable
output fields. The output holds media objects; it is not a transport serializer.
Do not rename `castMembers` to command field `members` or turn Rating into a String
without a requested API change. Mapping an invalid reconstructed Video with null
launch year can throw; the mapper does not revalidate it.

ListVideos uses domain VideoSearchQuery and the VideoGateway's VideoPreview page,
then maps VideoListOutput. The mapper also has a Video overload. It does not load
each full Video or media resource. Preserve query/metadata pass-through and empty
pages, with gateway errors propagating.

## Download: media lookup without a Video lookup

GetMediaCommand is `(String videoId, String mediaType)` with a direct `with` factory.
The default converts VideoID, resolves `VideoMediaType.of`, then calls only
`mediaResourceGateway.getResource(id, type)`. It does not check VideoGateway first.
Unknown type throws NotFoundException with
`"Media type %s doesn't exists"`; an empty resource throws NotFoundException with
`"Resource %s not found for video %s"`, formatted from the command values. Keep the
exact public messages, including grammar, when reproducing the source.

MediaOutput is `(byte[] content, String contentType, String name)`, with
`with(Resource)` passing each field directly. Its byte array aliases Resource's
array. No stream ownership, close operation, copy or size limit is demonstrated.
Do not claim deep immutability because this output is a record, or implement an
HTTP streaming response inside the use case.

## Upload: one selected media slot

UploadMediaCommand is `(String videoId, VideoResource videoResource)` with a direct
factory. After ID conversion and Video lookup, the default switches on the
resource's type. VIDEO/TRAILER use storeAudioVideo and their respective update
method; BANNER/THUMBNAIL/THUMBNAIL_HALF use storeImage and the corresponding method.
Then call `videoGateway.update` and build
`UploadMediaOutput.with(savedVideo, type)` with `(String videoId, VideoMediaType mediaType)`.
No other media slot is replaced. Missing video throws NotFoundException before
storage. No local validation, exception wrapper, resource cleanup or compensation
appears in this action; storage/persistence failures propagate. A null resource or
type is not normalized by the command factory.

## Encoding status: match before mutation

UpdateMediaStatusCommand carries `(MediaStatus status, String videoId,
String resourceId, String folder, String filename)` and a direct `with` factory.
The action loads the Video and computes `"%s/%s".formatted(folder, filename)` without
path validation. It first matches resourceId against the video's current media ID;
only if that fails does it test the trailer's ID. Thus video wins if both IDs match.
Null media never matches. Missing Video throws NotFoundException; unmatched resource
returns normally without gateway.update. There is no image-status branch.

For a match: PENDING performs no domain transition; PROCESSING calls
`video.processing(type)`; COMPLETED calls `video.completed(type, encodedPath)`.
All three then call `videoGateway.update(video)`, including PENDING. Do not add
status ordering, retry, deduplication, resource creation or an error for an obsolete
resource ID. Null status fails at the switch only when a resource matches.
The formatted path can contain `null` values; a new path policy is not implicit.

Use the supplemental tests routed in [testing and source fidelity](testing-and-source.md)
to distinguish full update from single upload and successful compensation from
an attempted cleanup. These tests characterize the source; they do not approve its
limitations for every new application.
