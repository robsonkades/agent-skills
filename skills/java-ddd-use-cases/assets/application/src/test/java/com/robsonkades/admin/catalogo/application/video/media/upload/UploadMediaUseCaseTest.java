package com.robsonkades.admin.catalogo.application.video.media.upload;

import com.robsonkades.admin.catalogo.application.UseCaseTest;
import com.robsonkades.admin.catalogo.domain.Fixture;
import com.robsonkades.admin.catalogo.domain.exceptions.NotFoundException;
import com.robsonkades.admin.catalogo.domain.video.MediaResourceGateway;
import com.robsonkades.admin.catalogo.domain.video.VideoGateway;
import com.robsonkades.admin.catalogo.domain.video.VideoMediaType;
import com.robsonkades.admin.catalogo.domain.video.VideoResource;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class UploadMediaUseCaseTest extends UseCaseTest {

    @InjectMocks
    private DefaultUploadMediaUseCase useCase;

    @Mock
    private MediaResourceGateway mediaResourceGateway;

    @Mock
    private VideoGateway videoGateway;

    @Override
    protected List<Object> getMocks() {
        return List.of(mediaResourceGateway, videoGateway);
    }

    @Test
    @DisplayName("Single video upload preserves the four unrelated media slots")
    public void givenVideoUpload_whenOtherMediaExists_shouldPreserveOtherSlots() {
        final var video = Fixture.Videos.systemDesign()
                .updateVideoMedia(Fixture.Videos.audioVideo(VideoMediaType.VIDEO))
                .updateTrailerMedia(Fixture.Videos.audioVideo(VideoMediaType.TRAILER))
                .updateBannerMedia(Fixture.Videos.image(VideoMediaType.BANNER))
                .updateThumbnailMedia(Fixture.Videos.image(VideoMediaType.THUMBNAIL))
                .updateThumbnailHalfMedia(Fixture.Videos.image(VideoMediaType.THUMBNAIL_HALF));
        final var trailer = video.getTrailer().orElseThrow();
        final var banner = video.getBanner().orElseThrow();
        final var thumbnail = video.getThumbnail().orElseThrow();
        final var half = video.getThumbnailHalf().orElseThrow();
        final var resource = VideoResource.with(VideoMediaType.VIDEO,
                Fixture.Videos.resource(VideoMediaType.VIDEO));
        final var stored = Fixture.Videos.audioVideo(VideoMediaType.VIDEO);
        when(videoGateway.findById(video.getId())).thenReturn(Optional.of(video));
        when(mediaResourceGateway.storeAudioVideo(video.getId(), resource)).thenReturn(stored);
        when(videoGateway.update(any())).thenAnswer(returnsFirstArg());

        final var output = useCase.execute(UploadMediaCommand.with(video.getId().getValue(), resource));

        Assertions.assertEquals(VideoMediaType.VIDEO, output.mediaType());
        Assertions.assertSame(stored, video.getVideo().orElseThrow());
        Assertions.assertSame(trailer, video.getTrailer().orElseThrow());
        Assertions.assertSame(banner, video.getBanner().orElseThrow());
        Assertions.assertSame(thumbnail, video.getThumbnail().orElseThrow());
        Assertions.assertSame(half, video.getThumbnailHalf().orElseThrow());
        verify(videoGateway).update(same(video));
        verify(mediaResourceGateway, never()).clearResources(any());
    }

    @Test
    @DisplayName("Stores video media and persists the updated video")
    public void givenCmdToUpload_whenIsValid_shouldUpdateVideoMediaAndPersistIt() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.VIDEO;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);
        final var expectedMedia = Fixture.Videos.audioVideo(expectedType);

        when(videoGateway.findById(any()))
                .thenReturn(Optional.of(aVideo));

        when(mediaResourceGateway.storeAudioVideo(any(), any()))
                .thenReturn(expectedMedia);

        when(videoGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualOutput = useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedType, actualOutput.mediaType());
        Assertions.assertEquals(expectedId.getValue(), actualOutput.videoId());

        verify(videoGateway, times(1)).findById(eq(expectedId));

        verify(mediaResourceGateway, times(1)).storeAudioVideo(eq(expectedId), eq(expectedVideoResource));

        verify(videoGateway, times(1)).update(argThat(actualVideo ->
                Objects.equals(expectedMedia, actualVideo.getVideo().get())
                        && actualVideo.getTrailer().isEmpty()
                        && actualVideo.getBanner().isEmpty()
                        && actualVideo.getThumbnail().isEmpty()
                        && actualVideo.getThumbnailHalf().isEmpty()
        ));
    }

    @Test
    @DisplayName("Stores trailer media and persists the updated video")
    public void givenCmdToUpload_whenIsValid_shouldUpdateTrailerMediaAndPersistIt() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.TRAILER;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);
        final var expectedMedia = Fixture.Videos.audioVideo(expectedType);

        when(videoGateway.findById(any()))
                .thenReturn(Optional.of(aVideo));

        when(mediaResourceGateway.storeAudioVideo(any(), any()))
                .thenReturn(expectedMedia);

        when(videoGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualOutput = useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedType, actualOutput.mediaType());
        Assertions.assertEquals(expectedId.getValue(), actualOutput.videoId());

        verify(videoGateway, times(1)).findById(eq(expectedId));

        verify(mediaResourceGateway, times(1)).storeAudioVideo(eq(expectedId), eq(expectedVideoResource));

        verify(videoGateway, times(1)).update(argThat(actualVideo ->
                actualVideo.getVideo().isEmpty()
                        && Objects.equals(expectedMedia, actualVideo.getTrailer().get())
                        && actualVideo.getBanner().isEmpty()
                        && actualVideo.getThumbnail().isEmpty()
                        && actualVideo.getThumbnailHalf().isEmpty()
        ));
    }

    @Test
    @DisplayName("Stores banner media and persists the updated video")
    public void givenCmdToUpload_whenIsValid_shouldUpdateBannerMediaAndPersistIt() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.BANNER;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);
        final var expectedMedia = Fixture.Videos.image(expectedType);

        when(videoGateway.findById(any()))
                .thenReturn(Optional.of(aVideo));

        when(mediaResourceGateway.storeImage(any(), any()))
                .thenReturn(expectedMedia);

        when(videoGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualOutput = useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedType, actualOutput.mediaType());
        Assertions.assertEquals(expectedId.getValue(), actualOutput.videoId());

        verify(videoGateway, times(1)).findById(eq(expectedId));

        verify(mediaResourceGateway, times(1)).storeImage(eq(expectedId), eq(expectedVideoResource));

        verify(videoGateway, times(1)).update(argThat(actualVideo ->
                actualVideo.getVideo().isEmpty()
                        && actualVideo.getTrailer().isEmpty()
                        && Objects.equals(expectedMedia, actualVideo.getBanner().get())
                        && actualVideo.getThumbnail().isEmpty()
                        && actualVideo.getThumbnailHalf().isEmpty()
        ));
    }

    @Test
    @DisplayName("Stores thumbnail media and persists the updated video")
    public void givenCmdToUpload_whenIsValid_shouldUpdateThumbnailMediaAndPersistIt() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.THUMBNAIL;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);
        final var expectedMedia = Fixture.Videos.image(expectedType);

        when(videoGateway.findById(any()))
                .thenReturn(Optional.of(aVideo));

        when(mediaResourceGateway.storeImage(any(), any()))
                .thenReturn(expectedMedia);

        when(videoGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualOutput = useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedType, actualOutput.mediaType());
        Assertions.assertEquals(expectedId.getValue(), actualOutput.videoId());

        verify(videoGateway, times(1)).findById(eq(expectedId));

        verify(mediaResourceGateway, times(1)).storeImage(eq(expectedId), eq(expectedVideoResource));

        verify(videoGateway, times(1)).update(argThat(actualVideo ->
                actualVideo.getVideo().isEmpty()
                        && actualVideo.getTrailer().isEmpty()
                        && actualVideo.getBanner().isEmpty()
                        && Objects.equals(expectedMedia, actualVideo.getThumbnail().get())
                        && actualVideo.getThumbnailHalf().isEmpty()
        ));
    }

    @Test
    @DisplayName("Stores half thumbnail media and persists the updated video")
    public void givenCmdToUpload_whenIsValid_shouldUpdateThumbnailHalfMediaAndPersistIt() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.THUMBNAIL_HALF;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);
        final var expectedMedia = Fixture.Videos.image(expectedType);

        when(videoGateway.findById(any()))
                .thenReturn(Optional.of(aVideo));

        when(mediaResourceGateway.storeImage(any(), any()))
                .thenReturn(expectedMedia);

        when(videoGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualOutput = useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedType, actualOutput.mediaType());
        Assertions.assertEquals(expectedId.getValue(), actualOutput.videoId());

        verify(videoGateway, times(1)).findById(eq(expectedId));

        verify(mediaResourceGateway, times(1)).storeImage(eq(expectedId), eq(expectedVideoResource));

        verify(videoGateway, times(1)).update(argThat(actualVideo ->
                actualVideo.getVideo().isEmpty()
                        && actualVideo.getTrailer().isEmpty()
                        && actualVideo.getBanner().isEmpty()
                        && actualVideo.getThumbnail().isEmpty()
                        && Objects.equals(expectedMedia, actualVideo.getThumbnailHalf().get())
        ));
    }

    @Test
    @DisplayName("Rejects an upload when the video is absent")
    public void givenCmdToUpload_whenVideoIsInvalid_shouldReturnNotFound() {
        // given
        final var aVideo = Fixture.Videos.systemDesign();
        final var expectedId = aVideo.getId();
        final var expectedType = VideoMediaType.THUMBNAIL_HALF;
        final var expectedResource = Fixture.Videos.resource(expectedType);
        final var expectedVideoResource = VideoResource.with(expectedType, expectedResource);

        final var expectedErrorMessage = "Video with ID %s was not found".formatted(expectedId.getValue());

        when(videoGateway.findById(any()))
                .thenReturn(Optional.empty());

        final var aCmd = UploadMediaCommand.with(expectedId.getValue(), expectedVideoResource);

        // when
        final var actualException = Assertions.assertThrows(
                NotFoundException.class,
                () -> useCase.execute(aCmd)
        );

        // then
        Assertions.assertEquals(expectedErrorMessage, actualException.getMessage());
    }
}
