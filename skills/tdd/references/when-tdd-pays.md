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
  transitions, idempotent handlers. Write the invariant as a parameterised test; it finds cases
  you would not have chosen by hand, as it did in `references/loop-mechanics.md`.

## Where test-after or a different approach is correct

**Exploration and spikes.** When the question is "is this library capable of X", tests
presuppose an answer you do not have. Spike without tests, learn the answer, then **throw the
spike away** and build it back with tests. The failure mode is keeping the spike — untested
code written while ignorant, now load-bearing.

**Legacy code with no seams.** You cannot write a unit test for a class that constructs its own
dependencies and reads statics. The order is: characterisation tests at whatever level
currently works, then refactor to create a seam, then unit tests, then change behaviour. That
sequence belongs to java-legacy-code-testing (creating the seam) and java-refactoring (the
characterisation tests and the refactoring itself); starting with TDD here means starting with a
rewrite.

**Wiring and configuration.** Serialisation config, security filter chains, connection pools,
framework registration. There is no interesting logic to drive out; write the integration test
after the wiring exists, to lock in behaviour you have observed and verified.

**UI layout and anything judged by appearance.** Assertions on structure do not capture the
requirement, and they break constantly.

**Performance work.** A test asserts correctness; performance needs a benchmark with a warmed
JIT and a distribution, not an assertion on one run (jmh-microbenchmarks, load-testing). Write
the correctness tests first, then measure — but the measurement is not a TDD cycle.

**Concurrency.** A test that passes proves the interleaving it happened to run. Correctness
here comes from the design and from reasoning about happens-before (java-memory-model), with
tests as a supplement (concurrency-testing) — not from driving the design with a red test.

## The three laws, and what to do with them

Uncle Bob's formulation — write no production code except to pass a failing test, write no more
of a test than sufficient to fail, write no more production code than sufficient to pass — is a
training constraint. It is deliberately extreme so that a learner feels the loop.

As a rule imposed on production work it produces a characteristic damage: dozens of trivial
tests written to satisfy the letter, a design pinned by tests that assert the implementation,
and a refactor step nobody has time for. Keep the intent — small steps, verified failures,
design pressure — and set the granularity by the table above.

## Answering "is TDD mandatory here?"

Give a reason, not a position:

> "For the discount rules, yes — the boundaries are the risk and the cycle is milliseconds.
> For the Kafka consumer wiring, no: there is nothing to drive out, and I will write the
> integration test after the wiring works and verify it fails when the topic name is wrong."

That answer is checkable and it commits you to the same total amount of testing. "We always
TDD" and "TDD is a waste of time" are both unfalsifiable, and both end with untested wiring.

## The agent-specific failure

An agent that writes the test and the implementation in the same edit, runs the suite once, and
sees green has performed none of the loop. It has no evidence the test can fail, and a test
asserting a tautology looks identical to a working test in that output.

The minimum honest version: write the test, run it, quote the red output, implement, run again,
quote the green. Two runs. Anything less is test-after wearing TDD's name — which is a
legitimate choice, but must be reported as what it is (coding-agent-discipline).
