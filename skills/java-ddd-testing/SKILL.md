---
name: java-ddd-testing
description: >-
  Write and review Java DDD domain unit tests following the ddd-example domain
  reference: real aggregates and values, validation handlers, typed IDs, exceptions,
  utilities and local domain events. Use when adding a domain behavior test, checking
  validation timing or reviewing assertions that may miss a domain defect. Requires
  no mocks and @DisplayName on every unit test. Does not implement application,
  persistence, Spring or message-delivery tests.
---

# Java DDD Testing

## Scope and authority

Test observable behavior inside the domain layer. The sole technical reference for
this skill is the current `C:/git/ddd-example/domain` source and tests. Read the
relevant production type and its tests before deriving an expectation. The source
map in [Behavioral checks](references/behavioral-checks.md) records the inspected
revision and its important variations; recheck the working tree when applying it.

Use real domain objects. **No mocks, spies, Mockito extensions, static mocking or
mocked gateways belong in these domain tests. Every unit test method must declare
`@DisplayName` with a clear description of its behavior.** The reference uses no
mocks in its domain tests, but does not yet use `@DisplayName`; the latter is an
explicit user requirement added to the reference conventions. Mockito in shared
build dependencies does not authorize using it here.

Use this skill to implement tests or review their evidence. For a findings-only
request, report findings and proposed checks without editing application code.
Do not change production behavior merely to satisfy an invented test expectation.

## Establish the test contract

1. Inspect the selected domain type, factory overload, validator, error type and
   existing tests. Identify the rule, inputs and observable result. Do not invent
   validation, normalization, uniqueness, idempotency or delivery requirements.
2. Inspect `domain/build.gradle`, the shared convention, runner and filters. The
   reference declares JUnit Jupiter API/engine 5.9.2 and a `unitTest` tag through
   `UnitTest`. Its Gradle wrapper is 7.6; `buildSrc` selects Java 17 for itself,
   which alone does not declare a domain compiler release. Confirm the target
   toolchain; do not upgrade it or add dependencies to use these examples.
3. Mirror the production package under `domain/src/test/java`, extend the
   existing `UnitTest`, and follow `given..._when..._then/should...` names, `final`
   locals, `expected...`/`actual...` values and JUnit `Assertions`. Add the required
   method-level `@DisplayName`. Keep setup, action and assertions easy to locate.
4. If the reference has alternatives, select the matching one from evidence.
   If the target's intended contract is absent or conflicts with the reference,
   ask a focused question; continue independent checks. Do not choose a familiar
   DDD convention as an unstated replacement.

## Match the enforcement boundary

| Subject                   | Test the actual behavior                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`, `Video`       | Create or update the real object, then call `validate(handler)`. Invalid input is not automatically rejected by the factory/update.                                                          |
| `Genre`, `CastMember`     | Construction and `update` call `selfValidate`; assert `NotificationException` and its errors at that call. Updates mutate before validation, so an exception does not prove unchanged state. |
| `ThrowsValidationHandler` | The first appended validation error throws `DomainException`; do not expect every independent error to accumulate.                                                                           |
| `Notification`            | Validate through the real handler and assert the accumulated `Error.message()` values. Do not invent error codes or fields.                                                                  |
| IDs and values            | Follow each concrete equality/null contract. `ValueObject` does not implement equality; media equality does not include all fields.                                                          |
| Local events              | Assert recorded event count, type and payload, or invoke the real entity publication method with a small observing lambda as in `EntityTest`. This proves local behavior only.               |

For exact source locations, boundary choices, collection/copy limitations, exceptions
and utility cases, read [Behavioral checks](references/behavioral-checks.md).
For complete source-compatible test examples with `@DisplayName`, read
[JUnit examples](references/examples.md) when writing or adapting a domain test.
When reproducing the reference test setup, use the complete
[UnitTest.java](assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java)
and [Fixture.java](assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/Fixture.java)
snapshots; their roles and dependencies are in the
[test-support prerequisites](references/examples.md#test-support-source-and-prerequisites).
Both are test-support classes without test methods. The optional `java-ddd` skill's
[domain source index](../java-ddd/references/source-index.md) locates all 49 production
source files shipped across the family; use it when assembling the examples without
the original checkout. These assets preserve the recorded source revision, not a
claim about a different target's current behavior.

## Make each test useful

- One scenario should expose one meaningful behavior: a valid result, a specific
  rejected input, a no-op, a copy boundary or an event trigger. Several assertions
  may be necessary to establish that result; a test per getter adds no such rule.
- Assert concrete changed and preserved fields, exact error counts/messages used
  by the reference, or event payloads. Entity equality checks identity and cannot
  establish that an update preserved the right state.
- Pair acceptance and rejection at actual boundaries. Null, blank and trimmed
  length are separate validator branches. Do not copy another aggregate's limits
  or add a positive-duration rule that `VideoValidator` does not contain.
- Capture immutable before-values, not an alias to the same mutable aggregate.
  Do not require rollback after `Genre.update` or `CastMember.update`: their source
  assigns state before throwing. Characterize it honestly and ask before changing
  that behavior.
- Prefer existing project fixtures or direct real-object construction for new tests.
  Reuse the reference `Fixture` for unrelated valid setup when it already fits the
  project, but pin every input that decides the expected result. Its Faker values
  are not fixed, and its copy methods do not establish universal deep-copy behavior.
- For update-time tests, reconstruct through the existing `with(...)` using fixed
  dates in the past; assert advancement from that old `updatedAt` and preservation
  of `createdAt`. This setup is an explicit user requirement. The source compares
  immediate wall-clock values, which need not differ. A no-op can instead assert
  an unchanged timestamp. Do not add sleeps, static mocks or a new `Clock`
  production API to make a domain test pass.
- Keep assertions on public behavior. No reflection, private-method verification,
  generic test framework or extra production getters solely for a test.

## Execute and report

Run the focused test command in the correct module with the supported toolchain,
then the requested domain suite. For this reference, the shared convention supplies
`:domain:unitTests` and `:domain:test`; inspect filters before using `--tests`.
Read discovered/executed counts, failures and skips. Zero executed tests, a compile
failure or a skipped test cannot establish the asserted behavior.

Review every added or changed unit test for `@DisplayName`, real domain construction
and an expectation that would detect the stated defect. Run the complete examples
when materially changing them; their prerequisites are in the example reference.
No coverage percentage or passing mocked interaction substitutes for the rule.

Report the behavior covered, files changed or findings, exact executed commands and
results, and unresolved gaps. Distinguish source inspection, executed code tests
and written evaluation scenarios. Use [Evaluation cases](references/evaluation-cases.md)
when reviewing the skill's decisions; written cases are not measured agent results.

## Boundaries and handoffs

Gateway interfaces live in the domain, but there is no implementation behavior to
prove by mocking them. Repository adapters, database round trips, transactions,
concurrency conflicts, application orchestration and broker/outbox durability need
their own authorized scope and evidence; they are not domain unit tests. See
[Persistence and delivery boundary](references/persistence-and-delivery.md) when
a request mixes these claims with a local domain test.

Compose with `java-ddd-aggregates`, `java-ddd-value-objects`,
`java-ddd-domain-events`, `java-ddd-domain-services` or `java-ddd-repositories`
for the corresponding model contract. `java-ddd` owns domain discovery. Hand off
application work to `java-ddd-use-cases` and framework tests to
`spring-boot-testing`; neither changes this skill's domain rules.
