# Sagas and compensation in Java

Java 17+ sealed types plus a durable store; no saga framework assumed. Code is partial: participant,
storage, context and test-fixture types belong to the application. SQL below uses PostgreSQL syntax.

## Model the steps so the pivot is a type, not a comment

```java
public sealed interface SagaStep {
    String name();
    void execute(SagaContext ctx);
    non-sealed interface Compensatable extends SagaStep { void compensate(SagaContext ctx); }
    non-sealed interface Pivot extends SagaStep {}        // no compensation exists
    non-sealed interface ForwardOnly extends SagaStep {}  // retried, never compensated
}
```

A sealed interface with no `permits` clause permits the subtypes declared in the same file,
so the direct subtype set is closed. The non-sealed roles are not disjoint: one class can implement
both `Pivot` and `Compensatable`. Validate exactly one role per step, stable unique step IDs and
at most one pivot. A no-pivot plan contains only compensatable steps; before a pivot all steps are
compensatable, and after it all are forward-only. The compiler does not enforce plan order or prove
that a participant can compensate. Pattern-switch syntax additionally depends on the JDK.

## Persist intent before the call and transition atomically

```text
Claim current saga version -> receive updated state/version and ownership epoch.
For the current step:
  Commit STARTED with stable (saga, step, operation) identity; receive the new version.
  Invoke participant outside the storage transaction using that stable command key.
  On definite success:
    Atomically persist effect IDs, DONE and next position using expected version/epoch;
    receive updated state. Persist pivot-committed status here.
  On definite business rejection with no effect:
    Persist rejection and recovery direction using expected version/epoch.
    Before pivot commit: compensate completed steps; after commit: forward repair.
  On timeout, transport ambiguity or lost storage-commit response:
    Resolve durable store and participant status before retrying or changing direction.
    Leave recoverable STARTED/UNKNOWN state; do not convert storage failure to rejection.
On claim expiry/version conflict: stop transitions, reload under a valid claim.
Mark COMPLETED through a checked transition only after all required outcomes.
```

- Version/epoch checks prevent conflicting durable transitions, including failure/compensation
  states; they do not stop an expired coordinator's remote request. Stable participant keys and
  state rules remain necessary. A new transport attempt ID must not create a new business effect.
- `STARTED` commits **before** the call, so a crash mid-call leaves evidence that the step
  may have run; the recovery worker asks the participant for that step's status by saga id
  instead of guessing.
- Query by stable step identity, persist effect IDs and resolve a pivot's outcome before choosing
  backward versus forward recovery. `NOT_FOUND` does not prove an old execute cannot arrive later.
  Participants must serialize execute/cancel or retain cancellation tombstones for the replay horizon.
- Marking `DONE` and advancing position is one local transaction. Separate writes create a
  crash window in which recovery may misclassify the step.
- Nothing authoritative about the saga lives only in the thread, so restart resumes from the table — with a
  query that doubles as the numeric definition of "stuck" and the source of the alert:

```sql
SELECT id FROM saga_instance WHERE status IN ('RUNNING', 'COMPENSATING', 'UNKNOWN')
   AND updated_at < now() - interval '5 minutes';
```

This is a candidate inactivity query. Calibrate the threshold and track step/attempt start time
separately when heartbeats or retry bookkeeping refresh `updated_at` without business progress.

## A compensation that survives being run twice

```java
final class ChargeCard implements SagaStep.Compensatable {
    public void execute(SagaContext ctx) {
        payments.charge(new ChargeRequest(ctx.sagaId() + ":charge", ctx.amount()));
    }
    public void compensate(SagaContext ctx) {
        // Stable command key plus the exact original business effect being reversed.
        payments.refund(new RefundRequest(
                ctx.sagaId() + ":refund", ctx.chargeId(), ctx.amount()));
    }
}
```

The refund is a **new business fact**, not a deletion of the charge. Compensation must resolve
whether the charge exists and target that identity; inventing a refund for a charge that never
existed may itself violate the payment API or ledger invariant.

## When the compensation itself fails

The following block illustrates control flow, not a complete store API. Every state write requires
the current ownership/version, and durable escalation must close the failure-to-enqueue crash gap.

```java
void compensateCompletedBackwards(SagaInstance saga, List<SagaStep> steps) {
    store.mark(saga.id(), COMPENSATING);
    for (CompletedStep completed : store.completedStepsDescending(saga.id())) {
        if (steps.get(completed.position()) instanceof SagaStep.Compensatable c) {
            try {
                store.markCompensationStarted(saga.id(), c.name());
                c.compensate(saga.context());
                store.mark(saga.id(), c.name(), COMPENSATED);
            } catch (RuntimeException e) {   // nothing compensates this
                store.mark(saga.id(), c.name(), COMPENSATION_FAILED, e.toString());
                escalation.enqueue(saga.id(), c.name(), saga.context());
                return;                      // policy retries or routes to manual repair
            }
        }
    }
    store.mark(saga.id(), COMPENSATED);
}
```

The retry loop belongs to a durable worker, not a request thread. Define max age/attempts and
whether exhausted work remains automatically retryable or enters manual repair. Alert on age
and count in `COMPENSATION_FAILED`; without ownership the queue is a landfill. Compensation
callbacks require authentication and authorization because replaying one mutates business state.

The compensation block is control-flow pseudocode expressed in Java. All `store.mark*` operations
must check current version/ownership and return refreshed state. Persist `COMPENSATION_FAILED`
and its repair intent atomically (for example an outbox), or have a durable scanner discover the
failure; a separate `escalation.enqueue` alone has a crash gap. Resolve a refund whose response
was lost and skip known compensated steps. Never declare the entire saga compensated while an
effect is unknown or its pivot has committed.

## Testing: fail every step, assert the invariant each time

```java
@ParameterizedTest
@ValueSource(ints = {0, 1, 2, 3})
void failureAtAnyStepLeavesAConsistentState(int failingStep) {
    var participants = Participants.failingAt(failingStep);   // in-memory or WireMock
    runner.run(sagaFor(order), participants);

    if (failingStep <= plan.pivotIndex()) { // definite rejection before pivot committed
        assertThat(participants.inventoryReserved()).isEmpty();
        assertThat(participants.chargesNet()).isZero();        // charge and refund cancel
        assertThat(store.statusOf(order.id())).isEqualTo(COMPENSATED);
    } else {
        assertThat(store.statusOf(order.id())).isEqualTo(FORWARD_REPAIR_REQUIRED);
        participants.recover();
        runner.resume(order.id());
        assertThat(store.statusOf(order.id())).isEqualTo(COMPLETED);
    }
}
```

Additional cases the parameterised sketch does not reach:

- **Duplicate application** — run the whole saga twice with the same saga id and assert one
  charge and one reservation. This fails when a step forgot its idempotency key.
- **Crash between the call and the record** — the participant succeeds, then the runner
  throws before `store.mark(..., DONE)`. On replay the step must not apply twice; the
  participant's own key is what makes that true, not the saga log.
- **Compensation failure** — make one compensation throw, then assert an escalation row
  exists and the instance is `COMPENSATION_FAILED`, not `COMPENSATED`. A saga reporting
  success after a failed compensation is the worst outcome available: nothing looks at it
  again.
- **Concurrent coordinators** — race two claims/transitions for one version and assert one
  durable transition; participant requests may still duplicate and must collapse by key.
- **Pivot outcome unknown** — return a timeout after committing the pivot, query by saga/step
  identity, then prove recovery goes forward rather than compensating pre-pivot work.
- **Cancel before delayed execute** — status initially says not found, cancellation commits, then
  deliver the old execute; assert no reservation or charge is resurrected.
- **Repair notification crash** — fail after durable compensation failure but before enqueue;
  prove the scanner/outbox still schedules repair and an expired coordinator cannot overwrite it.
