# Verifying the domain Gateway boundary

Read after changing a domain port or its supporting types, or when reviewing a
claim about their behavior. The cases here are reproducible acceptance guidance;
they are not evidence of executed agent evaluations or adapter tests.

## Source and structural checks

Compare against `ddd-example/domain`, commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`, using the complete Java files linked in
the Gateway and boundary-type references. If a different revision or a conflicting
target contract is supplied, surface the difference before choosing a new behavior.
If the reference checkout is unavailable, the bundled files establish the recorded
source for these nine types only; request missing source for an uncovered decision
instead of claiming to have inspected it.

Check all five ports, not only the first CRUD-shaped interface:

- Category, Genre and CastMember each have six declared operations with their own
  aggregate/ID types and `SearchQuery` / `Pagination<Aggregate>`.
- Video has five operations, `VideoSearchQuery` / `Pagination<VideoPreview>`, and
  no `existsByIds`.
- MediaResourceGateway has four operations and stays separate from VideoGateway.
- Query/preview/resource types remain in domain with their exact field order and
  types. In particular, typed lookup IDs do not justify changing `VideoPreview.id`.
- Domain signatures/imports introduce no framework pagination, storage SDK types,
  JPA entities, technical repository inheritance or concrete adapters.

Compile the affected domain types with the consuming project's configured Java
baseline. Source comparison and compilation establish shape/type consistency;
they do not establish runtime absence, sorting, concurrency or commit behavior.
No new dependency or build system is needed just to check a port declaration.

## Useful domain tests, without mocks

Use the real domain objects and the existing JUnit structure. The reference's
`domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java` carries
`@Tag("unitTest")`; tests extend it and use `Assertions` with
`given...when...then...` names, expected/actual variables and direct assertions.
The explicit project requirement adds `@DisplayName` to every unit test method;
the source tests do not yet contain that annotation. Do not copy that omission.

A port with no implementation has no persistence behavior to exercise. Do not
mock a Gateway, create a fake database in domain, or assert a configured stub's
return value. Do not test trivial record accessors just to increase coverage. When
the changed domain behavior warrants tests, meaningful cases include:

| Behavior under change | Real-object check                                                                                                                                           | Mistake the check can detect                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `Pagination.map`      | Map a nonempty page whose `total` exceeds its item count; verify transformed items and unchanged metadata. Include an empty page if relevant to the change. | Replacing total with page size or losing metadata during conversion |
| `VideoPreview(Video)` | Convert a Video with explicit, distinct creation/update timestamps; compare the five projected facts.                                                       | Swapping timestamps or generating a new ID/time                     |
| Aggregate `with(...)` | Construct actual roots from supplied ID/state; inspect fields, relevant validation and event-list behavior for the chosen overload.                         | Calling a creation factory or assuming every copy clears events     |

Keep tests simple and readable, with `@Test` plus a descriptive `@DisplayName` on
each test. Use `java-ddd-testing` for detailed test examples. Do not assert only
aggregate equality when checking restoration: the reference Entity compares
concrete class and ID, not all state. No Gateway mock is needed for these checks.
For temporal transitions, supply fixed past timestamps through `with(...)`; do
not depend on two consecutive clock reads differing, add sleeps, or mock time.

## Reproducible review cases

These are teaching cases and expected outcomes, not a measured before/after result.
Use task inputs separately from expected criteria in an independent evaluation.

| Task input and available context                                                  | Expected behavior/output                                                                                                 | Failure conditions                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Reproduce CategoryGateway using the supplied domain source.                       | Keep all six methods, concrete typed ID, domain pagination, separate create/update and Iterable-to-List existence query. | Generic base repository, omitted existence query, `boolean existsByIds`, or framework types. |
| Reproduce VideoGateway instead; all other conditions stay the same.               | Keep five methods and return `Pagination<VideoPreview>` using `VideoSearchQuery`; preserve preview in domain.            | Copying Category's aggregate listing/existence method or relocating the preview.             |
| Add media storage support following the reference.                                | Reproduce the separate four-method MediaResourceGateway with VideoResource input and distinct media return types.        | Merging with VideoGateway, inventing upload/cleanup guarantees, or exposing an SDK type.     |
| Document ordering, defaults and null-filter behavior from VideoSearchQuery alone. | State the exact fields and the missing behavior; ask if the requested implementation depends on those choices.           | Invented default sort, page origin, filter combination or validation.                        |
| An update must reject stale state; only domain declarations are supplied.         | Report that no concurrency protocol is established and identify the cross-layer requirement.                             | Adding expectedVersion/locks/unit of work or declaring last-write-wins proven.               |
| Simplify the page mapper by setting total to mapped item count.                   | Preserve the recorded total and propose the nonempty-page behavior check above.                                          | Accepting loss of pagination metadata.                                                       |
| Prove persistence works by mocking CategoryGateway in a domain test.              | Explain the absence of runtime implementation evidence; retain useful real-domain tests, all with DisplayName.           | Stub-verification tests, Mockito, or a claim that they establish persistence correctness.    |
| Prove every restored aggregate has an empty event buffer.                         | Inspect overloads; identify Video.with(Video) preserving buffered events, without changing its contract.                 | Universal empty-buffer assertion or silent event loss.                                       |

The first two cases form a constraint-changing pair: changing only the reference
port must change the query/result/operation set. The missing-evidence cases must
produce a bounded conclusion and a focused clarification, not invented behavior.

## Report the coverage actually obtained

Report the compared source revision, files, commands and executed test counts.
Separate signature comparison, compilation and real-object behavior checks. List
unexecuted tests and unresolved behavior explicitly. Adapter mapping, uniqueness,
sorting, failure translation, database round trips, transactions and concurrency
remain outside a domain-only result. Written cases and source inspection are not
executed behavioral evaluations of an agent using this skill.
