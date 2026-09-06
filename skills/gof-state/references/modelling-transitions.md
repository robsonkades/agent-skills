# Modelling transitions

Java 21 partial snippets (no preview): domain event/value types, imports and framework wiring
are omitted. Use the five-state definitions in worked-example.md for the transition below;
import the nested state types. Tests containing ellipses are designs, not executable tests.

## Where the transitions live

| Placement                       | Adding a state costs              | Whole machine readable?    | Fits when                                      |
| ------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------- |
| **In each state class**         | Edit the states that reach it     | No — spread across N files | States have substantial behaviour of their own |
| **One transition function**     | One compile error per switch      | **Yes**                    | You own every state; the machine is the point  |
| **A transition table (data)**   | A row                             | Yes, as data               | The machine is configured or must be shown     |
| **Scattered `if`s on a status** | Nothing — and that is the problem | No                         | Never                                          |

```java
// one transition function: the whole machine in one place
static OrderState transition(OrderState current, OrderEvent event) {
    Objects.requireNonNull(current);
    Objects.requireNonNull(event);
    return switch (current) {
        case Draft d -> switch (event) {
            case Pay p -> new Paid(p.at(), p.reference());
            case Cancel c -> new Cancelled(c.at(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Paid p -> switch (event) {
            case Ship s -> new Shipped(s.tracking(), s.at());
            case Cancel c -> new Refunding(c.at(), p.reference(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Shipped s -> throw new IllegalTransition(current, event);
        case Cancelled c -> throw new IllegalTransition(current, event);
        case Refunding r -> switch (event) {
            case RefundSettled x -> new Cancelled(x.at(), r.reason());
            default -> throw new IllegalTransition(current, event);
        };
    };
}
```

The outer `switch` has no `default`, so adding a state fails to compile here. The inner ones do,
to explicitly reject unlisted events; this is a design choice, not an inherent open-event rule.
For a closed event set, enumerate rejected event types too if compiler feedback is wanted on additions.
The defaults here require a separate state/event inventory test.

## Sealed records or enum?

```java
// enum: states carry no data
public enum Status { DRAFT, PAID, SHIPPED, CANCELLED }

// sealed records: states carry the data that only makes sense in that state
public sealed interface OrderState permits OrderState.Draft, OrderState.Paid, OrderState.Shipped, OrderState.Cancelled {
    record Draft() implements OrderState { }
    record Paid(Instant at, PaymentReference reference) implements OrderState { }
    record Shipped(TrackingId tracking, Instant at) implements OrderState { }
    record Cancelled(Instant at, Reason reason) implements OrderState { }
}
```

This reduced four-state sketch omits Refunding and constructor validation; it only illustrates layout.
Production constructors must reject missing/invalid payloads (see the worked example).
The records version separates state-specific fields: `trackingId` exists only on
`Shipped`, so no code can read a tracking id from a draft order and no column needs to be nullable
in the object representation; the relational schema may still have nullable per-state columns.

Use the enum when states carry nothing, when the state is a simple persisted column and the data
lives elsewhere anyway, or when you want the states to be `switch`-able in contexts where records
would be awkward. Enum constants are reused after class initialization, which matters only in a genuinely hot
path.

Enums with per-constant behaviour (a body per constant) sit between the two: fine for small,
stable machines, and they scatter the transition rules across constants exactly the way state
classes do.

## Persistence

```java
@Enumerated(EnumType.STRING)      // never EnumType.ORDINAL
private Status status;
```

STRING stores enum names, so names become storage contracts. For independently stable codes use
an explicit mapping/converter and validate unknown values; do not rename Java constants casually.

`ORDINAL` stores the position, so inserting a constant in the middle or reordering the enum
silently reinterprets every existing row. It is a data-corruption bug with no error message.

For sealed record states, persist a discriminator plus the state's data, and map explicitly:

```java
static OrderState fromRow(String state, Row row) {
    return switch (state) {
        case "DRAFT" -> new Draft();
        case "PAID" -> new Paid(row.instant("paid_at"), new PaymentReference(row.string("payment_ref")));
        case "SHIPPED" -> new Shipped(new TrackingId(row.string("tracking")), row.instant("shipped_at"));
        case "CANCELLED" -> new Cancelled(row.instant("cancelled_at"), Reason.valueOf(row.string("reason")));
        default -> throw new UnknownPersistedState(state);      // reject; never coerce
    };
}
```

Evolving the set:

- **Adding a state** may require no row rewrite, but can require schema/check-constraint, index,
  report, API-consumer and rolling-version compatibility changes. Old binaries must define how
  they handle rows/messages containing the new code.
- **Removing a state** requires migrating existing rows first. Deploying code that cannot read a
  value still present in the database is an outage for those rows.
- **Renaming** is a two-phase change: accept both names, migrate the rows, then drop the old one.
- **Unknown values need an explicit safe policy:** reject, quarantine or preserve for forwarding;
  never silently reinterpret them as a legal active state.

## Atomicity

```java
// wrong: check-then-act
if (order.state() instanceof Paid) {
    order.transition(new Ship(tracking, now));      // two requests can both pass the check
    orders.save(order);
}
```

Options include CAS, conditional writes, optimistic locking and appropriately scoped locks.
Choose from all guards and the ownership boundary:

```java
// 1. In-memory, immutable state behind a reference
private final AtomicReference<OrderState> state;
boolean apply(OrderEvent event) {
    OrderState current, next;
    do {
        current = state.get();
        next = transition(current, event);          // throws on illegal
    } while (!state.compareAndSet(current, next));
    return true;
}

// 2. Database, conditional update — the expected state is in the WHERE clause
int updated = jdbc.update("""
        UPDATE orders SET status = 'SHIPPED', tracking = ?, shipped_at = ?
        WHERE id = ? AND status = 'PAID'
        """, tracking, now, id);
if (updated == 0) throw new ConcurrentTransition(id);           // check the row count

// 3. Optimistic locking — the version guards the whole aggregate
@Version private long version;                                  // OptimisticLockException on clash
```

A status-only predicate protects this one-way transition, not other guards or an ABA cycle back
to the same status. Include a version and all relevant preconditions when necessary. Check exactly
one affected row; zero can mean absent, stale or illegal state, not proof of a particular race.
Raw SQL/bulk updates bypass ORM version management and managed-state synchronization: coordinate
version increments and refresh/clear policy, or keep one persistence path. The worked example
shows an explicit versioned write. Pessimistic locking is another valid option.

The CAS transition must be pure because it may run repeatedly. Use immutable validated state/event
payloads and stable supplied time; never send email or debit a payment inside the retry loop.
A reused enum reference can suffer ABA; include a revision when history matters. Committing CAS
and then enqueueing work is not atomic/durable publication.

## Side effects of a transition

A transition that also sends an email, publishes an event or calls a service must define what
happens when it is retried:

```text
Effect inside the same transaction as the state change
  → local database effects or an outbox row in the same effective transaction.
    Outbox publication can repeat; command deduplication and relay operation remain necessary (event-driven-architecture).

Effect after the commit
  → may not happen at all if the process dies. Acceptable only if
    something reconciles.

Effect before the state change
  → the effect happens for a transition that then fails. Almost always
    wrong.
```

## Timeouts as transitions

"Cancel if unpaid after 30 minutes" is an event, and something must deliver it:

```text
A scheduled sweep query          delay includes interval, runtime, backlog and outages;
                                 check query plan and bounded batches

A delayed message                delivery is not an exact-time guarantee; inspect broker
                                 delay, redelivery and catch-up semantics

An in-memory timer               lost on restart. Only for states that
                                 do not outlive the process
```

The failure to avoid: a state reachable only by a timer that does not survive a deploy. Orders sit
in `AwaitingPayment` forever and are found by a customer. Whatever the mechanism, the transition
must tolerate duplicates. Compare durable due time, current state and timer/attempt generation;
a stale timeout from an earlier lifecycle must not cancel a newer attempt. Payment-versus-expiry
race policy must be enforced atomically — the sweep and a redelivered message may both fire
(`distributed-locks-and-leases`).

## Testing the table

```java
static Stream<Arguments> transitions() {
    return Stream.of(
        arguments(new Draft(),  new Pay(NOW, REF),   Paid.class),
        arguments(new Draft(),  new Ship(TRK, NOW),  IllegalTransition.class),
        arguments(new Paid(..), new Ship(TRK, NOW),  Shipped.class),
        arguments(new Shipped(..), new Cancel(NOW),  IllegalTransition.class));
}

@ParameterizedTest
@MethodSource("transitions")
void transition_table(OrderState from, OrderEvent event, Class<?> expected) { ... }
```

The table is illustrative and incomplete. Derive or assert inventory coverage of every state/event
kind, then test payload guards, reason/reference preservation, repeated commands and effect outcomes.
Scenario tests remain necessary for multi-step invariants and failures.

Primary sources: [Java 21 pattern switch](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html),
[AtomicReference](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html),
[Jakarta Persistence 3.2 bulk updates/versioning](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2),
and [ShedLock lock duration](https://github.com/lukas-krecan/ShedLock).
