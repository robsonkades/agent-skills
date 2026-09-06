# Command against event, and what a bus must get right

## The contrast, in full

| Dimension           | Command                                    | Event                                               |
| ------------------- | ------------------------------------------ | --------------------------------------------------- |
| Grammar             | Imperative: `PlaceOrder`, `CancelShipment` | Past tense: `OrderPlaced`, `ShipmentCancelled`      |
| Semantics           | A request that may be refused              | A fact that already occurred                        |
| Recipients          | Exactly one logical handler                | Zero or more subscribers                            |
| Coupling direction  | Sender knows the operation exists          | Publisher knows nothing about subscribers           |
| Failure ownership   | The handler owes the sender an outcome     | A failing subscriber is the subscriber's problem    |
| Validity            | Can be rejected as invalid                 | Claimed fact still requires trusted, valid delivery |
| Versioning pressure | The sender and handler evolve together     | The publisher must not break unknown subscribers    |
| Replay              | Re-executes an intent — needs idempotency  | Re-states a fact — subscribers need idempotency     |

Two failure modes follow directly:

- **An "event" that can be rejected.** `OrderValidated` published for a subscriber to approve or
  refuse makes the publisher depend on a decision it cannot see, and the answer has nowhere to go.
  That is a command wearing an event's name.
- **A "command" with several handlers.** Nobody owns the outcome, partial failure is
  unrepresentable, and adding a handler silently changes the operation's meaning.

Grammar is a review hint. Establish whether the message requests a decision or reports a fact;
malformed, unauthorized or unsupported event deliveries may be rejected without undoing a fact.

## Command bus dispatch

```java
public sealed interface Command permits PlaceOrder, CancelOrder, RefundOrder { }

public interface Handler<C extends Command> { Result handle(C command); }
```

The safest dispatch in a single process is not a bus at all — it is an exhaustive `switch`:

```java
Result dispatch(Command command) {
    return switch (command) {
        case PlaceOrder c  -> placeOrder.handle(c);
        case CancelOrder c -> cancelOrder.handle(c);
        case RefundOrder c -> refundOrder.handle(c);
    };
}
```

A new command fails to compile until it has a handler, which is a guarantee a `Map<Class<?>,
Handler>` cannot provide. Use the map when handlers are contributed by modules you do not compile,
and then fail at startup on an unhandled command type rather than at the first message.

Never dispatch by a class name taken from the payload:

```java
// deserialisation gadget, not dispatch
Class.forName(envelope.type()).getDeclaredConstructor().newInstance();

// closed registry
private static final Map<String, Class<? extends Command>> TYPES = Map.of(
    "order.place", PlaceOrder.class,
    "order.cancel", CancelOrder.class);
```

## When a command is persisted or transmitted

The moment a command is written to a queue, an outbox table or a log, its shape becomes a
contract with a future version of your own code.

```java
public record PlaceOrder(
        @JsonProperty("id")        CommandId id,          // idempotency key
        @JsonProperty("v")         int schemaVersion,     // explicit, not inferred
        @JsonProperty("basketId")  BasketId basketId,
        @JsonProperty("issuedAt")  Instant issuedAt)      // for staleness decisions
        implements Command { }
```

Rules:

- **A stable wire name**, decoupled from the Java class name, so a package move is not a breaking
  change.
- **An explicit version field.** Inferring the version from which fields are present works until
  two changes overlap.
- **Compatible reading.** Ignore unknown fields only when their omission preserves the accepted
  meaning; reject unsupported versions and missing required/security-critical data. Missing optional
  fields need documented defaults tested against retained commands.
- **A staleness rule.** A command sitting in a queue through an outage may execute hours later.
  Decide whether it should: a `PlaceOrder` from six hours ago against a price that has changed may
  need rejecting rather than executing (`delivery-semantics`).
- **No live references.** A command holding a managed entity, a `Connection`, an open stream or a
  `Clock` is not serialisable in any useful sense, and even in-process it will execute against a
  context that no longer exists.

## Idempotency

At-least-once delivery permits duplicates; retries and operator replay can also repeat execution.
It does not guarantee that a duplicate will occur.

```java
@Transactional
public Result handle(PlaceOrder command) {
    if (processed.contains(command.id())) return processed.resultOf(command.id());
    var result = doPlaceOrder(command);
    processed.record(command.id(), result);       // same transaction as the effect
    return result;
}
```

Two details that decide whether this works: the deduplication record must be written in the **same
transaction** as the effect, or a crash between them re-executes; and the stored result must be
returned, not merely "already done", so a retrying sender gets an answer rather than an error
(`idempotency`).

This flow also requires an atomic unique claim or equivalent serialization: two concurrent handlers
can both pass `contains`. Bind the scoped key to the payload, reject mismatched reuse, and retain
deduplication for the permitted replay horizon. The transaction covers only enlisted resources;
external effects require provider idempotency or reconciliation, not just `@Transactional`.

## Undo: three different mechanisms

| Mechanism        | When it works                                                       | Cost                                                      |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| **Inverse**      | The operation is mathematically reversible and nothing else changed | Cheap; fragile if other commands touched the same state   |
| **Memento**      | The affected state can be captured before execution                 | Memory per undo step; must capture enough (`gof-memento`) |
| **Compensation** | The effect left the process — money moved, an email was sent        | A new business operation, itself fallible                 |

The mistake is applying the first where the third is required. "Undo the payment" is not
`payment.reverse()`; it is a refund, which has fees, may be refused, and takes days. Model it as
its own command with its own outcome (`distributed-transactions-and-sagas`).

A second mistake: an inverse that is correct in isolation and wrong in sequence. If command B read
the state that command A produced, undoing A alone leaves B's result based on a state that no
longer exists. Either undo is stack-ordered — only the most recent command may be undone — or the
commands must be genuinely independent, which is a property to state rather than to assume.

## Captured state

```java
// wrong: executes against whatever the entity looks like later
Runnable command = () -> order.cancel();

// wrong: a managed entity outside its session
record CancelOrder(Order order) implements Command { }

// right: values and identifiers
record CancelOrder(CommandId id, OrderId orderId, Reason reason, Instant issuedAt)
        implements Command { }
```

The handler re-loads by identifier, inside its own transaction, and re-checks the preconditions.
That re-check is not redundant: between issuing and executing, the order may have shipped, and the
command's validity at creation time says nothing about its validity now.
