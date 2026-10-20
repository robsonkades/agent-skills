package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

class MediaValueObjectsTest extends UnitTest {

    @Test
    @DisplayName("Image equality uses checksum and location, ignoring ID and name")
    void givenSameImageContentAndLocation_whenComparing_shouldBeEqual() {
        // given
        final var first = ImageMedia.with("id-a", "abc", "Banner.png", "/images/banner");
        final var second = ImageMedia.with("id-b", "abc", "Renamed.png", "/images/banner");

        // then
        Assertions.assertEquals(first, second);
        Assertions.assertEquals(first.hashCode(), second.hashCode());
        Assertions.assertNotEquals(first, ImageMedia.with("id-a", "abc", "Banner.png", "/other"));
    }

    @Test
    @DisplayName("Media factories reject missing required data")
    void givenNullChecksum_whenCreatingMedia_shouldRejectIt() {
        Assertions.assertThrows(NullPointerException.class,
                () -> ImageMedia.with(null, "Banner.png", "/images/banner"));
        Assertions.assertThrows(NullPointerException.class,
                () -> AudioVideoMedia.with(null, "Video.mp4", "/videos/raw"));
    }

    @Test
    @DisplayName("New audio/video media starts pending without an encoded location")
    void givenValidMedia_whenCreating_shouldStartPending() {
        final var media = AudioVideoMedia.with("abc", "Video.mp4", "/videos/raw");

        Assertions.assertTrue(media.isPendingEncode());
        Assertions.assertEquals(MediaStatus.PENDING, media.status());
        Assertions.assertEquals("", media.encodedLocation());
    }

    @Test
    @DisplayName("Processing replaces media state and leaves the pending value unchanged")
    void givenPendingMedia_whenProcessing_shouldReturnReplacement() {
        // given
        final var pending = AudioVideoMedia.with("abc", "Video.mp4", "/videos/raw");

        // when
        final var processing = pending.processing();

        // then
        Assertions.assertNotSame(pending, processing);
        Assertions.assertEquals(pending.id(), processing.id());
        Assertions.assertEquals(pending.rawLocation(), processing.rawLocation());
        Assertions.assertEquals(MediaStatus.PROCESSING, processing.status());
        Assertions.assertFalse(processing.isPendingEncode());
        Assertions.assertEquals(MediaStatus.PENDING, pending.status());
    }

    @Test
    @DisplayName("Completed media changes encoding state while preserving equality")
    void givenPendingMedia_whenCompleting_shouldChangeStateWithoutChangingEquality() {
        // given
        final var pending = AudioVideoMedia.with("abc", "Video.mp4", "/videos/raw");

        // when
        final var completed = pending.completed("/videos/encoded");

        // then
        Assertions.assertEquals(MediaStatus.COMPLETED, completed.status());
        Assertions.assertEquals("/videos/encoded", completed.encodedLocation());
        Assertions.assertEquals(pending.id(), completed.id());
        Assertions.assertEquals(pending, completed);
        Assertions.assertEquals(pending.hashCode(), completed.hashCode());
        Assertions.assertEquals(MediaStatus.PENDING, pending.status());
        Assertions.assertEquals("", pending.encodedLocation());
    }

    @Test
    @DisplayName("The reference permits processing already completed media")
    void givenCompletedMedia_whenProcessing_shouldPreserveEncodedLocation() {
        final var completed = AudioVideoMedia.with(
                "id", "abc", "Video.mp4", "/videos/raw", "/videos/encoded", MediaStatus.COMPLETED);

        final var processing = completed.processing();

        Assertions.assertEquals(MediaStatus.PROCESSING, processing.status());
        Assertions.assertEquals("/videos/encoded", processing.encodedLocation());
        Assertions.assertEquals(MediaStatus.COMPLETED, completed.status());
    }

    @Test
    @DisplayName("Completing media rejects a null encoded path")
    void givenNullEncodedPath_whenCompleting_shouldRejectIt() {
        final var pending = AudioVideoMedia.with("abc", "Video.mp4", "/videos/raw");

        Assertions.assertThrows(NullPointerException.class, () -> pending.completed(null));
        Assertions.assertEquals(MediaStatus.PENDING, pending.status());
    }

    @Test
    @DisplayName("Resource exposes the same bytes on input and access")
    void givenResource_whenMutatingSharedBytes_shouldExposeThoseChanges() {
        // given
        final byte[] content = {1, 2};
        final var resource = Resource.with(content, "abc", "video/mp4", "Video.mp4");

        // when / then
        content[0] = 3;
        Assertions.assertEquals(3, resource.content()[0]);
        resource.content()[1] = 4;
        Assertions.assertEquals(4, content[1]);
    }

    @Test
    @DisplayName("VideoResource equality retains Resource identity semantics")
    void givenMatchingResourceFields_whenComparingWrappers_shouldRequireSameResource() {
        // given
        final var first = Resource.with(new byte[]{1}, "abc", "video/mp4", "Video.mp4");
        final var second = Resource.with(new byte[]{1}, "abc", "video/mp4", "Video.mp4");
        final var wrapper = VideoResource.with(VideoMediaType.VIDEO, first);

        // then
        Assertions.assertNotEquals(first, second);
        Assertions.assertEquals(wrapper, VideoResource.with(VideoMediaType.VIDEO, first));
        Assertions.assertNotEquals(wrapper, VideoResource.with(VideoMediaType.VIDEO, second));
    }

    @Test
    @DisplayName("VideoResource adds no null validation in either construction path")
    void givenNullComponents_whenCreatingVideoResource_shouldKeepThem() {
        final var fromFactory = VideoResource.with(null, null);
        final var fromConstructor = new VideoResource(null, null);

        Assertions.assertNull(fromFactory.type());
        Assertions.assertNull(fromFactory.resource());
        Assertions.assertEquals(fromFactory, fromConstructor);
    }

    @Test
    @DisplayName("Rating lookup uses labels rather than enum constant names")
    void givenRatingLabel_whenLookingUp_shouldMatchTheLabelOnly() {
        Assertions.assertEquals(Optional.of(Rating.AGE_10), Rating.of("10"));
        Assertions.assertEquals(Optional.of(Rating.ER), Rating.of("er"));
        Assertions.assertTrue(Rating.of("AGE_10").isEmpty());
        Assertions.assertTrue(Rating.of(" 10 ").isEmpty());
        Assertions.assertTrue(Rating.of(null).isEmpty());
    }

    @Test
    @DisplayName("Media type lookup ignores case but does not trim input")
    void givenMediaTypeName_whenLookingUp_shouldMatchWithoutTrimming() {
        Assertions.assertEquals(Optional.of(VideoMediaType.VIDEO), VideoMediaType.of("video"));
        Assertions.assertTrue(VideoMediaType.of(" video ").isEmpty());
        Assertions.assertTrue(VideoMediaType.of("unknown").isEmpty());
        Assertions.assertTrue(VideoMediaType.of(null).isEmpty());
    }
}
