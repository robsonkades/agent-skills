# Failure atomicity

A failed method should leave its receiver in the state it had before the call. When it does
not, the exception is only the first failure: the second is that the caller catches it,
retries or continues, and operates on an object that is now internally inconsistent — with no
error at the moment the damage becomes visible.

## The four ways to get it

**1. Immutability.** An immutable object cannot be left half-modified; a failed operation
simply produces no new instance. This is the strongest form and needs no discipline at the
call site — see java-immutability.

**2. Check before you change.** Order the method so every validation happens before any
mutation:

```java
public void withdraw(Money amount) {
    requireSameCurrency(amount);                     // all checks first
    if (amount.isGreaterThan(balance)) throw new InsufficientFunds(id, balance, amount);
    balance = balance.minus(amount);                 // then the single mutation
    entries.add(Entry.debit(amount));                // ordered so nothing after this can fail
}
```

The ordering rule generalises: perform the operation that can fail _before_ the one that
mutates, and put the mutation that cannot fail last. A `Stack.pop` that checks `size == 0`
before touching the array is this pattern in the JDK.

**3. Work on a copy, then swap.** When the operation is complex, build the new state
separately and install it with a single assignment that cannot fail:

```java
public void replaceAll(List<Rule> rules) {
    List<Rule> validated = rules.stream().map(this::validate).toList();   // may throw
    this.rules = validated;                                               // cannot
}
```

Sorting implementations do exactly this — copying into an array, sorting, and writing back —
partly for performance and partly because a comparator that throws mid-sort would otherwise
leave the list scrambled.

**4. Recovery code.** A rollback in a `catch` that undoes what was already done. It is the
weakest option: the rollback itself can fail, it doubles the code paths, and it is hard to
test. Reserve it for durable structures (an on-disk index, a file layout) where the other
three are impossible.

## Where to relax it deliberately

Failure atomicity is not free and not always desirable:

- **A batch that processes 10 000 records** should usually keep the 9 998 that succeeded and
  report the two that failed. Atomicity at the item level, a summary at the batch level — see
  the result-type discussion in `design-decisions.md`.
- **A concurrent object whose invariant already broke** cannot be repaired by the failing
  thread alone; `ConcurrentModificationException` explicitly makes no atomicity promise.
- **`Error`s (OOM, stack overflow) are not recoverable** and no method is expected to stay
  atomic across them.

What matters is that the choice is stated. Document non-atomic methods explicitly:
"if this throws, the collection may contain some of the added elements" is a contract; silence
is a trap.

## Where the boundary of "the object" ends

Failure atomicity is a property of _in-memory_ state, and this is where it is most often
over-claimed:

- **A method that mutates the object and calls a remote service is not atomic**, regardless of
  ordering. If the local mutation succeeds and the call times out, you do not know whether the
  remote side applied it — a timeout is not a failure, it is an unknown. That is the
  idempotency and retry problem, not an exception-design one: see idempotency,
  timeouts-and-deadlines and retries-and-backoff.
- **A database transaction gives atomicity for persistent state**, and only for what is inside
  it. In-memory fields mutated in the same method are _not_ rolled back when the transaction
  is: an entity object, a cache, a counter or a queued event stays modified while the row does
  not. This mismatch is the standard bug behind "the cache says shipped, the database says
  pending"; enterprise-transactions and ddd-adjacent skills cover the pattern of publishing
  effects only after commit.
- **Across services there is no atomicity to preserve**, only compensation. A partially
  applied multi-service operation needs an explicit saga with compensating actions and an
  outbox — distributed-transactions-and-sagas.

The practical rule: make the in-memory object atomic, make the persistent state
transactional, and make everything beyond the process idempotent and compensable. Do not
substitute one for another.

## Review checks

- [ ] Every mutating method validates fully before mutating anything.
- [ ] The unfailable mutation is last; nothing that can throw runs between two mutations that
      must both happen.
- [ ] Complex updates build new state and install it with one assignment.
- [ ] Methods that deliberately are not atomic say so in the Javadoc.
- [ ] No method mutates in-memory state and then performs a remote call whose failure would
      leave the two inconsistent — or, if it must, the remote effect is idempotent and the
      local state is derived from the confirmed outcome.
- [ ] In-memory state changed inside a transaction is either derived from the persistent state
      or explicitly restored when the transaction rolls back.
- [ ] A test exercises the failure path and asserts the object is still usable afterwards —
      not only that the exception was thrown.
