# Artefact formats

These examples are illustrative formats, not observed execution results. Fill placeholders from
actual evidence and leave missing historical details unknown.

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
Tracking writer: coordinator maintains this snapshot/log from resource-owner updates.
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
Resolution owner: product owner named in the accepted definition; agent-A tracks Q-08.
Unblocks when: an applicable answer from that owner or an evidenced delegate establishes the
uniqueness rule, with its source/revision recorded and affected criteria/contracts reconciled.

## Next

RES-09 (agent-B): inspect the metric paths listed in plan.md#res-09 and identify which
required counters are missing before implementing them. This work is unaffected by Q-08.
RES-05 (agent-A): open DispatchConsumerTest and complete the poison-message scenario
specified in plan.md#res-05, then capture its validation outcome. The happy-path test is unrun.

## Evidence

EV-01..EV-04: link each result to its command, selected/passed/skipped counts or asserted
outcome, timestamp, code and contract revision, test environment and limitations.
For EV-01 include engine/version, fixture shape and migration assertions. An empty test
selection does not establish acceptance; a result from another revision needs an explicit
impact assessment before it supports current acceptance.
Do not mark these illustrative DONE rows as real results without those records.
```

Three properties to preserve: the validation column contains what ran rather than a tick, the
blocker section states the question in full, and "Next" names ready work, its owner and starting point.
If RES-05's poison-message work depends on unresolved idempotency semantics, keep that part
blocked rather than assuming all work on the consumer is independent.

## Evidence that survives a handoff

Use the existing evidence record rather than creating another tracking system. Retain the check
identity, observed outcome, checked revision, relevant environment and acceptance coverage shown
above, plus a stable run/attempt identifier when available. A link to the latest pipeline can
change its target; a local temporary report may disappear when the session ends. Check that the
next owner can use the cited evidence, and record known access or retention limits.

Keep only the detail needed to substantiate acceptance under the project's requirements; do not
copy entire logs or sensitive payloads by default. GitHub Actions, for example, supports
[configurable artifact retention](https://docs.github.com/en/actions/tutorials/store-and-share-data#configuring-a-custom-artifact-retention-period);
a saved artifact URL is not a promise of permanent availability. This does not authorize changing
CI retention, exporting artifacts or granting access.

If evidence becomes inaccessible, preserve what was actually observed and distinguish an access
gap from a failed or unexecuted check:

- An expired raw report with a retained, applicable result sufficient under the project's
  evidence requirements can leave DONE intact. Note the lost detail; do not rerun solely because
  the link expired.
- An expired report whose only remaining record is a green badge cannot establish which revision
  or acceptance checks passed. Reopen the affected completion claim as IN_PROGRESS, or BLOCKED
  if an external dependency prevents obtaining required evidence. Record the gap and arrange
  targeted retrieval or validation with the resource owner; do not invent the missing result.

If the project requires the original artifact, a summary alone cannot replace it. Preserve other
resources' sufficient evidence and distinguish this evidence gap from an implementation defect.

## Evidence applicability and reruns

When a new result arrives, match the resource's required coverage to the checks actually run,
their outcome and the revision and environment actually checked. Record omitted, skipped,
cancelled or still-running required checks as gaps, not passes. A focused rerun can complete
coverage alongside earlier applicable results; it need not repeat unrelated successful checks.
Retain each contributing attempt so a passing retry does not erase the original failure or imply
its cause was diagnosed. Unresolved instability remains visible under the project's acceptance
requirements; do not invent a universal number of green retries.

For GitHub Actions, [reruns retain the original event's SHA and ref and may target selected
jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).
The [run ID stays the same while the attempt number increases](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables).
Inspect what the checkout/build actually consumed if the workflow overrides that revision. A
new attempt's timestamp alone is not evidence that the current working tree was tested. Apply
the same provenance check to the actual CI system in use, without assuming GitHub's identifiers.

Assess changes by their effect on the evidence's scope. For example, a completed consumer's
passing poison-message tests may remain applicable after an unrelated documentation correction.
If the accepted acknowledgement configuration changes, those earlier results no longer establish
that path under the new configuration. Reopen the affected resource, preserve the old result as
historical evidence, and name the missing check for the new condition. Keep unrelated DONE rows.
An unchanged commit does not establish equivalence when relevant configuration or dependencies
changed outside it; record the assumption checked, not just the commit label.

## execution-log.md

Append corrections at the bottom with actor, resource, baseline and recording time. Preserve
original observations; do not infer causal ordering from concurrent timestamps. Sensitive
content follows the repository's redaction process, with a sanitized audit note.

```markdown
# Execution log

## 2026-09-04

Recorded: <actual recording timestamp>; actor: agent-A.
Baseline: Product r3 / Engineering r2; plan r3; code: <commit plus relevant working-tree revision>.
Event dates: 2026-09-04; exact start/completion times were not captured.

RES-01 started.
RES-01 done. Applied V42 to a copy of the current schema (40,112 rows); all rows read
back as LEGACY. Files: V42__order_dispatch_state.sql. EV-01 records the command,
assertions, checked revision and environment.
RES-11 cancelled. ED-11 identifies its scope as duplicate producer transport retries already
covered by the configured client; application retries, duplicate effects and deadlines retain
their existing owners and required tests. Broker retries alone do not cover those contracts.
Plan amended accordingly.

## 2026-09-05

Recorded: <actual recording timestamp>; actor: agent-A.
Baseline: Product r3 / Engineering r2; plan r3 -> r4; code: <commit plus relevant working-tree revision>.
Event dates: 2026-09-05; exact event times were not captured.

RES-05 started.
RES-05 paused, IN_PROGRESS. Consumer, deserialisation and happy path implemented;
DispatchConsumerTest written but not run. Poison path outstanding.
RES-07 blocked. The uniqueness scope of the idempotency key depends on whether a
repeated dispatch is a duplicate. Asked as Q-08. Blocks RES-08. Agent-B continues with RES-09.
Plan amended: RES-06 added — implementing RES-05 revealed an acknowledgement-path question
that no resource covered. Check the existing container/base
consumer before adding manual acknowledgement; duplicated acknowledgement can break delivery.
Impact map updated.
```

What the log is for: reconstructing **why** the current state is what it is. The status table
says where things stand; the log says how they got there, and it is the artefact that makes a
surprise explicable three weeks later.

## Resuming from the artefacts

Find the established entry point from the repository's feature index, task link or existing
tracking convention. Follow its links before creating another tracker. If a link is missing,
search the feature/resource IDs and affected paths in the likely documentation locations.
Report what was searched and any access failure; one failed lookup does not establish that no
record exists. With competing copies, compare scope, revisions and accepted supersession links;
the newest filename or modification time does not establish authority.

Use this reading order for the selected resource and its prerequisites. The names are roles
in the existing format, not required filenames:

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

Reconcile sources according to the claim they support: an accepted contract establishes intended
behavior, code shows the implementation, and a check result establishes only what ran under its
recorded conditions. A recent log entry may correct a stale table, but is not itself validation.
For a discrepancy, retain the old claim and its source in history; record what was inspected,
what is now established, the affected IDs and any remaining uncertainty. Correct the snapshot
from that evidence. For example, an IN_PROGRESS row can become DONE if existing applicable
evidence covers all remaining acceptance; a DONE row with invalidated coverage must reopen.
Do not pick whichever source looks most complete, rewrite acceptance to fit code, or reset all
resources because one record is stale.

Check recorded answers before asking the same question again. Resolve a blocker only when its
answer or restored condition is evidenced, applicable to the current revision, and within the
responder's established authority where a decision is required. Record the resolution source
and reassess dependent work; a proposal or expired decision alone does not unblock it. An
unstarted resource whose impediment is gone may return to TODO; unfinished started work resumes
as IN_PROGRESS. Unblocking does not imply DONE. If the current commitment cannot be established,
record the conflicting sources and the specific owner/evidence needed to resolve them; continue
work whose readiness does not depend on that conflict.

Replace a stale "Next" with an action per available owner supported by the reconciled dependencies.
Name its starting file, section or check, the result it should produce, and any condition that
must be resolved first. "Continue RES-05" is insufficient when the next owner must rediscover
which assertion failed or which question remained open. A tracking-only request stops at this
handoff; route implementation or required validation to the resource owner without implying it
ran. Before handing off, reopen the entry point and follow the selected resource's links to
confirm that the correction, supporting evidence and next action were actually persisted. Record
any inaccessible evidence and apply the evidence-retention rules above.

## Feature status line

For a report, a status update or a commit message, derive the counts from the table:

```text
async-order-dispatch: 4/10 done, 1 in progress, 2 blocked (Q-08), 2 todo, 1 cancelled — next RES-09 (agent-B)
```

Add a short delta when counts hide useful progress: what evidence changed, which constraint or
blocker matters now, and the next action's owner and intended result. If scope changed, name the
added, split or retired IDs; do not compare the old and new ratios as a delivery-speed measure.
When nothing material changed, say which condition is still outstanding rather than inventing
progress. Tracking supplies facts for a forecast; it does not derive dates from resource counts.

For a failed attempt that changes the plan, keep a feature-local lesson in the existing log:
attempt and conditions → observed result → supported adjustment → next verification. For example,
if validation never started because a runner could not obtain its database fixture, record that
execution gap and the fixture-restoration check; do not report a tested implementation failure.
If the fixture was available and an acceptance assertion failed, record the assertion and route
the defect to its resource owner. A later pass can support completion when required coverage is
sufficient, but does not by itself prove which intervention caused recovery. Do not turn one
outcome into a project-wide policy or create a separate memory system.
