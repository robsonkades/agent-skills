# Deciding and Designing

## The comparison that should happen first

Event sourcing is usually proposed to solve a problem that a cheaper mechanism already
solves. Run this comparison explicitly, because the alternatives are genuinely good and are
routinely skipped.

| Need                                    | Cheapest adequate mechanism                    | Event sourcing adds                               |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| "Who changed this, and when"            | Audit/history table, or DB temporal tables     | Nothing worth the cost                            |
| "What did it look like last March"      | Bitemporal columns, or temporal tables         | Arbitrary reconstruction, including derived state |
| "Feed changes to analytics"             | Change data capture (CDC) from the existing DB | Nothing — CDC is less invasive                    |
| "Other services react to changes"       | Publish integration events from an outbox      | Nothing — the outbox is independent               |
| "Undo, and show the user their history" | A history table plus a revert operation        | Undo of derived state, not just stored fields     |
| "The sequence IS the domain"            | —                                              | This is the case it exists for                    |

The last row is the honest test. In a ledger, the entries are the truth and the balance is a
derived number — writing the balance as the truth and the entries as an audit log inverts the
domain. In a claims system, the sequence of events _is_ the claim. In a CRM, a contact's
current details are the truth and the change history is metadata.

**Adopt per aggregate, not per system.** A system where the ledger is event-sourced and the
customer profile is a normal table is well designed, not inconsistent.

### The costs to state out loud when proposing it

- Every query needs a projection, and every new query needs a new projection built from
  history.
- Every event type is a permanent schema commitment.
- The team needs an operational answer for rebuilds, projection lag and position tracking.
- Onboarding cost: this is unfamiliar to most Java developers, and mistakes are structural
  rather than local.
- Erasure obligations conflict with immutability, and the resolution must exist before the
  first event is written.

## Stream boundaries

A stream is three things at once, which is why the boundary matters so much:

- the **unit of consistency** — events in it are ordered and appended atomically;
- the **unit of concurrency** — the expected-version check is per stream;
- the **unit of loading** — the whole stream is read to rebuild state.

So: **one stream per aggregate instance**, `account-1234`, not `all-accounts`.

```text
Too coarse:  one stream for everything
             → every write contends with every other write;
               loading any aggregate reads the entire history.

Right:       one stream per aggregate instance
             → contention only between commands on the same aggregate;
               loading reads only that aggregate's events.

Too fine:    a stream per field or per event type
             → no atomic multi-event append, no meaningful ordering,
               and the invariant has nowhere to live.
```

The failure that shows up late is the **unbounded stream**: an aggregate that accumulates
events forever — a long-lived account, a device feed, a rolling subscription. Every load gets
slower, permanently. Two answers, in order of preference:

1. **Close and open streams on a business boundary.** An accounting period, a subscription
   term, a session. The closing event carries the balance forward, and the new stream starts
   from it. This is what accounting has always done, and it bounds the stream by design.
2. **Snapshot.** Cheaper to implement, but treats the symptom and adds a cache to keep
   correct.

If neither is possible, the aggregate boundary is probably wrong.

## Designing the events

**Name them as facts in the business's language, past tense.**

```java
public sealed interface AccountEvent {
    record AccountOpened(String accountId, String holder, Instant at) implements AccountEvent { }
    record FundsDeposited(String accountId, Money amount, Instant at) implements AccountEvent { }
    record FundsWithdrawn(String accountId, Money amount, Instant at) implements AccountEvent { }
    record AccountFrozen(String accountId, String reason, Instant at) implements AccountEvent { }
}
```

`BalanceUpdated(newBalance)` would be the same information and a much worse event: it records
the _result_ of a decision instead of the decision, so no projection can ever ask "how much was
withdrawn" and no new rule can be applied to the past.

**What belongs in the payload:**

- Everything a projection or a future replay will need — an event is read by code that does not
  exist yet, and cannot ask the database for context that has since changed.
- The values as they were, not references to look up. If a price was applied, store the price.
- Enough identity to route it: aggregate id, and the stream version the store assigns.

**What does not belong:**

- Derived values that can be recomputed from other events, unless recomputation is expensive
  and the rule can never change.
- Whole related aggregates — copy the fields that mattered.
- Anything the aggregate did not actually decide. Events describe the aggregate's own facts.

**Metadata belongs beside the payload, not inside it:** correlation and causation ids, the
actor, the timestamp the store assigns. Keeping them separate means the business payload stays
readable and the plumbing can evolve independently (`distributed-tracing-design`).

## The write model

Load, fold, decide, append. The decision is pure; the store call is at the edge.

```java
public final class Account {
    private final String id;
    private Money balance;
    private boolean frozen;

    private Account(String id) {
        this.id = id;
        this.balance = Money.zero();
    }

    /** Reconstitution: fold the stream. No validation here — these already happened. */
    public static Account replay(String id, List<AccountEvent> history) {
        Account account = new Account(id);
        history.forEach(account::apply);
        return account;
    }

    private void apply(AccountEvent event) {
        switch (event) {
            case AccountEvent.AccountOpened e   -> { /* identity already set */ }
            case AccountEvent.FundsDeposited e  -> balance = balance.plus(e.amount());
            case AccountEvent.FundsWithdrawn e  -> balance = balance.minus(e.amount());
            case AccountEvent.AccountFrozen e   -> frozen = true;
        }
    }

    /** Decision: validate against current state, return the outcome. Appends nothing. */
    public Decision withdraw(Money amount, Instant at) {
        if (frozen) {
            return new Decision.Rejected("account is frozen");
        }
        if (balance.isLessThan(amount)) {
            return new Decision.Rejected("insufficient funds");
        }
        return new Decision.Accepted(List.of(new AccountEvent.FundsWithdrawn(id, amount, at)));
    }

    public sealed interface Decision {
        record Accepted(List<AccountEvent> events) implements Decision { }
        record Rejected(String reason) implements Decision { }
    }
}
```

Three properties to preserve:

- **`apply` never validates.** It is replaying facts. A validation in `apply` means an old
  event can fail to load after a rule changes — the system breaks retroactively.
- **The command method returns the outcome; it does not store it.** The application service
  appends. This keeps the aggregate testable as a pure function of history and command.
- **A rejected command is an expected outcome, not an exception.** "Insufficient funds" is a
  branch the caller will take, and modelling it as a returned value keeps the decision total
  and the call site's handling checkable by the compiler
  (`humble-objects-and-functional-core`). Reserve exceptions for conditions no caller can act
  on — a corrupt stream, an unreadable payload.

## Concurrency: expected version

Every append states the version the decision was made against. The store rejects the append if
the stream has moved.

```java
public void withdraw(String accountId, Money amount, CommandId commandId) {
    StreamSlice slice = store.readStream(accountId);          // events + current version

    // An unknown outcome from a previous attempt may already have appended this command.
    if (slice.containsCommand(commandId)) {
        return;
    }
    Account account = Account.replay(accountId, slice.events());

    switch (account.withdraw(amount, clock.instant())) {
        case Account.Decision.Rejected r -> throw new CommandRejectedException(r.reason());
        case Account.Decision.Accepted a ->
                store.append(accountId, a.events(), slice.version(), commandId);
    }
}
```

This is optimistic concurrency control, and it behaves as it does over a version column
(`offline-concurrency-control`):

- The conflict is detected reliably; the store enforces it with a unique constraint on
  `(streamId, version)`.
- **Retrying means re-deciding, not re-appending.** Reload the stream, replay, and run the
  command again against fresh state. Appending the previously computed events at a new version
  applies a decision made against state that no longer holds.
- Some commands cannot be retried automatically at all. A withdrawal that was valid against
  the old balance may be invalid now; that is a user-visible conflict, not a transient error
  (`retries-and-backoff`).

**The dangerous case is neither success nor failure — it is the unknown outcome.** A socket
timeout, a connection reset, or the process dying after the append committed and before the
acknowledgement. Re-deciding here is not safe: the stream has genuinely moved on, so the retry
computes a second, perfectly valid `FundsWithdrawn` and appends it at version N+1. The
expected-version check passes, because the version really is new. The customer is debited
twice for one command, and nothing in the concurrency model can detect it.

The fix is command-level idempotency, and it must be designed in: carry a command id, record
it in the appended events' metadata, and check for it before re-deciding after an unknown
outcome — as the snippet above does (`idempotency`).

**One assumption underlies all of this: a single linearizable primary per stream.** The
`(streamId, version)` constraint has to be enforced in one place, and `readStream` must go to
that place, not to a replica. An active-active or multi-region store that resolves concurrent
writes last-writer-wins provides no expected-version check at all, and none of this holds.

Where an invariant spans aggregates, event sourcing does not help: the answer is the same as
anywhere else — redesign the boundary, or accept eventual consistency with a compensating
process (`distributed-transactions-and-sagas`).

## Choosing the store and the payload format

Two build-time decisions that are effectively permanent, because the events written under them
outlive every other choice in the system.

**The store** must give you three things, and a message broker gives you only the first: append
with an expected version, read a stream back in order at any time, and subscribe from a
position. A topic is a transport with a retention window, not a store — it cannot replay a
single aggregate's history two years later, and that replay is the whole design. Use a
purpose-built event store, or an append-only table with a unique `(streamId, version)`
constraint and a gapless subscription strategy (`message-ordering-and-partitioning`).

**The payload format** is a schema commitment on the same horizon. Choose one that tolerates
unknown and missing fields, so an additive change stays the cheap change: JSON with lenient
deserialisation, or Avro/Protobuf with defaults. Never Java serialisation — it welds the stored
bytes to the class shape that wrote them, so the first refactor of a record makes old events
unreadable (`serialization-performance`).

## Snapshots

A snapshot is a cached fold at a version.

```text
Load = latest snapshot (version N) + events after N
```

**Warranted when** streams are long by nature and cannot be closed on a business boundary, and
measurement shows load time is the actual problem.

**Rules that keep them safe:**

- Deleting every snapshot must leave the system correct. If not, the snapshot has become the
  source of truth.
- A snapshot is tied to the shape of the state class. Change that shape and old snapshots must
  be invalidated — version them, and discard rather than upcast; they are rebuildable.
- Snapshot on a threshold of events, not on a timer. The cost is a function of stream length.
- Do not snapshot early. It is a cache, with a cache's invalidation problems, and premature
  adoption hides the fact that the stream boundary is wrong.
