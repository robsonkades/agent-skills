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
| Implement  | One line.                                                                                                                                              |
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
to the migration's actual impact and reversibility.

| Step       | What it looks like                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand | Every reader and writer of the column, including reports, exports and other services.                                                                                                                                                 |
| Clarify    | What is the rule for splitting existing values? Mononyms, prefixes, multi-word families — this decision is the feature, and it cannot be inferred.                                                                                    |
| Risk       | Data can be lost or misinterpreted by a bad split. Reversibility depends on retained originals, concurrent writes and the migration phase.                                                                                            |
| Tests      | Migration from empty to head; migration over seeded pre-migration data; the backfill rule as unit tests over real awkward names; the **previous** application version running against the **new** schema.                             |
| Implement  | Separate expand, migration and contract phases; choose deploy count from compatibility and observation needs. Preserve original values, define the authoritative write path and prevent backfill from overwriting concurrent updates. |
| Verify     | The full pipeline, plus the backfill timed against production-sized data. A backfill that took 20 minutes on the test dataset can take six hours on production.                                                                       |
| Review     | Apply repository requirements and involve data expertise where needed. Review recovery and concurrent-writer behavior, not only DDL.                                                                                                  |
| Record     | A decision record: the split rule, what happens to unsplittable values, and why.                                                                                                                                                      |
| Deliver    | The runbook: order of deploys, checks and stop conditions for each phase, and the tested recovery path: rollback where valid, otherwise forward repair or restore.                                                                    |

Mixed application versions during rollout and recovery validation also matter for endpoint
and configuration changes. The migration adds durable-data risk: removing the old column
can make a code revert insufficient. Contract only after old readers/writers and the agreed
rollback window are gone; test the selected forward-repair or restore procedure, including
its effect on writes received since migration. A backup alone does not prove recovery.

The phase separation and compatibility concerns follow
[Sadalage and Fowler's evolutionary database design](https://martinfowler.com/articles/evodb.html).
The exact locking, online-DDL and transaction behavior must come from the deployed database
and migration tool, not this illustrative workflow.

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
