# Where TDD pays, and where it does not

## What makes the loop cheap or expensive

Price the loop from feedback latency, the cost of a trustworthy assertion and fixture, and
test maintenance. Short execution time helps but does not make the whole loop nearly free.

| Condition                                     | Effect on the loop                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Short focused cycle                           | Frequent feedback is easier; still price fixtures and maintenance                                        |
| Cycle in minutes (container, full context)    | Consider focused integration runs, larger steps or test-after; lower the level only if the risk survives |
| The expected output is known before coding    | Helps specify the assertion; arranging state or a reliable oracle may still be costly                    |
| The expected output is what you are exploring | Explore or test an explicit hypothesis before treating it as a requirement                               |
| Behaviour reachable without I/O               | Often easier to isolate; input generation or computation may still be expensive                          |
| Behaviour only exists once wired together     | Keep the real integration boundary; choose test order from its contract and cost                         |

When the loop is costly, identify whether feedback delay, oracle uncertainty, fixture setup or
maintenance dominates. Extract behavior only when a useful boundary preserves the risk and
improves the design. A container-dependent contract can legitimately need a slower integration
loop; retaining that boundary or choosing test-after can be sound. No universal seconds cutoff
decides whether TDD is worthwhile.

## Where it often pays

- **Algorithmic and rule-heavy logic** — pricing, tax, eligibility, parsing, scheduling.
  Known rules and boundary cases can support a fast local loop; check oracle and execution
  cost rather than assuming every such problem has a millisecond cycle.
- **Bug fixes, when the failure can be reproduced safely at a useful level.** The failing test is
  strong evidence that the fix addresses the reported fault rather than a nearby one. During an
  incident, mitigation may precede the regression test; nondeterministic, destructive, or
  production-only failures may require a recorded reproducer, model, or diagnostic assertion before
  a stable automated test is possible.
- **Designing a new API from the caller's side.** Writing the call first exposes an awkward
  signature before there is an implementation defending it (java-api-design).
- **Anything with a stated invariant** — sums that must balance, state machines with illegal
  transitions, idempotent handlers. A parameterised test checks the cases supplied to it;
  generation can explore additional inputs, but neither replaces the invariant's justification.
  The walkthrough's six hand-selected counts pass immediately; its separate zero-count test fails.

## Where test-after or a different approach is correct

**Exploration and spikes.** When the expected behavior is unknown, use a bounded experiment;
an executable assertion may still be an effective way to test a hypothesis. After learning,
discard the spike or deliberately harden it with requirements, error handling and tests.
The failure mode is promoting exploratory code without that review.

**Legacy code with no seams.** A class that constructs dependencies and reads statics can be
hard to isolate; inspect reachable behavior before declaring it untestable. A useful order is:
characterisation tests at whatever level
currently works, then refactor to create a seam, then unit tests, then change behaviour. That
sequence belongs to java-legacy-code-testing (creating the seam) and java-refactoring (the
characterisation tests and the refactoring itself). Avoid a rewrite merely to enforce unit-first.

**Wiring and configuration.** Serialisation config, security filter chains, connection pools,
framework registration. When the required contract is known, an integration test can drive
the wiring first; otherwise inspect or explore it, then assert intended behavior. Do not
bless observed behavior without checking the requirement, particularly for security rules.

**UI layout and anything judged by appearance.** Structural assertions alone do not establish
visual quality. Use an appropriate visual/accessibility check; test-first can still fit known
interaction or accessibility requirements.

**Performance work.** Preserve correctness and use a repeatable measurement appropriate to
the boundary (jmh-microbenchmarks, load-testing). Warm-up fits steady-state questions; startup
requires cold-start measurements. A predeclared performance gate can guide a change, but one
timing failure/pass is not evidence of a reliable regression or improvement.

**Concurrency.** A test that passes proves the interleaving it happened to run. Correctness
here comes from the design and from reasoning about happens-before (java-memory-model), with
tests as a supplement (concurrency-testing). A controlled schedule or model can provide a
useful red regression test, but its passing does not prove all interleavings safe.

## The three laws, and what to do with them

Uncle Bob's [three laws](https://blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html)
constrain test and production increments to the next failing condition and its minimal
implementation. That is a fine-grained discipline; it can serve as a training exercise without
making it the required method for every production change.

Applied mechanically to production work it can produce dozens of trivial
tests written to satisfy the letter, a design pinned by tests that assert the implementation,
and a refactor step nobody has time for. Keep the intent — small steps, verified failures,
design pressure — and set the granularity by the table above.

## Answering "is TDD mandatory here?"

Give a reason, not a position:

> "For the discount rules, yes — the boundaries are the risk and the cycle is milliseconds.
> For Kafka consumer wiring, I will first check whether the integration harness can express
> the required topic/offset behavior cheaply. If exploration must come first, I will then
> validate the intended contract and check that the test detects a wrong topic."

That answer is checkable. Choose enough validation for the risk; test order alone does not
determine test completeness or guarantee tested wiring.

## The agent-specific failure

Writing the test and implementation together and observing one green run does not establish
that this behavior was developed test-first. Inspect discovery and assertion sensitivity;
green with zero tests is not validation, and green alone cannot distinguish a tautology from
an assertion that would catch the intended fault.

To claim an observed red-green cycle, retain the intended failing result before the relevant
implementation and the passing result after it, plus any post-refactor checks actually run.
Count executions and tests as they occurred rather than enforcing a universal two-new-run quota:
characterization may start green, invariant checks may already hold, and an isolated old-code or
controlled-defect run can establish scoped sensitivity without changing the development history.
For those approaches, report the evidence and its limits under the actual method
(coding-agent-discipline); do not force a production failure or fabricate an earlier red.

Keep enough context to reproduce the cycle: working directory/module, selected test, relevant
fixture or configuration, source state, and the observed failure and subsequent result. Existing
runner output can carry this; a separate report for every step is unnecessary. If the build reuses
a cached result instead of executing, identify the reuse and its applicable inputs rather than
counting it as a new observed run. Use the project's supported rerun mechanism when fresh execution
is needed; do not delete shared build state merely to manufacture a clean run.

The same outward result can mean different things:

| Observed result                                                                   | What it establishes and what to do next                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compilation fails because a newly required method is absent                       | The API is missing. Add the smallest declaration needed, then observe the runtime behavior test; the compiler failure did not exercise its assertions.                                          |
| A pricing test aborts because unrelated fixture configuration is missing          | The pricing assertion has not run. Repair the fixture or report the limitation, then seek the intended red.                                                                                     |
| A registration test fails to resolve the handler named in the contract            | Missing registration can be the intended red when the test exercises the actual registry/configuration; preserve that boundary while fixing it.                                                 |
| A helper test passes, but the reported entry point selects another implementation | Only the helper's exercised behavior is covered. Follow the actual selection and obtain evidence at a test point that retains this risk; a full end-to-end suite is not automatically required. |

The [JUnit 6.1.3 Console Launcher documentation](https://docs.junit.org/6.1.3/running-tests/console-launcher.html)
illustrates separate discovery/execution counts, selectors and skipped/aborted results. Use the
equivalent evidence from the project's existing runner rather than imposing this runner or version.

## Resolving a disputed red

An assertion's expected result needs a basis independent of the implementation being tested:
an accepted requirement, documented boundary contract, worked example or justified invariant.
Before fixing a failure, distinguish missing behavior from an invalid fixture or mistaken
expectation. Characterization records observed behavior; it does not by itself endorse that
behavior as the requirement for a bug fix.

If the contract supports the assertion, repair production behavior and preserve that assertion.
If authoritative evidence shows the expectation was wrong, correct the test and record the
reason; do not introduce a production defect to satisfy it. Rerun affected tests and report the
revised evidence, without treating the earlier invalid failure as proof of the corrected test's
sensitivity. If the contract remains ambiguous, ask which observable outcome is required and
continue independent cases. Copying actual output into expected values merely to get green,
loosening a valid assertion, or updating snapshots without reviewing their contract defeats the
check. Kent Beck's [Canon TDD](https://newsletter.kentbeck.com/p/canon-tdd) describes both the
scenario list and this distinction between satisfying a test and disguising a failure.

See [Fowler's TDD account](https://martinfowler.com/bliki/TestDrivenDevelopment.html) for the
small test/code/refactoring cycle; these applicability choices depend on the actual contract
and feedback cost, not a blanket prohibition on an entire type of work.
