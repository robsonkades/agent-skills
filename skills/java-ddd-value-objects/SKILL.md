---
name: java-ddd-value-objects
description: >-
  Implement and review domain value objects and typed identifiers using the ddd-example
  domain conventions. Use for ValueObject, Identifier, CategoryID, CastMemberID, GenreID,
  VideoID, media factories, equality and hashing, resource aliasing, and value-object unit
  tests. Preserve the reference's per-type construction and normalization rules. Aggregate
  lifecycle, Gateway implementations, application orchestration and infrastructure are
  outside this skill.
---

# Java DDD Value Objects

## Authority and scope

Use the current `C:\git\ddd-example\domain` module as the sole technical reference for
this domain implementation style. The reference paths and observed contracts are in
[semantic contracts](references/semantic-contracts.md). If the checkout is elsewhere,
locate the supplied domain module. When it is unavailable, use the complete bundled
source snapshot below and identify its recorded revision. If a requested rule is absent
from that source, ask for the missing evidence. Do not substitute a generic DDD example
or invent a rule.
These instructions implement the reference's patterns, including its different choices
for different classes. They do not authorize modifying the reference repository.

Own the `ValueObject`/`Identifier` hierarchy, concrete IDs, media values, their creation,
equality, hashing, replacements and exposed state. Use java-ddd for the shared domain
foundation, java-ddd-aggregates for aggregate transitions, java-ddd-repositories for
Gateway contracts, and java-ddd-testing for the domain test suite. Persistence mappings,
JSON representation, HTTP, money, document formats and new business policies require
evidence beyond this module and are outside this implementation recipe.

## Workflow

1. **Read the relevant implementation and tests before selecting a pattern.** Inspect the
   base types, the nearest concrete type in the same aggregate package, its factories,
   accessors, equality methods and callers. Record the source revision/local differences.
   Inspect the target build and tests; do not upgrade Java or add dependencies to fit a
   preferred example. The reference has a Gradle 7.6 wrapper, JUnit 5.9.2 in its conventions
   and Java 17 compatibility settings for `buildSrc`; those settings alone do not pin the
   domain compiler release.
2. **Make a short contract from that evidence.** Identify the owning package, superclass,
   fields, factory names, null/empty handling, normalization, equality components and
   mutable aliases. Distinguish what the source implements from a requested change.
   Missing business rules remain questions, not generated constraints.
3. **Preserve the hierarchy and construction API.** `ValueObject` is an empty abstract
   class. `Identifier` extends it and declares `String getValue()`. Concrete `<Root>ID`
   classes extend `Identifier`, store a final `String`, have a private constructor,
   `from(String)` and `unique()`, and live beside their aggregate. They are not records
   or final classes in the reference. `unique()` delegates through `IdUtils.uuid()`.
   Do not add a generic ID superclass with equality or a new utility for each aggregate.
4. **Keep each ID's exact input policy.** Category, CastMember and Genre IDs preserve
   nonnull input unchanged, including empty strings and spaces. `VideoID.from` calls
   `toLowerCase()` before construction. None parses a UUID or checks existence. Keep
   this distinction; do not add trimming, UUID validation, locale changes or case folding
   to the other IDs under a claim of following the reference.
5. **Implement the concrete equality and state contract.** IDs compare exact runtime
   class and value, with `Objects.hash(getValue())`. `ImageMedia` compares checksum and
   location; `AudioVideoMedia` compares checksum and raw location. Their technical IDs,
   names and encoding state do not become equality fields. `Resource` has inherited
   identity equality and exposes its original `byte[]`; `VideoResource` keeps the given
   resource reference. Do not silently add defensive copies or full-field record equality.
   If the task requires different semantics, expose that conflict and obtain the missing
   requirement before changing it.
6. **Verify useful observable behavior.** Use real objects, JUnit `Assertions`, clear
   given/when/then tests and `@DisplayName` on every unit test. No mocks, spies, Mockito or
   Spring context. Test preservation or transformation of values, hash lookup, the actual
   equivalence relation, immutable media replacement and relevant aliasing. An equality
   assertion alone cannot prove a media state transition because status is excluded.

## Decisions to preserve

| Task                                                      | Required distinction                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add an ID for a new aggregate                             | Use the concrete hierarchy and API above; choose its input behavior only from an approved analogous source or an explicit requirement. Ask if case handling is undecided. |
| Reconstruct an existing ID                                | `from` accepts non-UUID strings. Preserve the per-type case rule; generation format is not a parsing restriction.                                                         |
| Reconstruct media                                         | The full `with(...)` overload retains the supplied ID and state; the short overload generates an ID and, for audio/video, starts pending with an empty encoded location.  |
| Move media to processing/completed                        | Return a replacement preserving the original object's state. Do not invent allowed-transition guards; inspect status and locations explicitly in tests.                   |
| Replace Resource or VideoResource with a record/deep copy | That changes the reference's identity/aliasing behavior. Record the discrepancy instead of applying the rewrite as a style improvement.                                   |
| Add a value absent from the reference                     | Inspect the approved nearest pattern, then ask for any missing validation/equality/operation rule. Do not infer currency, range, checksum or document policy.             |

Keep these types in the aggregate's package (`domain.category`, `domain.genre`,
`domain.castmember`, `domain.video`), with shared bases at `domain` and `IdUtils` at
`domain.utils`. Use the reference's constructors, names and accessors rather than
introducing a `domain.vo` layer, Lombok, framework annotations or a fluent builder.

## Conditional references

- Read [semantic contracts](references/semantic-contracts.md) when implementing or
  reviewing an ID, media/resource type or enum lookup. It records exact source evidence,
  per-type exceptions and contracts a broad immutability rule would otherwise overwrite.
- Read [executable examples](references/java-example.md) when implementing the ID pattern
  or writing value-object tests. It explains how to compile the complete production
  assets with the existing JUnit examples and states their remaining prerequisites.

The following assets are complete source files from the same domain module at commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`, not abbreviated snippets. Read only the row
needed for the task, together with the shared bases or utility it imports. Shared files
live in java-ddd; this package contains one copy of each of its 12 production types.

| When working on                                              | Complete source                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shared value/identifier hierarchy or generated ID format | [ValueObject](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java), [Identifier](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java), [IdUtils](../java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/utils/IdUtils.java) |
| Category identifiers                                         | [CategoryID](assets/java/CategoryID.java)                                                                                                                                                                                                                                                                                               |
| Cast member identifiers and role constants                   | [CastMemberID](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberID.java), [CastMemberType](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberType.java)                                                                                                      |
| Genre identifiers                                            | [GenreID](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreID.java)                                                                                                                                                                                                                                         |
| Video identifiers and their case rule                        | [VideoID](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoID.java)                                                                                                                                                                                                                                         |
| Media construction, equality and encoding replacements       | [AudioVideoMedia](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/AudioVideoMedia.java), [ImageMedia](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/ImageMedia.java), [MediaStatus](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/MediaStatus.java)         |
| Resource bytes and wrapper ownership                         | [Resource](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/Resource.java), [VideoResource](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoResource.java)                                                                                                                          |
| Rating labels or media-type lookup                           | [Rating](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/Rating.java), [VideoMediaType](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoMediaType.java)                                                                                                                            |

If java-ddd is not available beside this skill, locate its matching source assets or use
the supplied domain checkout for those imports. The optional suggestion does not install
the shared files automatically. Keep the packages and signatures when assembling the
sources; do not compile an asset and the checkout's duplicate class together.

## Completion

Show the chosen reference type/path, implementation or concrete findings, tests actually
run and any unresolved rule. Confirm constructor/factory compatibility, per-type input
handling, matching equality/hash behavior and the actual ownership of mutable state.
Do not report `Resource` as deeply immutable or every subclass of `ValueObject` as
having structural equality. Source compatibility checks and executed domain tests do
not establish that an agent using the skill will make every intended decision.
