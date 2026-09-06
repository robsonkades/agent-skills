---
name: architecture-testing
description: >
  Write or review tests for architectural promises: dependency boundaries, transaction
  atomicity, persistence mappings, stale-write detection, query budgets and API/event
  compatibility. Use when green tests missed a lost update or N+1, a boundary exists only
  in documentation, or an integration test may hide the behavior it claims to verify.
  Does not choose the architecture or governance thresholds (architecture-fitness-functions),
  replace general unit-test design, or establish production capacity (load-testing).
---

# Architecture Testing

## Purpose and scope

Turn an agreed architectural promise into a test that exercises its actual mechanism and
fails for the intended violation. A green functional test does not establish transaction,
dependency, concurrency or compatibility properties it never observes. This skill owns
test design and implementation, not architecture selection or governance policy.

Before choosing version-sensitive test APIs, inspect compiler release/toolchains, resolved
framework/test-library versions, runner configuration and the JDKs used by tests and deployment.
The structural example uses release 17 source compilation; its recorded run used JDK 25, not
a Java 17 runtime. Match the target project rather than upgrading it to fit an example. New
dependencies, preview features and toolchain upgrades require their own justification and scope.

## Workflow

1. **Name the promise and failure.** Obtain the relevant implementation, existing tests,
   package/contract or transaction boundary, dependency versions and build command. For data
   tests, also obtain engine/version, migrations, isolation and cache settings. For a budget,
   identify the operation and what is counted. If the promise or threshold is unknown, propose
   a conditional test design and request the missing contract; do not invent the architecture.
2. **Choose the smallest setup that retains the mechanism.** Use the table below. Fakes and
   mocks can isolate behavior but do not establish database or network semantics. A full context
   is justified when proxying, wiring or cross-layer behavior is the assertion; inspect slow-suite
   timing before assuming that a large context is the cause.
3. **Control the observation.** Define fixture state, transaction ownership, caches, execution
   scope, cleanup and time bounds. Count selected classes/tests or observed operations where
   an empty selection or disabled instrument could produce a false green.
4. **Prove the test detects the defect.** Use a small violating fixture or a temporary mutation:
   forbidden dependency, missing transaction, lazy fetch regression or stale write. Observe the
   intended assertion fail, then restore the valid state and rerun. A compile/setup error is not
   that proof. Keep mutations isolated and preserve unrelated work.
5. **Report evidence and limits.** Name the command, actual tests run and result, plus what
   remains untested. A configuration inspection is evidence of intent; a runtime result proves
   only the tested state/interleaving/version. For diagnosis, separate the suspected blind spot
   from a reproduced defect and name the experiment that would distinguish them.

## Match the assertion to the mechanism

| Promise                                        | Smallest credible test setup                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Pure business invariant                        | Domain test; add persistence coverage if truth depends on durable state                                          |
| Use-case orchestration                         | Owned ports with a suitable fake, stub or focused mock                                                           |
| Dependency prohibition                         | Imported production classes/build graph plus a known violating fixture                                           |
| HTTP binding, validation, error/response shape | Web slice with actual relevant advice, serialization and security configuration                                  |
| Gateway protocol and error translation         | Real adapter/client against a controlled server, including applicable failure classes                            |
| Mapping, constraint, migration or isolation    | Isolated production-family engine with representative configuration and production migrations                    |
| Local use-case atomicity                       | Actual transaction entry point, no outer test transaction masking it, durable-state observation                  |
| Stale version rejection                        | Separate committed transactions using stale state; overlap only if the claim requires it                         |
| Concurrent interleaving/locking                | Independent transactions/connections, controlled schedule and bounded failure/cleanup                            |
| Query or remote-call budget                    | Enabled scoped counters around full result consumption, representative cardinality                               |
| Consumer compatibility                         | Actual consumer interaction and provider verification, or policy-specific schema checks plus runtime conformance |

Read [Boundary and contract tests](references/boundary-and-contract-tests.md) for structural,
web, gateway or compatibility checks. Read
[Persistence and concurrency tests](references/persistence-and-concurrency-tests.md) for
data, rollback, budget, migration or concurrency checks. Neither reference is required for
a pure domain assertion.

## Decision rules

- Choose doubles by the assertion. A fake can model useful state but can also drift; a mock
  can verify a meaningful interaction without freezing every call order. Neither proves the
  real adapter works. Avoid simulating vendor internals when a controlled boundary is available.
- An alternative in-memory engine can catch some defects; it cannot establish fidelity to the
  production engine's dialect, locking or constraints. Testcontainers is one provisioning option,
  not a substitute for matching versions/configuration or ensuring isolation.
- Do not replace semantic properties with convenient syntax. A suffix rule tests names, not
  aggregate ownership; an annotation-location rule does not prove a transaction executes.
- Test application/framework integration where it is your responsibility: constraints actually
  applied to the request, converters preserving precision, and advice mapping errors. Do not
  delete these checks merely because a framework implements part of the mechanism.
- Budget tests catch access growth, not acceptable latency or plans. Performance/plan checks may
  run in dedicated CI when representative resources exist; hand capacity claims to `load-testing`
  and diagnosis to `architecture-and-performance`.
- An overlap test covers a chosen schedule, not all races. A single-threaded sequence using stale
  detached state can verify optimistic version checks; it cannot establish concurrent lock behavior.
- Keep accepted exemptions narrow, named and explained. Do not widen imports, disable empty-rule
  failures, reset a baseline or weaken an assertion simply to make the build green.

## Minimum deliverable

For a review: evidence, defect or coverage gap, consequence, adjustment and validation.
For implementation: the focused test/change, its prerequisites, how the violating case fails,
the passing run and any remaining coverage gap. Scale this to the task; no suite-wide report
is needed for one guard.

Choosing thresholds and consequences belongs to `architecture-fitness-functions`; transaction
design to `enterprise-transactions`; contract policy to `rpc-and-api-contracts`.
Use [Validation cases](references/validation-cases.md) when evaluating this skill or rehearsing
a difficult review. Those cases evaluate agent decisions, not the application under test.
