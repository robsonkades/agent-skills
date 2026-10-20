package com.robsonkades.admin.catalogo.application.video.media.get;

import com.robsonkades.admin.catalogo.application.UseCaseTest;
import com.robsonkades.admin.catalogo.domain.Fixture;
import com.robsonkades.admin.catalogo.domain.exceptions.NotFoundException;
import com.robsonkades.admin.catalogo.domain.video.MediaResourceGateway;
import com.robsonkades.admin.catalogo.domain.video.Resource;
import com.robsonkades.admin.catalogo.domain.video.VideoID;
import com.robsonkades.admin.catalogo.domain.video.VideoMediaType;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;

public class GetMediaUseCaseTest extends UseCaseTest {

    @InjectMocks
    private DefaultGetMediaUseCase useCase;

    @Mock
    private MediaResourceGateway mediaResourceGateway;

    @Override
    protected List<Object> getMocks() {
        return List.of(mediaResourceGateway);
    }

    @Test
    @DisplayName("Media retrieval exposes the same mutable byte array as its resource")
    public void givenStoredResource_whenCallsGetMedia_shouldRetainSharedBytes() {
        final var id = VideoID.unique();
        final var type = VideoMediaType.VIDEO;
        final var bytes = new byte[]{1, 2};
        final var resource = Resource.with(bytes, "checksum", "video/mp4", "video.mp4");
        when(mediaResourceGateway.getResource(id, type)).thenReturn(Optional.of(resource));

        final var output = useCase.execute(GetMediaCommand.with(id.getValue(), type.name()));
        output.content()[0] = 9;

        Assertions.assertSame(bytes, output.content());
        Assertions.assertEquals(9, resource.content()[0]);
    }

    @Test
    @DisplayName("Returns the stored media bytes and metadata")
    public void givenVideoIdAndType_whenIsValidCmd_shouldReturnResource() {
        // given
        final var expectedId = VideoID.unique();
        final var expectedType = Fixture.Videos.mediaType();
        final var expectedResource = Fixture.Videos.resource(expectedType);

        when(mediaResourceGateway.getResource(expectedId, expectedType))
                .thenReturn(Optional.of(expectedResource));

        final var aCmd = GetMediaCommand.with(expectedId.getValue(), expectedType.name());

        // when
        final var actualResult = this.useCase.execute(aCmd);

        // then
        Assertions.assertEquals(expectedResource.name(), actualResult.name());
        Assertions.assertEquals(expectedResource.content(), actualResult.content());
        Assertions.assertEquals(expectedResource.contentType(), actualResult.contentType());
    }

    @Test
    @DisplayName("Throws not found when the requested media resource is absent")
    public void givenVideoIdAndType_whenIsNotFound_shouldReturnNotFoundException() {
        // given
        final var expectedId = VideoID.unique();
        final var expectedType = Fixture.Videos.mediaType();

        when(mediaResourceGateway.getResource(expectedId, expectedType))
                .thenReturn(Optional.empty());

        final var aCmd = GetMediaCommand.with(expectedId.getValue(), expectedType.name());

        // when
        Assertions.assertThrows(NotFoundException.class, () -> {
            this.useCase.execute(aCmd);
        });
    }

    @Test
    @DisplayName("Throws not found for an unknown media type")
    public void givenVideoIdAndType_whenTypeDoesntExists_shouldReturnNotFoundException() {
        // given
        final var expectedId = VideoID.unique();
        final var expectedErrorMessage = "Media type QUALQUER doesn't exists";

        final var aCmd = GetMediaCommand.with(expectedId.getValue(), "QUALQUER");

        // when
        final var actualException = Assertions.assertThrows(NotFoundException.class, () -> {
            this.useCase.execute(aCmd);
        });

        // then
        Assertions.assertEquals(expectedErrorMessage, actualException.getMessage());
    }
}
