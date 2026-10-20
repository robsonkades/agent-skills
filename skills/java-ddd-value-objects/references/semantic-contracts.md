# Reference contracts for values and identifiers

Use this when implementing the ID hierarchy, a media value, resource handling or enum
lookup. The sole source is `C:\git\ddd-example\domain`, inspected at repository commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`. The [source routes](../SKILL.md#conditional-references)
provide complete bundled implementations from that revision. Inspect the current supplied
checkout when available; a changed checkout can change the evidence. Otherwise identify
the bundled revision when applying these contracts. Paths below are relative to the
domain module; `main` abbreviates `src/main/java/com/robsonkades/admin/catalogo/domain`
and `test` abbreviates `src/test/java/com/robsonkades/admin/catalogo/domain`.

These are implementation contracts selected by the user as the standard. Describing a
limitation does not authorize a repair, and it does not establish a general DDD rule.
If an explicit requested behavior contradicts the source, surface the exact difference
and ask only for the missing decision. Continue work that does not depend on it.

## Base types and typed IDs

`main/ValueObject.java` is an empty abstract class. It supplies no validation, equality,
hashing or immutability mechanism. `main/Identifier.java` extends it and declares only
`public abstract String getValue()`. `Entity`/`AggregateRoot` consume typed identifiers;
their lifecycle is covered by java-ddd-aggregates.

The concrete ID files are `main/category/CategoryID.java`,
`main/castmember/CastMemberID.java`, `main/genre/GenreID.java` and
`main/video/VideoID.java`. Preserve the following shape:

- An ordinary public class extending `Identifier`, not a record or a class declared final.
- One private final `String value`; a private constructor enforcing nonnull input.
- `from(String)` for reconstruction and `unique()` for new IDs; `getValue()` for access.
- `equals` accepts `this`, rejects null/different runtime class, then compares values.
  `hashCode` uses `Objects.hash(getValue())`. Equal text in different ID types remains
  distinct. Do not centralize equality in the empty base class.

| Type                                    | `from` behavior                            | Consequence                                                                                   |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `CategoryID`, `CastMemberID`, `GenreID` | Preserve the supplied nonnull String.      | `"ABC"` and `"abc"` differ; leading zeroes, whitespace and empty strings survive.             |
| `VideoID`                               | Call `anId.toLowerCase()`, then construct. | Case is transformed using the JVM default locale; null fails before reaching the constructor. |

`main/utils/IdUtils.java` is a final utility with a private constructor. `uuid()` calls
`UUID.randomUUID().toString().toLowerCase().replace("-", "")`. This yields the source's
generated representation; it does not make UUID grammar an invariant of `from`.
`test/genre/GenreTest.java` uses `CategoryID.from("123")` and `from("456")`, which would
be broken by a UUID parser. Never replace the string with `UUID`, parse an ID numerically,
strip characters or apply the VideoID transformation to all ID types.

The lack of an explicit locale in `VideoID` is observable source behavior. Do not
silently replace it with `Locale.ROOT`. When a new type's case rule is not specified,
identify the difference between the reference IDs and request that rule rather than
declaring one of them universally correct.

The complete ID assets in the [source routes](../SKILL.md#conditional-references) retain
these per-type implementations. [CategoryID](../assets/java/CategoryID.java) remains at
its existing asset path. Adapt names/packages only after identifying the owning aggregate;
do not generate a parallel ID framework.

## Media construction and equality

`main/video/ImageMedia.java` extends `ValueObject` and stores final strings `id`,
`checksum`, `name` and `location`. Its private constructor requires each to be nonnull;
there are no blank, path or checksum-format checks. Its factories are:

- `with(checksum, name, location)`: create an ID with `IdUtils.uuid()`.
- `with(id, checksum, name, location)`: retain the supplied ID.

Accessors are `id()`, `checksum()`, `name()` and `location()`. Equality requires the same
runtime class and only checksum plus location; hashing uses those same two fields.
`test/video/ImageMediaTest.java` explicitly compares two images with different names and
generated IDs as equal. Full-field equality or ID-only equality would change this model.

`main/video/AudioVideoMedia.java` extends `ValueObject` with final strings `id`,
`checksum`, `name`, `rawLocation`, `encodedLocation` and final `MediaStatus status`.
All constructor arguments are required to be nonnull, but empty strings are accepted.

| Operation                                                             | Source behavior                                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `with(checksum, name, rawLocation)`                                   | Generate ID, set encoded location to `""`, status to `PENDING`.                                                                                   |
| Full `with(id, checksum, name, rawLocation, encodedLocation, status)` | Reconstruct the supplied fields without a state-transition check.                                                                                 |
| `processing()`                                                        | New instance with the same ID, checksum, name and locations, status `PROCESSING`.                                                                 |
| `completed(encodedPath)`                                              | New instance with the same ID, checksum, name and raw location, supplied encoded path, status `COMPLETED`. Null path is rejected by construction. |
| `isPendingEncode()`                                                   | True exactly for `MediaStatus.PENDING`.                                                                                                           |

`MediaStatus` declares `PENDING`, `PROCESSING`, `COMPLETED`, `ERROR`. The media methods
do not reject `completed` from pending or `processing` from completed. Do not invent a
transition state machine because the enum suggests one. `Video` decides when to replace
its media; that aggregate behavior belongs to java-ddd-aggregates.

Audio/video equality requires the same runtime class and only checksum plus raw location;
hashing uses the same pair. ID, name, encoded location and status are excluded. Thus a
pending value and its completed replacement compare equal despite different observable
state. Test status and paths to verify processing, and verify that the original keeps
its previous state. `test/video/AudioVideoMediaTest.java` supplies construction, equality
and null-argument examples; it does not prove every transition or aliasing contract.

Neither media class is declared final in the source. Preserve exact-class equality and
the concrete API; do not introduce inheritance or turn these classes into full-field
records as an incidental cleanup.

## Resource and wrapper records

`main/video/Resource.java` extends `ValueObject`, has a private constructor and
`with(byte[], checksum, contentType, name)`. All four arguments are nonnull. Each field
is final, but `content` is stored and returned directly. Both changing the caller's array
and changing the accessor result change the bytes seen through the object. There are no
`equals` or `hashCode` overrides, so distinct instances retain identity equality, even
when all fields and content match. The superclass adds no behavior.

`main/video/VideoResource.java` is a record of `VideoMediaType type` and `Resource resource`
with `with(type, resource)`. It has no validating canonical constructor; both direct
construction and the factory accept null components. Record equality delegates the
resource comparison to `Resource`, preserving its identity semantics and aliased bytes.
Two wrappers of the same type and same resource compare equal; separately constructed
resources with matching bytes do not make their wrappers equal.

Do not describe these objects as deeply immutable or apply `Arrays.equals`, byte copying,
null guards, immutable collections or new validation just because another value type
uses them. Those changes would need a separately stated requirement. When source fidelity
and a requested deep-immutability guarantee conflict, report the conflict before editing.

Other source records (`pagination/SearchQuery`, `pagination/Pagination`,
`video/VideoSearchQuery`, `video/VideoPreview`) do not extend `ValueObject`. Their presence
does not authorize converting the base hierarchy or adding canonical-constructor checks.
Pagination and search signatures belong to java-ddd-repositories. Mutable list/set
components remain aliases unless their own implementation copies them.

## Enum lookups

`main/video/Rating.java` contains `ER`, `L`, `AGE_10`, `AGE_12`, `AGE_14`, `AGE_16`,
`AGE_18`. `getName()` returns its label (`"10"`, for example); `of(label)` searches those
labels with `equalsIgnoreCase` and returns `Optional<Rating>`. It does not parse the enum
constant name `"AGE_10"`. Null, unknown and whitespace-padded labels return empty.

`main/video/VideoMediaType.java` contains `VIDEO`, `TRAILER`, `BANNER`, `THUMBNAIL`,
`THUMBNAIL_HALF`; `of(value)` matches the enum constant name case-insensitively and returns
an Optional, without trimming or throwing for no match. `CastMemberType` is simply
`ACTOR`, `DIRECTOR`; the source gives it no `of` factory. Do not invent a universal enum
parser across these types.

## Useful tests and missing evidence

Use the given/when/then organization and `Assertions` from the source media tests.
The reference's `UnitTest` base adds `@Tag("unitTest")`. The user additionally requires
`@DisplayName` on every unit test and no mocks. These requirements apply to new examples
even though the inspected source tests do not have DisplayName annotations.

Prefer direct real values and named cases: case handling for a particular ID, equal ID
hash lookup, different aggregate ID types, image equality, media status replacement and
Resource aliasing. Avoid an assertion for every getter when the getter is not the behavior
under test. Never use `assertEquals` alone to verify an audio/video state transition.
The [example guide](java-example.md) explains runnable checks and their limits.

There is no money, measurement-unit, range or official-document implementation in this
reference module. Those policies cannot be derived from a generic value-object slogan.
If requested, ask for the missing technical/business reference; do not reuse a synthetic
CustomerDocument or InvoiceAmount contract as this project's standard.
