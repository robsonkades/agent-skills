# Workflow by risk

The nine steps are the same in every case. What changes is how much each one costs — and for
low-risk work, most of them collapse to seconds rather than disappearing.

## Low risk: a configuration default

> Change the connection pool's idle timeout from 10 minutes to 5.

| Step       | What it collapses to                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Understand | Find where the value is set and who reads it. **Two minutes, not skippable.**                                                  |
| Clarify    | One question, because there is one: why 5? If the answer is "it feels better", stop — that is a change with no stated problem. |
| Risk       | Higher than the diff suggests. This affects every database call under load.                                                    |
| Tests      | A configuration test asserting the value, if one exists. Nothing new.                                                          |
| Implement  | One line.                                                                                                                      |
| Verify     | Build and the suite; plus a note of what to watch after deploy.                                                                |
| Review     | One reviewer, focused on the operational consequence rather than the line.                                                     |
| Record     | The reason, in the commit message. This is the whole documentation.                                                            |
| Deliver    | Name the metric that will show whether it helped.                                                                              |

**The trap:** a one-line diff invites a one-second review. Timeouts, pool sizes, retry counts,
feature-flag defaults and cache TTLs are the highest risk-per-line changes in most systems,
because their effect appears only under production load and only after deploy.

## Medium risk: a new endpoint

> `GET /orders/export` returning CSV for the authenticated user.

| Step       | What it looks like                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Understand | Read the neighbouring controller, the auth filter, the existing order query.                                                           |
| Clarify    | Run the ambiguity checklist. Realistically eight questions; ask three, assume five, record all (requirements-and-acceptance).          |
| Risk       | Integrating — crosses HTTP, auth and persistence boundaries.                                                                           |
| Tests      | Unit tests for the CSV rendering rules; a slice test for routing and auth; one integration test for the query (java-testing-strategy). |
| Implement  | Rendering first, driven by tests (the rules have known outputs); wiring after, verified by the slice test.                             |
| Verify     | Full suite, architecture tests, integration tests. Read the output.                                                                    |
| Review     | Normal depth, in the payoff order (code-review).                                                                                       |
| Record     | Assumptions and out-of-scope in the pull request description.                                                                          |
| Deliver    | State what is not covered: no pagination, cap at 12 months, no admin access.                                                           |

**Where this one goes wrong:** implementing before deciding the test approach, then discovering
the CSV rendering is buried in the controller and can only be tested through HTTP. The design
follows the test decision, which is why step 4 precedes step 5.

## High risk: a schema migration

> Split `customer.name` into `given_name` and `family_name`.

Every step is at full weight, and two extra concerns appear that lower tiers do not have.

| Step       | What it looks like                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand | Every reader and writer of the column, including reports, exports and other services.                                                                                                                     |
| Clarify    | What is the rule for splitting existing values? Mononyms, prefixes, multi-word families — this decision is the feature, and it cannot be inferred.                                                        |
| Risk       | Irreversible. Data can be lost by a bad split and not noticed for months.                                                                                                                                 |
| Tests      | Migration from empty to head; migration over seeded pre-migration data; the backfill rule as unit tests over real awkward names; the **previous** application version running against the **new** schema. |
| Implement  | Expand / migrate / contract, over three deploys — add columns, dual-write and backfill, then remove the old column once nothing reads it.                                                                 |
| Verify     | The full pipeline, plus the backfill timed against production-sized data. A backfill that took 20 minutes on the test dataset can take six hours on production.                                           |
| Review     | Two reviewers, one of whom knows the data. Review the rollback, not just the migration.                                                                                                                   |
| Record     | A decision record: the split rule, what happens to unsplittable values, and why.                                                                                                                          |
| Deliver    | The runbook: order of deploys, how to verify each, how to roll back each.                                                                                                                                 |

The two extra concerns: **both versions run simultaneously** during a rolling deploy, and
**rollback must be tested**, not written. Neither exists at the lower tiers, and both are what
make this tier different in kind rather than in degree.

## What never collapses

Regardless of risk:

- **Reading the code you are about to change.** The step most often skipped under time pressure,
  and the one that saves the most time.
- **Running what you changed.** Not the whole suite — the tests that cover it.
- **Saying what you did not do.** Cheap at every tier, and the difference between a delivery and
  a surprise.

## What legitimately disappears at low risk

- Written acceptance criteria — the commit message carries the intent.
- A design discussion.
- Integration and end-to-end gates that the change cannot affect.
- A second reviewer.

## Sequencing when part of the work is blocked

Waiting on an answer does not mean waiting. Do everything that does not depend on it, and put
the dependent part behind the smallest decision point you can — one constant, one method, one
interface — so that when the answer arrives, one place changes.

Then say, in the same message as the question, what you have built and what is waiting. A
question sent alone reads as no progress.
