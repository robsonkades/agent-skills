---
name: service-layer-design
description: >-
  Organizing and reviewing the Java APPLICATION layer exactly as demonstrated by
  ddd-example/application: aggregate/action packages, independent use-case base classes,
  abstract action contracts and Default implementations, command/output records, and
  domain gateway dependencies. Use when locating or adding an application action,
  reviewing its boundary, or reproducing the reference organization. Preserve the
  reference's technical and organizational choices; ask about missing patterns instead
  of supplying another service architecture. Detailed action behavior and tests belong
  to java-ddd-use-cases; controllers, adapters, transactions and authorization are outside
  this reference's demonstrated application scope.
---

# Service Layer Design

## Purpose and authority

Organize, design and review the application boundary using only the demonstrated
`ddd-example/application` model. Its patterns are normative for this skill because
the project explicitly selected fidelity to that reference. This is not a choice among
generic service-layer styles.

The source snapshot and build evidence are recorded in
[service boundaries](references/service-boundaries.md). The original location is
`C:/git/ddd-example/application`; installed users need not have that workstation path.
Use the supplied support assets and the source-backed organization map for the patterns
they cover. For a new behavior or missing contract, inspect the user-provided reference
or ask for the missing source/decision. Do not complete a gap with a familiar DDD pattern.

This skill owns package organization, base types and responsibility boundaries.
`java-ddd-use-cases` owns the exact action signatures, command/output fields, execution
order, errors, media flows and action tests. Consult it when implementing or reviewing
those details. Domain internals remain a separate concern: application code calls the
existing domain API and consumes its gateways.

## Non-negotiable shape

- Packages group by aggregate and then action: `category`, `castmember`, `genre`,
  `video`; actions include `create`, `update`, `delete`, `retrieve/get`,
  `retrieve/list`, and the three video `media` actions. Preserve these nested paths.
- `UseCase<IN, OUT>`, `UnitUseCase<IN>` and `NullaryUseCase<OUT>` are three
  **independent abstract classes** at the application root. Their methods are respectively
  `OUT execute(IN anIn)`, `void execute(IN anIn)` and `OUT execute()`.
  Do not replace them with interfaces or derive the latter two from `UseCase` with
  `Void`. No reference action extends `NullaryUseCase`; keep the base without inventing one.
- Each action has a typed abstract `...UseCase` and a concrete `Default...UseCase`
  in the same action package. All five cast-member contracts are `sealed`, permit
  their matching default implementation, and their defaults are `non-sealed`.
  Category, genre and video use ordinary abstract contracts and ordinary concrete classes.
- Commands and outputs live beside the action, as records with the demonstrated
  `with`/`from` factories. Do not create command/output records where the reference
  accepts a string/search query or returns `void`. Preserve actual domain types in
  signatures; the reference does not impose a primitives-only application API.
- Defaults receive domain gateway collaborators through public constructors, store them
  in `private final` fields, and apply `Objects.requireNonNull`. Commands, aggregates,
  notifications and derived values stay local to `execute` or its helpers.
  Actions do not inject or call other application use cases.
- Simple delete and list actions are intentional boundaries. Preserve their action
  contracts even when execution is one gateway call plus ID/output mapping. Do not
  collapse them into a generic CRUD service or bypass them because they are short.
- The application sources contain no Spring stereotypes, transaction/security
  annotations, controllers, persistence adapters, event publishers or outbox machinery.
  Do not introduce those responsibilities, an injected clock, a generic handler bus,
  builders or another service architecture as part of reference reproduction.

The reference baseline uses Java 17 language features. Inspect the target build before
applying the assets; do not silently upgrade a target that cannot compile them. See
[build evidence and limits](references/service-boundaries.md#build-evidence-and-limits)
for the distinction between the observed build settings and an application toolchain.

## Workflow

1. Identify the requested aggregate and action. Read the matching row in the
   [organization map](references/application-organization.md); use it to locate the
   abstract contract, default, records and test suite.
2. Inspect those actual files, their base class, imported domain contracts and the
   target build. Preserve differences between action families instead of normalizing
   all errors, identifiers, modifiers or factory names.
3. Assign responsibilities using
   [service boundaries](references/service-boundaries.md#responsibilities-visible-in-the-source):
   the default orchestrates the demonstrated calls, the domain owns the called domain
   operations, and the records expose the action's input/output shape. Keep domain
   gateway declarations in their existing domain ownership; do not introduce a
   second application gateway or a concrete adapter dependency.
4. For implementation, use the matching source action and the detailed recipes in
   `java-ddd-use-cases`. Reuse the support assets below only when those types are
   needed. Preserve `with`/`from` factories and existing domain call chains rather
   than designing an alternate fluent API.
5. Check the resulting package/class signatures and dependency direction against the
   source. Compile changed Java with the target's declared baseline and run the
   relevant action tests when code changes. A package move or boundary review must
   not silently change validation, error propagation, gateway order or media cleanup.

If the source does not demonstrate a requested pattern, state the specific gap and ask
for its source or explicit rule before implementing that part. Continue independent
work whose contract is already known. Multiple gateway calls do not establish a shared
transaction or global atomicity; do not promise either from this module.

## Tests and support assets

Application tests preserve Mockito: `UseCaseTest`, `@ExtendWith(MockitoExtension.class)`,
`@Tag("unitTest")`, `@Mock`, `@InjectMocks`, focused stubbing and meaningful outcome/
interaction assertions. The project's no-mocks rule applies to DOMAIN tests, not these
application tests.

Every applied unit test must have a descriptive `@DisplayName`; this is an explicit
project requirement added to the source convention, whose original 103 tests lack it.
Keep tests simple and behavior-focused. For temporal comparisons, use the approved fixed
historical dates through existing reconstruction factories; do not add sleeps, mock
clocks or production changes to make the tests pass. Detailed fixtures and test recipes
live in `java-ddd-use-cases`.

When establishing the application root, inspect and reuse these complete Java source
assets, preserving their signatures and adapting the package prefix only when the target
requires it:

- [UseCase.java](assets/application/src/main/java/com/robsonkades/admin/catalogo/application/UseCase.java)
  — input plus output base.
- [UnitUseCase.java](assets/application/src/main/java/com/robsonkades/admin/catalogo/application/UnitUseCase.java)
  — input plus `void` base.
- [NullaryUseCase.java](assets/application/src/main/java/com/robsonkades/admin/catalogo/application/NullaryUseCase.java)
  — no-input base; no action implementation is demonstrated.
- [UseCaseTest.java](assets/application/src/test/java/com/robsonkades/admin/catalogo/application/UseCaseTest.java)
  — read when adding action tests; preserves the Mockito extension, unit tag,
  `getMocks()` contract and identifier conversion helpers.

The three main assets compile without external dependencies. The test support requires
the existing domain `Identifier`, JUnit Jupiter and Mockito dependencies; it is not a
standalone test suite. It preserves the source's `BeforeEachCallback` method; do not
claim that this method is invoked merely because the test base implements the interface.
The declared extension is `MockitoExtension`. Inspect actual lifecycle evidence before
relying on reset behavior.

## Deliverable

For an organization review, report the affected package/action, source evidence, preserved
contracts and any concrete mismatch. For an implementation, include the focused change
and executed compile/test results. State unavailable evidence and unresolved patterns;
do not present a structural match or passing unit test as proof of adapter behavior,
transactional atomicity or measured improvement.
