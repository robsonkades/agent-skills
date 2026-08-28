# Boundaries and Propagation

## Propagation, by what it actually does

| Mode            | If a transaction exists       | If none exists | Connections | Notes                                                                |
| --------------- | ----------------------------- | -------------- | ----------- | -------------------------------------------------------------------- |
| `REQUIRED`      | joins it                      | starts one     | 1           | The default and almost always correct                                |
| `REQUIRES_NEW`  | suspends it, starts a new one | starts one     | 2           | Two connections held at once; can deadlock against the suspended one |
| `SUPPORTS`      | joins it                      | runs without   | 0 or 1      | Behaviour changes with the caller — hard to reason about; avoid      |
| `NOT_SUPPORTED` | suspends it, runs without     | runs without   | 1 held idle | Useful to keep a long read out of a write transaction                |
| `MANDATORY`     | joins it                      | throws         | 1           | Good on internal helpers that must never demarcate                   |
| `NEVER`         | throws                        | runs without   | 0           | Guards code that must not be transactional                           |
| `NESTED`        | savepoint inside the current  | starts one     | 1           | JDBC savepoints; not supported by every manager or driver            |

The two worth deliberate use are `REQUIRED` (everywhere) and `REQUIRES_NEW` (for work that
must survive the caller's rollback — audit records, failure logging, an idempotency marker).
`REQUIRES_NEW` costs a second pool connection for the inner duration: a pool of 10 with a
use case that nests one is effectively a pool of 5, and under load that is a deadlock
against your own pool.

## The silent no-ops

Each of these compiles, looks demarcated, and is not:

```java
@Service
public class Orders {

    @Transactional
    public void placeAll(List<Command> commands) {
        for (var c : commands) place(c);        // ← self-invocation: no proxy, no new tx.
    }                                            //   With REQUIRES_NEW intended, nothing
                                                 //   is isolated; all-or-nothing instead.
    @Transactional(propagation = REQUIRES_NEW)
    public void place(Command c) { ... }

    @Transactional
    private void audit(String what) { ... }      // ← private: proxy cannot advise it.

    @Transactional
    public final void settle() { ... }           // ← final: CGLIB cannot override it.
}
```

Also silent: `@Transactional` on a class instantiated with `new` rather than injected; on a
method invoked from a lambda that the framework did not proxy; and — most commonly — on a
method reached from a `@PostConstruct` or from a constructor, before the proxy exists.

**Verification at runtime**, worth having in a test rather than reasoning about:

```java
assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
assertThat(TransactionSynchronizationManager.getCurrentTransactionName())
    .endsWith("PlaceOrder.place");
```

## Rollback rules

```java
// Default: rolls back on RuntimeException and Error, commits on checked exceptions.
@Transactional
public void settle() throws InsufficientFunds { ... }   // ← commits the partial work

@Transactional(rollbackFor = InsufficientFunds.class)
public void settleCorrectly() throws InsufficientFunds { ... }
```

Two further traps:

- **Catching inside the boundary.** If an inner `REQUIRED` method threw and the outer
  catches it and continues, the transaction is already marked rollback-only; the commit at
  the end fails with `UnexpectedRollbackException` and the original cause is long gone. If
  the inner failure must be survivable, the inner work needs `REQUIRES_NEW`.
- **Swallowing to "make it resilient".** A `catch (Exception e) { log.error(...); }` around
  a write inside a transaction produces a commit of whatever happened to succeed. Failing
  fast is the transactional behaviour; resilience belongs outside the boundary.

## Keeping the boundary small

```java
@Transactional
public void placeOrder(PlaceOrderCommand command) {
    var order = Order.from(command);
    orders.save(order);
    paymentGateway.charge(order.total());   // ← 3 s p99, sometimes 30 s on timeout
}
```

The remote call's latency is now lock duration and connection-hold duration. Under a
provider slowdown, the pool empties and every unrelated endpoint fails — an availability
incident caused by a transaction boundary.

The corrected shapes, in order of preference:

1. **Do the remote work outside the transaction**, before or after, and make the write
   idempotent so a retry is safe (`idempotency`).
2. **Outbox**: write the order and a `pending_charge` row in the same transaction; a relay
   reads the outbox after commit and calls the gateway with retries. Atomic locally, at
   least once remotely.
3. **Compensate**: charge first, then write; if the write fails, refund. Only where the
   remote system supports a reliable reversal.

The one shape that is never correct is a remote call inside the transaction with the
justification that "it will be rolled back if the call fails" — the remote side has already
acted, and your rollback does not reach it.

## Batch work

```java
// Wrong: one transaction, one lock set, no restart point, undo log grows all night.
@Transactional
public void reindexAll() {
    for (var row : repository.findAll()) { ... }
}

// Right: a transaction per chunk, restartable, bounded lock scope.
public void reindexAll() {
    Long cursor = 0L;
    List<Row> chunk;
    while (!(chunk = repository.findNextChunk(cursor, 500)).isEmpty()) {
        cursor = transactionTemplate.execute(status -> processChunk(chunk));
    }
}
```

Chunked batches need three properties the single transaction gets for free and must now be
designed: restartability (a durable cursor), idempotency of a chunk (a chunk may be applied
twice after a crash), and a defined intermediate state — other readers will see the batch
half-applied, and someone must decide that is acceptable.

## Reads

- `@Transactional(readOnly = true)` lets Hibernate set `FlushMode.MANUAL` and skip dirty
  checking, which is a real saving on large result sets, and may route to a replica if
  routing is configured. It does not prevent writes at the database level in every engine.
- A read with no transaction is fine and is one connection per statement. A read _inside_
  a write transaction extends that transaction — move long reads out with `NOT_SUPPORTED`
  when they are incidental to the write.
- Repeatable reads within one request come from the transaction, not from the ORM. A
  request that reads the same row twice outside a transaction may legitimately see two
  values (`consistency-models`).

## Checklist for a use case

- [ ] Exactly one demarcation, at the application service
- [ ] No network call, message publish, file write or user wait inside it
- [ ] Rollback rule matches the exceptions actually thrown
- [ ] No self-invocation on the transactional path
- [ ] Batch work chunked, with a restart cursor
- [ ] `REQUIRES_NEW` used only where the inner work must survive an outer rollback, and the
      pool is sized for the extra connection
- [ ] The non-atomic edge (message, remote call) has a named strategy: outbox, retry or
      compensation
