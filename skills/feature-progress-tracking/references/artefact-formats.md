# Artefact formats

## progress.md

The current snapshot at material transitions and handoffs. It is the entry point for resuming,
with links to the plan, decisions and evidence; it does not replace reading the affected code.

```markdown
# Asynchronous order dispatch — progress

Updated: 2026-09-05
Input revisions: Product r3; Engineering r2
Plan: plan.md Depth: Deep Persistence: Dossier
Plan revision: r4
Ownership: agent-A owns RES-05/06/07/08; agent-B owns RES-09. Check current ownership before editing.
Code/evidence baseline: <commit plus relevant working-tree revision>; example values below are illustrative.

## Resources

| ID     | Resource               | Status      | Validation                                 | Notes                                           |
| ------ | ---------------------- | ----------- | ------------------------------------------ | ----------------------------------------------- |
| RES-01 | Dispatch state column  | DONE        | EV-01 V42 applied; 40k rows read as LEGACY |                                                 |
| RES-02 | Order entity mapping   | DONE        | EV-02 OrderTest — 9 tests passed           |                                                 |
| RES-03 | Dispatch service       | DONE        | EV-03 DispatchServiceTest — 14 passed      |                                                 |
| RES-04 | Dispatch endpoint      | DONE        | EV-04 ControllerTest — 4 passed            |                                                 |
| RES-05 | Dispatch consumer      | IN_PROGRESS | not yet run                                | poison path outstanding                         |
| RES-06 | Acknowledgement path   | TODO        | not yet run                                | added by plan r4; confirm existing owner of ack |
| RES-07 | Idempotency key        | BLOCKED     | -                                          | Q-08, since 2026-09-05                          |
| RES-08 | Consumer deduplication | BLOCKED     | not yet run                                | depends on RES-07/Q-08                          |
| RES-09 | Dispatch metrics       | TODO        | -                                          |                                                 |
| RES-11 | Retry policy           | CANCELLED   | -                                          | duplicate transport policy; ED-11               |

## Blockers

Q-08 — Is a repeated dispatch of the same order a duplicate to suppress, or a
legitimate second dispatch with its own id?
Blocks RES-07, and RES-08 through it. Asked 2026-09-05. Does not block RES-09.

## Next

RES-09. RES-05 resumes at the poison-message path.

## Evidence

EV-01..EV-04: link each result to its command, selected/passed/skipped counts or asserted
outcome, timestamp, code and contract revision, test environment and limitations.
For EV-01 include engine/version, fixture shape and migration assertions. A passing command
against another revision or an empty test selection does not establish current acceptance.
Do not mark these illustrative DONE rows as real results without those records.
```

Three properties to preserve: the validation column contains what ran rather than a tick, the
blocker section states the question in full, and "Next" names ready work and its owner.
If RES-05's poison-message work depends on unresolved idempotency semantics, keep that part
blocked rather than assuming all work on the consumer is independent.

## execution-log.md

Append corrections at the bottom with actor, resource, baseline and recording time. Preserve
original observations; do not infer causal ordering from concurrent timestamps. Sensitive
content follows the repository's redaction process, with a sanitized audit note.

```markdown
# Execution log

## 2026-09-04

RES-01 started.
RES-01 done. Applied V42 to a copy of the current schema (40,112 rows); all rows read
back as LEGACY. Files: V42__order_dispatch_state.sql.
RES-11 cancelled. ED-11 identifies its scope as duplicate producer transport retries already
covered by the configured client; application retries, duplicate effects and deadlines retain
their existing owners and required tests. Broker retries alone do not cover those contracts.
Plan amended accordingly.

## 2026-09-05

RES-05 started.
RES-05 paused, IN_PROGRESS. Consumer, deserialisation and happy path implemented;
DispatchConsumerTest written but not run. Poison path outstanding.
RES-07 blocked. The uniqueness scope of the idempotency key depends on whether a
repeated dispatch is a duplicate. Asked as Q-08. Blocks RES-08. Proceeding with RES-09.
Plan amended: RES-06 added — implementing RES-05 revealed an acknowledgement-path question
that no resource covered. Check the existing container/base
consumer before adding manual acknowledgement; duplicated acknowledgement can break delivery.
Impact map updated.
```

What the log is for: reconstructing **why** the current state is what it is. The status table
says where things stand; the log says how they got there, and it is the artefact that makes a
surprise explicable three weeks later.

## Resuming from the artefacts

An agent picking up an unfamiliar feature uses this reading order, then verifies readiness for
the selected resource before editing:

1. **progress.md** — the table, blockers, ownership, baselines and "Next".
2. **plan.md** — the resource being resumed, its files and its validation, and the amendments
   section.
3. **execution-log.md** — relevant entries since the last handoff and unresolved questions;
   the last two entries may concern unrelated parallel work.
4. **decisions/** — only the records the resource cites.
5. **analysis.md** — only if the resource's purpose is unclear from the plan.

Inspect applicable repository instructions, current authorization, ownership and working-tree
changes. Read the resumed resource's code, callers and tests; match its acceptance criteria
and evidence to the current revision. File existence and an executable test command prove
neither prior execution nor present correctness. Reuse unaffected valid evidence; rerun checks
when changes or gaps invalidate it, not merely because a new session began.

If state disagrees, determine whether tracking is stale, code regressed or the accepted plan
changed. Preserve other contributors' work and reopen only affected resources/evidence.
Resolve a blocker from recorded answers before asking the same question again.

## Feature status line

For a report, a status update or a commit message, derive one line from the table rather than
writing prose:

```text
async-order-dispatch: 4/10 done, 1 in progress, 2 blocked (Q-08), 2 todo, 1 cancelled — next RES-09 (agent-B)
```
