---
name: java-ddd-domain-services
description: >-
  Implement Java DDD behavior placement, named factories and validation following
  the ddd-example domain reference. Use when deciding where a domain rule belongs,
  implementing Validator and ValidationHandler, collecting Notification errors,
  or preserving validation timing during creation, restoration and update.
  Covers aggregate and value-object behavior without inventing domain services,
  policies or specifications; excludes application orchestration and infrastructure.
---

# Java DDD Domain Services

## Authority and scope

Follow the implementation in `ddd-example/domain` as this skill's sole technical
reference. The packaged guidance and Java assets record that contract at revision
`8d964ce4106c2299164e28980ae7553e2afbdc92`; the original checkout was
`C:\git\ddd-example\domain`. Its location is provenance, not a required install
path. Preserve the target project's base package while retaining the reference's
type relationships, method contracts and placement of behavior.

This reference has no dedicated domain-service, policy, specification or factory
class. Its domain behavior lives in aggregates, value objects, named static
factories and aggregate-specific validators. Do not create a service layer merely
because this skill is named domain services. This is the selected implementation
standard, not a universal prohibition on domain services in DDD. If a requested
operation has no evidenced counterpart, ask for its business contract and an
approved reference before introducing a new pattern. Do not fill the gap with
external DDD theory.

Keep this work inside the domain layer and its unit tests. Loading, saving,
transactions, remote calls and persistence mappings are separate work; the
domain-owned gateway signatures belong to `java-ddd-repositories`.

## Establish the specific contract

Inspect the affected aggregate or value object, its factories, validator,
validation handlers, exceptions and domain tests. Trace one accepted and one
rejected input through the actual entry point. Record the owner, rule, error
message, validation order and point at which failure becomes visible. A class
name alone does not establish its behavior.

Read the target project's Java release/toolchain and test dependencies. The
reference has Gradle 7.6, JUnit Jupiter 5.9.2 and Java 17 settings in `buildSrc`;
`domain/build.gradle` does not declare its own Java toolchain. Do not infer the
target module's release from that alone or upgrade dependencies to use the skill.
The examples require the reference domain types and the project's existing
JUnit setup; they introduce no new annotation library.

When creating a new aggregate, establish which demonstrated validation lifecycle
it follows. The source contains two distinct choices; if the request and target
code do not identify one, ask instead of selecting a universal default. Likewise,
source-specific lengths and messages do not establish rules for an unrelated
business concept.

## Keep behavior with the evidenced owner

| Responsibility                             | Reference implementation                                                             | Preserve                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Change aggregate state                     | `Category.activate/deactivate/update`, `Genre.addCategory`, `Video.updateVideoMedia` | Behavior stays on the root; fluent mutation methods return `this`                                         |
| Produce another value                      | `AudioVideoMedia.processing/completed`                                               | Return a new value object; do not move these operations into a media service                              |
| Create a new root                          | `newCategory`, `newGenre`, `newMember`, `newVideo`                                   | Static factory on the owning type; identity and initial lifecycle are established there                   |
| Restore or copy a root                     | Its actual `with(...)` overload                                                      | Preserve supplied identity and lifecycle; trace validation and copying in that overload                   |
| Check aggregate fields                     | `CategoryValidator`, `GenreValidator`, `CastMemberValidator`, `VideoValidator`       | A dedicated validator beside the aggregate, using the shared handler protocol                             |
| Reject missing required constructor values | Existing `Objects.requireNonNull` calls on IDs/media and selected base fields        | Keep their `NullPointerException` behavior; do not silently translate every rejection into a notification |

Use the reference's `domain.category`, `domain.castmember`, `domain.genre` and
`domain.video` organization as the pattern: root, ID, validator and gateway live
together. Shared validation types live in `domain.validation`; handlers live in
`domain.validation.handler`. Do not add a project-wide `services` bucket,
Spring `@Service`, Jakarta Bean Validation constraints, Lombok-generated setters
or ORM specifications to replace these mechanisms.

## Preserve validation timing

| Aggregate    | Named creation and `with(...)`                                                                              | `update(...)`                                                                     | Validation entry point                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Category`   | Constructor assigns fields and checks identity/timestamps; it does not invoke `CategoryValidator`           | Mutates and returns without field validation                                      | Caller invokes `validate(handler)`                                                        |
| `Video`      | Constructor assigns fields and delegates identity handling to its base; it does not invoke `VideoValidator` | Mutates and returns without field validation                                      | Caller invokes `validate(handler)`                                                        |
| `Genre`      | Constructor assigns fields, then invokes `selfValidate()`                                                   | Changes activation, name, categories and timestamp, then invokes `selfValidate()` | Fresh `Notification`, delegated validator, then `NotificationException` when errors exist |
| `CastMember` | Constructor assigns fields, then invokes `selfValidate()`                                                   | Assigns name, type and timestamp, then invokes `selfValidate()`                   | Fresh `Notification`, delegated validator, then `NotificationException` when errors exist |

`with(...)` does not universally bypass validation: `Genre` and `CastMember`
still run their constructors' checks. Conversely, adding constructor validation
to `Category` or `Video` changes the reference's contract. `Genre.activate`,
`deactivate` and category collection operations do not call `selfValidate()`.
Trace each method rather than assuming that all public mutations validate.

An exception from `Genre.update` or `CastMember.update` does not restore the old
in-memory state: assignments happen first. Do not promise atomic rejection or
silently reorder those operations. If preserving state on failure is required,
identify that as a requested contract change and resolve it with the user.

## Implement the validator protocol

Before implementing a validator, handler or lifecycle change, read
[Validation and factory contracts](references/validation-and-factories.md). It
contains the actual interfaces, handler differences, rule order, error messages,
source locations and examples.

Keep these constraints visible during implementation:

- `validate(handler)` constructs the aggregate's validator and calls its
  parameterless `validate()`. Validators inspect state; they do not mutate,
  normalize, load gateways or save anything.
- Append the domain `Error(String message)` through `ValidationHandler`. Preserve
  the original error text and ordering. Return from an individual field check
  after a null or blank failure; with `Notification`, subsequent independent
  field checks still run.
- Choose the actual handler contract: `Notification` accumulates; an append to
  `ThrowsValidationHandler` throws immediately. Do not turn both into an
  interchangeable exception-preserving wrapper.
- Allocate a new `Notification` for each independent validation. It is mutable,
  exposes its error list, and does not clear earlier errors when reused.
- Preserve `isBlank()` followed by `trim().length()` where present. Validation
  checks a trimmed length without storing a trimmed value. Do not invent checks
  for fields that the reference leaves unchecked.

## Complete Java implementations

When implementing or comparing validation code, open the relevant complete source
files below. They retain the original packages, visibility, error messages, field
order and exception handling; use them alongside the contract reference above.

- For the shared protocol: [Error.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Error.java),
  [ValidationHandler.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/ValidationHandler.java)
  and [Validator.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/Validator.java).
- For accumulated errors and callback failures:
  [Notification.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/Notification.java).
- For immediate rejection and its different callback catch contract:
  [ThrowsValidationHandler.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/validation/handler/ThrowsValidationHandler.java).
- For the aggregate being changed:
  [CategoryValidator.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/category/CategoryValidator.java),
  [CastMemberValidator.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/castmember/CastMemberValidator.java),
  [GenreValidator.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/genre/GenreValidator.java)
  or [VideoValidator.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/video/VideoValidator.java).

These are complete production source files, not a standalone module. The handlers
require `DomainException`; concrete validators require their aggregate types.
When assembling the source for compilation, use `java-ddd` for the complete base
types, exceptions and utilities, and `java-ddd-aggregates` for the roots and their
companion type routing.

## Verify domain behavior

Use real aggregates, value objects and handlers in simple unit tests. No mocks,
Mockito, Spring context, database or network. Every unit test added or changed
must have a meaningful `@DisplayName`, including tests copied from the reference.
The original tests lack that annotation; it is an explicit requirement of this
skill family, not a claim about the original files.

Exercise the boundary affected by the change: accepted input, null/blank/length
rejection, exact errors, accumulation versus first failure, or creation versus
explicit validation. Test restoration separately when it is affected. Assert
observable state and errors, not calls to private helpers. Do not create getter
tests merely to raise coverage. For the complete testing conventions use
`java-ddd-testing`; a focused executable example is in the routed reference.

Return the chosen owner, preserved lifecycle and changed files with executed
checks. For a review, distinguish findings from implemented fixes and allow a
supported no-change result. Report unresolved requirements and tests not run;
compilation does not prove business correctness or persistence atomicity.

## Related domain skills

Use `java-ddd` for base types, utilities and exception hierarchy;
`java-ddd-aggregates` for aggregate boundaries and copy/mutation contracts;
`java-ddd-value-objects` for value and identifier implementation;
`java-ddd-domain-events` for event registration and publication. These skills
compose around the same reference. Requests to implement application use cases
or infrastructure remain outside this domain-only scope.
