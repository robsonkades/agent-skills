---
name: java-test-doubles
description: >
  Choosing and using test doubles in Java: the stub/mock/fake distinction that actually
  changes what a test proves, selecting real collaborators, fakes or mocks for the needed
  evidence, verifying contractual interactions, Mockito's strict stubs, and deciding when
  a foreign API needs an owned boundary. Use when a test mocks every
  collaborator the class touches, when verify is asserted on a query, when a refactoring
  broke tests that still describe correct behaviour, when deep stubs or static mocking are
  proposed, when a stubbed repository is hiding a query that does not work, when
  UnnecessaryStubbingException appears, or when migrating from @MockBean. Does not cover
  which level to test at (java-testing-strategy), how the test is written
  (java-test-design), deterministic executors for threading (concurrency-testing), or breaking a dependency so the
  class can be constructed at all (java-legacy-code-testing).
---

# Java Test Doubles

## Purpose

A double replaces something real, and in doing so it replaces the evidence that thing works
with your belief about how it behaves. Prefer real fast, deterministic collaborators; justify
substitution by the behavior and isolation the test needs, including at an internal boundary.

The failure this exists to prevent is the fully-mocked test: every collaborator stubbed, every
call verified, the suite green, and the system broken — because nothing in the test ever
executed the code that was actually wrong.

## Workflow

Inspect the compiler release, runtime JDK, JUnit/Mockito versions, mock maker/agent setup and
Spring Boot/Framework combination first. References describe a JDK 25/Mockito 5.23 context,
not a required project baseline; partial examples are not a bundled executable harness.
Use compatible APIs without upgrades or preview. If dependencies or the real adapter are
unavailable, report that coverage as pending rather than inferring it from a double.
Reuse the requested behavior, existing tests and project constraints; ask only about a missing
failure, lifecycle or interaction contract that would change the choice.

1. **Consider the real collaborator first.** A fast, deterministic `new PricingRules()` can
   exercise useful real behavior. Ownership alone does not decide: a stable library value may
   be appropriate, while an internal collaborator may need isolation for this scenario.
2. **If you cannot, say why**: it does I/O, it is slow, it is non-deterministic, it belongs to
   a boundary whose behavior needs control, or the case you need (a timeout, a 500) cannot be
   produced on demand. One of those reasons, or another concrete isolation/contract need,
   should explain the substitution.
3. **Pick by what the test needs.** A value to proceed with → a stub. A record that a command
   happened → focused interaction verification. Required stateful behavior across several calls
   may justify a maintained fake; one canned outcome may need only a stub.
4. **Verify contractual interactions.** Prefer returned values or readable state. Query counts
   or absence can matter for caching, remote-call budgets or authorization; verify these only
   when the requirement makes the interaction itself observable, not merely because it occurred.
5. **Pay the boundary's debt.** A mocked boundary carries assumptions to check against the
   real thing — the query against the real engine, the HTTP shape against a stub server. Track
   relevant existing evidence and uncovered risks as part of the change (java-testing-strategy).

## Rules

- A foreign mock encodes assumptions about an API you do not control. An owned adapter can
  isolate vendor semantics; an existing provider SPI or stable public interface may already be
  the right seam. Introduce a wrapper for a useful consumer contract or isolation benefit,
  not merely because a type is foreign; test the relevant real boundary (java-dry-kiss-yagni).
- Prefer a small fake when the test needs its state transitions — "save then find", for
  example. A stub can be sufficient for one answer or failure. Neither a map-backed fake nor
  a mock establishes database, cache or queue semantics beyond what it actually implements.
- Normally construct value objects, records, DTOs and enums. Mocking can bypass their
  constructors and invent impossible states; use such a substitution only for an explicit
  boundary-failure scenario, without claiming a real instance can produce it.
- Deep stubs bind tests to a chain and can hide missing setup. Inspect whether the chain exposes
  private structure or is a legitimate fluent API (java-law-of-demeter). Compare a real builder,
  explicit intermediate doubles or a scoped deep stub; the syntax alone is not a design defect.
- `MockitoExtension` defaults to strict stubs. Unused non-lenient stubs normally produce
  `UnnecessaryStubbingException` after an otherwise successful test; the reference explains
  failure suppression and argument-mismatch heuristics. Investigate unused setup versus a missed
  path before changing the test; keep any justified leniency narrow.
- Prefer real argument values to `any()`. `any()` is correct when the argument genuinely does
  not matter to the assertion; used everywhere it turns `verify` into "something was called".
- Many stubs are a prompt to inspect fixture scope and responsibility boundaries, not a numeric
  verdict that the class has too many collaborators (java-cohesion-coupling).
- Spring Framework 6.2+: `@MockitoBean` and `@MockitoSpyBean`. Spring Boot deprecated
  `@MockBean` and `@SpyBean` in 3.4 for removal in Boot 4. Bean override definitions contribute to
  the context-cache key; changing method-level stub answers alone does not define a new key.
  Measure cache misses and startup cost before calling context loading the suite's bottleneck.

## References

Deliver the behavior under test, reason for each substitution, what the double cannot prove,
and real-boundary checks executed or still needed. Report actual test counts/failures; assertions
against a fake do not establish database or network semantics.
Retaining an adequate existing double or real collaborator is a valid result; name the risk it
covers and any consequential evidence still missing rather than forcing a new abstraction.

- [Choosing a double, with a worked fake](references/choosing-a-double.md). The taxonomy
  in terms of what each _proves_, when a fake beats a mock, keeping a fake honest with a
  contract test, and partial examples of a service tested with a fake repository and a
  mocked gateway. Read when deciding what to substitute.
- [Mockito hazards](references/mockito-hazards.md). Strict stubs and the
  exact failure they produce, spies and partial mocks, static and constructor mocking, argument
  captors versus state assertions, and the `verify` patterns that become change detectors.
  Read before reaching for any Mockito feature beyond `when` and `verify`.
