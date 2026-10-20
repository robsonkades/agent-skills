package com.robsonkades.admin.catalogo.application.genre.retrieve.list;

import com.robsonkades.admin.catalogo.application.UseCaseTest;
import com.robsonkades.admin.catalogo.domain.genre.Genre;
import com.robsonkades.admin.catalogo.domain.genre.GenreGateway;
import com.robsonkades.admin.catalogo.domain.pagination.Pagination;
import com.robsonkades.admin.catalogo.domain.pagination.SearchQuery;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

public class ListGenreUseCaseTest extends UseCaseTest {

    @InjectMocks
    private DefaultListGenreUseCase useCase;

    @Mock
    private GenreGateway genreGateway;

    @Override
    protected List<Object> getMocks() {
        return List.of(genreGateway);
    }

    @Test
    @DisplayName("Maps genre results and preserves pagination metadata")
    public void givenAValidQuery_whenCallsListGenre_shouldReturnGenres() {
        // given
        final var genres = List.of(
                Genre.newGenre("Ação", true),
                Genre.newGenre("Aventura", true)
        );

        final var expectedPage = 0;
        final var expectedPerPage = 10;
        final var expectedTerms = "A";
        final var expectedSort = "createdAt";
        final var expectedDirection = "asc";
        final var expectedTotal = 2;

        final var expectedItems = genres.stream()
                .map(GenreListOutput::from)
                .toList();

        final var expectedPagination = new Pagination<>(
                expectedPage,
                expectedPerPage,
                expectedTotal,
                genres
        );

        when(genreGateway.findAll(any()))
                .thenReturn(expectedPagination);

        final var aQuery =
                new SearchQuery(expectedPage, expectedPerPage, expectedTerms, expectedSort, expectedDirection);

        // when
        final var actualOutput = useCase.execute(aQuery);

        // then
        Assertions.assertEquals(expectedPage, actualOutput.currentPage());
        Assertions.assertEquals(expectedPerPage, actualOutput.perPage());
        Assertions.assertEquals(expectedTotal, actualOutput.total());
        Assertions.assertEquals(expectedItems, actualOutput.items());

        Mockito.verify(genreGateway, times(1)).findAll(eq(aQuery));
    }

    @Test
    @DisplayName("Returns an empty genre page when no results exist")
    public void givenAValidQuery_whenCallsListGenreAndResultIsEmpty_shouldReturnGenres() {
        // given
        final var genres = List.<Genre>of();

        final var expectedPage = 0;
        final var expectedPerPage = 10;
        final var expectedTerms = "A";
        final var expectedSort = "createdAt";
        final var expectedDirection = "asc";
        final var expectedTotal = 0;

        final var expectedItems = List.<GenreListOutput>of();

        final var expectedPagination = new Pagination<>(
                expectedPage,
                expectedPerPage,
                expectedTotal,
                genres
        );

        when(genreGateway.findAll(any()))
                .thenReturn(expectedPagination);

        final var aQuery =
                new SearchQuery(expectedPage, expectedPerPage, expectedTerms, expectedSort, expectedDirection);

        // when
        final var actualOutput = useCase.execute(aQuery);

        // then
        Assertions.assertEquals(expectedPage, actualOutput.currentPage());
        Assertions.assertEquals(expectedPerPage, actualOutput.perPage());
        Assertions.assertEquals(expectedTotal, actualOutput.total());
        Assertions.assertEquals(expectedItems, actualOutput.items());

        Mockito.verify(genreGateway, times(1)).findAll(eq(aQuery));
    }

    @Test
    @DisplayName("Propagates a genre list gateway failure")
    public void givenAValidQuery_whenCallsListGenreAndGatewayThrowsRandomError_shouldReturnException() {
        // given
        final var expectedPage = 0;
        final var expectedPerPage = 10;
        final var expectedTerms = "A";
        final var expectedSort = "createdAt";
        final var expectedDirection = "asc";

        final var expectedErrorMessage = "Gateway error";

        when(genreGateway.findAll(any()))
                .thenThrow(new IllegalStateException(expectedErrorMessage));

        final var aQuery =
                new SearchQuery(expectedPage, expectedPerPage, expectedTerms, expectedSort, expectedDirection);

        // when
        final var actualOutput = Assertions.assertThrows(
                IllegalStateException.class,
                () -> useCase.execute(aQuery)
        );

        // then
        Assertions.assertEquals(expectedErrorMessage, actualOutput.getMessage());

        Mockito.verify(genreGateway, times(1)).findAll(eq(aQuery));
    }
}
