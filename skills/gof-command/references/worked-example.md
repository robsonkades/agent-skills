# Two worked examples: exact undo, and durable execution

The same pattern, two uses with almost nothing in common operationally. Seeing both is what stops
"we use the Command pattern" from meaning anything on its own.

These are partial Java 17 sketches with domain types/imports and framework implementations
omitted. Property annotations assume an existing property-testing library. No deployment or
remote-provider behavior is established by these examples alone.

## 1. A diagram editor's undo stack

In-process, synchronous, no serialisation, exact inverses available. The consumer needs edit
history, not a bus:

```java
var history = new History(initialDiagram);
history.execute(new SetLabel(shapeId, "Draft"));  // ordinary edit
history.undo();
history.redo();                                  // reuse history, not a second effect channel
// A command for a missing shape must fail without changing the diagram or either stack.
```

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

    public History(Diagram initial) {
        current = java.util.Objects.requireNonNull(initial, "initial");
    }

    public void execute(EditCommand command) {
        var inverse = java.util.Objects.requireNonNull(command.inverse(current));
        var next = java.util.Objects.requireNonNull(command.apply(current));
        undo.push(inverse);
        current = next;
        redo.clear();                     // a new edit invalidates the redo branch
    }

    public void undo() {
        if (undo.isEmpty()) return;
        var inverse = undo.peek();
        var forward = java.util.Objects.requireNonNull(inverse.inverse(current));
        var next = java.util.Objects.requireNonNull(inverse.apply(current));
        redo.push(forward);
        undo.pop();
        current = next;
    }

    public void redo() {
        if (redo.isEmpty()) return;
        var forward = redo.peek();
        var inverse = java.util.Objects.requireNonNull(forward.inverse(current));
        var next = java.util.Objects.requireNonNull(forward.apply(current));
        undo.push(inverse);
        redo.pop();
        current = next;
    }
}
```

`redo.clear()` is the line people forget, and its absence produces a redo stack that reapplies
edits against a diagram they were never computed for.

This ordering preserves history if inverse calculation or application throws, provided `Diagram`
is immutable and operations do not partially mutate external state. Confine `History` to one
thread and route every edit through it. Bound history retention. `Move`'s negated delta is exact
only for reversible arithmetic without rounding, overflow, snapping or clamping; otherwise save
the prior position. A `Delete` inverse also needs a permitted restoration command in the sealed set.

### The property test that matters

```java
@Property
void undo_restores_the_previous_diagram(@ForAll("diagrams") Diagram before,
                                        @ForAll("commands") EditCommand command) {
    var after = command.apply(before);
    assertThat(command.inverse(before).apply(after)).isEqualTo(before);
}
```

Generate valid `(before, command)` pairs, including each supported command; unrelated generators
can produce missing-shape cases outside the operation's preconditions. Also test execute failure,
undo failure, redo and branch invalidation. The single inverse property does not exercise history
ordering or guarantee that future command types are covered by the generator.

### Stack ordering is a constraint, not a convention

Only the most recent command may be undone. If `SetLabel` then `Delete` were applied and `SetLabel`
alone were undone, the inverse would target a shape that no longer exists. The `Deque` enforces
the ordering; selective undo needs an explicit dependency/conflict or transformation protocol,
not merely a list of immutable commands.

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

This assumes both writes join the same actual transaction; `@Transactional` alone does not prove
enlistment. The generated ID belongs to one issued intent. Retrying the request itself must reuse
that identity or an equivalent business-operation claim rather than mint another settlement intent.
Publishing to the broker inside the transaction
instead would be a dual write: the broker accepts it, the transaction rolls back, and a settlement
is attempted for a payment that was never marked (`event-driven-architecture`).

### The handler

Illustrative **fresh-attempt flow only**: before using it, require an atomic unique command claim scoped to tenant
and operation, payload fingerprint checks, and stored terminal outcomes. `contains` then `record`
alone races under concurrent delivery. Local payment/dedup records share a transaction; a remote
gateway does not join it. The gateway must durably deduplicate the same key and payload through
the entire replay horizon or expose reconciliation for an unknown outcome. Serialize conflicting
payment transitions or use conditional version checks; different command IDs can target one payment.

Before entering this fresh-attempt path, resolve completed, in-flight and unknown attempts for the
same operation using durable attempt/provider evidence. For example, a gateway accepted key K at
09:59 but the reply was lost; at 10:01 the command is expired and local state has changed. Those
later checks do not establish that K was never applied. Reconcile K (or replay it only under the
provider's safe retry contract), record what is known and keep recovery owned before any new
effect or terminal no-effect verdict. Do not mint a replacement key. This dispatch/recovery
protocol is a prerequisite, not implemented by the `contains` shortcut below (`idempotency`).

```java
@Transactional
public void handle(SettlePayment command) {
    if (processed.contains(command.id())) return;                 // redelivery

    var payment = payments.byId(command.paymentId())
            .orElseThrow(() -> new UnknownPayment(command.paymentId()));

    if (!payment.isPendingSettlement()) {
        throw new SettlementStateConflict(payment.id());         // classify from actual state
    }
    if (command.issuedAt().isBefore(clock.instant().minus(SETTLEMENT_WINDOW))) {
        throw new CommandTooOld(command.id(), command.issuedAt());  // terminal fresh-intent rejection
    }

    var receipt = gateway.settle(payment, command.amount(), command.id());  // key sent onward
    payments.recordSettlement(payment.id(), receipt);
    processed.record(command.id());                               // same transaction
}
```

Five things this handler does that the editor's did not need:

- **Deduplicates local recording** under the atomic-claim prerequisite above; the remote effect
  additionally requires the provider protocol. Acknowledge according to the accepted completion
  or durable recovery-handoff contract; handing off unresolved work is not settling the payment.
- **Re-checks the precondition.** The payment may have been settled by an operator between issue
  and execution; the command's validity when created says nothing about now.
- **Rejects stale fresh intents.** An unattempted settlement released after a six-hour outage may
  no longer be appropriate. Expiry limits new execution; it cannot erase an earlier unknown effect.
- **Passes the key downstream**; this helps only when the provider implements the stated contract.
  A timeout after acceptance needs retry under that guarantee or reconciliation, not a fresh key.
- **Classifies failures with evidence.** Unknown payment may mean terminal bad input or a bounded
  ordering/visibility delay. Expiry is a business rule. Record a terminal rejection or bounded retry
  policy; neither every failure nor every missing payment automatically belongs in a DLQ.

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

Normalize absent values during deserialization; Java `Optional` alone does not configure a wire
default. Resolving the account from current payment state is safe only if that is the accepted
legacy meaning. Otherwise preserve the issued account or translate versioned intent explicitly.
An additive field can change semantics; test queued old commands and old consumers before rollout.

## Side by side

|                     | Editor undo                                                      | Durable settlement                                                                        |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Lifetime            | Milliseconds                                                     | Minutes to hours                                                                          |
| Serialised          | No                                                               | Yes — versioned contract                                                                  |
| Delivered twice     | Not by this History contract                                     | Possible under configured delivery/replay policy                                          |
| Repeat policy       | Explicit edit/undo/redo operations                               | This settlement requires one intended effect; local claim plus provider/recovery contract |
| Undo                | Exact inverse                                                    | Compensation, as a separate command                                                       |
| Preconditions       | Stack ordering                                                   | Re-checked at execution                                                                   |
| Failure destination | Caller sees failure; history retained under stated preconditions | Owned rejection, bounded retry or reconciliation; DLQ only if selected                    |

The shared part is only the idea that an invocation is a value. Every operational property comes
from where that value goes.
