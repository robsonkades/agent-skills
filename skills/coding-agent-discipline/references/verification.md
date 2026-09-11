# What counts as verification

## Claim to evidence

| Claim you want to make     | Minimum evidence                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "It compiles"              | The relevant compile task succeeded for the final inputs, or a valid cache result covers them                                          |
| "Tests pass"               | The named relevant suite executed for the final state; failures, executed counts and skipped coverage were inspected                   |
| "This test covers the bug" | You saw it **fail** before the fix and pass after                                                                                      |
| "The bug is fixed"         | The reproduction that failed now succeeds, by the reported symptom                                                                     |
| "This is faster"           | Baseline and candidate measurements of the named metric under comparable workload, versions and environment, with variability reported |
| "Nothing else uses this"   | A search you ran, whose scope you state — including non-code references                                                                |
| "The API behaves this way" | Version-matched contract/source or a focused run for the claimed behavior; signature alone establishes availability/types              |
| "This is the cause"        | Evidence discriminates it from plausible alternatives, ideally a controlled reproduction/intervention; otherwise a hypothesis          |
| "The change is complete"   | Every required part and required verification is finished; remaining required work means a partial or blocked result                   |

State the scope and source of evidence: command, inspected artifact or versioned reference.
A documented contract is not an observed application outcome. Bind test/build evidence to
the relevant revision, module, configuration and environment; checks before later edits do
not establish the final state. Re-run affected checks when subsequent changes invalidate them.
Limit performance claims to the measured operation and conditions; a microbenchmark does
not establish application-level improvement (jmh-microbenchmarks, performance-methodology).

## Traps that produce a false green

- **Exit code 0 with zero tests.** A misconfigured filter, a wrong path, a module that did not
  build — the runner exits successfully having run nothing. Always read the count.
- **Skipped tests.** `@Disabled`, an unmet assumption, a missing container runtime. Report
  "12 passed, 40 skipped" and identify whether required coverage was skipped; a successful
  runner status does not establish the skipped behavior.
- **Unverified cache provenance.** Valid incremental/cache reuse can cover current inputs.
  Inspect task outcomes and whether sources, generated files, toolchain and configuration
  are tracked inputs. Missing inputs or wrong outputs justify a targeted uncached rerun;
  `FROM-CACHE` alone does not prove staleness, nor does a cache hit prove correct setup.
- **A test insensitive to the defect.** Assertions only on fixture/stub values, or mock
  verification unrelated to the changed path. Identify what incorrect behavior would make
  it fail; absence of an explicit assertion alone is not proof of insensitivity (a test can
  deliberately check that an operation completes without throwing).
- **The wrong module.** The suite ran, in a different package from the one you changed.
- **Compilation without execution.** A compile check can establish types and other static
  contracts; it does not establish runtime configuration, wiring or SQL behavior.

Watching a relevant test fail for the reported defect and then pass after the fix is strong
evidence, not immunity: unrelated environment changes, retries or flakiness can also produce
red then green. Check failure cause, exercised path and unchanged test conditions. Do not
claim regression sensitivity when the pre-fix failure was not observed.

For asynchronous ordering claims, observe contract milestones rather than assuming progress
after a sleep or a fixed number of promise/scheduler turns, unless that timing is itself the
contract. In a streaming test, let the writer signal entry and return a test-controlled
promise; make any subsequent input pull fail while that write is unresolved. After release,
await the next observed milestone with a bounded failure path and cleanup of owned work.
If a contract-preserving scheduling change breaks the test, repair its synchronization
without losing checks for premature progress, stalled completion or propagated failures.

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

These are prohibited as shortcuts to green. If a test encodes an obsolete requirement or an
implementation detail legitimately changed by the authorized task, identify the old
assertion and controlling requirement, then repair the test and retain meaningful boundary
and failure coverage. Report that adjustment; do not require fresh approval for an already
authorized contract change. Ask when evidence does not settle the expected behavior.

## Confidence vocabulary

Use these consistently and the user can calibrate on you:

| Phrase                         | Means                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| "Verified: …"                  | The named execution, artifact or version-matched contract establishes this specific claim |
| "The build passes"             | I ran the build; it succeeded                                                             |
| "I expect …"                   | Reasoning, not observation                                                                |
| "I have not verified …"        | Available evidence has not established the claim                                          |
| "I could not verify … because" | Blocked, with the reason                                                                  |
| "I am assuming …"              | A gap I filled; contradict me                                                             |

Name the evidence when "verified" could mean either contract inspection or execution:
"The pinned API contract rejects null; this application's null-input path was not run."

Avoid "should work", "should be fine" and "looks correct" entirely. They read as verification
and mean inference, which is precisely the ambiguity that destroys trust.

## The final check before reporting complete

- [ ] Every claim maps to something I observed, or is labelled as inference
- [ ] I read the test counts, not just the exit code
- [ ] I said what I could not run, and why
- [ ] No test was weakened, skipped or deleted to get to green
- [ ] My edits are requested or necessary; unrelated pre-existing work is preserved
- [ ] Required work is finished, or the result is explicitly partial/blocked with named gaps
- [ ] Assumptions I made are stated where the user can contradict them

## Sources for tool interpretation

- [Gradle build cache](https://docs.gradle.org/current/userguide/build_cache.html): task
  input/output caching and `FROM-CACHE`; check the project's Gradle version and task setup.
- [Node test runner](https://nodejs.org/api/test.html): filtering, skipping and reporting;
  use the installed runner's output and documentation rather than assuming other runners
  share its discovery or exit behavior.
