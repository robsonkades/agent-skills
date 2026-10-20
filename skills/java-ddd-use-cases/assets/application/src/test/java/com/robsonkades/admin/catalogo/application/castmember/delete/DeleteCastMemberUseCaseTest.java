package com.robsonkades.admin.catalogo.application.castmember.delete;

import com.robsonkades.admin.catalogo.domain.Fixture;
import com.robsonkades.admin.catalogo.application.UseCaseTest;
import com.robsonkades.admin.catalogo.domain.castmember.CastMember;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberGateway;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberID;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

public class DeleteCastMemberUseCaseTest extends UseCaseTest {

    @InjectMocks
    private DefaultDeleteCastMemberUseCase useCase;

    @Mock
    private CastMemberGateway castMemberGateway;

    @Override
    protected List<Object> getMocks() {
        return List.of(castMemberGateway);
    }

    @Test
    @DisplayName("Delegates deletion of an existing cast member")
    public void givenAValidId_whenCallsDeleteCastMember_shouldDeleteIt() {
        // given
        final var aMember = CastMember.newMember(Fixture.name(), Fixture.CastMembers.type());

        final var expectedId = aMember.getId();

        doNothing()
                .when(castMemberGateway).deleteById(any());

        // when
        Assertions.assertDoesNotThrow(() -> useCase.execute(expectedId.getValue()));

        // then
        verify(castMemberGateway).deleteById(eq(expectedId));
    }

    @Test
    @DisplayName("Accepts deletion when the cast member gateway reports no failure")
    public void givenAnInvalidId_whenCallsDeleteCastMember_shouldBeOk() {
        // given
        final var expectedId = CastMemberID.from("123");

        doNothing()
                .when(castMemberGateway).deleteById(any());

        // when
        Assertions.assertDoesNotThrow(() -> useCase.execute(expectedId.getValue()));

        // then
        verify(castMemberGateway).deleteById(eq(expectedId));
    }

    @Test
    @DisplayName("Propagates a cast member deletion gateway failure")
    public void givenAValidId_whenCallsDeleteCastMemberAndGatewayThrowsException_shouldReceiveException() {
        // given
        final var aMember = CastMember.newMember(Fixture.name(), Fixture.CastMembers.type());

        final var expectedId = aMember.getId();

        doThrow(new IllegalStateException("Gateway error"))
                .when(castMemberGateway).deleteById(any());

        // when
        Assertions.assertThrows(IllegalStateException.class, () -> useCase.execute(expectedId.getValue()));

        // then
        verify(castMemberGateway).deleteById(eq(expectedId));
    }
}
