# Deviation and blockers

## Reconcile a planned target before changing it

Use the accepted behavior to locate the implementation, not just the plan's filenames.
Trace the caller, registration or configuration that selects it under the relevant supported
conditions. If a planned symbol is absent, check the owning module, renames and generated
sources or registration where applicable; a failed or narrowly scoped search does not establish
that a replacement is needed. Keep a consequential unresolved selection explicit.

- **The target moved or the plan names an unused implementation:** amend the resource's
  file/dependency map to the actual path while preserving its acceptance contract. Do not
  change the unused implementation merely to match the plan.
- **The existing path already meets the obligation:** verify it and record the evidence;
  remove redundant planned edits while preserving acceptance coverage and resource history.
- **The current path contradicts an accepted contract:** its existence does not supersede
  that contract. Classify the discrepancy below before changing scope or copying its behavior.

For example, a plan assigns CSV escaping to `LegacyExporter`, but the command registry routes
the supported `export` command to `StreamingExporter`. Tests constructing `LegacyExporter`
directly would miss this mismatch. Inspect the selected export path, reuse any escaping it
already provides, and amend the planned target. If selection intentionally awaits a separately
authorized rollout, keep that boundary: validate the prepared component under its own contract
and leave activation/integration as the named remaining work, rather than enabling it silently.

## Deviation

Implementation can reveal a mistaken premise or an omission in the plan. That does not make every
deviation a plan defect: the code may be wrong. Unrecorded changes leave the plan, decisions and code
describing different systems, so classify the evidence before amending any of them.

When implementation contradicts the plan, pause the affected decision-dependent action and
classify it. Continue independent authorized work; fix an implementation bug rather than
rewriting the decision to excuse it.

| What happened                                          | Do this                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A resource needs another resource that was not planned | Trace it to accepted scope or resolve a scope change; add its validation/dependency and re-derive the order                   |
| A resource turns out to be unnecessary                 | Establish continued acceptance coverage or an authorized scope revision; mark CANCELLED with reason and preserve history      |
| A file needs changing that no resource names           | Amend the impact map, or recognise it as scope and decide                                                                     |
| The planned approach appears not to work               | Distinguish an implementation bug from evidence invalidating a decision; supersede only the latter with appropriate authority |
| The validation cannot be run as planned                | Record the gap; use a justified equivalent or leave required validation pending                                               |
| A risk that was rated LOW turns out not to be          | Reassess the evidence and impact; mitigate or record a valid GAP accepted by its accountable owner where policy permits       |

An implementation correction preserves the accepted decision and contract. A plan amendment
changes how that contract is implemented. A supersession changes the decision because its
premise or consequences no longer hold; record evidence and reopen affected acceptance checks.

```text
Amendment (plan)
2026-09-05  CT-04 already requires 202 with Location; the plan incorrectly transcribed
            it as 200 with a body. Correct RES-04 to match CT-04 and run its contract tests.
            If CT-04 instead promised 200, this would require a contract revision and
            consumer-impact analysis, not merely a plan amendment.

Supersession (decision)
ED-04 superseded by accepted ED-09. A traced customer-region change moves events between
partitions; the old design had no cross-partition ordering mechanism for CT-02. See the
reproduction and revised publication/consumer migration in ADR-004.
```

## Carrying an execution finding forward

When a resolved deviation affects remaining work, retain the useful decision in the existing
resource notes or decision record: the observed failure, evidence distinguishing its cause,
the correction and validation, and the conditions under which it applies. Link affected
resource/acceptance IDs; do not create a separate lessons artifact for every fix. A successful
workaround is not automatically a project standard or permission to broaden the change.

For example, suppose concurrent tests fail because one test's cleanup deletes another's
fixture rows. Record the conflicting operations and the check after separating their fixture
ownership. Reuse that isolation for resources with the same accidental interference; preserve
the concurrent operations that acceptance requires. If two application requests instead
violate the accepted invariant while using the intended shared data, fixture separation would
hide the defect: correct the implementation and retain that contention in validation.

Until evidence distinguishes those causes, keep the explanation conditional. A passing serial
run can guide investigation; it does not establish either explanation or justify making all
tests serial. Revisit the recorded choice when ownership, required concurrency or target
environment changes, rather than copying the earlier workaround unconditionally.

## Blockers

A resource is BLOCKED when it cannot proceed and the reason is outside the work itself: an
unanswered question, a missing credential, a dependency on someone else, an environment that
does not exist.

A fixable implementation failure, hard task or authorized local choice is work, not an
external blocker. A failing test can reveal an unavailable environment or upstream dependency;
classify the actual impediment instead of classifying every red test alike.

Record it where it will be seen, with everything the next person needs:

```text
RES-07 Idempotency key on dispatch_log       BLOCKED
      Since         2026-09-05
      Reason        The uniqueness scope depends on whether a customer may dispatch
                    the same order twice deliberately (retry after cancellation).
      Needs         A decision from the Product owner: is a repeated dispatch of the same
                    order a duplicate to be suppressed, or a legitimate second
                    dispatch with its own id?
      Asked         2026-09-05, question Q-08
      Blocks        RES-08 (consumer), RISK-02's mitigation
      Does not block RES-09, RES-10 — no forced dependency
      Meanwhile     Proceeding with RES-09.
```

Four things make this useful: the question is stated so it can be answered without context, the
consequence of each answer is implied by the framing, what else stops is named, and what
continues is named.

## Rules

```text
IF a resource is blocked
THEN inspect existing answers, authorization and available evidence first. Record the
     remaining impediment and a focused question only if needed; continue the next ready
     independent resource. Do not guess a contract or insert a placeholder as accepted behavior.

IF every remaining resource is blocked by the same question
THEN finish any independent investigation, test preparation or review that can clarify the
     choice, and report the concrete blocked actions. Do not claim elapsed time is approval.

IF a blocker is resolved
THEN record the answer and its source before resuming, so the resumed work is
     traceable to the answer rather than to a memory of it.

IF a blocker threatens the next required outcome or handoff
THEN surface its impact and decision/evidence needed prominently; age alone does not set priority.

IF work continues around a blocker
THEN distinguish implemented-but-unvalidated resources from DONE ones, with the missing
     evidence and next action; do not create a qualified-DONE state for material test gaps.
```

## Stopping mid-resource

A session can end anywhere. What must survive it:

```text
RES-05 Dispatch consumer                     IN_PROGRESS
      Done so far   Consumer class, deserialisation, happy path handled.
      Next          Poison-message path (the plan's validation requires it) and the
                    idempotency check, which waits on RES-07.
      Not yet run   DispatchConsumerTest — written but not executed.
      Working notes The existing consumer base class handles acknowledgement; do not
                    acknowledge manually (ShippingConsumer.java:44).
```

"Not yet run" is the field that prevents the next session from assuming validation happened.

Also reconcile work outside the current call stack. Before releasing file ownership,
identify any validation jobs, generators or watchers you started that can still change the
owned files or their fixtures. Wait for a bounded check, stop an owned helper safely, or
explicitly transfer it to the receiving owner with its handle, target, current state and
next observation. A handoff entry alone does not transfer a process or prevent concurrent
writes. Do not stop unrelated user services or another owner's jobs.

If interruption leaves an operation's result unknown, record the last observed state,
possible effects and the evidence needed to distinguish running, completed and failed.
On resumption, inspect that evidence before restarting: a disconnected command can have
committed work even when no success message was captured. Reconcile the actual files or
durable job/migration state and repeat only when the operation's repeat/recovery contract
permits it. An unknown required result remains IN_PROGRESS, or BLOCKED if an external
impediment prevents resolving it; no new status or automatic rollback is needed.
