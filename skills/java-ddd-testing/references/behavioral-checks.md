# Domain behavioral checks

Read when selecting assertions for a domain type or reviewing whether a green test
establishes its claimed behavior. These rules are extracted from
`C:/git/ddd-example/domain`, inspected at commit
`8d964ce4106c2299164e28980ae7553e2afbdc92` with a clean working tree. Recheck the
current files; this record is not a substitute for missing source access. Ask for
the reference when unavailable, rather than filling its gaps from another DDD model.

Paths below are relative to `domain/src/main/java/com/robsonkades/admin/catalogo/domain`
or the corresponding `domain/src/test/java` package. The source and its tests are
the technical evidence; `@DisplayName` on every unit test and the no-mocks rule
are explicit user requirements for this skill. Fixed past dates for update-time
tests are also explicitly authorized, as described below.

## Test shape and setup

All eight concrete test classes extend `UnitTest`, which declares
`@Tag("unitTest")`. The 65 source test methods use JUnit `@Test` and
`Assertions`, readable `given..._when..._then/should...` names and local expected
values. No domain test imports Mockito or declares `@DisplayName` in this revision.
Add `@DisplayName` to each new or revised unit test; do not describe it as a source
annotation that already exists.

`Fixture` provides valid objects and typed IDs for related aggregates. Its preset
`Category`, `Genre`, `CastMember` and `Video` methods return copies through each
type's actual copy operation. It also uses Faker for names, booleans, years, durations
and enum values. Use it only where those variations cannot decide the assertion.
Explicit literals in the existing tests are the model for null, blank, limit,
status and event-trigger cases. Do not add a generic builder framework or random
boundary generator when a short direct factory call states the case clearly.

## Validation and transitions

| Evidence                                                                        | Meaningful test choice                                                                                                                                                                                | Incorrect extrapolation                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `category/Category.java`, `CategoryValidator.java`, `CategoryTest.java`         | Call `validate` after create/update. Name is nonnull, nonblank and trimmed length 3–255. Description can be blank. Verify activation/deactivation, stable ID/creation date and defined deletion date. | Factory always throws for an invalid name; description is required; invalid update is rolled back.                     |
| `castmember/CastMember.java`, `CastMemberValidator.java`, `CastMemberTest.java` | Factory/update throws `NotificationException` for invalid name or null type. Name trimmed length is 3–255. Independent name/type errors accumulate through internal `Notification`.                   | Name rejection makes the whole update atomic; every validation handler collects all errors.                            |
| `genre/Genre.java`, `GenreValidator.java`, `GenreTest.java`                     | Name trimmed length is 1–255. Constructor/update self-validates. Null categories on update become empty; null add/remove and null/empty bulk-add return without timestamp changes.                    | Category's minimum length applies; null association input always throws; duplicate IDs are automatically deduplicated. |
| `video/Video.java`, `VideoValidator.java`, `VideoValidatorTest.java`            | Explicit validation checks nonblank title/description, trimmed maxima 255/4000, and nonnull launch year/rating. Other fields stay valid while exercising one branch.                                  | Validator enforces positive duration, a year range, existing related IDs or a publication policy absent from its code. |

Test exact minimum/maximum and adjacent values when the changed rule involves a
length boundary. Keep the expected literal independent of the validator constant;
a test that derives both invalid input and expected limit from a changed constant
can conceal a broken contract. Do not replicate every unchanged branch as a
mandatory test count.

`Category.update` and `Video.update` assign state without calling validation.
`Genre.update` and `CastMember.update` assign state and then call
`selfValidate`. Their exception tests do not prove unchanged in-memory state.
If investigating a failure path, inspect and characterize the actual state; do
not impose transactional rollback on those methods or change them silently.

Use the real handler for the behavior under test:

- `ThrowsValidationHandler.append(Error)` immediately throws `DomainException`.
  Test its first error; changing to `Notification` changes how many errors can be
  observed in one validation pass.
- `Notification` collects errors and returns them via `getErrors()`;
  `validate(Validation<T>)` returns the successful result, or records caught errors
  and returns null. `NotificationException` carries that list when the aggregate's
  `selfValidate` raises it.
- Errors contain only `message`. Follow the source tests' exact count and
  `getErrors().get(i).message()` assertions. Do not invent codes/property paths or
  use only an exception's existence when the failing rule matters.

## Identity, values and copy boundaries

Use independently constructed IDs with the same string to test typed identity.
Concrete IDs compare their class and raw string; `from("123")` appears in
`GenreTest`. Do not require UUID parsing, case normalization or nonblank checks
that the selected ID factory does not implement. `Entity` equality compares
concrete class and ID, so two versions of an aggregate can be equal while their
business fields differ. Assert those fields directly for copies and updates.

`ImageMediaTest` and `AudioVideoMediaTest` deliberately compare distinct instances
with different names/generated IDs as equal. `ImageMedia` uses checksum/location;
`AudioVideoMedia` uses checksum/raw location. Assert equal hash codes for these
equal values, but inspect media status, ID and encoded location explicitly when
those are the result of a transition. Do not replace their equality with an
all-fields record expectation. Their null constructor arguments raise
`NullPointerException`, not validator notifications.

`ValueObject` is an empty base; `Resource` has no equality override and returns
its stored byte array directly. Do not assert universal value equality, immutable
array ownership or defensive copying just because a class extends `ValueObject`.
If the target needs stronger ownership, ask before changing the reference pattern.

Separate the source's collection behaviors:

- `Entity` copies an input event list and exposes an unmodifiable view.
  `EntityTest` checks the exposed view; a focused input-alias test can additionally
  mutate the original list and inspect the entity. Neither establishes deep copies
  of arbitrary event payloads.
- `Genre.with(Genre)` and `Video.with(Video)` copy their collections of IDs.
  Their raw-argument constructors retain supplied collections. `Genre.update`
  and `Video.update` copy association collections. Test the actual overload.
- `Category.clone()` is a shallow clone, including the inherited event list.
  Do not assume isolation of every mutable field because a fixture uses it.

When a copy is the subject, compare ID, relevant scalar fields, audit values and
event behavior; ID equality alone would miss lost state. Never use `before = root`
as a previous-state snapshot.

## Local domain events

`VideoTest` verifies that pending video/trailer media produces one
`VideoMediaCreated` with the root ID, raw file path and an occurrence instant.
Read `Video.onAudioVideoMediaUpdated` to distinguish the trigger: null, processing
and completed media do not emit that event. Updating the same pending media again
can append another event; there is no deduplication policy to assert.

`Video.with(Video)` retains pending events in a copied list;
the raw-argument `Video.with(...)` starts without events.
The source test named `givenValidVideo_whenCallsWith_shouldCreateWithoutEvents`
only checks nonnull. To establish emptiness in a new test, assert emptiness.

For publication, use the pattern in `EntityTest`: a minimal concrete
`DummyEntity`/`DummyID`/`DummyEvent` makes the abstract entity testable, and a
publisher lambda records observed calls. These are small test types and an
observer, not a mocked domain object or gateway. Assert events recorded before,
events observed during publication and the buffer after it. A null publisher is
a no-op; a throwing publisher interrupts iteration before the final clear.
Do not interpret callback invocation as durable delivery or exactly-once behavior.

## Exceptions, utilities and timing

Test helpers when their behavior is the change or risk, not to create a test per
method. Evidence is in `exceptions/*`, `utils/*`, `validation/*` and
`validation/handler/*`:

- `DomainException.with(Error)` exposes the error message; the list overload uses
  an empty exception message and retains the list. `NotificationException` has its
  own aggregate message and error list. Assert the relevant channel.
- `NotFoundException.with(aggregateClass, id)` formats the aggregate name/ID and
  has an empty error list; its `Error` overload carries one error.
  `NoStacktraceException` disables writable stack traces; test that only when
  this exception contract matters. Preserve cause behavior where used.
- `IdUtils.uuid()` yields lowercase UUID text without hyphens. Check its exposed
  format if changing it; do not assert a specific random ID or prove uniqueness
  by sampling a handful.
- `CollectionUtils.mapTo(null, mapper)` returns null; `nullIfEmpty` returns null
  for null/empty sets and the same nonempty set. Do not impose copying or replace
  these null results with empty sets in a test.
- `InstantUtils.now()` truncates to microseconds. Consecutive calls need not be
  distinct. `Category.update` uses `Instant.now()` directly, unlike its lifecycle
  operations. Keep any temporal expectation specific to the method.

The source tests use strict before/after comparisons between immediate operations.
The user explicitly requires fixed past dates through the existing `with(...)`
reconstruction for update-time tests. Assert that the update advances beyond that
old value and preserves creation time; the example reference demonstrates it.
This test setup is an authorized addition, not a claim that the source tests already
use it. No sleeps, mocks or new production clock API are needed. For actual no-op
paths, assert that the supplied timestamp remains unchanged instead.
