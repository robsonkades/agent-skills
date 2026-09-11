# Command against event, and what a bus must get right

## The contrast, in full

| Dimension           | Command                                       | Event                                                          |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Grammar             | Imperative: `PlaceOrder`, `CancelShipment`    | Past tense: `OrderPlaced`, `ShipmentCancelled`                 |
| Semantics           | A request that may be refused                 | A fact that already occurred                                   |
| Recipients          | Exactly one logical handler                   | Zero or more subscribers                                       |
| Coupling direction  | Sender knows the operation exists             | Fact contract need not enumerate subscribers                   |
| Failure ownership   | One owner defines the operation's outcome     | Each subscriber has an explicit processing/recovery obligation |
| Validity            | Can be rejected as invalid                    | Claimed fact still requires trusted, valid delivery            |
| Versioning pressure | Handler must interpret accepted older intents | Publisher must preserve accepted subscriber contracts          |
| Replay              | Re-executes intent under its repeat policy    | Re-delivers a fact under each subscriber's effect policy       |

Two failure modes follow directly:

- **An "event" that can be rejected.** `OrderValidated` published for a subscriber to approve or
  refuse makes the publisher depend on a decision it cannot see, and the answer has nowhere to go.
  That is a command wearing an event's name.
- **A "command" with independent effect handlers but no combined-outcome owner.** Partial failure
  becomes ambiguous and adding a handler changes the operation's meaning. Competing instances
  or explicitly coordinated subcommands do not have this defect merely because they are plural.

Grammar is a review hint. Establish whether the message requests a decision or reports a fact;
malformed, unauthorized or unsupported event deliveries may be rejected without undoing a fact.

## Command bus dispatch

```java
public sealed interface Command permits PlaceOrder, CancelOrder, RefundOrder { }

public interface Handler<C extends Command> { Result handle(C command); }
```

For a closed set that genuinely needs type dispatch, an exhaustive `switch` can be enough.
Keep an existing direct callback or framework dispatcher when it already meets the contract:

```java
Result dispatch(Command command) {
    return switch (command) {
        case PlaceOrder c  -> placeOrder.handle(c);
        case CancelOrder c -> cancelOrder.handle(c);
        case RefundOrder c -> refundOrder.handle(c);
    };
}
```

When recompiled against a new permitted subtype, these explicit cases need coverage; a branch
that returns a placeholder can still compile. Exhaustiveness proves type coverage, not handler
behavior or compatibility with independently changed binaries. Use a checked registry when
modules contribute handlers; check missing, duplicate and type-mismatched registrations, and
reject unsupported input types.
Pattern switches require [Java 21 without preview](https://openjdk.org/jeps/441); the
[switch-expression runtime rules](https://docs.oracle.com/javase/specs/jls/se21/html/jls-15.html#jls-15.28.2)
also distinguish compile-time coverage from runtime matching.

Never dispatch by a class name taken from the payload:

```java
// deserialisation gadget, not dispatch
Class.forName(envelope.type()).getDeclaredConstructor().newInstance();

// closed registry
private static final Map<String, Class<? extends Command>> TYPES = Map.of(
    "order.place", PlaceOrder.class,
    "order.cancel", CancelOrder.class);
```

The allowlist limits type selection; it does not establish caller authorization, payload bounds
or business validity. Trusted internal reflection is a different boundary from this untrusted input.

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
- **An explicit schema/version policy**, carried in the payload or a defined envelope/schema
  identity. The illustrated integer field is one option; do not infer ambiguous intent from
  whichever fields happen to be present.
- **Compatible reading.** Ignore unknown fields only when their omission preserves the accepted
  meaning; reject unsupported versions and missing required/security-critical data. Missing optional
  fields need documented defaults tested against retained commands.
- **A staleness rule.** A command sitting in a queue through an outage may execute hours later.
  Decide whether it should: a `PlaceOrder` from six hours ago against a price that has changed may
  need rejecting rather than executing (`delivery-semantics`).
- **No process resources in durable intent.** Use stable data/identifiers instead of managed
  entities, connections, open streams or service objects. For an in-process command, retaining
  a live receiver may be valid when its lifetime and thread ownership cover execution.

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

For this same-store deduplication flow, atomically commit the effect and durable operation result.
Replay or reconstruct the response required by the interface, not an unrelated conflict. Natural
state idempotence, conditional transitions or explicitly tolerated repeated effects may support
other contracts without this table; decide with `idempotency`.

This flow also requires an atomic unique claim or equivalent serialization: two concurrent handlers
can both pass `contains`. Bind the scoped key to the payload, reject mismatched reuse, and retain
deduplication for the permitted replay horizon. The transaction covers only enlisted resources;
external effects require provider idempotency or reconciliation, not just `@Transactional`.

## Undo: three different mechanisms

| Mechanism        | When it works                                                                | Cost                                                                     |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Inverse**      | The operation is mathematically reversible and nothing else changed          | Cheap; fragile if other commands touched the same state                  |
| **Memento**      | The affected state can be captured before execution                          | Memory per undo step; must capture enough (`gof-memento`)                |
| **Compensation** | The effect is outside the reversible boundary and a business reversal exists | A new business operation, itself fallible; cannot erase all consequences |

The mistake is applying the first where the third is required. "Undo the payment" is not
`payment.reverse()`; it is a refund, which may incur fees, refusal or delay. Model it as
its own command with its own outcome (`distributed-transactions-and-sagas`).

A second mistake: an inverse that is correct in isolation and wrong in sequence. If command B read
the state that command A produced, undoing A alone leaves B's result based on a state that no
longer exists. Either undo is stack-ordered — only the most recent command may be undone — or the
selective undo needs an explicit dependency/conflict or transformation protocol. Independence
can make it simple; being command values alone does not establish it.

## Captured state

```java
// Live receiver: valid for a confined callback, not a snapshot for later/remote work.
Runnable command = () -> order.cancel();

// Unsafe if execution outlives the managed session or violates its thread ownership.
record CancelOrder(Order order) implements Command { }

// Durable/deferred intent: retain values and identifiers, not the managed entity.
record CancelOrder(CommandId id, OrderId orderId, Reason reason, Instant issuedAt)
        implements Command { }
```

For that durable/deferred form, the handler re-loads inside its own transaction and re-checks preconditions.
That re-check is not redundant: between issuing and executing, the order may have shipped, and the
command's validity at creation time says nothing about its validity now. Preserve the original
intent: when issued values/version matter, carry them and reject conflicts rather than silently
substituting today's meaning. A later rejection also cannot resolve an earlier unknown effect.

An [Executor may run inline, pooled or on a new thread](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Executor.html).
Submission publishes prior actions under its contract; unsynchronised later mutation is not a
reliable execution-time snapshot. Specify ownership instead of assuming a particular thread.
