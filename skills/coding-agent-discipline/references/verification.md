# What counts as verification

## Claim to evidence

| Claim you want to make     | Minimum evidence                                                        |
| -------------------------- | ----------------------------------------------------------------------- |
| "It compiles"              | The build command ran and reported success                              |
| "Tests pass"               | The suite ran; you read the counts; the count of executed tests is > 0  |
| "This test covers the bug" | You saw it **fail** before the fix and pass after                       |
| "The bug is fixed"         | The reproduction that failed now succeeds, by the reported symptom      |
| "This is faster"           | A measurement with a distribution, not one run (jmh-microbenchmarks)    |
| "Nothing else uses this"   | A search you ran, whose scope you state — including non-code references |
| "The API behaves this way" | The signature in the pinned version, or a run                           |
| "This is the cause"        | It explains the symptom, the timing and the distribution (debugging)    |
| "The change is complete"   | Every part of the request is done, or the exceptions are named          |

The pattern: an observation, with the command that produced it. If you cannot name the command,
the claim is an inference and must be labelled as one.

## Traps that produce a false green

- **Exit code 0 with zero tests.** A misconfigured filter, a wrong path, a module that did not
  build — the runner exits successfully having run nothing. Always read the count.
- **Skipped tests.** `@Disabled`, an unmet assumption, a missing container runtime. "12 passed,
  40 skipped" is not a passing suite.
- **A cached build.** Nothing recompiled; the result describes the previous state. If a change
  produced no rebuild, that is itself suspicious.
- **A test that cannot fail.** No assertion, an assertion on a stubbed value, a `verify` on a
  mock the test itself configured. Green proves it ran (java-test-doubles).
- **The wrong module.** The suite ran, in a different package from the one you changed.
- **Compilation without execution.** Type-checking proves shape, not behaviour, and it proves
  nothing at all about configuration, wiring or SQL.

The single strongest defence is having watched the test fail first. A test observed red then
green cannot be any of the above (tdd).

## Reporting a partial verification

Blocked verification is normal and completely fine to report. Silently omitting it is not.

> **Ran:** `npm run build` (clean), `npm run test:only` — 176 tests, 0 failures.
> **Not run:** the integration suite — no container runtime available here, so the new
> repository query is unverified against a real engine.
> **Unverified:** the migration's behaviour on existing data. The unit tests cover the split
> rule; nothing has run it against a populated table.

Three sentences, and the user knows exactly where the risk sits. Compare with "done, tests
pass", which is true, misleading, and will be discovered in a review or in production.

## Reporting a failure

Report the failure first, quote it, and do not soften it:

> `RenewalPolicyTest.windowBoundaries` fails at the `2026-03-09` case: expected `false`, got
> `true`. The window is inclusive of the end date, which contradicts the acceptance criterion
> as I read it. I have not changed the test — this looks like a real defect in the policy, but
> the criterion is ambiguous about the boundary. Which is intended?

What that does: quotes the actual output, states the interpretation, says what was **not**
changed, and asks the one question that resolves it. What it avoids: making the test pass and
mentioning nothing.

## Never do this to a red test

- Change the assertion to match the current output.
- Add `@Disabled`, a tag exclusion, or a retry.
- Narrow the input until the failing case is gone.
- Delete the test.
- Add a broad `catch` that swallows the failure.
- Loosen a matcher (`isEqualTo` → `isNotNull`) to get past it.

Each of these turns a signal into silence, and each is invisible in a summary. If a test is
genuinely wrong — it encodes an old requirement, or it asserts an implementation detail that
legitimately changed — say that explicitly, show the assertion, and let the user decide. That
is a real and common case; it just is not yours to decide silently.

## Confidence vocabulary

Use these consistently and the user can calibrate on you:

| Phrase                         | Means                         |
| ------------------------------ | ----------------------------- |
| "Verified: …"                  | I ran it and observed this    |
| "The build passes"             | I ran the build; it succeeded |
| "I expect …"                   | Reasoning, not observation    |
| "I have not verified …"        | Explicitly untested           |
| "I could not verify … because" | Blocked, with the reason      |
| "I am assuming …"              | A gap I filled; contradict me |

Avoid "should work", "should be fine" and "looks correct" entirely. They read as verification
and mean inference, which is precisely the ambiguity that destroys trust.

## The final check before reporting complete

- [ ] Every claim maps to something I observed, or is labelled as inference
- [ ] I read the test counts, not just the exit code
- [ ] I said what I could not run, and why
- [ ] No test was weakened, skipped or deleted to get to green
- [ ] Everything in the diff was asked for, or is explained
- [ ] Every part of the request is done, or the exceptions are named
- [ ] Assumptions I made are stated where the user can contradict them
