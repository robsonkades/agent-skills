# Where TDD pays, and where it does not

## What makes the loop cheap or expensive

TDD's cost is dominated by two things: how long one cycle takes, and how well you can express
the next behaviour as an assertion before writing it.

| Condition                                     | Effect on the loop                                     |
| --------------------------------------------- | ------------------------------------------------------ |
| Cycle under ~10 seconds                       | Cheap; the loop is nearly free                         |
| Cycle in minutes (container, full context)    | Expensive; batch behaviours, or drive at a lower level |
| The expected output is known before coding    | Cheap; the assertion writes itself                     |
| The expected output is what you are exploring | Expensive; you would be guessing at assertions         |
| Behaviour reachable without I/O               | Cheap                                                  |
| Behaviour only exists once wired together     | Expensive; the test is an integration test             |

Notice that none of these is about the developer's discipline. When someone reports TDD "not
working" here, the productive question is which row they are in — usually a slow cycle, and
the fix is to make the behaviour reachable without the container, not to abandon the loop.

## Where it pays clearly

- **Algorithmic and rule-heavy logic** — pricing, tax, eligibility, parsing, scheduling. The
  expected outputs are known, boundaries are numerous, and the cycle is milliseconds.
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

Uncle Bob's formulation — write no production code except to pass a failing test, write no more
of a test than sufficient to fail, write no more production code than sufficient to pass — is a
training constraint. It is deliberately extreme so that a learner feels the loop.

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

An agent that writes the test and the implementation in the same edit, runs the suite once, and
sees green has performed none of the loop. It has no evidence the test can fail, and a test
asserting a tautology looks identical to a working test in that output.

The minimum honest version: write the test, run it, quote the red output, implement, run again,
quote the green. Two runs. Anything less is test-after wearing TDD's name — which is a
legitimate choice, but must be reported as what it is (coding-agent-discipline).

See [Fowler's TDD account](https://martinfowler.com/bliki/TestDrivenDevelopment.html) for the
small test/code/refactoring cycle; these applicability choices depend on the actual contract
and feedback cost, not a blanket prohibition on an entire type of work.
