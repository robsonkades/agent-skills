# Deciding and Designing

## The comparison that should happen first

Event sourcing is usually proposed to solve a problem that a cheaper mechanism already
solves. Run this comparison explicitly, because the alternatives are genuinely good and are
routinely skipped.

| Need                                    | Cheapest adequate mechanism                    | Event sourcing adds                                      |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| "Who changed this, and when"            | Audit/history table, or DB temporal tables     | Domain replay only if independently required             |
| "What did it look like last March"      | Bitemporal columns, or temporal tables         | Arbitrary reconstruction, including derived state        |
| "Feed changes to analytics"             | Change data capture (CDC) from the existing DB | Semantic domain events only if CDC rows are insufficient |
| "Other services react to changes"       | Publish integration events from an outbox      | Historical fold only if the sequence is authoritative    |
| "Undo, and show the user their history" | A history table plus a revert operation        | Undo of derived state, not just stored fields            |
| "The sequence IS the domain"            | —                                              | This is the case it exists for                           |

The last row is the honest test. In a ledger, the entries are the truth and the balance is a
derived number — writing the balance as the truth and the entries as an audit log inverts the
domain. In a claims system, the sequence of events _is_ the claim. In a CRM, a contact's
current details are the truth and the change history is metadata.

**Adopt per aggregate, not per system.** A system where the ledger is event-sourced and the
customer profile is a normal table is well designed, not inconsistent.

### The costs to state out loud when proposing it

- Queries need a state representation: an existing view may serve many queries; direct
  stream folds and inline views are alternatives to a separate asynchronous projection.
- Every retained event type is a schema commitment for its replay/evolution horizon.
- The team needs an operational answer for rebuilds, projection lag and position tracking.
- Onboarding cost: this is unfamiliar to most Java developers, and mistakes are structural
  rather than local.
- Erasure obligations conflict with immutability, and the resolution must exist before the
  first event is written.

### Define what “state at time T” means

Replay can answer different temporal questions:

- **Transaction/recorded time:** what the system had recorded by T.
- **Effective/valid time:** what the business now believes was true at T, including later
  corrections/backdated facts.
- **Historical interpretation:** state produced by the code/schema rules deployed at T.
- **Current interpretation of history:** old events upcast and folded by today's rules.

These answers can differ. Persist decision inputs and effective/recorded times where the domain
needs them; version projection logic or retain reproducible artifacts when historical code
semantics matter. External exchange rates, feature flags or reference data absent from events
make exact replay impossible. Compare bitemporal storage when valid-time correction is the real
requirement.

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

The failure that shows up late is the **long stream**: full replay work grows with retained
events even when indexed append/tail reads remain efficient. Measure event count, bytes, fold
CPU and snapshot hit/recovery time. Possible answers include:

1. **Close and open streams on a business boundary.** An accounting period, a subscription
   term, a session. The closing event carries the balance forward, and the new stream starts
   from it. This is what accounting has always done, and it bounds the stream by design.
2. **Snapshot.** Cheaper to implement, but treats the symptom and adds a cache to keep
   correct.

If neither is possible, incremental state loading or a revised aggregate boundary may be
needed; long history alone does not prove the boundary wrong.

## Designing the events

**Name them as facts in the business's language, past tense.**

Partial Java 21 domain examples: `Instant`, `List` and the application `Money` type/imports
are omitted. `Money` uses exact arithmetic and rejects incompatible currencies; the example
assumes an existing account whose stream identity/schema/order were checked while loading.

```java
public sealed interface AccountEvent {
    record AccountOpened(String accountId, String holder, Instant at) implements AccountEvent { }
    record FundsDeposited(String accountId, Money amount, Instant at) implements AccountEvent { }
    record FundsWithdrawn(String accountId, Money amount, Instant at) implements AccountEvent { }
    record AccountFrozen(String accountId, String reason, Instant at) implements AccountEvent { }
}
```

`BalanceUpdated(newBalance)` alone loses the distinction between a withdrawal, deposit and
correction. Preserve the decision when consumers or replay need that distinction. Conversely,
`BalanceReconciled(newBalance, reason)` can record a real domain correction; include the inputs
and provenance required by its contract rather than inventing a withdrawal to fit a naming rule.

**What belongs in the payload:**

- Decision inputs/results needed to preserve the event's meaning and known replay obligations.
  Future consumers cannot be predicted, so “store everything” is not a bounded requirement.
- The values as they were, not references to look up. If a price was applied, store the price.
- Enough identity to route it: aggregate id, and the stream version the store assigns.

**What does not belong:**

- Derived values that can be recomputed from retained facts, unless preserving the value/rule
  used at decision time is itself part of the domain record.
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

    /** Reconstitution: fold structurally verified history without rerunning command rules. */
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
        if (!amount.isPositive()) {
            return new Decision.Rejected("amount must be positive");
        }
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

- **`apply` does not rerun command validation.** Reject corrupt payloads, stream-identity
  mismatches and unsupported schemas at the loading boundary. Do not discard malformed
  history or rejudge old accepted facts against new business rules.
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
public WithdrawResult withdraw(String accountId, Money amount, CommandId commandId) {
    StreamSlice slice = store.readStream(accountId);          // events + current version

    // An unknown outcome from a previous attempt may already have appended this command.
    var prior = slice.outcomeFor(commandId);
    if (prior.isPresent()) {
        return WithdrawResult.from(prior.orElseThrow());
    }
    Account account = Account.replay(accountId, slice.events());

    return switch (account.withdraw(amount, clock.instant())) {
        case Account.Decision.Rejected r -> WithdrawResult.rejected(r.reason());
        case Account.Decision.Accepted a -> {
            AppendResult appended =
                    store.append(accountId, a.events(), slice.version(), commandId);
            yield WithdrawResult.accepted(appended.position());
        }
    };
}
```

This is optimistic concurrency control, and it behaves as it does over a version column
(`offline-concurrency-control`):

- The store must atomically enforce the expected revision. A transactional table can use
  a unique `(streamId, version)` constraint with an atomic batch; native stores may use
  different mechanisms. An unconditional append does not enforce this invariant.
- **After a confirmed concurrency conflict**, reload and check command identity before
  re-deciding if allowed. Never move stale events to a new expected revision. Retrying the
  identical append at its original revision/event IDs after an unknown result may be supported
  by the store's idempotent-append contract; verify its exact conditions.
- Some commands cannot be retried automatically at all. A withdrawal that was valid against
  the old balance may be invalid now; that is a user-visible conflict, not a transient error
  (`retries-and-backoff`).

**The dangerous case is neither success nor failure — it is the unknown outcome.** A socket
timeout, a connection reset, or the process dying after the append committed and before the
acknowledgement. Re-deciding here is not safe: the stream has genuinely moved on, so the retry
computes a second, perfectly valid `FundsWithdrawn` and appends it at version N+1. The
expected-version check passes, because the version really is new. The customer is debited
twice for one command, and nothing in the concurrency model can detect it.

The fix is command-level idempotency, designed with the store: carry a command id, append it
atomically with the events, and recover the prior outcome before re-deciding. A linear scan of
an unbounded stream may be too costly, so use store-supported event identity or a command index
whose uniqueness/transaction boundary is explicit. On an expected-version conflict, reload and
repeat the command-ID check before any re-decision (`idempotency`).

Bind command identity to tenant/stream and a canonical request fingerprint; reject reuse
with different input. Define the deduplication horizon and whether rejected/no-event outcomes
must also remain stable on retry. The snippet only recovers accepted outcomes retained in
the stream; snapshot loading or prefix retention must not silently drop required identities.

**One assumption underlies all of this: linearizable conditional append for the stream.** A
single primary is one implementation; a quorum service can also provide it. The decision read
and expected-version append must participate in the store's stated consistency contract. An
active-active store using last-writer-wins without conditional stream append does not provide
this invariant.

For a cross-aggregate invariant, inspect supported multi-stream atomic append before choosing
between redesign and eventual recovery. KurrentDB's documented multi-stream APIs are
server/version-specific; event sourcing itself guarantees no cross-stream transaction.
State the actual resource boundary (`distributed-transactions-and-sagas`).

## Choosing the store and the payload format

Two build-time decisions that are effectively permanent, because the events written under them
outlive every other choice in the system.

**The store** must support the required conditional append, ordered stream read over the
declared retention horizon, and resumable subscription. Some brokers provide long retention,
ordering and replay but lack a direct expected-stream-version primitive or efficient per-stream
reads; some databases/event stores provide all three. Evaluate semantics and access paths, not
the product label. An append-only table needs a unique `(streamId, version)` constraint and a
commit-order-safe subscription strategy (`message-ordering-and-partitioning`).

**The payload format** is a schema commitment on the same horizon. Choose one that tolerates
unknown and missing fields, so an additive change stays the cheap change: JSON with lenient
deserialisation, or Avro/Protobuf with compatible schemas/defaults. Avoid Java native
serialization for long-lived events due to class coupling, security and interoperability
costs; not every class refactor is inherently incompatible (`serialization-performance`).

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
- Bind snapshots to stream identity, exact revision and compatible fold/schema version.
  Validate compatibility or discard and replay; a change need not invalidate every snapshot.
- Choose event-count, measured replay-cost or time-based snapshot policies from recovery SLOs;
  capture state and revision consistently and prevent an older snapshot replacing a newer one.
- Do not snapshot by folklore. It is a rebuildable cache with version/invalidations; add it
  when measured load/recovery cost or bounded replay SLO justifies it.
