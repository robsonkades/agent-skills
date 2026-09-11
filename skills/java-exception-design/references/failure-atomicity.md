# Failure atomicity

When unchanged state is the failure contract, a failed method must leave its receiver as it
was before the call. An undocumented partial mutation can make a caller retry or continue on
inconsistent state. Some operations instead promise partial progress or invalidate the receiver;
define that post-failure state and the covered failures before choosing an implementation.

## The four ways to get it

The code blocks are partial Java 21 snippets: domain types (`Money`, `Entry`, `Rule`), fields,
imports and helper methods are elided. `validate` must not mutate existing rules or external
state; copying the list alone does not isolate mutable elements or side effects.

**1. Immutability.** A truly immutable receiver cannot be left half-modified. That protects
the receiver, not external effects performed by the operation or a caller's publication of
new state — see java-immutability.

**2. Check before you change.** Order the method so every validation happens before any
mutation:

```java
private record State(Money balance, List<Entry> entries) {}

public void withdraw(Money amount) {
    State before = state;
    requireSameCurrency(amount);
    if (amount.isGreaterThan(before.balance())) {
        throw new InsufficientFunds(id, before.balance(), amount);
    }
    Entry debit = Entry.debit(amount);                // may validate/throw before publication
    var entries = new ArrayList<>(before.entries());
    entries.add(debit);                               // may allocate/throw before publication
    state = new State(before.balance().minus(amount), List.copyOf(entries)); // one state swap
}
```

This is failure atomicity, not automatically thread safety. Concurrent access still needs a lock or
an appropriate `volatile`/atomic state-reference protocol, and multi-step decisions must be guarded
as one operation; see java-thread-safety-contracts.

The ordering rule generalises: perform fallible work before publishing mutation and, where
multiple fields form one invariant, publish an immutable aggregate in one assignment. A `Stack.pop` that checks `size == 0`
before touching the array is this pattern in the JDK.

**3. Work on a copy, then swap.** When the operation is complex, build the new state
separately and install it with a single assignment that cannot fail:

```java
public void replaceAll(List<Rule> rules) {
    List<Rule> validated = rules.stream().map(this::validate).toList();   // may throw
    this.rules = validated;                                               // cannot
}
```

Some operations use copy-then-swap, but do not assume library sorts are failure-atomic: the
`List.sort` contract does not promise rollback if the comparator throws. Read
the target API contract and test exceptional paths.

**4. Recovery code.** A rollback in a `catch` that undoes what was already done. Consider it
when preparation/copying is unsuitable and restoration can meet the declared failure model;
this can apply to owned in-memory state as well as durable structures. Verify rollback failure
and prevent concurrent observers from seeing an invalid intermediate state. Disk recovery also
needs crash semantics; a `catch` cannot run after process loss.

## Where to relax it deliberately

Failure atomicity is not free and not always desirable:

- **A batch that permits independent item progress** can keep successful items and report
  failures. A declared all-or-nothing batch must retain that guarantee; item count does not
  authorize partial commits. For item-level outcomes and a batch summary, see
  the result-type discussion in `design-decisions.md`.
- **Concurrent/fail-fast collections** may detect interference with
  `ConcurrentModificationException`, but detection is best effort and does not promise rollback.
  Thread safety and failure atomicity are separate contracts.
- **VM/resource failures such as OOM or stack overflow** can defeat recovery itself. Define
  the failures covered by the atomicity guarantee; do not promise universal rollback across
  arbitrary `Error`s, or infer that every `Error` has the same recovery policy.

What matters is that the choice is stated. Document non-atomic methods explicitly:
"if this throws, the collection may contain some of the added elements" is a contract; silence
is a trap.

## Where the boundary of "the object" ends

Failure atomicity is a property of _in-memory_ state, and this is where it is most often
over-claimed:

- **Local mutation plus an ordinary remote call does not establish joint atomicity.** A timeout
  is a local failure signal; without definitive evidence the remote effect may remain unknown.
  Preserve known completed effects separately from unknown ones. That is the
  idempotency and retry problem, not an exception-design one: see idempotency,
  timeouts-and-deadlines and retries-and-backoff.
- **A database transaction gives atomicity for persistent state**, and only for what is inside
  it. In-memory fields mutated in the same method are _not_ rolled back when the transaction
  is: an entity object, a cache, a counter or a queued event stays modified while the row does
  not. This mismatch is the standard bug behind "the cache says shipped, the database says
  pending"; enterprise-transactions covers transaction participation and rollback boundaries.
  Publishing only after commit avoids premature visibility but can still need recovery if
  that later publication fails.
- **A local exception does not establish cross-service atomicity.** Coordinated transaction
  protocols can provide atomic commit for participating resources under their assumptions;
  ordinary independent HTTP calls do not inherit it. Route the choice among coordinated
  transactions, reconciliation and compensation to distributed-transactions-and-sagas. A saga
  or outbox is not mandatory for every remote call, and compensation is not rollback isolation.

The practical rule: enforce the declared in-memory failure state, make persistent state
transactional where required, and define remote outcome/reconciliation semantics explicitly. Do not
substitute one for another.

## Review checks

- [ ] Mutating methods enforce their declared failure state through preparation/recovery or
      an explicit partial-progress/invalidation contract.
- [ ] Fields participating in one invariant are published as one immutable state where practical;
      rollback paths handle their own possible failures.
- [ ] Complex updates prepare before publication or use a verified recovery protocol fitting
      the declared contract and ownership.
- [ ] Methods that deliberately are not atomic say so in the Javadoc.
- [ ] Methods combining local and remote changes preserve known/unknown outcomes and use the
      accepted reconciliation, safe repetition or coordinated protocol required by their contract;
      a local throw does not erase an applied effect or by itself require idempotent remote operations.
- [ ] In-memory state changed inside a transaction is restored, invalidated or reconciled with
      persistent state after rollback as required by the accepted consistency contract.
- [ ] A test exercises the failure path and checks the promised unchanged, partially progressed
      or unusable state afterwards — not only that the exception was thrown.

## Authoritative references

- [XAResource, Java SE 21](https://docs.oracle.com/en/java/javase/21/docs/api/java.transaction.xa/javax/transaction/xa/XAResource.html) — participating resource managers and coordinated commit; not a guarantee for arbitrary HTTP services.
- [List.sort exceptional-state contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#sort(java.util.Comparator)>)
- [try-with-resources and suppressed exceptions, Java Language Guide](https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html)
