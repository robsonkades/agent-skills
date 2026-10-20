---
name: java-ddd
description: >-
  Implement or review a Java DDD domain layer using the ddd-example domain module as
  the sole technical reference. Use when a capability spans aggregate organization,
  Entity, AggregateRoot, ValueObject, Identifier, validation, exceptions, utilities,
  Gateways, events and domain tests. Resolve missing business rules before coding;
  application orchestration, persistence adapters and HTTP contracts have separate owners.
---

# Java DDD

Translate confirmed business examples into domain code following the reference's
actual contracts. This skill owns the common domain foundation and coordinates the
specialists. It does not replace a domain task with an application or infrastructure slice.

For the common bases, use the complete source files:
[AggregateRoot.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/AggregateRoot.java),
[Entity.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Entity.java),
[Identifier.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/Identifier.java)
and [ValueObject.java](assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain/ValueObject.java).
When an implementation or one of its imported types is needed, read the
[domain source index](references/source-index.md). It maps all 49 production types to
one complete source file each in this hub or its required specialists, including the
exceptions and utilities owned here. Read the affected contracts before adapting them;
the individual files depend on other indexed types and are not isolated snippets.

## Reference and scope

The sole technical authority is the current user-designated `ddd-example/domain`
module. The bundled references capture the inspected revision and its source paths;
they are portable instructions, not a requirement for a Windows directory to exist.
Do not substitute an older `ddd-example-master` checkout, installed foundation,
external DDD prescription or a preferred implementation style.

Use the user's business vocabulary with the reference's implementation shape. A new
business rule, ownership boundary or choice between its different aggregate families
needs evidence. Inspect the available source and requirements first; ask a focused
question when that evidence does not resolve a consequential choice. Do not silently
turn an unknown into a rule. Continue independent work whose contract is established.

For package placement, shared base types, exceptions or utilities, read
[reference conventions](references/project-conventions.md). For a new capability,
conflicting requirements or a missing reference family, read
[modeling decisions](references/modeling-decisions.md).

## Establish the implementation contract

1. **Read the affected family and its tests.** Identify the operation, accepted and
   rejected inputs, current state, identity, lifecycle and expected result. Reuse
   explicit business examples; an existing table or field name cannot supply an
   unmentioned business rule. Record the exact reference types/methods being followed.
2. **Check the target's compatibility.** Inspect compiler settings, toolchain,
   dependencies and test configuration. The source uses Java 17-compatible constructs;
   its `buildSrc` targets Java 17, while the shared Java conventions do not explicitly
   fix the domain compiler release/toolchain. Do not infer that setting or upgrade
   Java, Gradle or dependencies. No Spring, JPA or validation-framework annotations
   appear in the reference domain production code.
3. **Map the domain package.** Keep the common base types directly under `domain`,
   aggregate families under `domain.<aggregate>`, and shared validation, exceptions,
   events, pagination and utilities in their named packages. Colocate a root with
   its `<Root>ID`, `<Root>Gateway`, `<Root>Validator` and relevant domain types.
   Reuse existing matching base contracts; do not create a parallel base hierarchy.
4. **Preserve the selected contract.** Keep factory names, constructor visibility,
   equality, failure types/messages, validation timing, copying and fluent return
   behavior from that family. Creation and `with(...)` reconstruction are different
   operations. Reconstruction restores identity and lifecycle data instead of
   generating them again. Do not normalize the source's deliberate or observed
   differences without an explicit request to change the contract.
5. **Implement and verify the domain behavior.** Check the actual transition and
   rejection result, including state after failure. Domain tests use real domain
   objects and no mocks, spies or Mockito. Every unit test method must have a meaningful
   `@DisplayName`, including parameterized tests when used. This display-name rule is
   an explicit user requirement in addition to the source, whose existing tests omit it.
   Keep tests simple, behavior-focused and readable; do not add getter/class-existence
   checks solely to increase a test count. For temporal transitions, initialize fixed
   past timestamps through an existing `with(...)` factory; do not use sleeps or mocks
   to force the clock forward. This is also an explicit user testing requirement.

## Contracts that must remain visible

- `ValueObject` is an empty abstract base. `Identifier` extends it and declares
  `String getValue()`. Neither base supplies automatic value equality, immutability
  or validation. Follow each concrete type's implementation.
- `Entity<ID extends Identifier>` owns a non-null, `protected final ID id`, abstract
  `validate(ValidationHandler)`, runtime-class-and-ID equality and recorded events.
  `AggregateRoot<ID extends Identifier>` adds only forwarding constructors.
- `Category` and `Video` expose explicit `validate(handler)`; their constructors and
  updates do not call it. `CastMember` and `Genre` call `selfValidate()` in construction
  and after updating fields. A failed update does not imply rollback. Preserve the
  relevant family's validation path instead of making every root reject at creation.
- An unmodifiable view is not a defensive snapshot. The source has live views,
  copied collections, aliased collections and mutable resource bytes. Preserve the
  actual method's behavior; do not promise deep immutability or add copying by habit.
- Use the reference exception hierarchy and `validation.Error` contracts. Do not
  translate a domain error into an HTTP status, introduce error codes, or replace
  `Notification` with Bean Validation as part of this domain implementation.
- Gateways are domain interfaces, and events are recorded domain facts. Their presence
  does not establish persistence, commit timing, message delivery or thread safety.
  Keep those claims outside the evidence this module supplies.

## Load the specialist for the affected decision

| Domain work                                                                           | Specialist                 |
| ------------------------------------------------------------------------------------- | -------------------------- |
| Root organization, lifecycle, associations, creation/reconstruction and copy behavior | `java-ddd-aggregates`      |
| Concrete value types, `<Root>ID`, factories, equality and resource ownership          | `java-ddd-value-objects`   |
| Validators, handlers, notifications and placement of domain behavior                  | `java-ddd-domain-services` |
| `<Root>Gateway`, media ports, search and pagination contracts                         | `java-ddd-repositories`    |
| `DomainEvent`, publisher, registration and event-list lifecycle                       | `java-ddd-domain-events`   |
| Simple domain unit tests, real objects, `@DisplayName` and useful assertions          | `java-ddd-testing`         |

These six domain specialists install alongside this hub; read only the ones required
by the affected contracts. `java-ddd-use-cases` owns a separately requested application
operation. Spring composition and adapters belong to `spring-boot-clean-architecture`
or `spring-boot-hexagonal-architecture`. `bounded-context-design` and
`domain-logic-organization` can support a separately requested architecture discussion;
they do not override this domain implementation reference.

## Make the result reviewable

Match the requested mode. A review identifies the mismatched contract, source evidence,
consequence and correction. A design identifies the domain types, reference family and
unresolved business questions. An implementation delivers the requested domain code and
meaningful tests. A short change report should name the behavior, owning type, relevant
reference, checks actually run and any unresolved requirement.

Distinguish source observations from user additions and proposed changes. If a requested
guarantee contradicts the reference, explain the exact conflict and ask before changing
that guarantee. Do not modify the reference repository merely because it was consulted.
Compilation and source comparison do not establish production concurrency or measured
skill improvement; report only the validation performed.
