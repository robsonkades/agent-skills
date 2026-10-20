package com.robsonkades.admin.catalogo.domain;

import com.robsonkades.admin.catalogo.domain.castmember.CastMemberID;
import com.robsonkades.admin.catalogo.domain.category.CategoryID;
import com.robsonkades.admin.catalogo.domain.genre.GenreID;
import com.robsonkades.admin.catalogo.domain.video.VideoID;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

class IdentifierTest extends UnitTest {

    @Test
    @DisplayName("Category, cast member and genre IDs preserve supplied text")
    void givenRawText_whenReconstructingIds_shouldPreserveIt() {
        // given
        final var expectedValue = " 00AbC ";

        // when / then
        Assertions.assertEquals(expectedValue, CategoryID.from(expectedValue).getValue());
        Assertions.assertEquals(expectedValue, CastMemberID.from(expectedValue).getValue());
        Assertions.assertEquals(expectedValue, GenreID.from(expectedValue).getValue());
    }

    @Test
    @DisplayName("Empty IDs are accepted by the reference factories")
    void givenEmptyText_whenReconstructingIds_shouldKeepEmptyValues() {
        Assertions.assertEquals("", CategoryID.from("").getValue());
        Assertions.assertEquals("", CastMemberID.from("").getValue());
        Assertions.assertEquals("", GenreID.from("").getValue());
        Assertions.assertEquals("", VideoID.from("").getValue());
    }

    @Test
    @DisplayName("Reconstructed equal category IDs work as map keys")
    void givenEqualCategoryIds_whenLookingUpById_shouldFindTheValue() {
        // given
        final var original = CategoryID.from("123");
        final var reconstructed = CategoryID.from("123");
        final var namesById = Map.of(original, "Aulas");

        // when
        final var actualName = namesById.get(reconstructed);

        // then
        Assertions.assertNotSame(original, reconstructed);
        Assertions.assertEquals(original, reconstructed);
        Assertions.assertEquals(original.hashCode(), reconstructed.hashCode());
        Assertions.assertEquals("Aulas", actualName);
        Assertions.assertNotEquals(original, CategoryID.from("456"));
    }

    @Test
    @DisplayName("The same text does not equate different aggregate ID types")
    void givenDifferentIdTypes_whenComparingSameText_shouldRemainDistinct() {
        final var categoryId = CategoryID.from("123");

        Assertions.assertNotEquals(categoryId, CastMemberID.from("123"));
        Assertions.assertNotEquals(categoryId, GenreID.from("123"));
        Assertions.assertNotEquals(categoryId, VideoID.from("123"));
    }

    @Test
    @DisplayName("Video IDs lowercase input while category IDs keep case")
    void givenDifferentCase_whenReconstructingIds_shouldFollowEachType() {
        Assertions.assertEquals("abc", VideoID.from("ABC").getValue());
        Assertions.assertEquals(VideoID.from("ABC"), VideoID.from("abc"));
        Assertions.assertNotEquals(CategoryID.from("ABC"), CategoryID.from("abc"));
    }

    @Test
    @DisplayName("Every reference ID rejects null input")
    void givenNull_whenReconstructingIds_shouldRejectIt() {
        Assertions.assertThrows(NullPointerException.class, () -> CategoryID.from(null));
        Assertions.assertThrows(NullPointerException.class, () -> CastMemberID.from(null));
        Assertions.assertThrows(NullPointerException.class, () -> GenreID.from(null));
        Assertions.assertThrows(NullPointerException.class, () -> VideoID.from(null));
    }

    @Test
    @DisplayName("Generated category IDs can be reconstructed with the same identity")
    void givenGeneratedCategoryId_whenReconstructing_shouldKeepItsValue() {
        // given
        final var original = CategoryID.unique();

        // when
        final var reconstructed = CategoryID.from(original.getValue());

        // then
        Assertions.assertTrue(original.getValue().matches("[0-9a-f]{32}"));
        Assertions.assertEquals(original, reconstructed);
    }
}
