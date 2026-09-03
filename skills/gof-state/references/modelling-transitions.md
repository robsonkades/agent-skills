# Modelling transitions

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
    return switch (current) {
        case Draft d -> switch (event) {
            case Pay p -> new Paid(p.at(), p.reference());
            case Cancel c -> new Cancelled(c.at(), c.reason());
            default -> throw new IllegalTransition(current, event);
        };
        case Paid p -> switch (event) {
            case Ship s -> new Shipped(s.trackingId(), s.at());
            case Cancel c -> new Refunding(c.at(), p.reference());
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
because events are open in a way states are not — and each `default` throws rather than ignoring,
which is the difference between a rejected request and a silent no-op.

## Sealed records or enum?

```java
// enum: states carry no data
public enum Status { DRAFT, PAID, SHIPPED, CANCELLED }

// sealed records: states carry the data that only makes sense in that state
public sealed interface OrderState permits Draft, Paid, Shipped, Cancelled {
    record Draft() implements OrderState { }
    record Paid(Instant at, PaymentReference reference) implements OrderState { }
    record Shipped(TrackingId tracking, Instant at) implements OrderState { }
    record Cancelled(Instant at, Reason reason) implements OrderState { }
}
```

The records version removes a whole class of nullable fields: `trackingId` exists only on
`Shipped`, so no code can read a tracking id from a draft order and no column needs to be nullable
in the domain model. That is usually the deciding advantage.

Use the enum when states carry nothing, when the state is a simple persisted column and the data
lives elsewhere anyway, or when you want the states to be `switch`-able in contexts where records
would be awkward. Enum constants also cost no allocation, which matters only in a genuinely hot
path.

Enums with per-constant behaviour (a body per constant) sit between the two: fine for small,
stable machines, and they scatter the transition rules across constants exactly the way state
classes do.

## Persistence

```java
@Enumerated(EnumType.STRING)      // never EnumType.ORDINAL
private Status status;
```

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
- **An unknown value must throw.** Mapping it to a default is how a `REFUNDING` order becomes
  `DRAFT` after a rollback.

## Atomicity

```java
// wrong: check-then-act
if (order.state() instanceof Paid) {
    order.transition(new Ship(tracking, now));      // two requests can both pass the check
    orders.save(order);
}
```

Three correct mechanisms, chosen by where the state lives:

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

(2) is the most under-used and the strongest for a single-row transition: the database performs
the compare-and-swap, and the row count is the answer. Its critical detail is checking that count
— an update that matched nothing looks identical to a successful one otherwise
(`offline-concurrency-control`).

## Side effects of a transition

A transition that also sends an email, publishes an event or calls a service must define what
happens when it is retried:

```text
Effect inside the same transaction as the state change
  → an outbox row, forwarded by a relay. Exactly-once state change,
    at-least-once delivery, idempotent consumer (event-driven-architecture).

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
A scheduled sweep query          simple; latency = sweep interval;
                                 needs an index on (status, created_at)

A delayed message                accurate; depends on the broker's
                                 delay support and its at-least-once
                                 redelivery

An in-memory timer               lost on restart. Only for states that
                                 do not outlive the process
```

The failure to avoid: a state reachable only by a timer that does not survive a deploy. Orders sit
in `AwaitingPayment` forever and are found by a customer. Whatever the mechanism, the transition
must be idempotent — the sweep and a redelivered message may both fire
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

Enumerating every `(state, event)` pair — including the illegal ones — is the specification. It is
also the test that fails informatively when a state is added and someone forgets an event, which
no scenario-based test does.
