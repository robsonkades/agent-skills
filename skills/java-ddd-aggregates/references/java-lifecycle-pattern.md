# Factories, validation and lifecycle

Read before changing construction, `with(...)`, copying or state transitions. This
captures the same `ddd-example/domain` revision and source paths listed in
[aggregate organization](aggregate-organization.md). Source behavior is the
contract; the differences below must not be silently standardized.

## Complete production templates

When implementing or reproducing the selected family, read its complete template
before writing code:

- [Category.java](../assets/reference/category/Category.java): private constructor,
  exact timestamp null checks, external validation, lifecycle clock calls and the
  complete `clone()` signature and exception handling.
- [Genre.java](../assets/reference/genre/Genre.java): protected constructor,
  self-validation, category list ownership and collection/lifecycle methods.
- [CastMember.java](../assets/reference/castmember/CastMember.java): protected
  constructor, name/type update and self-validation.
- [Video.java](../assets/reference/video/Video.java): complete factory parameters,
  field accessors, ID sets, media transitions, copy and event handling.

These four files preserve the full production source from
`ddd-example/domain/src/main/java/com/robsonkades/admin/catalogo/domain/<family>/<Root>.java`
at revision `8d964ce4106c2299164e28980ae7553e2afbdc92`; only line endings may differ.
They are production templates, not independent runnable applications. Read the
canonical [AggregateRoot.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java),
[Entity.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java),
[Identifier.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java)
and [ValueObject.java](../../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java)
for the foundation they require. Each root also needs its typed ID and validator,
validation handlers, exceptions and `InstantUtils`; Video additionally uses the
other aggregate IDs, media values, enums and domain event types. Resolve these
prerequisites through the [complete domain source index](../../java-ddd/references/source-index.md),
which covers all 49 production types across skills. The optional hub and relevant
specialist assets must be available; this package alone is not source-complete.
Reuse the supplied contracts instead of adding stubs to make a template compile.
A compatible Java toolchain and the test runtime are external prerequisites; see
[focused verification](verification.md) before running the test asset.

Preserve the target project's namespace consistently across these dependencies.
Adapt business names and rules only from stated requirements and a confirmed
reference family. Keep every other observed signature, visibility, assignment,
null check/message, copy path and clock call intact. For example, Category's
deactivation reads `InstantUtils.now()` separately for a newly assigned deletion
time and update time; its `clone()` catches `CloneNotSupportedException` and throws
`new AssertionError()`. Do not fill such details from intuition or treat the
summary tables and partial excerpts below as substitutes for the complete source.

## Choose the actual reference family

| Detail                   | `Category`                                                                    | `Genre`                            | `CastMember`                                 | `Video`                                      |
| ------------------------ | ----------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Constructor              | `private`                                                                     | `protected`                        | `protected`                                  | `protected`                                  |
| New factory              | `newCategory(name, description, active)`                                      | `newGenre(name, active)`           | `newMember(name, type)`                      | `newVideo(metadata, flags, rating, ID sets)` |
| ID creation              | `CategoryID.unique()`                                                         | `GenreID.unique()`                 | `CastMemberID.unique()`                      | `VideoID.unique()`                           |
| New timestamps           | One `InstantUtils.now()` for created/updated and initial deletion if inactive | Same inactive lifecycle convention | One `InstantUtils.now()` for created/updated | One `InstantUtils.now()` for created/updated |
| Constructor validation   | ID and non-null created/updated checks; no `CategoryValidator` call           | `selfValidate()` after assignments | `selfValidate()` after assignments           | ID check inherited; no `VideoValidator` call |
| `update(...)` validation | External                                                                      | `selfValidate()` after assignments | `selfValidate()` after assignments           | External                                     |
| Active/deleted lifecycle | `activate()`, `deactivate()`                                                  | `activate()`, `deactivate()`       | Absent                                       | Absent; has opened/published flags           |

All roots override `validate(handler)` with
`new <Root>Validator(this, handler).validate()`. That method validates current
state; it does not itself promise rollback or automatic execution from other
methods. Constructor-level ID/null checks and domain validation are distinct.

An invalid Category name can be stored by construction or `update(...)`; the
violation appears when its caller invokes `validate`. Video follows the same
external-validation structure. Genre/CastMember creation or reconstruction fails
with `NotificationException` if `selfValidate()` finds errors. Their update method
assigns new state and audit time **before** self-validation throws; the instance
can therefore contain the rejected values afterward. Preserve this timing and
never promise that expected rejection leaves state or timestamps unchanged.

## Reuse the construction and validation sequence

These are **partial source excerpts** from `genre/Genre.java`, not standalone
classes. They require the existing `Genre extends AggregateRoot<GenreID>` fields,
protected constructor, imports, ID, validator, handlers and exceptions. The
constructor assigns its arguments directly and then calls `selfValidate()`.

```java
public static Genre newGenre(final String aName, final boolean isActive) {
    final var anId = GenreID.unique();
    final var now = InstantUtils.now();
    final var deletedAt = isActive ? null : now;
    return new Genre(anId, aName, isActive, new ArrayList<>(), now, now, deletedAt);
}

public static Genre with(
        final GenreID anId,
        final String aName,
        final boolean isActive,
        final List<CategoryID> categories,
        final Instant aCreatedAt,
        final Instant aUpdatedAt,
        final Instant aDeletedAt) {
    return new Genre(anId, aName, isActive, categories,
            aCreatedAt, aUpdatedAt, aDeletedAt);
}

@Override
public void validate(final ValidationHandler handler) {
    new GenreValidator(this, handler).validate();
}

private void selfValidate() {
    final var notification = Notification.create();
    validate(notification);
    if (notification.hasError()) {
        throw new NotificationException("Failed to create a Aggregate Genre", notification);
    }
}
```

Keep full `with(...)` distinct from the new factory: use the supplied ID,
timestamps, lifecycle flags and collections. Do not generate a fresh ID or read
time to restore existing state. Do not call transition methods to reconstruct it.
Both full and copy `with(...)` for Genre/CastMember pass through their validating
constructor; reconstruction is not a universal validation bypass. Category/Video
do not acquire self-validation merely because another root has it.

For a new domain concept, do not invent name lengths, uniqueness checks, lifecycle
states or admission rules from its English name. Identify the confirmed reference
family and obtain any missing business rules before filling its validator.

## Transitions and audit values

Genre's update is another **partial source excerpt**:

```java
public Genre update(final String aName, final boolean isActive,
                    final List<CategoryID> categories) {
    if (isActive) {
        activate();
    } else {
        deactivate();
    }
    this.name = aName;
    this.categories = new ArrayList<>(categories != null ? categories : Collections.emptyList());
    this.updatedAt = InstantUtils.now();
    selfValidate();
    return this;
}
```

- Category/Genre creation with `active == false` sets `deletedAt` to the same
  instant as `createdAt` and `updatedAt`. Activation clears deletion; deactivation
  sets deletion only if currently null. Both methods refresh update time and
  return the same root. Repeated deactivation preserves the first deletion value.
- Category/Genre update first invokes activation/deactivation, assigns fields,
  then refreshes update time. `Category.update` uses `Instant.now()` for this final
  assignment; Genre uses `InstantUtils.now()`. Keep the difference visible: the
  utility truncates to microseconds. Do not normalize Category's path without an
  explicit change request.
- CastMember update assigns name/type and update time, calls `selfValidate()` and
  returns `this`. It has no active/deleted state.
- Video update assigns metadata, flags and rating; the private setters replace ID
  sets according to the ownership table; it refreshes update time and returns
  `this`. It does not validate or register an event.
- All these transitions preserve the root ID and `createdAt`. Multiple calls to
  `InstantUtils.now()` can return the same value; neither the source implementation
  nor fluent chaining establishes a strictly increasing clock or atomic sequence.

The reference does not provide a validity guarantee after every public method.
Do not retrofit candidate-state validation, rollback, immutable replacement or
clock injection as if these were its existing pattern. If the requested change
needs a new guarantee, surface that mismatch and ask for the missing contract.

## Copies and media updates

| Path                           | Identity and fields                                     | Pending events                           |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| `Category.with(existing)`      | Same ID and field values in a new root                  | Empty buffer                             |
| `Category.clone()`             | Shallow clone, same ID and field values                 | Shares the inherited event list          |
| `Genre.with(existing)`         | Same ID/values; new category list; validates            | Empty buffer                             |
| `CastMember.with(existing)`    | Same ID/values; validates                               | Empty buffer                             |
| `Video.with(existing)`         | Same ID/values; new ID sets; same media references      | Copies existing events into a new buffer |
| Full `with(...)` for each root | Supplied ID/field values; constructor behavior retained | Empty buffer                             |

Copying is not equivalent to replaying commands. Video's copy constructor path
passes `getDomainEvents()` to the base constructor, which creates a new list; the
events themselves are not deep-copied. Category's `clone()` does not pass through
a constructor. These source limits are evidence to report, not permission to
replace one copy API with another.

Video's image update methods assign the nullable media value and refresh update
time. Its trailer/video update methods do the same and call
`onAudioVideoMediaUpdated`: non-null pending media registers `VideoMediaCreated`.
Other media states and null do not register that event. `processing(type)` and
`completed(type, encodedPath)` act on an existing video/trailer via the corresponding
update method; an absent media or other type produces no action. See
`java-ddd-domain-events` for exact payload/buffer semantics and
`java-ddd-value-objects` for media transition contracts.

## Source and verification limits

The evidence is the four root classes, their validators, `Entity`,
`utils/InstantUtils.java`, and the corresponding tests in
`src/test/java/com/robsonkades/admin/catalogo/domain/{category,genre,castmember,video}`.
Source reads establish the ordering and ownership described above. Existing tests
demonstrate representative creation, mutation and error expectations, but do not
cover every aliasing or copy path. Run the focused cases in
[verification](verification.md) when changing one of those contracts. Domain checks
do not establish persistence isolation, transaction rollback or event delivery.
