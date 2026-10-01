---
name: java-ddd-use-cases
description: >-
  Implement or review Java DDD application use cases when commands, aggregate
  orchestration, authorization and commit outcomes are mixed. Preserve action-based
  packages, UseCase/DefaultUseCase contracts and framework-independent commands and
  outputs; distinguish creation, absence, concurrency and replay. Excludes deciding
  whether a service layer is needed, strategic context design and Spring or ORM
  configuration mechanics.
---

# Java DDD Use Cases

Implement one business action as a framework-independent application operation.
The use case obtains facts, checks the actor's authority, invokes domain behavior
and coordinates the required outcome. It must not become the only place that knows
what makes an aggregate valid. Its callers may be HTTP, a message consumer, a job
or another local adapter.

Use this skill once a domain model and an application boundary are intended. For
deciding whether that boundary is warranted, use `service-layer-design`. For an
architectural migration or source-dependency repair across layers, use
`spring-boot-clean-architecture`. Neither DDD nor this skill requires CQRS,
microservices, a command bus or one interface per class.

## Establish the action and existing conventions

Trace one actual action from entrypoint to commit, including failure mapping and
non-HTTP callers. Inspect the build's Java release/toolchain, modules, a neighboring
use case, domain port, composition root and tests. Record the business precondition,
trusted actor and tenant, returned outcome and resources that must commit together.
Identify whether success means committed state or durable acceptance for later work.

In this architectural family, the naming shape is:

```text
application/UseCase.java
application/order/submit/SubmitOrderUseCase.java
application/order/submit/DefaultSubmitOrderUseCase.java
application/order/submit/SubmitOrderCommand.java
application/order/submit/SubmitOrderOutput.java
domain/order/Order.java
domain/order/OrderGateway.java
```

`order` represents the existing context/package vocabulary, not proof of a bounded
context. The inspected catalog reference uses `application.category.create`,
`application.castmember.create` and `application.category.retrieve.list`, with
`<Action>Command.with(...)` and `<Action>Output.from(...)`. The installed foundation
also illustrates `<Action>CommandOutput`; preserve the target's established suffix.
Retain its `application.<context>.<action>` arrangement; do not
move unrelated packages to manufacture conformance. The family uses `execute(command)`,
constructor injection, final dependencies and final method/constructor parameters.
Inspect existing nullability annotations, validation and errors before choosing
equivalents. Do not add JSpecify or another dependency solely for an example.

The conventional contract can be `sealed abstract SubmitOrderUseCase extends
UseCase<SubmitOrderCommand, SubmitOrderOutput> permits DefaultSubmitOrderUseCase`.
Preserve an observed `sealed`/`non-sealed`/`final` policy; retain a suitable plain
interface or concrete class when that is the project's existing boundary. Before
changing modifiers, inspect proxying, decorators and test substitution. A sealed
contract does not permit arbitrary direct decorators; a final implementation cannot
be subclassed. Naming consistency is not a reason to build a new inheritance tree.
The reference's cast-member operations use sealed contracts with non-sealed defaults;
its category operations use plain abstract contracts and implementations. It also
has `UnitUseCase<IN>` for no output and `NullaryUseCase<OUT>` for no input. Reuse these
only when the operation actually needs them; do not invent dummy commands/results.
The worked example uses Java 17 syntax without preview features; this is an example
baseline, not an instruction to upgrade the target.

Separate verified project facts from this family's reference conventions. Inspect
the target itself before generalizing from a reference example. Missing business rules are not
permission to invent creation, authorization or commit semantics. Continue the
work whose requirements are known; clarify only consequential gaps.

## Design the operation's contract

1. **Name the intent and its failure cases.** `SubmitOrder` and `CreateOrder` express
   different actions. An absent order during submission is an absence outcome;
   `orElseGet(Order::create)` silently changes the business operation. Introduce
   create-or-submit only when the domain contract explicitly requires it, including
   identity allocation and race behavior.
2. **Keep inner contracts independent.** Commands carry use-case inputs; output
   records describe the result. They do not carry HTTP requests, Spring Security
   principals, JPA entities, lazy proxies or Spring Data pagination types. Map those
   outside the core. Reuse an existing DTO if its vocabulary, ownership and change
   contract match; do not duplicate it merely to have two class names. Domain value
   objects can be input types when local callers can honor that contract; otherwise
   parse them at the application boundary.
3. **Separate three kinds of decisions.** Protocol validation belongs at the
   transport boundary; application decisions control access and sequencing for this
   action; invariants and business state transitions belong to the domain. An
   aggregate's `submit()` checks whether submission is legal, regardless of caller.
   The use case must not calculate a new status and bypass behavior through setters.
   Business authorization rules may live in a domain policy; application orchestration
   obtains the trusted facts and ensures that policy is invoked.
4. **Choose explicit absence and failure semantics.** Use the project's typed result
   or typed exception convention. Expected rejections can be results, while existing
   typed exceptions can also be a deliberate boundary contract. Do not use `null`,
   `Optional.empty()` or a generic catch to conflate absence, denial, conflict and
   infrastructure failure. Preserve externally promised non-disclosure of resource
   existence. HTTP status mapping belongs to the adapter.
   The reference uses `Either<Notification, Output>` for categories and exceptions
   for cast members; neither is a universal rule. Preserve applicable semantics and
   do not copy a broad persistence-exception catch into a domain-validation result.
5. **Keep invocation state local.** A shared use-case instance must not retain the
   current command, actor, tenant or loaded aggregate in fields. Immutable commands
   need defensive copies for mutable members; `record` alone is only shallowly
   immutable. Outputs must not expose mutable aggregate state.

When implementing or reviewing these class contracts, read the
[submission slice](references/submission-slice.md). It explains absence, a trusted
actor source, a domain-owned gateway and the distinction between an output and a
durable result.

## Orchestrate without losing the business guarantee

Use a domain-owned `OrderGateway` for aggregate persistence in this family. An
application service may call a domain repository port named `OrderRepository` in a
project that uses that vocabulary; the prohibited dependency is the infrastructure
implementation or Spring Data interface. A change of noun establishes no boundary.

Obtain identity from a trusted adapter/context, never from the request's claimed
roles or tenant ownership. Enforce tenant scope on access and persistence, and
resource-level permission before mutation. Jobs and consumers need an explicit
service actor and scope; bypassing HTTP must not bypass application policy. If
authorization depends on mutable facts, include them in the relevant consistency
contract instead of trusting a stale preflight check.

Define the business unit of work first. Compose its transaction outside pure domain
and application code, with no Spring/JPA/HTTP imports in either. The outer wrapper
must enclose all required writes, expose success only after commit, and be the path
used by every relevant caller. An annotation, an invoked `save`, or a returned record
does not prove a transaction committed. A wrapper joining an existing transaction
cannot promise durability before that transaction completes. If returning a failure
value after writes, ensure those writes cannot accidentally commit. Distinguish
confirmed rollback, uncertain completion and failure after a successful commit;
an exception alone does not establish that the business change was undone.

Require storage-enforced conflict detection when two submissions can race; a read
followed by an in-memory version comparison is insufficient. A conflict is not
permission to blindly repeat a stale user's intent. If retries or duplicate delivery
are in scope, bind the operation identity to actor/tenant, action and request
semantics, then coordinate the deduplication record with the business change.
Idempotency does not replace the invariant or concurrency control.

For repeated requests, multi-write operations, events or transaction wrapper changes,
read [atomic outcomes and failure cases](references/atomic-outcomes.md). Do not
claim a local transaction covers remote calls. Preserve an explicit outcome for
commit success followed by response loss or publication failure.

For a read-only query, use an application-owned projection port when it answers the
question directly. It need not hydrate an aggregate or introduce a command bus.
Specify access scope, ordering, paging and acceptable staleness; a projection's
earlier answer cannot authorize a later invariant-sensitive write. Avoid recursively
calling public use cases to share a few lines: extract the appropriate domain policy
or internal application collaborator, keeping one explicit authorization and
transaction boundary for the composed action.

## Complete the slice and verify the claim

Implement the operation, its domain call, port contract, outer wiring, caller mapping
and affected tests as one slice. Preserve compatible serialized fields and public
errors unless the requested change includes them. Do not add adapters or a global
refactor to satisfy an illustrative package tree.

Select checks that discriminate the actual risk:

- Domain tests prove rejection leaves a valid state; application tests prove absence,
  denial and conflict do not become create/save success, and each caller supplies
  trusted context. Include a foreign-tenant identifier and forged identity payload
  when changing access enforcement.
- Application tests use domain objects and controlled ports without starting Spring.
  They assert outcomes and meaningful forbidden side effects, not every incidental
  call order. Fakes must not leak live aggregate references that persist mutations
  before `save` succeeds.
- Composition/integration tests exercise the real caller-to-wrapper path, rollback,
  deferred commit failure and concurrent writes for affected guarantees. A mock
  gateway cannot prove transaction interception or database isolation.
- Boundary checks cover production imports and signature types, select nonempty
  packages and detect a known forbidden dependency. Package names alone are no proof.

For model boundaries, optionally use `java-ddd-aggregates` and
`java-ddd-value-objects`; use `java-ddd-domain-services` for a policy that fits no
entity/value object. `java-ddd-repositories` owns persistence contracts,
`java-ddd-domain-events` owns event meaning and lifecycle, and `java-ddd-testing`
owns broader test design. For an uncertain context boundary, return to `java-ddd`.
Use `spring-transactions-and-events` for actual Spring interception and
`idempotency` for a distributed deduplication protocol. These are optional handoffs;
the core workflow here remains usable when they are unavailable.

Report the implemented action and boundary, relevant failure/commit guarantees,
checks executed and remaining evidence gaps. A review supplies concrete findings
and discriminating checks; it may conclude the existing design is adequate. A code
sketch or passing unit test does not establish production atomicity, performance or
measured improvement in agent behavior.

The application-boundary concept follows the
[Service Layer entry in Fowler's catalog](https://martinfowler.com/eaaCatalog/serviceLayer.html).
The model's independence from application tasks follows Evans's
[DDD Reference, Layered Architecture and Repositories](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf).
The class names, command/output shape and framework-free application boundary are
this family's implementation choices; those sources do not prescribe them.
