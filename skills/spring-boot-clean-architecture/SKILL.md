---
name: spring-boot-clean-architecture
description: >-
  Implement or repair Clean Architecture boundaries in Java/Spring Boot when domain
  policies, use-case orchestration and framework mechanisms are mixed. Allocate
  rules, distinguish source dependencies from execution flow, choose simple results
  or output presenters, and preserve transaction and authorization behavior during
  incremental migration. Excludes architecture-style selection and detailed HTTP,
  ORM or distributed-system design.
---

# Spring Boot Clean Architecture

Own the separation of domain policy, application operations and external mechanisms
within an accepted Clean Architecture direction. A successful change has an inward
source dependency graph and preserves the requested observable behavior. Renaming
packages, counting layers or starting four Maven modules establishes neither.

MVC may implement presentation inside this architecture; hexagonal architecture
describes conversations across the application boundary. They are compatible views,
not maturity levels. Do not introduce DDD, CQRS, microservices, an interface for every
class or a second model for every value merely because the task says “clean”.

For choosing whether isolation is worthwhile, use `framework-coupling-and-independence`
and `architecture-trade-off-analysis`. Use `spring-boot-hexagonal-architecture` for
port semantics and driving/driven adapters. This skill owns which policy belongs
where and what crosses those boundaries. A local binding, query or bean defect with
no boundary problem belongs to its Spring specialist.

## Establish the policy and the environment

Inspect the request, relevant ADRs and consumer contracts, then trace one actual use
case through its callers, domain rules, persistence and tests. Identify actors,
trusted identity, invariants, authorization, failure outcomes, atomic writes and
whether success means commit or only acceptance. Distinguish an explicit boundary
requirement from an observed package convention or your proposal. An annotation or
class name is evidence of placement, not evidence that the behavior runs.

Read Maven/Gradle wrappers, compiler release/toolchains, resolved Spring and test
dependencies, CI/runtime images and existing architectural checks. The authoring
baseline is **Java 25, Spring Boot 4.x**; the executable fixture pins **Boot 4.1.1**,
with no preview features. This is not the minimum supported Java version or an
authorization to upgrade a target project. Match its resolved versions before using
version-sensitive APIs. WebFlux and Boot major-version migration are separate work.

When the task follows the catalog DDD reference project or asks to preserve its
class/package conventions, read [DDD reference alignment](references/ddd-reference-alignment.md).
Its Gradle modules, use-case contracts and Spring generation differ from this skill's
independent teaching fixture; use the target's names and behavior when adapting it.

If evidence is missing, state which conclusion is conditional and inspect available
code before asking. Ask only about an unresolved requirement that changes the work,
such as whether a receipt must commit with an order. Continue independent work; do
not invent access rules, atomicity or an independence requirement to fill the gap.

## Decide and implement one complete slice

1. **Assign the policies.** Put a rule that defines a valid business state or
   transition with the domain that owns it. The application coordinates a particular
   operation: obtains facts, authorizes the actor, invokes those rules, requests
   persistence and returns an outcome. HTTP parsing, SQL, serialization and bean
   construction belong outside the independent core. Do not move all conditionals
   out of controllers: protocol decisions remain there. Read
   [policies and boundaries](references/policies-and-boundaries.md) when allocating
   rules, mapping types or drawing dependency and execution maps.
2. **Choose the smallest useful boundary.** Retain adequate direct calls and concrete
   use-case classes. Introduce an inner-owned interface where an outward call or
   substitution contract requires it. A simple query does not need an aggregate,
   presenter and parallel DTO hierarchy. When independence is explicitly required,
   even a small core cannot expose Spring/JPA/HTTP types and still claim strict
   independence. If framework coupling is accepted, record its actual scope and
   consequence instead of relabeling it as absent.
3. **Decide the crossing contract.** Define inputs, outcomes, absence and failures in
   the inner vocabulary. Reject mutable persistence state, lazy proxies, security
   framework objects and protocol response types crossing inward. Do not turn every
   infrastructure failure into “not found”. Return a simple result when synchronous
   consumption fits; use an inner output interface only when application-owned
   output sequencing or interaction makes it useful. Multiple representations alone
   do not require callbacks. Read [results and presentation](references/results-and-presentation.md)
   before choosing or repairing this boundary.
4. **Connect the real entry.** Update its callers, mappings, outer bean configuration
   and transaction/access path together. Use single-constructor injection or `@Bean`
   parameters without unnecessary `@Autowired`. Keep domain authorization and
   invariants effective for jobs and messages as well as HTTP; identity must come
   from a trusted entry, not a request's claimed owner or roles. An outer transaction
   decorator or facade must actually wrap every required invocation. Read
   [composition and migration](references/composition-and-migration.md) before moving
   Spring-managed behavior or migrating an existing slice.
5. **Challenge the boundary and behavior.** Test rules and orchestration without
   infrastructure; separately exercise the real configuration, transaction and
   affected representation. Check production dependencies with a known violation,
   including forbidden signature types; never accept an empty selection. Read
   [verification](references/verification.md) when implementing or assessing these
   checks. For a runnable example of their interaction, use the
   [boundary fixture](assets/boundary-fixture/README.md); inspect its limits and run
   it in a temporary copy, not as a new project template.

For incremental work, preserve current public errors, serialized fields and commit
semantics unless the task explicitly changes them. Extract one rule or operation,
adapt the existing infrastructure behind that seam, then switch its callers. Reuse
existing verification and rollback mechanisms. Do not run both write paths to
compare them; use safe read comparisons or isolated fixtures when needed.

## Keep responsibility and evidence explicit

`domain-logic-organization` owns the choice of domain model versus transaction script;
`mvc-and-request-handling` owns presentation responsibilities; `spring-boot-web` owns
HTTP binding, validation and response mapping. Pass the affected public contract and
inner outcome to these specialists instead of redefining their mechanics here.

`spring-boot` owns bean/auto-configuration details, `spring-transactions-and-events`
owns effective Spring transaction interception, and `spring-security-for-apis` owns
authentication/filter-chain mechanics. Supply the actual call path and required
access/commit behavior. `spring-boot-jpa` owns ORM mapping and persistence lifecycle;
`architecture-testing` and `spring-boot-testing` own test and harness mechanisms.
If a specialist is unavailable, keep the unresolved contract visible and continue
the authorized work whose prerequisites are known.

A review ends with evidence, consequence, a proportionate change and a discriminating
check. A design decision compares retain, isolate one boundary and broader separation
only where those alternatives matter. An implementation delivers the complete slice,
its consumer/wiring changes and executed checks. Scale the explanation to the task;
a narrow repair does not require a full architecture report.

Report what was observed separately from inference and unexecuted validation. A pure
unit test does not prove advice or transactions run; an H2 test does not prove a
production database's behavior; a dependency rule does not prove authorization or
replaceability. Do not promise lower latency, cheaper migrations or measured agent
improvement without appropriate evidence.

The conceptual dependency direction follows
[Robert C. Martin's Clean Architecture article](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html).
The proportional choices here, including simple returned results, are applications
of that constraint to the observed contract, not mandatory class diagrams from that
article. Verify Spring mechanisms against the target's version-matched primary
documentation; sources and concrete checks are routed above.
