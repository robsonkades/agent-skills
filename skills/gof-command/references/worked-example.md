# Two worked examples: exact undo, and durable execution

The same pattern, two uses with almost nothing in common operationally. Seeing both is what stops
"we use the Command pattern" from meaning anything on its own.

## 1. A diagram editor's undo stack

In-process, synchronous, no serialisation, exact inverses available.

```java
public sealed interface EditCommand permits Move, Resize, SetLabel, Delete {
    Diagram apply(Diagram diagram);
    EditCommand inverse(Diagram before);      // computed against the pre-state
}

public record Move(ShapeId shape, Vector delta) implements EditCommand {
    public Diagram apply(Diagram d) { return d.withShapeMoved(shape, delta); }
    public EditCommand inverse(Diagram before) { return new Move(shape, delta.negated()); }
}

public record SetLabel(ShapeId shape, String label) implements EditCommand {
    public Diagram apply(Diagram d) { return d.withLabel(shape, label); }
    public EditCommand inverse(Diagram before) {
        return new SetLabel(shape, before.labelOf(shape));   // the old value must be captured
    }
}
```

Two design points:

- **`inverse` takes the pre-state.** `Move` does not need it; `SetLabel` does, because the inverse
  is "restore what was there". Passing the pre-state uniformly avoids a separate memento for the
  simple cases while still supporting the ones that need it.
- **`Delete` cannot compute an inverse from a vector.** Its inverse is "re-insert this shape, with
  this content, at this z-order" — a memento in all but name. Where that state is large, keep a
  memento instead of the whole prior diagram (`gof-memento`).

```java
public final class History {
    private final Deque<EditCommand> undo = new ArrayDeque<>();
    private final Deque<EditCommand> redo = new ArrayDeque<>();
    private Diagram current;

    public void execute(EditCommand command) {
        undo.push(command.inverse(current));
        current = command.apply(current);
        redo.clear();                     // a new edit invalidates the redo branch
    }

    public void undo() {
        if (undo.isEmpty()) return;
        var inverse = undo.pop();
        redo.push(inverse.inverse(current));
        current = inverse.apply(current);
    }
}
```

`redo.clear()` is the line people forget, and its absence produces a redo stack that reapplies
edits against a diagram they were never computed for.

### The property test that matters

```java
@Property
void undo_restores_the_previous_diagram(@ForAll("diagrams") Diagram before,
                                        @ForAll("commands") EditCommand command) {
    var after = command.apply(before);
    assertThat(command.inverse(before).apply(after)).isEqualTo(before);
}
```

One property, generated inputs, and it covers every command type — including the ones added next
year. Hand-written undo tests reliably miss the case where a command is applied to a shape that
another command has since changed.

### Stack ordering is a constraint, not a convention

Only the most recent command may be undone. If `SetLabel` then `Delete` were applied and `SetLabel`
alone were undone, the inverse would target a shape that no longer exists. The `Deque` enforces
the ordering; a design allowing arbitrary undo would need commands to be genuinely independent, a
much stronger property.

## 2. A durable command queue for outbound settlement

Persisted, redelivered, executed minutes or hours later, against an external system. Almost every
decision differs.

```java
public record SettlePayment(
        CommandId id,                 // idempotency key, generated once by the issuer
        int schemaVersion,
        PaymentId paymentId,
        Money amount,
        Instant issuedAt) implements Command { }
```

### Written with the state change

```java
@Transactional
public void requestSettlement(PaymentId id, Money amount) {
    payments.markPendingSettlement(id);
    outbox.enqueue(new SettlePayment(CommandId.newId(), 1, id, amount, clock.instant()));
}
```

The command and the state change commit together. Publishing to the broker inside the transaction
instead would be a dual write: the broker accepts it, the transaction rolls back, and a settlement
is attempted for a payment that was never marked (`event-driven-architecture`).

### The handler

```java
@Transactional
public void handle(SettlePayment command) {
    if (processed.contains(command.id())) return;                 // redelivery

    var payment = payments.byId(command.paymentId())
            .orElseThrow(() -> new UnknownPayment(command.paymentId()));

    if (!payment.isPendingSettlement()) return;                   // already settled elsewhere
    if (command.issuedAt().isBefore(clock.instant().minus(SETTLEMENT_WINDOW))) {
        throw new CommandTooOld(command.id(), command.issuedAt());  // → dead letter, not retry
    }

    var receipt = gateway.settle(payment, command.amount(), command.id());  // key sent onward
    payments.recordSettlement(payment.id(), receipt);
    processed.record(command.id());                               // same transaction
}
```

Five things this handler does that the editor's did not need:

- **Deduplicates by command id**, recorded in the same transaction as the effect.
- **Re-checks the precondition.** The payment may have been settled by an operator between issue
  and execution; the command's validity when created says nothing about now.
- **Rejects stale commands.** A settlement command released from a queue after a six-hour outage
  may no longer be appropriate; that is a business rule and it belongs here, explicitly.
- **Passes the idempotency key downstream**, so the gateway also deduplicates. Idempotency at one
  layer is not idempotency end to end (`idempotency`).
- **Distinguishes retry from dead-letter.** `UnknownPayment` and `CommandTooOld` are permanent;
  retrying them consumes the queue forever (`poison-messages-and-dlq`).

### Undo does not exist here

There is no inverse for "money moved". The reversal is a `RefundPayment` command: a separate
business operation, with its own fees, its own failure modes and its own possibility of refusal.
Modelling it as `settle.undo()` would imply a guarantee the world does not offer
(`distributed-transactions-and-sagas`).

### Versioning, when the shape changed

Adding a `settlementAccount` field to `SettlePayment` had to work with commands already sitting in
the outbox:

```java
public record SettlePayment(CommandId id, int schemaVersion, PaymentId paymentId, Money amount,
                            Instant issuedAt, Optional<AccountId> settlementAccount) { }
```

Optional, with a documented default resolved from the payment when absent. The alternative —
version 2 as a separate type with a translator — is correct for a breaking change and was not
needed for an additive one. What was not acceptable was making it a required field, which would
have thrown on every command written before the deploy.

## Side by side

|                     | Editor undo               | Durable settlement                                 |
| ------------------- | ------------------------- | -------------------------------------------------- |
| Lifetime            | Milliseconds              | Minutes to hours                                   |
| Serialised          | No                        | Yes — versioned contract                           |
| Delivered twice     | No                        | Expected                                           |
| Idempotency         | Not needed                | Mandatory, keyed, transactional                    |
| Undo                | Exact inverse             | Compensation, as a separate command                |
| Preconditions       | Stack ordering            | Re-checked at execution                            |
| Failure destination | Nowhere — it is in-memory | Dead-letter queue with a permanent/transient split |

The shared part is only the idea that an invocation is a value. Every operational property comes
from where that value goes.
