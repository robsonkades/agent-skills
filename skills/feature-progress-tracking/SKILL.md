---
name: feature-progress-tracking
description: >
  Keeping a feature's state true while it is being built: one status per resource with defined
  transitions, a validation line required before anything reaches done, and a persisted record
  current enough that another agent or another session can resume from it without asking. Use
  when a feature spans more than one sitting, when someone else may pick the work up, when the
  answer to "where are we" is a summary of the conversation, when resources are marked done
  because code was written for them, when a blocker has been open long enough that nobody
  remembers what it needs, or when a plan and the code have silently diverged. Does not
  implement the resources (feature-execution), does not decide what counts as a resource
  (feature-decomposition), and does not perform the final review
  (feature-readiness-review).
---

# Feature Progress Tracking

## Purpose

Durable records preserve evidence and unfinished work across handoffs. Reconstruction is
possible from diffs, logs and test results, but uncertainty must remain visible; do not invent
start times or past validation merely to complete a table.

This skill exists so that a second agent, opening the repository with no history, can read one
entry point and find the current state, supporting evidence and next ready work.

## The status set

| Status          | Means                                                | Entered when                           |
| --------------- | ---------------------------------------------------- | -------------------------------------- |
| **TODO**        | Defined, not started                                 | The resource is created                |
| **IN_PROGRESS** | Started, with implementation or validation remaining | Work starts; may be paused for handoff |
| **BLOCKED**     | Cannot proceed for a reason outside the work         | The blocker is identified              |
| **DONE**        | Implemented and validated                            | The validation ran and passed          |
| **SKIPPED**     | Deliberately not done in this feature; still wanted  | A decision, with a reason and an owner |
| **CANCELLED**   | No longer needed at all                              | The reason it existed went away        |

Common transitions (additional evidence-based transitions are described below):

```text
TODO ──► IN_PROGRESS ──► DONE
  │           │  ▲
  │           ▼  │
  │        BLOCKED
  │           │
  ├──► SKIPPED ◄┘
  └──► CANCELLED

DONE ──► IN_PROGRESS     only when a later change reopens it; say what reopened it
```

The normal path is TODO → IN_PROGRESS → DONE. A direct TODO → DONE transition is acceptable for an
atomic task completed and validated between observations; record the validation rather than
inventing historical states. BLOCKED normally returns through IN_PROGRESS, but the blocker may also
make the resource CANCELLED or prove that no work remained. DONE still requires valid acceptance
evidence, even when a resolved blocker needs no new code. State transitions serve truthful
resumption, not workflow accounting for its own sake.

## Workflow

1. **Create the table when resources are defined**, initially TODO for unstarted work. When
   tracking begins later, reconstruct only evidence-supported state and label unknowns.
2. **Update at durable handoff points and material transitions.** For multi-session or parallel
   work, update before ownership changes and before ending a session. Do not turn sub-minute local
   edits into an event stream that costs more than the work.
3. **Require relevant acceptance evidence for DONE.** Link what ran, results and the checked
   code/contract revision and environment; a command name alone is not a passing result.
4. **Record a blocker with its question**, what it blocks, and what continues meanwhile.
5. **Append to the execution log** on start, completion, blocking, unblocking and any plan
   change. The log is append-only; a correction is a new entry.
6. **Leave the files true at the end of every session**, whatever state the work is in.
7. **Track revision impact.** Record the Product/Engineering or Tech baseline and plan revision. When
   either changes, reopen only traced `RES-*`, mark their prior `EV-*` stale, and name what triggered it.

Formats for both files, and the resumption procedure, are in
`references/artefact-formats.md`.

## Decision rules

```text
IF a resource has been implemented but not validated
THEN it is IN_PROGRESS, or BLOCKED when an external impediment prevents required validation.
     Record implemented work and missing evidence; do not call it qualified DONE.

IF validation was run and something failed
THEN investigate the cause; an implementation defect stays IN_PROGRESS, an external
     impediment can be BLOCKED. A required failing check does not support DONE.

IF a resource is DONE and a later resource breaks it
THEN it returns to IN_PROGRESS, and the log says which resource reopened it.

IF an accepted baseline or CT-* changes
THEN trace the impact to RES-*/EV-*, reopen affected rows, and preserve unaffected DONE evidence.

IF a resource is skipped
THEN say who decided and why, and whether the feature is complete without it —
     usually it means the scope table needs the item moved out of Required.

IF the same resource has been IN_PROGRESS across three sessions
THEN inspect remaining work, session length and dependencies. Split only when useful;
     session count alone proves neither oversizing nor an external blocker.

IF the progress file and the code disagree
THEN reconcile accepted scope, code revision and evidence before changing state. The tracker
     may be stale, the implementation may have regressed, or a supersession may be missing.
     Record what was established and reopen affected work; do not rewrite acceptance to fit code.

IF the feature is Light/Inline
THEN there is no tracking artefact. Do not create one to have a process.
```

## Constraints

- **Make concurrent ownership explicit.** Prefer one owner per resource and mergeable per-resource
  records or append-only events. If a shared table has multiple writers, use ordinary source-control
  conflict detection and reconcile from validation evidence; “one writer” is an operating choice,
  not a guarantee in a distributed workflow.
- **Never mark DONE optimistically.** "It should work" is IN_PROGRESS with a note.
- **Never delete a row.** Cancelled and skipped rows are the record of decisions.
- **Preserve decision history.** Append corrections, identify actor/resource/revision, and
  distinguish event time from recording time. Concurrent wall-clock order is not dependency
  order. Avoid secrets and personal payloads; if sensitive material was recorded, follow the
  repository's redaction procedure and retain a sanitized correction trail.

## Output

The progress table, current, and the report derived from it:

```text
Feature      Asynchronous order dispatch
Resources    10 total — 4 DONE, 1 IN_PROGRESS, 2 BLOCKED, 2 TODO, 1 CANCELLED
Blocked on   Q-08 (uniqueness scope for the idempotency key), asked 2026-09-05
Next         RES-09 (metrics), unaffected by the blocker
Plan changes RES-06 added 2026-09-05; RES-11 cancelled 2026-09-04
```

Keep the report proportionate; include material validation gaps and changed assumptions when
the five-line summary would hide them. Resource counts are not effort percentages or release readiness.
