# Selecting gates for a change

## Risk tiers

Risk here is a product of three things: what breaks if it is wrong, how long before anyone
notices, and how hard it is to undo.

| Tier                                    | Examples                                                    | Gate set                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Cosmetic** — no runtime effect        | Docs, comments, formatting, test names                      | Format and documentation checks; compile only when generated code, snippets, or build inputs can be affected. |
| **Local** — one component, reversible   | A pure-logic change under test, a new internal method       | Compile, lint, unit tests, static analysis                                                                    |
| **Integrating** — crosses a boundary    | A new endpoint, a new query, a message consumer             | The above + integration tests, architecture tests, contract tests                                             |
| **Irreversible** — hard or slow to undo | Schema migration, published API change, event schema change | The above + migration test from production-like state, compatibility check, staged rollout plan               |
| **Systemic** — affects everything       | Framework or JDK upgrade, dependency bump, config default   | Full suite + performance check + a rollback that has been tried                                               |

The tier is set by blast radius, not file count or version labels. A default timeout can be
systemic if widely shared. A rename can affect reflection, serialization or external contracts
that compilation does not check. Use the table as guidance within the repository's required gates.

## Trace a gate to its protected decision

Use this when reviewing an existing pipeline, choosing a check for a failure mode, or claiming
that a changed gate blocks merge or release. Trace one relevant gate through the existing
artifacts before generalizing to the rest:

1. **Detection:** locate the enabled rule, assertion or validator for the named failure and the
   inputs it examines. Follow the workflow command into scripts, lifecycle/task bindings,
   profiles, includes/excludes and relevant environment. A declared plugin, a generated report
   or a successful build does not by itself show that this detection ran. If the assertion is
   absent or exercises a different boundary, route the missing coverage to test design rather
   than adding unrelated checks.
2. **Execution:** compare that scope with a retained run: selected tests/rules, input revision or
   artifact digest, conditions, reports and original result. Check that a known violation of
   the intended property reaches the detector, not just that a synthetic command exits nonzero.
   The latter tests result propagation, not detection quality.
3. **Decision:** locate the current rule requiring that result for the actual merge target or
   release path. Inspect applicable protections, check identity/source, enforcement state and
   relevant bypass conditions. Repository workflow YAML describes a job; it is not the live
   policy. A red check is not evidence that the decision was blocked, and a green check alone
   cannot demonstrate rejection of an invalid change.

Keep the links and gaps in the existing PR, gate configuration or review record. State separately
what is configured, what executed, and what enforcement was verified, including the scope and
conditions of each claim. If current policy or a representative run is inaccessible, leave that
part unverified and continue local configuration and checker validation. Do not infer a missing
protection merely because its configuration is outside the checkout.

## Evidence needed for selective checks

A narrow gate set needs a complete change comparison and a credible affected-scope map, not
just a list of familiar file extensions. Inspect the base/head revisions, deleted and renamed
paths, shared build/configuration inputs, generated sources and dependent modules/consumers.
For example, a parent POM change can affect modules whose source paths did not change; a docs
file consumed by a generator is not necessarily cosmetic.

If the diff, dependency map or selector result is missing, truncated or stale, do not interpret
it as "nothing affected". Repair the evidence or use the repository's conservative fallback
gate set; if neither can run, report required evidence as missing. Retain the selected/excluded
checks, revision and selection reason so an aggregate result can distinguish a justified skip
from a check that never ran. Test the selector with both a truly unrelated edit and a shared-input
change that must select downstream checks.

## Five worked changes

### A typo in a README

**Tier:** cosmetic. **Gates:** format and documentation/link checks configured for this repository.

Skip unrelated suites only under the established selection policy. Check generated docs, tested
snippets and build inputs before classifying the path; verify that filtered required checks
resolve correctly instead of remaining pending or falsely reporting tested success.

### A new REST endpoint reading existing data

**Tier:** integrating. **Candidate gates:** compile under the existing warning policy, unit tests on the logic, a slice test
on request mapping and validation, one integration test proving the query works against the
real engine, architecture tests, and contract verification if a consumer has one.

**Performance gate:** inspect expected volume, query cardinality and shared-resource impact.
Being a new read endpoint does not prove it is cold. Follow the existing gate contract or
record why targeted query/load evidence is sufficient under that policy.

### A schema migration splitting a column

**Tier:** irreversible. **Gates:** everything from integrating, plus:

- the full migration history applied from empty to head, so the migration works on a fresh
  database as well as an existing one;
- the migration applied to a seeded pre-migration state, asserting the backfill;
- the _previous_ application version started against the _new_ schema — during a rolling
  deploy both run at once, and this is the check that is almost always skipped;
- a written rollback, and a statement of whether it loses data.

Rehearse the applicable rollback or forward-recovery path and compare resulting data with the
declared preservation requirements. This establishes behavior for the exercised states, not all
production data, concurrent writers or recovery times; review those remaining limits explicitly.

### A minor version dependency bump

**Tier:** based on affected runtime paths and transitive changes, not the word minor.
**Candidate gates:** relevant test suite, dependency convergence,
vulnerability scan, and a look at the transitive tree diff — the direct bump is rarely the
change that breaks something.

For anything touching serialisation, HTTP, or the persistence provider, add one integration
test run against real infrastructure. Minor versions change defaults; the changelog is where
you find out which.

### A hotfix during an incident

**Tier:** whatever the change is, under a constraint. The honest position is that some gates
are being traded for time, and the trade should be explicit rather than silent.

**Normally required for code edits:** compile and tests covering the code being changed. A hotfix that does
not compile or breaks its own unit tests extends the incident, and this has happened often
enough to be a pattern.

A previously verified rollback/configuration mitigation may not involve compiling new code.
Use the incident's existing emergency authority and record deferred evidence; do not wait for
unrelated checks while an authorized urgent mitigation is needed.

**Potentially deferred under the applicable emergency policy:** the full integration suite,
static analysis or vulnerability scan. Record the accepted exception, owner and prompt follow-up;
running them later does not itself authorize bypassing a required gate now.

**Owed afterwards:** the regression test for the fault (debugging, tdd), and a note in the
incident record of which gates were skipped. Recording it is what stops "we skipped the suite
for the hotfix" becoming the normal path.

## What normally may not be skipped

- **Compile when executable code, generated sources, dependency metadata, or build configuration changed.** A prose-only change need not compile an unrelated product.
- **The tests covering executable behaviour you changed.** Not the whole suite — the smallest set capable of falsifying the change.
- **A gate protecting against a defect class that has already reached production once.** That
  gate was bought with an incident, unless the current change provably cannot affect that class.

## What is legitimately skipped

- Gates that cannot be affected by the change (a path-filtered pipeline is a design, not a
  shortcut).
- Long gates on a draft, moved to the point of merge.
- A gate explicitly classified as advisory by policy, with findings triaged by a named owner
  on a named schedule. Noise alone does not authorize moving a required check after merge.

## Recording a skip

Distinguish a policy-authorized out-of-scope selection from an exception to an applicable gate.
For an exception, link the existing authorization and record the exact check/revision or release,
accepted risk, accountable owner, compensating evidence and expiry or completion trigger in the
pull request or incident record (technical-debt-decisions). A short record is enough when it
contains those facts; an issue link without a decision is not a waiver.

Recheck the exception when its expiry arrives or its assumptions change: expanded scope,
different artifact, failed compensation or a new applicable advisory may invalidate it before
the date. Restore the required check or obtain a fresh decision through the established policy;
do not renew by copying yesterday's waiver. An accepted exception remains deferred/accepted risk,
not a test pass. Close it with the promised evidence or an explicitly recorded replacement
decision, not merely because the incident ended.

## For an agent running gates

Report which gates you actually ran, with their real output. "Tests pass" is only sayable after
observing them pass — and if you could not run a gate (no container runtime, no credentials, no
network), say that explicitly rather than omitting it, because a silent omission reads as a
pass (coding-agent-discipline).
Inspect executed test counts, skips, report freshness, commit/configuration and process exit status.
Zero selected tests, a failed runner, stale artifacts or missing data cannot establish pass;
report not-run/invalid/inconclusive as appropriate. A comparator or enforcement script supplied
by untrusted PR code is not authoritative simply because it runs in a later step: preserve the
trusted workflow/evaluator boundary (`performance-regression-ci`). Return the chosen gate set,
actual results and remaining required checks; do not silently remove a red check to finish.

### Required checks in GitHub Actions

When implementing selection on GitHub Actions, distinguish workflow and job skips. A workflow
filtered out by paths can leave a required check pending; a job skipped by a condition reports
success. A required aggregate job can also be skipped after a dependency fails, so requiring
only that job can fail to block the merge.

Ensure the required result job runs after upstream failure, for example with job-level
`if: always()` and explicit `needs`. Then inspect results: merely running the final job is not
enforcement. Require success from the selection step and every selected check; reject failed,
cancelled, missing or unexpectedly skipped results. Accept an out-of-scope skip only when the
successful, trusted selection decision explains it. Test both legitimate non-selection and an
upstream failure that must block merging.

Also verify the change comparison used by path selection. GitHub documents different diffs for
push and pull-request events and limits on the returned changed-file set; a match outside that
set may not trigger a filtered workflow. Custom selectors must account for their own pagination
and truncation behavior. Do not treat a partial list as proof that all changes are cosmetic.
See [GitHub diff comparisons](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons).

Check whether an earlier step already hid the failure. With step-level `continue-on-error`,
`steps.<id>.outcome` can be `failure` while `steps.<id>.conclusion` is `success`; a successful
job result alone then does not prove its checker passed. Prefer leaving required checkers
blocking and using explicit failure/always conditions for report upload or cleanup. If the
design must continue collecting evidence after a failure, inspect the original step outcome
within that job and propagate failure to an enforcing step and the required result. Do not
make that enforcement non-blocking as well. Test a known violation with the actual error-handling
options enabled; a report artifact is insufficient. See [GitHub step outcome and conclusion](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context).

Verify which commit the required result covers (head, test merge or merge-group commit). If a
merge queue requires this Actions check, include the `merge_group` trigger; a pull-request run
alone does not supply that result. Confirm the configured required check name and source.
Inspect all applicable branch protection and rulesets for that target: GitHub rulesets can be
disabled, can target different branches, and can allow specified bypass actors; applicable
rulesets also layer with other protections. A ruleset file or one disabled ruleset alone does
not establish the effective policy. See [GitHub ruleset enforcement and layering](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

See [GitHub required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
and [job dependencies and conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs).
These platform-specific mechanics do not authorize changes to the repository's required-check policy.
