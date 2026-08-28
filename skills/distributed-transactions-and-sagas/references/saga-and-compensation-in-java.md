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

## Persist the position before the call, not after

```java
// Conceptual: no retry policy, no locking of the instance row.
void advance(SagaInstance saga, List<SagaStep> steps) {
    while (saga.position() < steps.size()) {
        SagaStep step = steps.get(saga.position());
        store.mark(saga.id(), step.name(), STARTED);      // its own committed transaction
        try {
            step.execute(saga.context());
            store.mark(saga.id(), step.name(), DONE);
            store.advance(saga.id());
        } catch (BusinessRejection rejected) {            // the participant said no
            store.mark(saga.id(), step.name(), FAILED, rejected.getMessage());
            compensateBackwards(saga, steps);
            return;
        } catch (OutcomeUnknown unknown) {                // timeout, connection reset
            store.mark(saga.id(), step.name(), UNKNOWN, unknown.getMessage());
            return;   // a recovery worker resolves it; never compensate on a timeout alone
        }
    }
    store.mark(saga.id(), COMPLETED);
}
```

- `STARTED` commits **before** the call, so a crash mid-call leaves evidence that the step
  may have run; the recovery worker asks the participant for that step's status by saga id
  instead of guessing.
- Rejection and unknown take different branches. Compensating on a timeout is how a saga
  refunds a payment that actually went through.
- Nothing about the saga lives in the thread, so a restart resumes from the table — with a
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
        // Keyed on the saga, not a fresh id: a repeated compensation returns the first
        // refund instead of issuing a second. The key contract is idempotency.
        payments.refund(new RefundRequest(ctx.sagaId() + ":refund", ctx.amount()));
    }
}
```

The refund is a **new business fact**, not a deletion of the charge — the statement shows
both lines, which is what "a compensation is not an undo" means in practice. It must also be
harmless when there is nothing to reverse: `refund` on an uncharged key returns the
not-charged state rather than failing, because the step may never have executed.

## When the compensation itself fails

```java
void compensateBackwards(SagaInstance saga, List<SagaStep> steps) {
    store.mark(saga.id(), COMPENSATING);
    for (int i = saga.position() - 1; i >= 0; i--) {
        if (steps.get(i) instanceof SagaStep.Compensatable c) {
            try {
                c.compensate(saga.context());
                store.mark(saga.id(), c.name(), COMPENSATED);
            } catch (RuntimeException e) {   // nothing compensates this
                store.mark(saga.id(), c.name(), COMPENSATION_FAILED, e.toString());
                escalation.enqueue(saga.id(), c.name(), saga.context());
                return;                      // a scheduled worker retries with backoff
            }
        }
    }
    store.mark(saga.id(), COMPENSATED);
}
```

The retry loop belongs to that worker, never to a request thread, and the escalation row is
the manual-intervention path. Alert on the count of rows in `COMPENSATION_FAILED`; without
that alert the queue is a landfill.

## Testing: fail every step, assert the invariant each time

```java
@ParameterizedTest
@ValueSource(ints = {0, 1, 2, 3})
void failureAtAnyStepLeavesAConsistentState(int failingStep) {
    var participants = Participants.failingAt(failingStep);   // in-memory or WireMock
    runner.run(sagaFor(order), participants);

    if (failingStep <= plan.pivotIndex()) {
        assertThat(participants.inventoryReserved()).isEmpty();
        assertThat(participants.chargesNet()).isZero();        // charge and refund cancel
        assertThat(store.statusOf(order.id())).isEqualTo(COMPENSATED);
    } else {
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
