package com.robsonkades.admin.catalogo.application.castmember.update;

import com.robsonkades.admin.catalogo.domain.Fixture;
import com.robsonkades.admin.catalogo.application.UseCaseTest;
import com.robsonkades.admin.catalogo.domain.castmember.CastMember;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberGateway;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberID;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberType;
import com.robsonkades.admin.catalogo.domain.exceptions.NotFoundException;
import com.robsonkades.admin.catalogo.domain.exceptions.NotificationException;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static org.mockito.AdditionalAnswers.returnsFirstArg;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class UpdateCastMemberUseCaseTest extends UseCaseTest {

    @InjectMocks
    private DefaultUpdateCastMemberUseCase useCase;

    @Mock
    private CastMemberGateway castMemberGateway;

    @Override
    protected List<Object> getMocks() {
        return List.of(castMemberGateway);
    }

    @Test
    @DisplayName("Updates a cast member while preserving identity and creation time")
    public void givenAValidCommand_whenCallsUpdateCastMember_shouldReturnItsIdentifier() {
        // given
        final var past = Instant.parse("2000-01-01T00:00:00Z");
        final var aMember = CastMember.with(
                CastMemberID.unique(), "vin diesel", CastMemberType.DIRECTOR, past, past
        );

        final var expectedId = aMember.getId();
        final var expectedName = Fixture.name();
        final var expectedType = CastMemberType.ACTOR;

        final var aCommand = UpdateCastMemberCommand.with(
                expectedId.getValue(),
                expectedName,
                expectedType
        );

        when(castMemberGateway.findById(any()))
                .thenReturn(Optional.of(CastMember.with(aMember)));

        when(castMemberGateway.update(any()))
                .thenAnswer(returnsFirstArg());

        // when
        final var actualOutput = useCase.execute(aCommand);

        // then
        Assertions.assertNotNull(actualOutput);
        Assertions.assertEquals(expectedId.getValue(), actualOutput.id());

        verify(castMemberGateway).findById(eq(expectedId));

        verify(castMemberGateway).update(argThat(aUpdatedMember ->
                Objects.equals(expectedId, aUpdatedMember.getId())
                        && Objects.equals(expectedName, aUpdatedMember.getName())
                        && Objects.equals(expectedType, aUpdatedMember.getType())
                        && Objects.equals(aMember.getCreatedAt(), aUpdatedMember.getCreatedAt())
                        && aMember.getUpdatedAt().isBefore(aUpdatedMember.getUpdatedAt())
        ));
    }

    @Test
    @DisplayName("Rejects an invalid cast member name without updating the gateway")
    public void givenAInvalidName_whenCallsUpdateCastMember_shouldThrowsNotificationException() {
        // given
        final var aMember = CastMember.newMember("vin diesel", CastMemberType.DIRECTOR);

        final var expectedId = aMember.getId();
        final String expectedName = null;
        final var expectedType = CastMemberType.ACTOR;

        final var expectedErrorCount = 1;
        final var expectedErrorMessage = "'name' should not be null";

        final var aCommand = UpdateCastMemberCommand.with(
                expectedId.getValue(),
                expectedName,
                expectedType
        );

        when(castMemberGateway.findById(any()))
                .thenReturn(Optional.of(aMember));

        // when
        final var actualException = Assertions.assertThrows(NotificationException.class, () -> {
            useCase.execute(aCommand);
        });

        // then
        Assertions.assertNotNull(actualException);

        Assertions.assertEquals(expectedErrorCount, actualException.getErrors().size());
        Assertions.assertEquals(expectedErrorMessage, actualException.getErrors().get(0).message());

        verify(castMemberGateway).findById(eq(expectedId));
        verify(castMemberGateway, times(0)).update(any());
    }

    @Test
    @DisplayName("Rejects an invalid cast member type without updating the gateway")
    public void givenAInvalidType_whenCallsUpdateCastMember_shouldThrowsNotificationException() {
        // given
        final var aMember = CastMember.newMember("vin diesel", CastMemberType.DIRECTOR);

        final var expectedId = aMember.getId();
        final var expectedName = Fixture.name();
        final CastMemberType expectedType = null;

        final var expectedErrorCount = 1;
        final var expectedErrorMessage = "'type' should not be null";

        final var aCommand = UpdateCastMemberCommand.with(
                expectedId.getValue(),
                expectedName,
                expectedType
        );

        when(castMemberGateway.findById(any()))
                .thenReturn(Optional.of(aMember));

        // when
        final var actualException = Assertions.assertThrows(NotificationException.class, () -> {
            useCase.execute(aCommand);
        });

        // then
        Assertions.assertNotNull(actualException);

        Assertions.assertEquals(expectedErrorCount, actualException.getErrors().size());
        Assertions.assertEquals(expectedErrorMessage, actualException.getErrors().get(0).message());

        verify(castMemberGateway).findById(eq(expectedId));
        verify(castMemberGateway, times(0)).update(any());
    }

    @Test
    @DisplayName("Throws not found for an absent cast member to update")
    public void givenAInvalidId_whenCallsUpdateCastMember_shouldThrowsNotFoundException() {
        // given
        final var aMember = CastMember.newMember("vin diesel", CastMemberType.DIRECTOR);

        final var expectedId = CastMemberID.from("123");
        final var expectedName = Fixture.name();
        final var expectedType = Fixture.CastMembers.type();

        final var expectedErrorMessage = "CastMember with ID 123 was not found";

        final var aCommand = UpdateCastMemberCommand.with(
                expectedId.getValue(),
                expectedName,
                expectedType
        );

        when(castMemberGateway.findById(any()))
                .thenReturn(Optional.empty());

        // when
        final var actualException = Assertions.assertThrows(NotFoundException.class, () -> {
            useCase.execute(aCommand);
        });

        // then
        Assertions.assertNotNull(actualException);

        Assertions.assertEquals(expectedErrorMessage, actualException.getMessage());

        verify(castMemberGateway).findById(eq(expectedId));
        verify(castMemberGateway, times(0)).update(any());
    }
}
