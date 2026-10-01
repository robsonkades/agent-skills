---
name: spring-boot-hexagonal-architecture
description: >-
  Implement or repair an agreed ports-and-adapters boundary in Java 25 and Spring
  Boot 4 applications. Use when one use case must serve multiple entry points,
  business rules leak into adapters, or external integration needs an application-owned
  contract. Owns port semantics, adapter substitution, Spring composition and boundary
  verification; excludes architecture-style selection, detailed MVC and ORM mechanics.
---

# Spring Boot Hexagonal Architecture

## Responsibility and activation

Make an agreed application boundary work through purposeful ports and substitutable
adapters. Apply when adding a second way to invoke an existing use case, isolating a
database or external client behind application requirements, repairing transport leakage,
or implementing a previously chosen hexagonal design. A direct application test can be
the second driving adapter; do not add a broker, scheduler or public endpoint to prove
that the architecture works.

The defining distinction is inside versus outside. A driving (primary) adapter calls an
application operation; a driven (secondary) adapter implements a capability the application
needs. Count conversations and responsibilities, not sides of a drawing or classes.
The pattern permits the same application to run through controlled test adapters and real
integrations; it does not prescribe its internal domain model or require six ports.
[Cockburn's original description](https://alistair.cockburn.us/hexagonal-architecture)
provides this distinction.

Initial architecture selection belongs to `layering-and-boundaries`; complex business-model
organization belongs to `domain-logic-organization`. A sound service with one straightforward
entry point may need only a local correction. MVC can be a driving adapter; it is not a
competing whole-system choice. Use `spring-boot-clean-architecture` when the primary issue
is allocating business policies and use-case/presentation responsibilities within the
chosen boundary. Do not impose DDD, CQRS, event sourcing, microservices or multiple build
modules as consequences of choosing ports and adapters.

## Establish the actual boundary

1. **Confirm scope and compatibility.** Preserve review, design and implementation modes.
   Read the target build, wrapper/toolchain, compiler release, resolved Boot/Framework
   versions, runtime image and relevant tests. Authoring baseline: **Java 25, Boot 4.x**;
   the executable fixture fixes **Boot 4.1.1** with no preview flags. A project's different
   baseline requires compatible guidance, not an implicit upgrade or build replacement.
   Inspect the [official Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html)
   for the actual release; the catalog baseline is not Boot's minimum requirement.
2. **Trace one real use case.** Follow every entry point, identity source, rule owner,
   side effect, transaction entry, data access and response. Inspect ADRs, package/module
   rules and public compatibility tests. Separate requirements from conventions and
   incidental implementation. A suffix such as `Port` does not establish ownership.
3. **Collect semantics that change the design.** Identify actors and authority, tenant or
   customer scope, invariants, completion guarantees, absence, conflicts, failure outcomes,
   lifecycle and time bounds. For persistence, inspect engine, schema constraints, version
   checks and transaction manager; for a remote dependency, inspect protocol, retry owner
   and whether timeout leaves the outcome unknown. Follow only relevant paths.
4. **State the permitted coupling.** If a framework-free core is required, enumerate its
   production packages and forbidden dependencies, including public signatures and generated
   sources. Otherwise preserve justified existing annotations or types. Direct unit testing
   without a container proves testability, not absence of compile-time framework dependencies.
5. **Resolve only material gaps.** Reuse existing evidence and authorization. Ask for an
   unavailable business rule or unknown completion/authorization policy if it changes the
   safe contract; continue independent work. Do not invent a retry guarantee, public access
   policy or database portability from a diagram.

When adding or changing a port, read [port contracts](references/port-contracts.md).
When moving wiring, transaction ownership or existing behavior across a boundary, read
[Spring composition and migration](references/spring-composition-and-migration.md).
When adapting the catalog DDD reference project or its naming/package conventions, read
[DDD reference alignment](references/ddd-reference-alignment.md) to map its actual
use-case, gateway and adapter contracts before applying the independent teaching fixture.

## Decide the smallest useful intervention

| Evidence                                                                                        | Decision and trade-off                                                                                                                                                                    | Observable check                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| One local correction; current boundary already preserves the use case                           | Retain the structure and fix its owner. Extra interfaces and mapping need a concrete consumer or isolation benefit.                                                                       | The affected contract passes without unrelated file moves.                                |
| HTTP and an import/job path repeat business rules                                               | Make both invoke the same application operation; keep format parsing in each adapter.                                                                                                     | The same invalid or unauthorized operation is rejected from both entries, before a write. |
| Application imports a vendor request/error or navigates an ORM proxy                            | Introduce or repair a consumer-owned contract if that dependency violates policy or hinders the required test/replacement. Account for mapping and lost capabilities.                     | Application tests need no device; real adapter tests preserve required semantics.         |
| A framework annotation is the only disputed coupling                                            | Decide against the accepted policy and actual exit cost. A plain core plus outer decorator buys compile-time isolation; an application annotation can retain simpler wiring when allowed. | Imports satisfy the chosen policy and real transaction/security behavior still executes.  |
| Two adapters have the same Java methods but different consistency, ordering or failure behavior | Narrow the promised contract, implement the missing semantics, or reject substitution.                                                                                                    | Shared conformance cases plus each adapter's real integration checks.                     |

Use `framework-coupling-and-independence` when the cost or allowed reach of Spring/JPA is
itself the unresolved decision; provide current imports, behavior and consumers. One useful
output port may have a single real implementation. Its value can be contract ownership and
test isolation rather than a speculative database replacement.

## Implement the conversation

For an implementation request, deliver a functioning vertical slice in the existing project:

1. Express the input operation and application-owned command/result types at the boundary.
   A port is a contract; a callable application class can serve as an input port. Add an
   interface when callers, substitution or decoration benefit, not one per class by rule.
2. Keep transport parsing and protocol responses in the driving adapter. Carry a trusted,
   minimal actor context into the application and enforce resource authorization and business
   invariants on every entry path. A request-supplied `actorId`, DTO validation or an HTTP-only
   security annotation cannot establish that guarantee for an import or direct caller.
   Internal callers are trusted to supply identity only within an explicitly controlled boundary.
3. Define driven ports from the use case's needs: operations, input/output semantics, absence,
   conflicts, failure classes, effects and ownership. Avoid exporting `ResponseEntity`, a
   Spring Data repository, vendor DTOs or lazy entities across a boundary that forbids them.
   Do not mechanically wrap every library API; retain stable types allowed by the contract.
4. Implement adapters and precise mappings. Translate infrastructure failures where they are
   known; retain internal causes for diagnosis without exposing secrets or vendor details in
   public responses. Distinguish a confirmed rejection from an outcome that may have committed.
   Do not convert storage failure to absence or repeat a non-idempotent operation automatically.
5. Wire the selected implementations outside an independent core using single constructors
   or `@Bean` parameters, following existing composition. New examples use no `@Autowired`;
   this is a catalog convention, not an API removal. Establish the effective transactional
   entry point and resource owners. A plain object's annotation and a green unit test do not
   demonstrate interception, database rollback or cleanup.
6. Integrate the actual callers, configuration and failure handling, then verify the promises.
   A fake completes an application test, not a requested durable service. Preserve external
   contracts and rollout compatibility when replacing existing paths; do not leave old and
   new rule owners silently diverging.

Application code remains responsible for the atomicity it requires even when an outer
decorator implements it. `@Transactional` with a local database manager does not make an
HTTP call or broker publication atomic with database writes. Crossing threads or returning
work for later execution changes transaction/context/resource assumptions; inspect those
semantics before introducing asynchronous signatures. Resource-backed results must have
an explicit consumption/closure lifetime; do not return a lazy value after its session closes.

## Validate the claim and deliver

Read [verification](references/verification.md) when selecting checks for a new or repaired
boundary. Use the [executable contract fixture](assets/contract-fixture/README.md) only when
adapting a compact example of two inputs, an isolated core, adapter conformance and real
Spring transaction wiring. It is a teaching fixture with a declared H2 contract, not a
production application template or proof about another database.

Keep three claims separate: package/content validity, executable example/application
behavior, and agent behavior when using this skill. Report actual commands, test counts,
failure/sensitivity evidence and relevant limits. A nonempty production dependency check
must detect a known forbidden dependency; functional tests alone cannot prove that rule.
An interface and fake cannot prove a real integration or transaction works. Sources and
tests support only their versions and exercised conditions; state unavailable evidence
and the discriminating next check instead of inventing a successful run or benefit.

For a review, give the location, violated contract, consequence and proportionate correction
with validation. For a design, give the chosen contract/owners and the constraint that would
change the decision. For implementation, provide the working slice, concise dependency
map, configuration/migration notes where changed, checks and remaining limitations. A small
port repair needs no multi-page ADR. Stop when the requested contract is integrated and
verified to the stated extent; no architecture completeness score or performance claim.

## Optional handoffs

Use `spring-boot` for general bean/property/lifecycle diagnosis, passing the failing wiring
and accepted coupling policy. Use `spring-boot-web` for MVC binding, response/error and
OpenAPI mechanics, passing application commands and outcomes while retaining the shared
use-case rules. Use `spring-boot-jpa` for persistence mappings and fetching, passing the
port's atomicity, identity, concurrency and absence guarantees. Use `spring-security-for-apis`
for trusted authentication and entry security, passing the resource authorization contract
and non-HTTP entry points; retain application enforcement where required.

Use `spring-transactions-and-events` for transaction propagation, proxy and event-delivery
mechanics, providing the call graph, manager, failures and completion contract. Use
`spring-http-clients` for outbound protocol/lifecycle implementation and `idempotency` when
ambiguous completion or retries require a durable duplicate-handling policy. Use
`architecture-testing` for deeper structural or integration test design, passing the
promised rule and a violating scenario. An optional handoff does not transfer responsibility
for completing and checking the requested application boundary.
