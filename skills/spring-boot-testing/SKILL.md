---
name: spring-boot-testing
description: >-
  Configure Spring Boot test harnesses for new service acceptance, or diagnose
  slices that omit real wiring, rollback that hides behavior, live-server state
  leaks and cached contexts that outlive test services. Use for executable boundary
  and lifecycle checks, not general test strategy or application security policy.
---

# Spring Boot Testing

Own the configuration and lifetime of the harness that makes a Boot test meaningful.
Activate when assembling evidence for a new service, or for missing slice collaborators,
unexpected overrides, misleading transaction assertions, server-test cleanup, or
context/container reuse failures. Preserve a sound harness; a failing test alone does
not justify widening it to `@SpringBootTest`.

Start with a test of the project's actual behavior and its existing Boot facilities:
`@WebMvcTest`, `@DataJpaTest`, supported bean overrides, and test-service connections.
Do not introduce an example application, a generic test interface, a connection helper,
or a framework lifecycle probe merely to demonstrate an annotation. A diagnostic probe
is justified only when it distinguishes a concrete unresolved failure; keep it separate
from reusable application code.

## Establish what actually runs

Inspect the project's build, wrapper, compiler/toolchain, resolved Boot/Framework/test
versions, test annotations/imports, active properties and CI command. This skill's
executable baseline is **Java 25, Boot 4.1.1**, with Boot-managed dependencies and no
preview flags. Apply version-sensitive APIs only after checking the target; selecting
the skill does not authorize an upgrade or changing its build tool.

Use the official [Spring Boot documentation](https://docs.spring.io/spring-boot/) for
test modules, slices and service connections; consult
[Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html) for repository
and persistence claims and [Spring Security](https://docs.spring.io/spring-security/reference/)
for filter-chain and security-test claims. Select versions matching the project's
resolved dependencies. Read the sections relevant to the decision, with Framework
documentation as a complement for test transactions, overrides and context caching.

Trace the named assertion to its real collaborators, request transport, thread,
transaction, database and cleanup owner. Inspect fresh test reports: an undiscovered,
disabled or environmentally skipped test provides no behavioral evidence. Keep test
services and configuration isolated from real application environments.
Recover the expected behavior from consumer contracts, acceptance criteria and relevant
ADRs; inspect the test contribution guide, fixtures and CI infrastructure before choosing
a new harness. An incidental existing test is not a testing policy, and current output
alone does not decide a disputed contract. Ask only about unresolved choices that change
the test: for example, which published client contract must remain compatible when schema
and validation disagree. Recommend preserving that contract pending an explicit change;
continue independent harness diagnosis while the policy decision is open. Use explicit,
reversible assumptions for local fixture details, not access or consistency guarantees.

## Choose the discriminating check

- **New service or acceptance review:** name each required observable behavior and
  identify the harness that can expose its failure. Include a real path through the
  selected HTTP, security and persistence boundaries; mocks and coverage counts cannot
  establish that those boundaries work together. Read
  [service acceptance boundaries](references/service-acceptance.md) to distinguish real
  collaborators from real transport. Reuse an adequate context and test service; add a
  boundary only when an agreed claim requires it. Defer unrelated acceptance gaps with
  their risk and trigger for follow-up; a narrow repair does not require a new suite.
- **Slice configuration:** compare loaded configuration with the real application's
  relevant controller advice, converters and filter chains. Import the necessary real
  wiring and replace only the boundary outside the test's claim. A successful request
  with filters disabled does not validate authorization. Read
  [slice and override diagnosis](references/slices-and-overrides.md).
- **Persistence or live-server state:** identify where commit happens and observe it
  independently. Flush, test rollback and server commit are different events; cleanup
  must survive the test's rollback. Read
  [transaction observability](references/transaction-observability.md).
- **Suite-only failures or repeated startup:** compare context keys, forks and resource
  lifetimes before changing caching. A service must remain available as long as a cached
  client needs it; resetting shared state is separate from rebuilding the context. Read
  [context and service lifetime](references/context-and-services.md).

When implementing or repairing tests, read the focused execution and handoff procedure
in [verification](references/verification.md); its routed asset instructions provide
concrete MVC replacement and persistence test shapes.
The runnable examples cover those two boundaries; full service acceptance,
context/container and listener-phase guidance are conditional references. Adapt the
relevant test to existing application types. Do not copy the fixture's build or all its
tests into an existing project.

For a repair, deliver the focused configuration change and a check that would expose
the original harness defect. For diagnosis/review, state the observation, why the
current test cannot establish its claim, and the next discriminating check. Report
executed counts and material coverage gaps without requiring a large report for a
small fix. Update the existing test guide when invocation, prerequisites or cleanup
ownership changes; preserve its local/CI split. Missing Docker permits compilation and
other tests, not a claim that a required container-backed path passed.

## Responsibility boundaries

Use `java-testing-strategy` for coverage allocation and CI discovery policy,
`java-test-design` for assertions and test structure, and `java-test-doubles` for the
choice of replacement. This skill owns their Boot configuration consequences.

Use `spring-boot` for application bean/property composition, `spring-boot-web` for HTTP
contracts, `spring-security-for-apis` for authorization/authentication policy,
`spring-boot-jpa` for mappings and SQL, and `spring-transactions-and-events` for
application transaction/event semantics. Pass the harness, actual versions, failing
request or transaction trace, and the missing observation; expect a domain correction
that this harness can test. These are optional handoffs, not required installations.
If unavailable, preserve the boundary and state the unresolved domain claim.
