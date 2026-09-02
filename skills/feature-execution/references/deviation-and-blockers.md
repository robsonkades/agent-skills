# Deviation and blockers

## Deviation

The plan will be wrong somewhere. That is not a failure of planning — it is what implementation
is for. The failure is deviating without recording it, because then the plan, the decisions and
the code all describe different systems and nobody knows which is current.

When implementation contradicts the plan, stop before writing more code and classify it:

| What happened                                          | Do this                                                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| A resource needs another resource that was not planned | Add it with its dependency; re-derive the order           |
| A resource turns out to be unnecessary                 | Mark CANCELLED with the reason; do not delete it          |
| A file needs changing that no resource names           | Amend the impact map, or recognise it as scope and decide |
| The planned approach does not work                     | This is a superseded decision, not a plan edit            |
| The validation cannot be run as planned                | Change the validation explicitly, and say what it loses   |
| A risk that was rated LOW turns out not to be          | Re-rate it; if it is now HIGH it needs a mitigation       |

The distinction that matters most is the fourth row. A plan amendment says "the same decision,
implemented differently". A superseded decision says "the choice was wrong". Recording the
second as the first is how a project loses the reason it does things.

```text
Amendment (plan)
2026-09-05  R-04 now returns 202 with a Location header rather than 200 with the
            body. Same decision (D-04, asynchronous dispatch); the original plan
            described the response shape incorrectly.

Supersession (decision)
D-04 superseded by D-09. Implementing R-02 showed the broker cannot give per-customer
ordering on the existing topic, which D-04 assumed. See ADR-004.
```

## Blockers

A resource is BLOCKED when it cannot proceed and the reason is outside the work itself: an
unanswered question, a missing credential, a dependency on someone else, an environment that
does not exist.

It is **not** blocked because it is hard, because a test fails, or because a decision is
agent-owned and has not been taken. Those are work.

Record it where it will be seen, with everything the next person needs:

```text
R-07  Idempotency key on dispatch_log       BLOCKED
      Since         2026-09-05
      Reason        The uniqueness scope depends on whether a customer may dispatch
                    the same order twice deliberately (retry after cancellation).
      Needs         A decision from the user: is a repeated dispatch of the same
                    order a duplicate to be suppressed, or a legitimate second
                    dispatch with its own id?
      Asked         2026-09-05, question Q-08
      Blocks        R-08 (consumer), K-02's mitigation
      Does not block R-09, R-10 — no forced dependency
      Meanwhile     Proceeding with R-09.
```

Four things make this useful: the question is stated so it can be answered without context, the
consequence of each answer is implied by the framing, what else stops is named, and what
continues is named.

## Rules

```text
IF a resource is blocked
THEN record it, ask the question, and move to the next unblocked resource —
     do not implement a placeholder on a guessed answer.

IF every remaining resource is blocked by the same question
THEN stop and say so plainly. That is the report; there is no partial progress to make.

IF a blocker is resolved
THEN record the answer and its source before resuming, so the resumed work is
     traceable to the answer rather than to a memory of it.

IF a blocker has been open across two sessions
THEN raise it as the headline of the report, not as a line in a status table.

IF work continues around a blocker
THEN say in every report which resources are complete but unvalidated because of it.
```

## Stopping mid-resource

A session can end anywhere. What must survive it:

```text
R-05  Dispatch consumer                     IN_PROGRESS
      Done so far   Consumer class, deserialisation, happy path handled.
      Next          Poison-message path (the plan's validation requires it) and the
                    idempotency check, which waits on R-07.
      Not yet run   DispatchConsumerTest — written but not executed.
      Working notes The existing consumer base class handles acknowledgement; do not
                    acknowledge manually (ShippingConsumer.java:44).
```

"Not yet run" is the field that prevents the next session from assuming validation happened.
