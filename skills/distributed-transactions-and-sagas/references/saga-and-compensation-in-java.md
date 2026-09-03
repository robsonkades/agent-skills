# Sagas and compensation in Java

Plain Java plus a database; no saga framework assumed.

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
so the three shapes are closed and a `switch` over them is exhaustive. That makes the
ordering rule checkable: a unit test walks each plan and asserts every step before the
`Pivot` is `Compensatable` and everything after it is `ForwardOnly`. A step that quietly
lost its compensation shows up there rather than in an incident.

## Persist intent before the call and transition atomically

```java
// Conceptual: store transitions use optimistic versions; participant calls are remote.
void advance(SagaInstance saga, List<SagaStep> steps) {
    if (!store.tryClaim(saga.id(), saga.version(), workerId, claimDeadline)) return;
    while (saga.position() < steps.size()) {
        SagaStep step = steps.get(saga.position());
        store.startAttempt(saga.id(), saga.version(), step.name(), attemptId());
        try {
            step.execute(saga.context());
            saga = store.completeAndAdvance(saga.id(), saga.version(), step.name()); // one tx
        } catch (BusinessRejection rejected) {            // the participant said no
            store.mark(saga.id(), step.name(), FAILED, rejected.getMessage());
            if (step instanceof SagaStep.ForwardOnly) {
                store.mark(saga.id(), FORWARD_REPAIR_REQUIRED);
            } else {
                compensateCompletedBackwards(saga, steps);
            }
            return;
        } catch (OutcomeUnknown unknown) {                // timeout, connection reset
            store.mark(saga.id(), step.name(), UNKNOWN, unknown.getMessage());
            return;   // a recovery worker resolves it; never compensate on a timeout alone
        }
    }
    store.mark(saga.id(), COMPLETED);
}
```

- The claim/version prevents two coordinators from advancing the same row concurrently; it is
  a liveness optimization, not a replacement for participant idempotency.
- `STARTED` commits **before** the call, so a crash mid-call leaves evidence that the step
  may have run; the recovery worker asks the participant for that step's status by saga id
  instead of guessing.
- Rejection and unknown take different branches. Compensating on a timeout is how a saga
  refunds a payment that actually went through.
- Marking `DONE` and advancing position is one local transaction. Separate writes create a
  crash window in which recovery may misclassify the step.
- Nothing authoritative about the saga lives only in the thread, so restart resumes from the table — with a
  query that doubles as the numeric definition of "stuck" and the source of the alert:

```sql
SELECT id FROM saga_instance WHERE status IN ('RUNNING', 'COMPENSATING', 'UNKNOWN')
   AND updated_at < now() - interval '5 minutes';
```

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

Three cases the parameterised test does not reach:

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
