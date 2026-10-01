---
name: java-ddd-testing
description: >-
  Write and review Java DDD tests for aggregate invariants, value-object equality,
  use-case outcomes, gateway rehydration, concurrency conflicts and domain-event durability.
  Use when extracting behavior into a domain model, testing rejected transitions,
  replacing repository mocks with in-memory gateways, or checking whether persistence
  tests protect the aggregate's consistency boundary. Follows domain, application and
  infrastructure packages. Does not choose bounded contexts or replace general Java
  test design, Spring test setup or database performance analysis.
---

# Java DDD Testing

## Purpose and scope

Turn a business rule into observable evidence at the layer that enforces it. Test the
aggregate as a behavioral unit, the use case through its input/output contract, and the
gateway against the persistence mechanism it promises. A class named `AggregateRoot`
or a green mocked `save()` does not establish those properties.

Use this skill to implement tests or review their evidence. A findings-only request
produces findings and proposed checks without modifying the application. Keep existing
adequate tests; do not migrate an entire suite because one test uses Mockito.

## Discover the contract

Before editing, inspect the relevant model, use case, adapters, tests, build configuration
and project instructions. Record only facts needed for the task:

- Business rule, permitted states, failure semantics and observable side effects.
- Aggregate root and child ownership; identifiers and equality conventions; create versus
  rehydrate factories; validation through exceptions, notifications or result values.
- Entry points, caller identity, authorization policy, transaction owner and gateway contract.
- JDK/toolchain, test runner and filters, resolved assertion libraries, engine/version,
  migrations and transaction isolation when persistence is involved.

First characterize current observable behavior when extracting DDD from existing code.
If a legacy model mutates then validates, preserve evidence of that behavior and identify
the intended safe boundary before changing it. Do not silently convert a compatibility
test into a new business policy. Missing rules require a stated assumption or a focused
question; independent checks can continue.

Use the existing root package. Under the family convention, tests mirror
`domain.order.OrderTest`, `application.order.submit.DefaultSubmitOrderUseCaseTest` and
`infrastructure.order.gateway.OrderGatewayImplTest`. Adapt an established project naming
scheme such as `CreateCategoryUseCaseTest` and `CategoryMySQLGatewayTest` instead of
renaming it. Name cases after business outcomes; preserve Portuguese `@DisplayName`
when that is the project's convention. No example authorizes a JDK or library upgrade.

The family's source baseline is Java 17; these scenarios are test designs, not a compiled
suite. Use the target project's supported JDK, test APIs and persistence version. A cited
Jakarta Persistence contract does not authorize migrating a `javax.persistence` project.

## Choose the evidence depth

| Claim                                                           | Smallest useful evidence                                     | What it cannot establish                             |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| A value or aggregate protects a local rule                      | Pure Java domain tests, no Spring or database                | Durable uniqueness or races                          |
| A use case returns the right result and protects a failure path | Real domain objects with controlled ports                    | Real SQL, framework proxying or transaction rollback |
| A gateway preserves model meaning                               | Real adapter, migrations and isolated database               | Broker delivery or every concurrent schedule         |
| A transaction protects root changes and an outbox               | Actual transaction entry point and independent durable reads | Relay recovery without testing the relay             |

Read [Behavioral checks and trustworthy fakes](references/behavioral-checks.md) when
implementing domain or application tests, or when a fake may hide a missing write.
Read [Persistence and delivery evidence](references/persistence-and-delivery.md) for
rehydration, rollback, version conflicts, natural-key uniqueness or outbox claims.
Read [Evaluation cases](references/evaluation-cases.md) when reviewing this skill or
testing whether its guidance catches a misleading green suite.

## Decision rules

1. **Observe the business outcome.** Assert relevant state, returned value, errors and
   domain events. Do not prescribe the private method sequence or mock every domain object.
   A recorded interaction is appropriate when the interaction itself is the contract,
   such as requesting an external notification; it still does not prove delivery.
2. **Pair acceptance with rejection.** For a transition, test its valid case and the
   boundary that rejects it. Rejection must not alter committed state or publish success.
   For invariant-preserving domain commands, also assert the in-memory aggregate, audit
   data and pending events remain as before the failed command.
   If rejection returns an error value inside a unit of work, verify the transaction
   outcome too; do not assume that the framework interprets that value as rollback.
3. **Protect the root's authority.** Exercise child updates through the root and check
   aliases cannot bypass it. A read-only list of mutable children is insufficient.
4. **Make persistence observable.** For an explicit-save port, a fake must store detached
   snapshots and rehydrate fresh objects. A shared `Map<ID, Aggregate>` can persist changes
   accidentally and let a missing `save()` pass. If the contract uses a unit of work,
   model its commit/rollback boundary instead of inventing explicit saves.
5. **Keep security independent of transport.** For each supported entry point, prove
   applicable caller/tenant/ownership rules hold before a protected side effect. An HTTP
   rejection alone does not cover a scheduled job or message consumer invoking the use case.
6. **Use the mechanism for the claim.** H2 may check a compatible mapping; it cannot prove
   another engine's SQL, locking or isolation. A fake version check tests application
   handling, not the production adapter's atomic compare-and-update.

## Execute and validate

1. Write the smallest scenario with explicit preconditions and an independent expectation.
   Use fixed instants and deterministic identifiers through existing seams where relevant.
   Avoid asserting wall-clock timestamps are strictly increasing across immediate calls.
2. Implement or adjust the focused test, preserving its business meaning. Do not add domain
   getters or public child mutators solely to expose internals; observe existing contracts
   or a deliberate immutable projection.
3. Run the narrow test command from the correct module, then required integration checks.
   Inspect discovered/executed counts, failures and skips; a filtered command with zero tests
   is no evidence. Use isolated resources and bound any concurrency or delivery wait.
4. For a consequential new guard, confirm a representative defect is detected: a rejected
   transition that mutates, an omitted save, or a stale write that overwrites. Use a scoped
   hostile fixture or temporary mutation, restore it, and rerun. A compilation failure is
   not proof that the intended assertion catches the defect.

The completion gate is evidence for the requested rule, its relevant rejection path and
the actual enforcement boundary. Do not broaden into every scenario below for a small
change; select cases by the promise at risk.

## Output and limits

Report the rule covered, files changed or review findings, exact commands and observed
results, and the remaining gap. Distinguish executed tests, manually inspected code and
written scenarios. If a database or broker is unavailable, complete pure tests and report
the specific integration case still unverified. Do not claim that a fake establishes
rollback, that one schedule proves race freedom, or that test coverage proves the model
matches the business without agreement on its rules.

For changing the model, optionally compose with java-ddd-aggregates, java-ddd-value-objects,
java-ddd-use-cases, java-ddd-domain-services, java-ddd-repositories or java-ddd-domain-events.
The java-ddd skill owns wider DDD discovery. General test readability belongs to java-test-design; double
selection to java-test-doubles; framework setup to spring-boot-testing; dependency and
cross-layer contract checks to architecture-testing. These are optional neighbors: when
unavailable, state the needed contract and continue this skill's focused checks.
