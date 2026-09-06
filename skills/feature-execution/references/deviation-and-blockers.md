# Deviation and blockers

## Deviation

The plan will be wrong somewhere. That is not a failure of planning — it is what implementation
is for. The failure is deviating without recording it, because then the plan, the decisions and
the code all describe different systems and nobody knows which is current.

When implementation contradicts the plan, pause the affected decision-dependent action and
classify it. Continue independent authorized work; fix an implementation bug rather than
rewriting the decision to excuse it.

| What happened                                          | Do this                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A resource needs another resource that was not planned | Add it with its dependency; re-derive the order                                                                               |
| A resource turns out to be unnecessary                 | Mark CANCELLED with the reason; do not delete it                                                                              |
| A file needs changing that no resource names           | Amend the impact map, or recognise it as scope and decide                                                                     |
| The planned approach appears not to work               | Distinguish an implementation bug from evidence invalidating a decision; supersede only the latter with appropriate authority |
| The validation cannot be run as planned                | Record the gap; use a justified equivalent or leave required validation pending                                               |
| A risk that was rated LOW turns out not to be          | Re-rate it; if it is now HIGH it needs a mitigation                                                                           |

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

IF a blocker has been open across two sessions
THEN raise it as the headline of the report, not as a line in a status table.

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
