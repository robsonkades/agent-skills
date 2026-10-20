# Verify domain events without mocks

Read when adding an event producer, changing queue management or writing domain tests.
Use the source contracts in [event lifecycle](event-lifecycle.md). These cases define
expected behavior; they do not establish that a target project or agent has passed them.

## Test conventions and useful checks

Follow the reference's plain JUnit tests: extend `UnitTest` (`@Tag("unitTest")`), use
`given..._when..._should...` method names, keep given/when/then visible and exercise actual
domain objects. Give **every** unit test a meaningful `@DisplayName`; this additional
requirement comes from the user, not the inspected tests. No mocks, spies, Mockito
extensions, stubbed aggregate methods or interaction verification belong in these tests.

`EntityTest` demonstrates a counter lambda for the publisher. A small lambda recording
actual event values in a list also exposes payload/order without a mocking framework.
Use it only when publication itself is the behavior under test. For ordinary aggregate
transitions, inspect state and `getDomainEvents()` directly.

Select cases that protect the changed contract:

| Scenario                                            | Valuable assertion                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pending video or trailer is attached                | Correct event type, video ID, raw path and non-null timestamp; correct media state     |
| Same update with processing/completed media         | No new event; updated media has the supplied status                                    |
| Null media update                                   | Media is absent and no new event is added                                              |
| Repeated pending update                             | Both occurrences remain; do not impose deduplication                                   |
| Event source data later changes                     | Previously captured path and ID remain the original values                             |
| `Video.with(video)`                                 | Existing events are retained; later registration/cleanup affects only that copy's list |
| Full-parameter `Video.with(...)` with pending media | No occurrence is emitted merely by restoring state                                     |
| Input list is mutated after entity construction     | Entity membership is unchanged; the constructor copied the container                   |
| Getter view is retained before registration         | It sees additions and successful cleanup; direct modification is rejected              |
| Null registration/publisher                         | Existing queue is unchanged                                                            |
| All publication calls succeed                       | Captured values preserve order and the queue empties; a second call emits nothing      |
| Second publication call fails                       | Exception escapes; first effect is visible; all events remain available for retry      |

Use explicit timestamps with the three-argument event constructor when time is test data.
For aggregate-generated event timestamps, assert the source's meaningful property, as the
existing `VideoTest` does, rather than comparing with a separate current-time call or
sleeping. When a test must prove that an update advances an aggregate timestamp, the user
authorized reconstruction through `with(...)` with fixed old timestamps. Preserve the
production implementation; do not introduce a mocked clock or change its time policy.

## Executable example using the actual domain

When assembling this example without the original checkout, use the packaged
[DomainEvent.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEvent.java),
[DomainEventPublisher.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEventPublisher.java)
and [VideoMediaCreated.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaCreated.java).
Use the complete [Entity.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java),
[AggregateRoot.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java)
and [InstantUtils.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/InstantUtils.java)
from the suggested `java-ddd` skill, and
[Video.java](../../java-ddd-aggregates/assets/reference/video/Video.java) from
`java-ddd-aggregates`. Include their referenced domain types and the test prerequisites
below; this event package alone is not a complete compilation source set. If a companion
skill is unavailable, use the corresponding files from the recorded source revision.

This complete class is intended for the reference domain's test source set, or an isolated
copy with the same classes. It needs Java 17-compatible compilation, the existing
`UnitTest` and JUnit Jupiter 5.9.2 from the reference build conventions. It introduces no
new build/dependency requirement. Run the class through the target's existing JUnit task;
keep validation artifacts outside the reference repository when it is only an input.

```java
package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.UnitTest;
import com.robsonkades.admin.catalogo.domain.events.DomainEvent;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class VideoDomainEventsTest extends UnitTest {

    @Test
    @DisplayName("Pending video media records the video ID and original file path")
    public void givenPendingMedia_whenUpdateVideo_shouldRegisterItsValues() {
        // given
        final var aVideo = newVideo();
        final var media = AudioVideoMedia.with("checksum", "video.mp4", "/raw/video.mp4");

        // when
        aVideo.updateVideoMedia(media);

        // then
        Assertions.assertEquals(media, aVideo.getVideo().orElseThrow());
        Assertions.assertEquals(1, aVideo.getDomainEvents().size());
        final var event = Assertions.assertInstanceOf(
                VideoMediaCreated.class, aVideo.getDomainEvents().get(0));
        Assertions.assertEquals(aVideo.getId().getValue(), event.resourceId());
        Assertions.assertEquals("/raw/video.mp4", event.filePath());
        Assertions.assertNotNull(event.occurredOn());
    }

    @Test
    @DisplayName("Processing media does not announce another pending media occurrence")
    public void givenProcessingMedia_whenUpdateVideo_shouldNotRegisterEvent() {
        // given
        final var aVideo = newVideo();
        final var media = AudioVideoMedia.with("checksum", "video.mp4", "/raw/video.mp4")
                .processing();

        // when
        aVideo.updateVideoMedia(media);

        // then
        Assertions.assertEquals(MediaStatus.PROCESSING,
                aVideo.getVideo().orElseThrow().status());
        Assertions.assertTrue(aVideo.getDomainEvents().isEmpty());
    }

    @Test
    @DisplayName("Failure on the second event retains the entire queue for a possible retry")
    public void givenTwoEvents_whenSecondPublicationFails_shouldRetainBoth() {
        // given
        final var aVideo = newVideo();
        final var occurredOn = Instant.parse("2024-01-01T12:00:00Z");
        final var first = new VideoMediaCreated("video-id", "/raw/first", occurredOn);
        final var second = new VideoMediaCreated("video-id", "/raw/second", occurredOn);
        final var published = new ArrayList<DomainEvent>();
        final var failure = new IllegalStateException("publisher unavailable");
        aVideo.registerEvent(first);
        aVideo.registerEvent(second);

        // when
        final var actualException = Assertions.assertThrows(IllegalStateException.class,
                () -> aVideo.publishDomainEvents(event -> {
                    if (event.equals(second)) {
                        throw failure;
                    }
                    published.add(event);
                }));

        // then
        Assertions.assertSame(failure, actualException);
        Assertions.assertEquals(List.of(first), published);
        Assertions.assertEquals(List.of(first, second), aVideo.getDomainEvents());
    }

    @Test
    @DisplayName("Publishing a copied video's events leaves the original queue intact")
    public void givenCopyWithPendingEvent_whenPublishCopy_shouldPreserveOriginal() {
        // given
        final var original = newVideo();
        final var event = new VideoMediaCreated("video-id", "/raw/video",
                Instant.parse("2024-01-01T12:00:00Z"));
        original.registerEvent(event);
        final var copy = Video.with(original);
        final var copyView = copy.getDomainEvents();
        final var published = new ArrayList<DomainEvent>();

        // when
        copy.publishDomainEvents(published::add);

        // then
        Assertions.assertEquals(List.of(event), published);
        Assertions.assertEquals(List.of(event), original.getDomainEvents());
        Assertions.assertTrue(copy.getDomainEvents().isEmpty());
        Assertions.assertTrue(copyView.isEmpty());
    }

    private static Video newVideo() {
        return Video.newVideo("Domain events", "A video for event tests", Year.of(2024),
                120.0, false, false, Rating.L, Set.of(), Set.of(), Set.of());
    }
}
```

The failure test deliberately shows the existing behavior; it does not prove safe retry
or durable delivery. The source's media equality omits status, so the non-pending case
asserts `status()` directly instead of relying on media equality to detect that change.

## Reproducible skill evaluation cases

These are written teaching/evaluation cases, not executed agent evaluations. An evaluator
can supply the task/context column separately, keeping expected answers out of the task.
Use the referenced source revision and ordinary skill resources; no broker is required.

| Task and context supplied to the agent                                                         | Expected behavior and required result                                                                                         | Failure condition                                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Implement event creation when pending video media is attached, following the reference         | Existing record and helper; video ID/raw path; no new dependency; tests with `@DisplayName` and actual objects                | Event ID/Clock/envelope invented; media ID replaces resource ID; mocks used        |
| Same task, but supplied media is already processing                                            | Preserve update without a new event and assert media status                                                                   | Event emitted solely because an update occurred                                    |
| Explain why retry after the second publisher call fails can repeat the first event             | Trace loop-before-clear, retained entire queue and observable first effect; distinguish source behavior from a desired repair | Claim prefix was removed, transaction rolled back or retry is exactly once         |
| Replace `getDomainEvents()` with `List.copyOf` as a behavior-preserving optimization           | Identify live-view change using a view captured before append/cleanup; preserve reference contract                            | Accept change as equivalent merely because both lists reject modification          |
| Copy a live video with pending events; then restore the same stored fields through full `with` | Preserve pending events only for copy overload; reconstructed instance emits none                                             | Both queues cleared, both preserved, or new occurrences created during restoration |
| Add a new event but provide no business trigger or payload requirements                        | Inspect available domain evidence; ask for the unresolved trigger/data instead of inventing them                              | Fill missing behavior with generic Order events or assume every update emits       |
| Make this domain queue survive process crashes                                                 | Explain lack of domain evidence for durability and hand off the additional scope                                              | Add outbox, Spring listener or delivery promises as part of the domain pattern     |

Record structural checks, compiled/executed examples and actual agent evaluations
separately. A source walkthrough can support a contract explanation, but cannot be
reported as an executed test or a measured improvement.
