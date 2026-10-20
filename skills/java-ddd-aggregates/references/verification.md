# Focused aggregate verification

Read when implementing or reviewing a lifecycle path. Select checks that can fail
for the behavioral change; do not reproduce every getter assertion or introduce a
test framework around an aggregate.

## Executable domain example

[AggregateLifecycleTest.java](../assets/AggregateLifecycleTest.java) is a complete
JUnit Jupiter test class against the reference domain classes and its `UnitTest`
base (`@Tag("unitTest")`). It uses real roots, typed IDs, events and handlers,
`given/when/then` method names, expected/actual variables and eight meaningful
`@DisplayName` annotations. There are no mocks, spies, Mockito calls, containers or
framework context. These tests characterize the source contract, including limits
that should not be silently changed during reproduction.

Use the class in an isolated test source set with the domain sources routed by the
[complete domain source index](../../java-ddd/references/source-index.md) and the
shipped [UnitTest.java](../../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java),
or adapt package names to a target that implements the same contracts. The index
covers all 49 production types across skills; this aggregate package alone cannot
compile the test. A compatible Java toolchain and JUnit Jupiter 5.9.2 with its test
runtime remain external prerequisites. The class is Java 17-compatible; keep the
target build's toolchain and do not add a separate build system or upgrade
dependencies just to run it.

The checks cover:

- Category external validation versus Genre construction-time validation.
- Deactivation preserving identity, creation time and the first deletion time.
- Genre's invalid update mutating state before reporting errors.
- Restored identity/timestamps and the full Genre factory's retained list.
- Genre's copy owning a separate list.
- Video creation retaining a set while its copy owns another set.
- Video copying pending events into an independent buffer.

The original reference tests do not declare `@DisplayName`; requiring it on every
new or revised domain unit test is the user's additional convention. The shared
reference build has a Mockito dependency for other modules; that is not evidence
of mock use or permission to use mocks in domain tests.

For an update-time assertion, reconstruct the aggregate with fixed old
`createdAt`/`updatedAt` values through `with(...)`, perform the transition, then
check that creation time is preserved and update time is after the supplied old
value. This user-approved test arrangement avoids assuming that two immediate
clock reads differ. Use no sleeps, polling or static clock mocks and do not change
production time handling to make the test pass.

Keep assertions at the observed validation point. Do not expect
`Category.newCategory(null, ...)` to throw from `CategoryValidator`, nor expect a
rejected Genre update to restore its previous state. A call returning `this`, an
unmodifiable accessor or a successful copy does not establish transactional rollback,
deep copying, concurrency safety or event delivery.

## Reproducible skill evaluation cases

These are teaching cases and expected outcomes, not executed behavioral evaluations
or measured improvements. Give an evaluator the request/context separately from
the expected-outcome columns. Keep model, tools and accessible sources comparable
if comparing original and revised skill behavior.

| Request and context                                                                                                                | Expected behavior and result                                                                                                               | Failure conditions                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Reproduce Category creation/update using the captured source; name may be null before explicit validation.                         | Private constructor, typed ID, external `validate`, correct factory/audit/lifecycle behavior; test invokes the real handler explicitly.    | Adds `selfValidate`, constructor name rejection or rollback without a requested contract change.                  |
| Same task, but the selected reference is Genre.                                                                                    | Protected constructor and constructor/update `selfValidate`; update assigns first; invalid construction throws `NotificationException`.    | Treats Genre like Category, or promises rejected updates preserve previous state.                                 |
| Review whether `Genre.with(fields)` and `Genre.with(existing)` both isolate their input collections.                               | Distinguishes retained input list from copy-owned list; proposes tests reflecting each observed path.                                      | Calls all factories defensive, changes ownership without authority, or treats an unmodifiable view as a snapshot. |
| Copy a Video with one pending event, then add another event to the copy.                                                           | Keeps both event values in the copy and only the original event in the source; distinguishes full reconstruction's empty buffer.           | Drops existing events or shares the mutable event list between the two roots.                                     |
| Implement a new aggregate with unspecified name rules and child-entity lifecycle; only these four roots are supplied as reference. | Identifies the missing rules and asks which existing lifecycle family applies; proceeds only with supported organization/foundation facts. | Invents limits, child ownership, new domain events or a universal lifecycle policy.                               |
| Prove concurrent database writes are safe by adding a root version and a mock repository test.                                     | Explains that this domain has no such protocol; keeps domain changes in scope and requests the needed persistence scope/evidence.          | Invents JPA or SQL behavior, adds framework annotations to the root, or claims a unit test proves isolation.      |

The first two cases form a pair: only the reference root changes, and therefore the
validation recommendation must change. The sources and executable cases cover
domain behavior; independent agent evaluation and repository-wide validation must
be reported separately.
