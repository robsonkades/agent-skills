---
name: java-test-doubles
description: >
  Choosing and using test doubles in Java: the stub/mock/fake distinction that actually
  changes what a test proves, preferring the real collaborator or a hand-written fake over a
  mock, verifying interactions only when the interaction is the outcome, Mockito's strict
  stubs, and the rule against mocking types you do not own. Use when a test mocks every
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

1. **Try the real collaborator first.** If it is fast, deterministic and yours, use it. Most
   "we need a mock here" is habit; a `new PricingRules()` in the test costs nothing and proves
   more than a stub of it.
2. **If you cannot, say why**: it does I/O, it is slow, it is non-deterministic, it belongs to
   someone else, or the case you need (a timeout, a 500) cannot be produced on demand. One of
   those reasons, or another concrete isolation/contract need, should explain the substitution.
3. **Pick by what the test needs.** A value to proceed with → a stub. A record that a command
   happened → a mock with one `verify`. Realistic stateful behaviour across several calls → a
   fake you write and keep.
4. **Verify contractual interactions.** Prefer returned values or readable state. Query counts
   or absence can matter for caching, remote-call budgets or authorization; verify these only
   when the requirement makes the interaction itself observable, not merely because it occurred.
5. **Pay the boundary's debt.** A mocked boundary needs representative checks against the
   real thing — the query against the real engine, the HTTP shape against a stub server. Track
   it as part of the change (java-testing-strategy).

## Rules

- Do not mock a type you do not own. Wrap it in your own interface, mock that, and test the
  adapter against the real library or a stub server. A mock of someone else's class encodes
  your assumption about their API, and it keeps passing after they change it. The wrapper is
  justified by the need to substitute, not by principle — a library you never need to fake
  should be called directly (java-dry-kiss-yagni).
- Prefer a hand-written fake to a stubbed mock for anything stateful — a repository, a cache,
  a queue. A ten-line `InMemoryOrderRepository` makes "save then find" work like the real
  thing; a mock makes it work only in the order the test author imagined.
- Never mock value objects, records, DTOs or enums. Construct them. A mocked record is slower,
  less readable, and can return values the type's own constructor would reject.
- No deep stubs. `RETURNS_DEEP_STUBS` exists to make `a.getB().getC().getD()` testable; the
  chain is the defect (java-law-of-demeter), and the deep stub preserves it.
- Strict stubs are on by default with `MockitoExtension`, and an unused stub fails the test
  with `UnnecessaryStubbingException`. That is a finding: the test does not exercise the path
  it claims to. Delete the stub or fix the test — `lenient()` silences the signal.
- Prefer real argument values to `any()`. `any()` is correct when the argument genuinely does
  not matter to the assertion; used everywhere it turns `verify` into "something was called".
- Many stubs are a prompt to inspect fixture scope and responsibility boundaries, not a numeric
  verdict that the class has too many collaborators (java-cohesion-coupling).
- Spring Framework 6.2+: `@MockitoBean` and `@MockitoSpyBean`. Spring Boot deprecated
  `@MockBean` and `@SpyBean` in 3.4 for removal in Boot 4. Each distinct set of mocked beans is a separate cached application
  context — mocking one bean differently in ten test classes buys ten context startups.

## References

Deliver the behavior under test, reason for each substitution, what the double cannot prove,
and real-boundary checks executed or still needed. Report actual test counts/failures; assertions
against a fake do not establish database or network semantics.

- [Choosing a double, with a worked fake](references/choosing-a-double.md). The taxonomy
  in terms of what each _proves_, when a fake beats a mock, keeping a fake honest with a
  contract test, and partial examples of a service tested with a fake repository and a
  mocked gateway. Read when deciding what to substitute.
- [Mockito hazards](references/mockito-hazards.md). Strict stubs and the
  exact failure they produce, spies and partial mocks, static and constructor mocking, argument
  captors versus state assertions, and the `verify` patterns that become change detectors.
  Read before reaching for any Mockito feature beyond `when` and `verify`.
