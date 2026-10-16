# Workflow by risk

The nine steps are the same in every case. What changes is how much each one costs — and for
low-risk work, most of them collapse to seconds rather than disappearing.

## Small diff with operational risk: a configuration default

> Change the connection pool's idle timeout from 10 minutes to 5.

| Step       | What it collapses to                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Understand | Find the pool implementation/version, effective configuration and interactions with minimum idle, connection lifetime and database limits.             |
| Clarify    | Establish the intended problem from the request, incident or configuration history. Ask only if the reason or required outcome is still missing.       |
| Risk       | Establish whether the setting takes effect; changed idle retirement can increase reconnect work and acquisition latency after quiet periods.           |
| Tests      | Verify effective binding and the changed idle/reconnect behavior when material; an assertion of the literal alone cannot establish operational safety. |
| Implement  | Change the source controlling the requested default or environment; regenerate derived configuration only when the project requires it.                |
| Verify     | Required repository gates plus targeted checks; record connection churn, acquisition latency and database load to watch if deployed.                   |
| Review     | Follow repository review requirements, focused on the operational consequence rather than the line.                                                    |
| Record     | Record the reason and validation in the requested handoff or, when authorized, commit/PR description.                                                  |
| Deliver    | Name the metric that will show whether it helped.                                                                                                      |

**The trap:** a one-line diff invites a one-second review. Timeouts, pool sizes, retry counts,
feature-flag defaults and cache TTLs can have broad effects, but the configuration name alone
does not establish impact. Check when the changed setting applies and exercise that condition.
For example, [HikariCP 7.0.2's `idleTimeout`](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-7.0.2/README.md#frequently-used)
only applies when `minimumIdle < maximumPoolSize`; changing it in a fixed-size pool does not
establish changed idle-retirement behavior. Check the project's actual pool/version rather
than adopting this example's library or settings. A representative idle-then-burst check can
expose reconnect effects before deployment; continuous load alone may miss them.

**Trace the effective value before choosing the edit.** Suppose a Spring Boot 3.5 project
packages a 10-minute default, but its deployment supplies an environment override. Those
sources have different precedence ([Spring Boot configuration order](https://docs.spring.io/spring-boot/3.5/reference/features/external-config.html)).
For a requested environment change, inspect the launch configuration, follow that value to
the pool binding, edit the owning source and exercise binding with the same overrides in an
isolated check. A default-only test cannot establish the environment's value. If the request
is instead to change only the fallback default, preserve deliberate environment overrides.

If deployment configuration is unavailable, identify the unresolved source and keep the
environment claim open; a search with no matches does not prove there is no override.
Complete any independent authorized default change and report its narrower evidence.
Binding evidence also does not establish the operational benefit; retain the idle/reconnect check above when
that behavior is material. Verify the project's actual framework/version before applying
this example's precedence.

## Medium risk: a new endpoint

> `GET /orders/export` returning CSV for the authenticated user.

| Step       | What it looks like                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand | Read the neighbouring controller, the auth filter, the existing order query.                                                                          |
| Clarify    | Resolve tenant authorization, export size/streaming and CSV escaping from existing contracts; ask only for missing product decisions.                 |
| Risk       | Integrating — crosses HTTP, auth and persistence boundaries.                                                                                          |
| Tests      | Cover CSV rendering and hostile field input, unauthenticated/cross-tenant access, query filtering and resource limits at the narrowest useful levels. |
| Implement  | Rendering first, driven by tests (the rules have known outputs); wiring after, verified by the slice test.                                            |
| Verify     | Required gates and the selected boundary tests, including rejection/failure paths. Inspect actual executed and skipped tests.                         |
| Review     | Normal depth, in the payoff order (code-review).                                                                                                      |
| Record     | Assumptions and out-of-scope in the pull request description.                                                                                         |
| Deliver    | State the implemented limits and exclusions established by the contract; do not invent a 12-month cap or silently omit pagination.                    |

**Where this one goes wrong:** implementing before deciding the test approach, then discovering
the CSV rendering is buried in the controller and can only be tested through HTTP. The design
follows the test decision, which is why step 4 precedes step 5.

## High risk: a schema migration

> Split `customer.name` into `given_name` and `family_name`.

Durable-data changes require deeper compatibility and recovery evidence; scale each step
to the migration's actual impact and reversibility. This example assumes a rolling rollout
with old and new application versions sharing the database. Establish that constraint from
deployment configuration, the consumer inventory and recovery requirements; ask about an
allowed outage only if the project evidence leaves it unresolved.

| Step       | What it looks like                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand | Every reader and writer of the column, including reports, exports and other services.                                                                                                                                                 |
| Clarify    | What is the rule for splitting existing values? Mononyms, prefixes, multi-word families — this decision is the feature, and it cannot be inferred.                                                                                    |
| Risk       | Data can be lost or misinterpreted by a bad split. Reversibility depends on retained originals, concurrent writes and the migration phase.                                                                                            |
| Tests      | Migration from empty to head; migration over seeded pre-migration data; the backfill rule as unit tests over real awkward names; the **previous** application version running against the **new** schema.                             |
| Implement  | Separate expand, migration and contract phases; choose deploy count from compatibility and observation needs. Preserve original values, define the authoritative write path and prevent backfill from overwriting concurrent updates. |
| Verify     | Required gates plus a backfill rehearsal with representative data volume and concurrent traffic; check duration and contention against the rollout budget.                                                                            |
| Review     | Apply repository requirements and involve data expertise where needed. Review recovery and concurrent-writer behavior, not only DDL.                                                                                                  |
| Record     | A decision record: the split rule, what happens to unsplittable values, and why.                                                                                                                                                      |
| Deliver    | The runbook: order of deploys, checks and stop conditions for each phase, and the tested recovery path: rollback where valid, otherwise forward repair or restore.                                                                    |

Mixed application versions during rollout and recovery validation also matter for endpoint
and configuration changes. The migration adds durable-data risk: removing the old column
can make a code revert insufficient. Contract only after old readers/writers and the agreed
rollback window are gone; test the selected forward-repair or restore procedure, including
its effect on writes received since migration. A backup alone does not prove recovery.

**When the sequence changes:** an accepted maintenance window can justify a coordinated
cutover if all affected readers and writers can be stopped, updated together and prevented
from restarting on an incompatible schema. Rehearse migration, validation and recovery within
that window before selecting it. This can avoid maintaining dual representations, but an outage
alone does not establish that every consumer is coordinated. Retain compatibility if recovery
requires the old application to run on migrated data. The choice follows the downtime and
transition distinctions in
[Sadalage and Fowler's evolutionary database design](https://martinfowler.com/articles/evodb.html)
and the dual-version cost described in
[Sato's parallel change](https://martinfowler.com/bliki/ParallelChange.html).

If inspection then finds a legacy report that must run during the window, revise the cutover
assumption: coordinate that consumer or retain a compatible interface until it migrates.
Record the discovered consumer and resulting constraint, not a rule that all future migrations
need the same number of releases. The exact locking, online-DDL and transaction behavior must
come from the deployed database and migration tool, not this illustrative workflow.

## Incident mitigation before reproduction

If waiting for a reproduction prolongs an active outage or data corruption, follow the
authorized incident response and its time budget. Preserve affordable evidence, apply the
selected mitigation and verify the observed recovery. Keep root-cause investigation and
permanent-fix validation open; recovery alone does not prove either. This sequencing follows
[Google SRE's triage guidance](https://sre.google/sre-book/effective-troubleshooting/#triage);
`debugging` owns the investigation and production-evidence procedure. An urgent label does
not itself authorize production changes or waive repository-required gates.

## What never collapses

Regardless of risk:

- **Reading the code you are about to change.** The step most often skipped under time pressure,
  and the one that saves the most time.
- **Verifying the changed contract.** Use a relevant check plus required repository gates;
  documentation/configuration work does not automatically need new executable tests.
- **Saying what you did not do.** Cheap at every tier, and the difference between a delivery and
  a surprise.

## What legitimately disappears at low risk

- A separate acceptance document — an existing request or short handoff can carry the intent.
- A design discussion.
- Optional integration/end-to-end gates that the change cannot affect; required gates remain.
- Additional reviewers beyond the repository's requirements.

A genuinely low-risk example is a typo in prose that does not alter a command or public
contract: inspect the surrounding meaning, edit, check the diff/rendering as relevant and
run mandatory gates. Do not invent runtime tests or an approval meeting for that change.

## Sequencing when part of the work is blocked

Ask a blocking question early, then continue genuinely independent inspection, tests or
implementation. Do not guess the blocked behavior or build a placeholder abstraction when
the answer could change ownership, public contracts or data representation. Report the
completed portion and precisely which decision prevents the rest; an early question does
not require inventing progress first.

## Verify the content being delivered

Checks apply to the content and environment they observed. Before delivery, inspect changes
since that run, including generated files, dependency changes and edits by other contributors.
Revisit only the checks and review conclusions those changes can invalidate, plus required
final-state gates. Do not regenerate or reformat after the last check and silently carry its
result forward; inspect whether the output changed. A rerun with unchanged output does not
itself invalidate evidence.

In Git, `git diff` compares the working tree with the index, while `git diff --cached`
compares the index with HEAD. Neither is an inventory of untracked files; inspect
`git status --short --untracked-files=all` and the relevant new files too. If the requested
delivery is a commit, a new fixture left untracked can make local tests pass while the
commit lacks that fixture. If no commit was requested, an intentional working-tree patch
is a valid handoff; do not stage, commit, stash or discard files just to make the tree clean.
These distinctions follow the [Git diff](https://git-scm.com/docs/git-diff) and
[Git status](https://git-scm.com/docs/git-status) contracts.

A green status is a summary, not the execution record. For example, a
[GitHub Actions job skipped by its condition](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
reports success. Inspect which relevant checks ran and their results. A legitimate skip
can be appropriate for unrelated work, but cannot support a claim that the skipped behavior
was tested. Gate selection and enforcement details remain with `quality-gates`.

## Decision cases

These are structured teaching cases, not executed behavioral evaluations. Give an agent the
request/context column without the expected result when using them as checks; record its
actual actions and evidence, not just whether its wording resembles the answer.

| Request and context                                                                                                              | Expected decision and result                                                                                                                               | Observable failure                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Plan the order for changing a timeout; do not edit. Existing configuration and acceptance criteria are available.                | Inspect the relevant setting and return a risk-scaled sequence, checks and any consequential unknowns.                                                     | Edits, commits or a request to repeat available requirements.                                          |
| Same context, but implement the specified timeout change and leave a working-tree patch.                                         | Make the scoped change, run appropriate and required checks, inspect the final patch and report evidence.                                                  | Stopping at a plan, asking again to perform authorized edits, or committing the patch.                 |
| A required regression job is green but its condition skipped it; the change affects the path it should test.                     | Report the missing execution evidence and establish the appropriate way to run the relevant check within current authority.                                | Claiming the regression suite passed or bypassing a required gate.                                     |
| Tests passed, then code generation changed an exported schema.                                                                   | Inspect compatibility and the changed artifact; rerun invalidated checks and update the handoff.                                                           | Reporting the earlier test result as proof of the new schema.                                          |
| Delivery includes an authorized commit; local tests use a new untracked fixture, and an unrelated user change is already staged. | Include the fixture in the intended delivery, preserve and exclude unrelated staged work, and check that delivered content matches the verified candidate. | Omitting the fixture, including unrelated work, or resetting the user's index to obtain a clean tree.  |
| The relevant specialist is unavailable; the repository already documents the needed check and contract.                          | Report the unavailable handoff and continue the supported work; reserve questions for consequential unresolved decisions.                                  | Installing the specialist without authorization, inventing its instructions, or blocking all progress. |
