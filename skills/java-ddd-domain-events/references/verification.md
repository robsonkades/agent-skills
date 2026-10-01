# Verify the declared event contract

Read when adding a producer, changing pending-event management or repairing loss/duplicates.
Adapt these scenarios to existing tests and run the affected ones. This document lists
cases; it does not establish that an application has passed them.

## Pure domain checks

- **Accepted transition:** starting from a valid draft, submit once and assert the accepted
  state plus exactly the intended event type, subject identity and occurrence data. Assert
  business meaning; a test that only verifies `registerEvent` was called misses the payload.
- **Rejected transition:** exercise an invalid draft/status and assert that both state and
  pending events are unchanged. If a fallible value computation fails, apply the same check.
- **Repeated command:** submit twice and assert the selected rejection/idempotency policy.
  If reopen/resubmit is legal, prove it produces a new occurrence instead of being silently
  discarded as a duplicate of the first submission.
- **Historical snapshot:** change permitted aggregate state after registration and assert
  that the old event still contains its original data. Also mutate any original input list
  and its elements to challenge shallow copying.
- **Time and identity:** use fixed inputs or an injected fixed clock. Assert occurrence time
  independently of recording/publication time. A redelivery or historical reconstruction
  preserves its accepted ID/time instead of generating another occurrence.
- **Rehydration:** persist/load an existing aggregate and assert that loading adds no new
  pending event. Keep legitimate creation events as a separate case.

## Application and unit-of-work checks

Use an in-memory gateway for business orchestration, with a fake collector if appropriate.
It can prove delegation and event selection; it cannot prove database rollback, transaction
participation or restart recovery.

| Failure or sequence                    | Observable result to establish                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Save rejects a stale aggregate version | No committed state or publication intent from the losing transition              |
| Save fails after an event is collected | Failed instance is discarded or both state and event bookkeeping are restored    |
| Same aggregate is saved twice          | Each accepted occurrence is staged once under the declared unit-of-work policy   |
| Two transitions occur before save      | Both intended snapshots survive with their specified local order                 |
| Handler adds another event             | Batch cleanup neither drops it nor triggers an unbounded dispatch cycle          |
| Second handler fails                   | Earlier effects follow the chosen rollback/retry policy, including repeat safety |

For batch ownership, capture pending events, append another occurrence, then acknowledge
only the captured batch. The snapshot must remain unchanged and the new occurrence must
remain pending, even when its payload/time equal an earlier occurrence. This challenges
both live read-only views and cleanup based on value equality.

Keep aggregate state restoration separate from list restoration. Returning the old events
to a list does not undo an in-memory state mutation or repair an optimistic-lock failure.

## Database and integration checks, only when that path exists

For an atomic state/outbox claim, use the real database/transaction wiring and observe
committed state from outside the tested transaction. Assert both writes on success and
neither on rollback, including failure after the first write. A test transaction that always
rolls back can conceal a broken after-commit path. Capture events at the external adapter
boundary to show no rolled-back fact escapes.

For an existing recovery mechanism, interrupt after commit but before send; the stored intent
must remain recoverable. Then interrupt after a successful send but before delivery status
is persisted: replay must preserve occurrence identity, and the consumer must apply its
effect according to its duplicate policy. Report orderly restart tests separately from
process-kill tests. Do not claim a process-crash guarantee from an exception-only test.

For command retry recovery, distinguish confirmed rollback from a commit whose response
is lost. In the latter case, reconciliation or retry under the same operation identity
must not create another accepted transition/publication intent. Generating a fresh event
ID on retry must not bypass the command's idempotency policy. Exercise the real failure
boundary when claiming this guarantee; a fake that always rolls back cannot establish it.

If the implementation intentionally uses best-effort local callbacks, assert its documented
timing and failure behavior. Record acceptable loss explicitly instead of writing a test
name that promises durable delivery. For Spring, include the real proxy entry, no-transaction
behavior and listener phase when relevant.

If order matters, send two distinguishable events for one aggregate and challenge their
order/duplication at the boundary that claims to enforce it. A list-order unit test proves
only in-memory order. Include concurrent writers if revisions are used as an order key.
If one local event maps to multiple messages, challenge deduplication collisions between them.

For serialized contracts, test retained historical payloads against supported readers and
inspect the payload for excluded private fields. Exercise a consumer that reloads state
after the aggregate has advanced to establish whether current-state semantics are acceptable.

## Closing evidence

Report the selected scenarios, actual commands and observed results with any limits. Keep
missing fixtures or inaccessible broker/database evidence explicit. A package, class or
annotation inspection can identify a suspicious dual write; confirming the guarantee also
requires the enlisted resources and actual failure path. Do not introduce a new broker or
test platform merely to validate an in-process domain fact.
