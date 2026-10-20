# JUnit domain examples

Read when writing domain tests in the reference style. Each Java block is a complete
test class to place in its matching package under `domain/src/test/java`, using the
actual production types and existing `UnitTest`. These examples add the required
`@DisplayName`; fixed past dates in the update test are also explicitly required by
the user. They do not replace the reference implementation or introduce new rules.

Prerequisites: the reference domain main classes with their existing dependencies,
the complete [UnitTest.java](../assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java),
JUnit Jupiter API/engine 5.9.2 and a compatible project toolchain. The snippets use
Java 17-compatible syntax; that compatibility is not a declaration of the domain
Gradle release. These four test classes use direct real objects and do not need
`Fixture`, Spring, Mockito, Faker or an additional assertion library.
Run the module's focused JUnit tests; a class can be renamed to avoid colliding with
an existing test. Expected outcomes below are part of the examples, not independent
agent-evaluation results.

## Test-support source and prerequisites

The complete [UnitTest.java](../assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java)
and [Fixture.java](../assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/Fixture.java)
are complete copies of `domain/src/test/java/com/robsonkades/admin/catalogo/domain/`
from `C:/git/ddd-example/domain` at commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`, with repository-standard LF line endings.
Preserve that package when reproducing
the reference examples. Neither support class declares a test method, so neither
needs method-level `@DisplayName`; every actual unit test still does.

`UnitTest` supplies the JUnit `@Tag("unitTest")` base. `Fixture` additionally uses
the reference domain classes, `com.github.javafaker:javafaker:1.0.2` and
`io.vavr:vavr:0.10.4`. Those versions reproduce the reference build; they do not
make Faker or Vavr a new production requirement in a target project. Keep Faker
in test scope when reproducing this fixture and resolve its transitive dependencies
through the project build. No mock library is required.

Prefer an existing project fixture or direct real-object construction for new tests.
The copied fixture intentionally retains Faker randomness and each domain type's
actual copy semantics, including `Category.clone()`'s shallow copy. Pin inputs that
decide an assertion; this asset does not promise deterministic values or universal
deep copies. For all 49 production source files needed across the family, follow
the optional `java-ddd` skill's [domain source index](../../java-ddd/references/source-index.md).
The snapshots can supply source when the original checkout is unavailable; inspect
the target's own source and build before applying these contracts to a different revision.

## Explicit validation and fixed past update time

The null-name test invokes the same boundary as `CategoryTest`: construction is
allowed and `validate` fails. The accepted boundary keeps the three-character rule
observable. The update test uses the existing reconstruction overload to avoid
requiring two consecutive clock readings to differ.

```java
package com.robsonkades.admin.catalogo.domain.category;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import com.robsonkades.admin.catalogo.domain.exceptions.DomainException;
import com.robsonkades.admin.catalogo.domain.validation.handler.ThrowsValidationHandler;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

public class CategoryValidationTest extends UnitTest {

    @Test
    @DisplayName("A three-character category name passes explicit validation")
    public void givenThreeCharacterName_whenValidate_thenAcceptCategory() {
        final var expectedName = "Art";
        final var actualCategory = Category.newCategory(expectedName, "", true);

        Assertions.assertDoesNotThrow(
                () -> actualCategory.validate(new ThrowsValidationHandler()));

        Assertions.assertEquals(expectedName, actualCategory.getName());
        Assertions.assertTrue(actualCategory.isActive());
    }

    @Test
    @DisplayName("A null category name is rejected when explicitly validated")
    public void givenNullName_whenValidate_thenReceiveNameError() {
        final var expectedErrorCount = 1;
        final var expectedErrorMessage = "'name' should not be null";
        final var actualCategory = Category.newCategory(null, "Description", true);

        final var actualException = Assertions.assertThrows(
                DomainException.class,
                () -> actualCategory.validate(new ThrowsValidationHandler()));

        Assertions.assertEquals(expectedErrorCount, actualException.getErrors().size());
        Assertions.assertEquals(expectedErrorMessage,
                actualException.getErrors().get(0).message());
    }

    @Test
    @DisplayName("Updating a category preserves its identity and creation date")
    public void givenReconstructedCategory_whenUpdate_thenAdvanceUpdateDate() {
        final var expectedId = CategoryID.from("123");
        final var expectedName = "Movies";
        final var expectedCreatedAt = Instant.parse("2020-01-01T00:00:00Z");
        final var previousUpdatedAt = Instant.parse("2021-01-01T00:00:00Z");
        final var actualCategory = Category.with(
                expectedId, "Films", "Description", true,
                expectedCreatedAt, previousUpdatedAt, null);

        actualCategory.update(expectedName, "New description", true);

        Assertions.assertEquals(expectedId, actualCategory.getId());
        Assertions.assertEquals(expectedName, actualCategory.getName());
        Assertions.assertEquals(expectedCreatedAt, actualCategory.getCreatedAt());
        Assertions.assertTrue(actualCategory.getUpdatedAt().isAfter(previousUpdatedAt));
    }
}
```

## Self-validation and accumulated errors

Changing only the aggregate changes where the invalid call is observed. The
`CastMember` factory invokes its validator through `Notification`; the independent
name and type errors are both present. A throwing handler would stop on its first
append instead.

```java
package com.robsonkades.admin.catalogo.domain.castmember;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import com.robsonkades.admin.catalogo.domain.exceptions.NotificationException;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class CastMemberValidationTest extends UnitTest {

    @Test
    @DisplayName("Creating a cast member reports both missing name and missing type")
    public void givenNullNameAndType_whenNewMember_thenReceiveBothErrors() {
        final var expectedErrorCount = 2;
        final var expectedNameError = "'name' should not be null";
        final var expectedTypeError = "'type' should not be null";

        final var actualException = Assertions.assertThrows(
                NotificationException.class,
                () -> CastMember.newMember(null, null));

        Assertions.assertEquals(expectedErrorCount, actualException.getErrors().size());
        Assertions.assertEquals(expectedNameError,
                actualException.getErrors().get(0).message());
        Assertions.assertEquals(expectedTypeError,
                actualException.getErrors().get(1).message());
    }
}
```

## Concrete value equality

`ImageMedia` equality deliberately ignores ID and name. Test its actual equality
keys, not all fields and not a generic rule applied to every `ValueObject` subclass.

```java
package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class ImageMediaEqualityTest extends UnitTest {

    @Test
    @DisplayName("Images with equal checksum and location are equal despite other fields")
    public void givenSameChecksumAndLocation_whenCompare_thenHaveValueEquality() {
        final var expectedChecksum = "abc";
        final var expectedLocation = "/images/banner";
        final var firstImage = ImageMedia.with(
                "first-id", expectedChecksum, "Banner.png", expectedLocation);
        final var secondImage = ImageMedia.with(
                "second-id", expectedChecksum, "Renamed.png", expectedLocation);

        Assertions.assertNotSame(firstImage, secondImage);
        Assertions.assertEquals(firstImage, secondImage);
        Assertions.assertEquals(firstImage.hashCode(), secondImage.hashCode());
    }
}
```

## Event trigger and its non-triggering counterpart

The real `AudioVideoMedia` state decides whether `Video` records an event. These
tests check that decision and its payload; they make no delivery claim. Processing
and completed values have the same equality keys as their pending predecessors,
so the completed test also inspects status directly.

```java
package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Year;
import java.util.Set;

public class VideoMediaEventTest extends UnitTest {

    @Test
    @DisplayName("Assigning pending video media records its resource ID and raw path")
    public void givenPendingMedia_whenUpdateVideoMedia_thenRecordEvent() {
        final var expectedEventCount = 1;
        final var expectedFilePath = "/videos/raw";
        final var actualVideo = Video.newVideo(
                "Title", "Description", Year.of(2022), 120.0,
                false, false, Rating.L, Set.of(), Set.of(), Set.of());
        final var expectedResourceId = actualVideo.getId().getValue();
        final var media = AudioVideoMedia.with("abc", "Video.mp4", expectedFilePath);

        actualVideo.updateVideoMedia(media);

        Assertions.assertEquals(expectedEventCount, actualVideo.getDomainEvents().size());
        final var actualEvent = (VideoMediaCreated) actualVideo.getDomainEvents().get(0);
        Assertions.assertEquals(expectedResourceId, actualEvent.resourceId());
        Assertions.assertEquals(expectedFilePath, actualEvent.filePath());
        Assertions.assertNotNull(actualEvent.occurredOn());
    }

    @Test
    @DisplayName("Assigning completed video media does not request encoding again")
    public void givenCompletedMedia_whenUpdateVideoMedia_thenRecordNoEvent() {
        final var actualVideo = Video.newVideo(
                "Title", "Description", Year.of(2022), 120.0,
                false, false, Rating.L, Set.of(), Set.of(), Set.of());
        final var media = AudioVideoMedia.with("abc", "Video.mp4", "/videos/raw")
                .completed("/videos/encoded");

        actualVideo.updateVideoMedia(media);

        Assertions.assertEquals(MediaStatus.COMPLETED,
                actualVideo.getVideo().orElseThrow().status());
        Assertions.assertTrue(actualVideo.getDomainEvents().isEmpty());
    }
}
```

For a focused sensitivity check in a disposable copy, changing the category minimum
from three to four must fail the accepted-boundary test, and removing the pending
status guard must fail the completed-media test. A syntax error is not that evidence.
Keep such temporary mutations out of the reference repository and restore them
before reporting normal test results.
