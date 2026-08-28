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
with your belief about how it behaves. That trade is worth making at a process boundary and
almost never worth making between two classes you own.

The failure this exists to prevent is the fully-mocked test: every collaborator stubbed, every
call verified, the suite green, and the system broken — because nothing in the test ever
executed the code that was actually wrong.

## Workflow

1. **Try the real collaborator first.** If it is fast, deterministic and yours, use it. Most
   "we need a mock here" is habit; a `new PricingRules()` in the test costs nothing and proves
   more than a stub of it.
2. **If you cannot, say why**: it does I/O, it is slow, it is non-deterministic, it belongs to
   someone else, or the case you need (a timeout, a 500) cannot be produced on demand. One of
   those five, or the double is not justified.
3. **Pick by what the test needs.** A value to proceed with → a stub. A record that a command
   happened → a mock with one `verify`. Realistic stateful behaviour across several calls → a
   fake you write and keep.
4. **Verify commands, never queries.** If the outcome is observable as a returned value or as
   state you can read back, assert that instead; a `verify` on a query asserts how the code is
   written, and breaks on every refactoring that is still correct.
5. **Pay the boundary's debt.** Every mocked boundary needs one test somewhere against the
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
- More than about three stubs to set up one test is a message about the class under test, not
  about the test: it has too many collaborators (java-cohesion-coupling).
- Spring: `@MockitoBean` and `@MockitoSpyBean` (Boot 3.4+). `@MockBean` was deprecated in 3.4
  and removed in Boot 4. Each distinct set of mocked beans is a separate cached application
  context — mocking one bean differently in ten test classes buys ten context startups.

## References

- **Choosing a double, with a worked fake** — `references/choosing-a-double.md`. The taxonomy
  in terms of what each _proves_, when a fake beats a mock, keeping a fake honest with a
  contract test, and compiling examples of a service tested with a real fake repository and a
  mocked gateway. Read when deciding what to substitute.
- **Mockito hazards, verified** — `references/mockito-hazards.md`. Strict stubs and the
  exact failure they produce, spies and partial mocks, static and constructor mocking, argument
  captors versus state assertions, and the `verify` patterns that become change detectors.
  Read before reaching for any Mockito feature beyond `when` and `verify`.
