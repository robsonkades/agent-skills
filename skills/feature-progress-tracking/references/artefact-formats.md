# Artefact formats

## progress.md

The one file that must be current at all times. It is read first by anyone resuming, and it
must be sufficient on its own.

```markdown
# Asynchronous order dispatch — progress

Updated: 2026-09-05
Plan: plan.md Depth: Significant

## Resources

| ID   | Resource              | Status      | Validation                                               | Notes                   |
| ---- | --------------------- | ----------- | -------------------------------------------------------- | ----------------------- |
| R-01 | Dispatch state column | DONE        | V42 applied to schema copy; 40k rows read back as LEGACY |                         |
| R-02 | Order entity mapping  | DONE        | OrderTest — 9 tests, 9 passed                            |                         |
| R-03 | Dispatch service      | DONE        | DispatchServiceTest — 14 tests, passed                   |                         |
| R-04 | Dispatch endpoint     | DONE        | DispatchControllerTest — 4 tests, passed                 |                         |
| R-05 | Dispatch consumer     | IN_PROGRESS | not yet run                                              | poison path outstanding |
| R-07 | Idempotency key       | BLOCKED     | -                                                        | Q-08, since 2026-09-05  |
| R-09 | Dispatch metrics      | TODO        | -                                                        |                         |
| R-11 | Retry policy          | CANCELLED   | -                                                        | broker retries; D-11    |

## Blockers

Q-08 — Is a repeated dispatch of the same order a duplicate to suppress, or a
legitimate second dispatch with its own id?
Blocks R-07, and R-08 through it. Asked 2026-09-05. Does not block R-09.

## Next

R-09. R-05 resumes at the poison-message path.
```

Three properties to preserve: the validation column contains what ran rather than a tick, the
blocker section states the question in full, and "Next" is one unambiguous instruction.

## execution-log.md

Append-only, newest at the bottom. Entries are never edited; a correction is a new entry saying
what was wrong.

```markdown
# Execution log

## 2026-09-04

R-01 started.
R-01 done. Applied V42 to a copy of the current schema (40,112 rows); all rows read
back as LEGACY. Files: V42__order_dispatch_state.sql.
R-11 cancelled. The broker's own retry covers the case R-11 existed for; see D-11.
Plan amended accordingly.

## 2026-09-05

R-05 started.
R-05 paused, IN_PROGRESS. Consumer, deserialisation and happy path implemented;
DispatchConsumerTest written but not run. Poison path outstanding.
R-07 blocked. The uniqueness scope of the idempotency key depends on whether a
repeated dispatch is a duplicate. Asked as Q-08. Blocks R-08. Proceeding with R-09.
Plan amended: R-06 added — implementing R-05 showed the consumer needs an explicit
acknowledgement path that no resource covered. Impact map updated.
```

What the log is for: reconstructing **why** the current state is what it is. The status table
says where things stand; the log says how they got there, and it is the artefact that makes a
surprise explicable three weeks later.

## Resuming from the artefacts

An agent picking up an unfamiliar feature reads in this order and stops as soon as it can act:

1. **progress.md** — the table, the blockers, and "Next". Usually sufficient.
2. **plan.md** — the resource being resumed, its files and its validation, and the amendments
   section.
3. **execution-log.md**, last two entries — what was in flight and any note left behind.
4. **decisions/** — only the records the resource cites.
5. **analysis.md** — only if the resource's purpose is unclear from the plan.

Before doing anything, verify the table against the repository: check that the files listed for
DONE resources exist and that the validations named can be run. Where the file and the code
disagree, correct the file first and say so in the log. A resumed session that starts by
trusting a stale tracker builds on a false position.

## Feature status line

For a report, a status update or a commit message, derive one line from the table rather than
writing prose:

```text
async-order-dispatch: 6/11 done, 1 in progress, 1 blocked (Q-08), 1 cancelled — next R-09
```
