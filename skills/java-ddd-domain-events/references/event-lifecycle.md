# The reference domain event lifecycle

Read when implementing an event, changing its producer or reviewing the pending-event
list. All technical patterns below come from `C:\git\ddd-example\domain`, inspected at
commit `8d964ce4106c2299164e28980ae7553e2afbdc92`. No application or infrastructure code
is needed to establish these domain contracts, and no delivery guarantee follows from them.

## Source map

Paths are relative to `domain/`. Main classes are under
`src/main/java/com/robsonkades/admin/catalogo/domain/`; tests use the same package path
under `src/test/java/`.

| Source                                                        | Evidence to preserve                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `events/DomainEvent.java`, `events/DomainEventPublisher.java` | Shared interfaces and exact signatures                                   |
| `Entity.java`, `AggregateRoot.java`                           | List construction, view, registration and publication                    |
| `video/VideoMediaCreated.java`, `utils/InstantUtils.java`     | Payload, constructors and timestamp creation                             |
| `video/Video.java`, `video/AudioVideoMedia.java`              | Media-trigger conditions, copy/reconstruction and status updates         |
| `category/Category.java`                                      | Difference between `with` and shallow `clone`                            |
| `EntityTest.java`                                             | Plain entity fixture and counter-lambda publication test                 |
| `video/VideoTest.java`                                        | Pending media event payload and preservation through `Video.with(video)` |

Source-derived edge behavior below is not necessarily covered by those existing tests.
Use the [verification cases](verification.md) to select useful checks for the changed path.

## Shared interfaces and concrete event

When implementing the interfaces or event, use the complete packaged
[DomainEvent.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEvent.java),
[DomainEventPublisher.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/events/DomainEventPublisher.java)
and [VideoMediaCreated.java](../assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaCreated.java).
The event also needs
[InstantUtils.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/InstantUtils.java)
from the suggested `java-ddd` skill, or the same file from the original revision.
The declarations below explain those contracts; no framework or broker is involved.

```java
package com.robsonkades.admin.catalogo.domain.events;

import java.io.Serializable;
import java.time.Instant;

public interface DomainEvent extends Serializable {
    Instant occurredOn();
}
```

```java
package com.robsonkades.admin.catalogo.domain.events;

@FunctionalInterface
public interface DomainEventPublisher {
    void publishEvent(DomainEvent event);
}
```

```java
package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.events.DomainEvent;
import com.robsonkades.admin.catalogo.domain.utils.InstantUtils;
import java.time.Instant;

public record VideoMediaCreated(
        String resourceId,
        String filePath,
        Instant occurredOn
) implements DomainEvent {

    public VideoMediaCreated(final String resourceId, final String filePath) {
        this(resourceId, filePath, InstantUtils.now());
    }
}
```

`InstantUtils.now()` returns `Instant.now().truncatedTo(ChronoUnit.MICROS)`. The stored
timestamp is created by the event constructor, separately from `Video.updatedAt`.
Their equality is not a contract. The three-argument constructor accepts its supplied
timestamp; the record adds no null checks or validation. Do not claim it rejects nulls.

The event contains a string resource identifier, a raw file location and a timestamp.
It does not carry an `AudioVideoMedia`, mutable `Video`, event ID or media-type field.
Even though both video and trailer updates use it, do not invent a discriminator.
If a new requested business behavior needs additional data, resolve that requirement
explicitly; the existing event does not establish it.

## Event buffer in Entity

For complete base classes, open
[Entity.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java)
and [AggregateRoot.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java)
in the suggested `java-ddd` skill, or use the same files from the original revision.
`AggregateRoot` forwards `(id)` and `(id, events)` to `Entity`. The following methods are
partial excerpts; retain its identity and validation members from the complete source.

```java
protected Entity(final ID id, final List<DomainEvent> domainEvents) {
    Objects.requireNonNull(id, "'id' should not be null");
    this.id = id;
    this.domainEvents = new ArrayList<>(
            domainEvents == null ? Collections.emptyList() : domainEvents);
}

public List<DomainEvent> getDomainEvents() {
    return Collections.unmodifiableList(domainEvents);
}

public void registerEvent(final DomainEvent event) {
    if (event == null) {
        return;
    }
    this.domainEvents.add(event);
}

public void publishDomainEvents(final DomainEventPublisher publisher) {
    if (publisher == null) {
        return;
    }
    getDomainEvents().forEach(publisher::publishEvent);
    this.domainEvents.clear();
}
```

Preserve these distinctions:

- A null input list produces an empty owned `ArrayList`. A supplied list's membership is
  copied, so later changes to that input container do not change the entity's list.
  Event instances are not cloned, and null elements already in the input list are not
  removed. The null-registration guard does not validate constructor contents.
- The getter prevents list modification through the returned reference but remains live.
  A previously obtained view sees later registration and successful cleanup. Replacing
  it with a snapshot changes the observable API.
- Normal publication visits the list in insertion order and clears it afterwards.
  A second publication with no new events emits nothing. A null publisher preserves the
  queue. The publisher is called synchronously; registering an event does not call it.
- If publication of event B throws after event A succeeded, the exception propagates and
  the list still contains A and B, plus any later unvisited entries. No prefix is removed
  and no already-executed publisher effect is undone. A retry starts at A again.

Do not reinterpret this method as acknowledgment, atomic delivery, rollback or an outbox.
It does not persist events or coordinate a transaction. Do not add locking, batch tokens,
draining, per-event removal or a `finally` cleanup as if they were equivalent refactors.
There is no supported concurrent/reentrant mutation protocol: keep these limits explicit
if a publisher attempts to modify the same aggregate during iteration.

## Video triggers and factory distinctions

When implementing a media producer or a copy/factory path, use the complete
[Video.java](../../java-ddd-aggregates/assets/reference/video/Video.java) from the suggested
`java-ddd-aggregates` skill, or the same file from the original revision.

Both media-update methods assign the new media, set `updatedAt = InstantUtils.now()`,
invoke this helper and return `this`:

```java
private void onAudioVideoMediaUpdated(final AudioVideoMedia media) {
    if (media != null && media.isPendingEncode()) {
        this.registerEvent(new VideoMediaCreated(getId().getValue(), media.rawLocation()));
    }
}
```

| Operation or input                                                             | Event result                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `updateVideoMedia(pending)` or `updateTrailerMedia(pending)`                   | Append one `VideoMediaCreated` with the video ID value and media raw location                 |
| Repeat an update with the same pending media                                   | Append another event; there is no duplicate suppression                                       |
| Update with `null`                                                             | Clear the corresponding media field, refresh `updatedAt`, append nothing                      |
| Update with `PROCESSING` or `COMPLETED` media                                  | Assign it and refresh `updatedAt`, append nothing                                             |
| `processing(type)` or `completed(type, encodedPath)` for present video/trailer | Delegate through a media update with the new non-pending status; append nothing               |
| Image-media updates or ordinary `update(...)`                                  | Append nothing                                                                                |
| `newVideo(...)`                                                                | Start with no media and an empty event list                                                   |
| Full-parameter `Video.with(...)`                                               | Restore supplied state, including media, with an empty event list                             |
| `Video.with(existingVideo)`                                                    | Copy the existing event membership into a separate list; preserve event values and timestamps |

The status-changing methods do not remove an event already pending before the change.
For absent video/trailer or a media type other than `VIDEO`/`TRAILER`, they do not execute
a media update. Media updates and construction do not call `validate(handler)`;
validation is invoked explicitly. An event in the queue therefore does not prove that
the entire aggregate has passed validation.

Do not generalize one copy method to all aggregates. `Category.with(category)` creates
an empty queue through its constructor, whereas `Category.clone()` uses `super.clone()`
and shares the inherited event-list reference. This is an observed limit of the source,
not permission to redesign it. `java-ddd-aggregates` owns the wider copy/factory rules.
