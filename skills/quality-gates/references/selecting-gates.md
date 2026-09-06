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

## Five worked changes

### A typo in a README

**Tier:** cosmetic. **Gates:** format and documentation/link checks configured for this repository.

Skip unrelated suites only under the established selection policy. Check generated docs, tested
snippets and build inputs before classifying the path; verify that filtered required checks
resolve correctly instead of remaining pending or falsely reporting tested success.

### A new REST endpoint reading existing data

**Tier:** integrating. **Gates:** compile with `-Werror`, unit tests on the logic, a slice test
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

No gate proves the last one. It is a review item, and it is the item that matters most.

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
- A noisy gate whose findings are triaged asynchronously — provided someone actually triages
  them, on a named schedule.

## Recording a skip

Whenever a gate is skipped under pressure, one line in the pull request or incident record:
what was skipped, why, and when it will run. This is the difference between a decision and a
habit, and it is the same discipline as recording deliberate technical debt
(technical-debt-decisions).

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
