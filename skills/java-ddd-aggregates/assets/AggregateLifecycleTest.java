package com.robsonkades.admin.catalogo.domain;

import com.robsonkades.admin.catalogo.domain.category.Category;
import com.robsonkades.admin.catalogo.domain.category.CategoryID;
import com.robsonkades.admin.catalogo.domain.exceptions.DomainException;
import com.robsonkades.admin.catalogo.domain.exceptions.NotificationException;
import com.robsonkades.admin.catalogo.domain.genre.Genre;
import com.robsonkades.admin.catalogo.domain.genre.GenreID;
import com.robsonkades.admin.catalogo.domain.validation.handler.ThrowsValidationHandler;
import com.robsonkades.admin.catalogo.domain.video.Rating;
import com.robsonkades.admin.catalogo.domain.video.Video;
import com.robsonkades.admin.catalogo.domain.video.VideoMediaCreated;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.Year;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class AggregateLifecycleTest extends UnitTest {

    @Test
    @DisplayName("Category reports an invalid name only when validation is requested")
    public void givenANullName_whenCreatingAndValidatingCategory_thenReportDomainError() {
        final var actualCategory = Category.newCategory(null, "Movies", true);

        final var actualException = Assertions.assertThrows(
                DomainException.class,
                () -> actualCategory.validate(new ThrowsValidationHandler())
        );

        Assertions.assertEquals(1, actualException.getErrors().size());
        Assertions.assertEquals("'name' should not be null", actualException.getErrors().get(0).message());
    }

    @Test
    @DisplayName("Category deactivation preserves identity, creation time and the first deletion time")
    public void givenAnActiveStoredCategory_whenDeactivatingTwice_thenPreserveLifecycleFacts() {
        final var expectedID = CategoryID.from("movies");
        final var expectedCreatedAt = Instant.parse("2020-01-01T00:00:00Z");
        final var oldUpdatedAt = Instant.parse("2020-01-02T00:00:00Z");
        final var actualCategory = Category.with(expectedID, "Movies", "Films", true,
                expectedCreatedAt, oldUpdatedAt, null);

        actualCategory.deactivate();
        final var firstDeletedAt = actualCategory.getDeletedAt();
        final var actualResult = actualCategory.deactivate();

        Assertions.assertSame(actualCategory, actualResult);
        Assertions.assertFalse(actualCategory.isActive());
        Assertions.assertNotNull(firstDeletedAt);
        Assertions.assertEquals(firstDeletedAt, actualCategory.getDeletedAt());
        Assertions.assertEquals(expectedID, actualCategory.getId());
        Assertions.assertEquals(expectedCreatedAt, actualCategory.getCreatedAt());
        Assertions.assertTrue(actualCategory.getUpdatedAt().isAfter(oldUpdatedAt));
    }

    @Test
    @DisplayName("Genre rejects an invalid name during construction")
    public void givenANullName_whenCreatingGenre_thenThrowNotificationException() {
        final var actualException = Assertions.assertThrows(
                NotificationException.class,
                () -> Genre.newGenre(null, true)
        );

        Assertions.assertEquals(1, actualException.getErrors().size());
        Assertions.assertEquals("'name' should not be null", actualException.getErrors().get(0).message());
    }

    @Test
    @DisplayName("Genre update reports invalid state after assigning the supplied values")
    public void givenAValidGenre_whenUpdatingWithNullName_thenRetainAssignedStateAndReportError() {
        final var actualGenre = Genre.newGenre("Drama", true);
        final var expectedID = actualGenre.getId();
        final var expectedCreatedAt = actualGenre.getCreatedAt();

        final var actualException = Assertions.assertThrows(
                NotificationException.class,
                () -> actualGenre.update(null, false, List.of())
        );

        Assertions.assertEquals("'name' should not be null", actualException.getErrors().get(0).message());
        Assertions.assertNull(actualGenre.getName());
        Assertions.assertFalse(actualGenre.isActive());
        Assertions.assertNotNull(actualGenre.getDeletedAt());
        Assertions.assertEquals(expectedID, actualGenre.getId());
        Assertions.assertEquals(expectedCreatedAt, actualGenre.getCreatedAt());
    }

    @Test
    @DisplayName("Genre reconstruction restores identity and timestamps while retaining its input list")
    public void givenStoredGenreFields_whenReconstructing_thenPreserveStoredFactsAndListOwnership() {
        final var expectedID = GenreID.from("genre-drama");
        final var expectedCreatedAt = Instant.parse("2020-01-01T00:00:00Z");
        final var expectedUpdatedAt = Instant.parse("2020-01-02T00:00:00Z");
        final var categories = new ArrayList<CategoryID>();
        final var expectedCategory = CategoryID.from("movies");

        final var actualGenre = Genre.with(expectedID, "Drama", true, categories,
                expectedCreatedAt, expectedUpdatedAt, null);
        categories.add(expectedCategory);

        Assertions.assertEquals(expectedID, actualGenre.getId());
        Assertions.assertEquals(expectedCreatedAt, actualGenre.getCreatedAt());
        Assertions.assertEquals(expectedUpdatedAt, actualGenre.getUpdatedAt());
        Assertions.assertEquals(List.of(expectedCategory), actualGenre.getCategories());
        Assertions.assertTrue(actualGenre.getDomainEvents().isEmpty());
    }

    @Test
    @DisplayName("A copied Genre preserves identity and owns an independent category list")
    public void givenAGenreWithCategories_whenCopyingAndAddingCategory_thenLeaveOriginalUnchanged() {
        final var expectedOriginalCategory = CategoryID.from("movies");
        final var addedCategory = CategoryID.from("series");
        final var originalGenre = Genre.newGenre("Drama", true).addCategory(expectedOriginalCategory);

        final var actualGenre = Genre.with(originalGenre).addCategory(addedCategory);

        Assertions.assertNotSame(originalGenre, actualGenre);
        Assertions.assertEquals(originalGenre.getId(), actualGenre.getId());
        Assertions.assertEquals(List.of(expectedOriginalCategory), originalGenre.getCategories());
        Assertions.assertEquals(List.of(expectedOriginalCategory, addedCategory), actualGenre.getCategories());
    }

    @Test
    @DisplayName("A new Video retains its category set while a copied Video owns a separate set")
    public void givenAMutableCategorySet_whenCreatingAndCopyingVideo_thenPreserveEachOwnershipContract() {
        final var categories = new HashSet<CategoryID>();
        final var originalVideo = Video.newVideo("A film", "A description", Year.of(2020),
                90.0, false, false, Rating.L, categories, Set.of(), Set.of());
        final var actualCopy = Video.with(originalVideo);
        final var addedCategory = CategoryID.from("movies");

        categories.add(addedCategory);

        Assertions.assertEquals(Set.of(addedCategory), originalVideo.getCategories());
        Assertions.assertTrue(actualCopy.getCategories().isEmpty());
        Assertions.assertEquals(originalVideo.getId(), actualCopy.getId());
    }

    @Test
    @DisplayName("A copied Video retains pending events in an independent buffer")
    public void givenAVideoWithPendingEvent_whenCopyingAndRegisteringAnother_thenLeaveOriginalBufferUnchanged() {
        final var originalVideo = Video.newVideo("A film", "A description", Year.of(2020),
                90.0, false, false, Rating.L, Set.of(), Set.of(), Set.of());
        final var occurredOn = Instant.parse("2020-01-01T00:00:00Z");
        final var expectedEvent = new VideoMediaCreated(originalVideo.getId().getValue(), "/video", occurredOn);
        final var addedEvent = new VideoMediaCreated(originalVideo.getId().getValue(), "/trailer", occurredOn);
        originalVideo.registerEvent(expectedEvent);

        final var actualCopy = Video.with(originalVideo);
        actualCopy.registerEvent(addedEvent);

        Assertions.assertEquals(List.of(expectedEvent), originalVideo.getDomainEvents());
        Assertions.assertEquals(List.of(expectedEvent, addedEvent), actualCopy.getDomainEvents());
    }
}
