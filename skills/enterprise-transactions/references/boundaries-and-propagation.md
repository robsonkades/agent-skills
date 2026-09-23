# Boundaries and Propagation

## Propagation, by what it actually does

| Mode            | If a transaction exists       | If none exists | Resource considerations                                                            |
| --------------- | ----------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `REQUIRED`      | joins it                      | starts one     | Shares physical transaction and rollback-only state                                |
| `REQUIRES_NEW`  | suspends it, starts a new one | starts one     | Outer resources retained; inner JDBC work can need another connection              |
| `SUPPORTS`      | joins it                      | runs without   | Resource synchronization depends on manager/configuration                          |
| `NOT_SUPPORTED` | suspends it, runs without     | runs without   | Does not release outer locks/connections; inner JDBC work still needs a connection |
| `MANDATORY`     | joins it                      | throws         | Enforces an existing transaction on an intercepted call                            |
| `NEVER`         | throws                        | runs without   | Absence of transaction does not mean absence of a JDBC connection                  |
| `NESTED`        | savepoint inside the current  | starts one     | Typically JDBC savepoints; manager/driver support required                         |

Choose propagation from commit semantics. An audit attempt may commit independently with
`REQUIRES_NEW`; a completed idempotency marker normally must commit with its business effect.
For one datasource, ten outer transactions holding ten connections can all wait for an inner
connection from a pool of ten. Bound concurrent outer work and model nesting, pool-acquisition
timeouts and lock dependencies; there is no universal "effective pool of five" rule.
Count acquired physical connections, not annotations: with a configured lazy datasource,
an empty transactional scope may never borrow a connection. This does not remove the extra
connection demand when both outer and inner scopes perform JDBC work.

An inner `REQUIRED` normally joins the outer isolation/timeout/read-only settings rather
than upgrading them. Inspect manager validation options when mismatches must be rejected.
Suspension and savepoints are manager-dependent. JDBC savepoint rollback does not necessarily
restore a JPA persistence context's in-memory state.

For local JDBC management, verify how each repository obtains its connection. Spring-aware
access such as `JdbcTemplate`/`DataSourceUtils` can use the bound connection; a raw connection
from the underlying datasource may execute independently, even against the same database.
Multiple transaction managers do not automatically combine their resources. Check persisted
state after a mid-operation failure, not only annotation placement or transaction activity.

## The silent no-ops

Partial Java illustration (omitted domain methods/imports), assuming Spring proxy mode:

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
method reached through a direct target/self call, including inside a lambda; and on a
method reached from a `@PostConstruct` or from a constructor, before interception is available.
A lambda calling an injected proxy can be intercepted. Thread-bound imperative transactions
do not automatically follow newly started threads or asynchronously scheduled work.

**Verification at runtime**, worth having in a test rather than reasoning about:

Partial AssertJ/Spring imperative assertions; the transaction name is diagnostic, not a
physical transaction identity or evidence of which datasource was enlisted:

```java
assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
assertThat(TransactionSynchronizationManager.getCurrentTransactionName())
    .endsWith("PlaceOrder.place");
```

## Rollback rules

```java
// Ordinary default, with no overriding rules or pre-existing rollback-only state.
@Transactional
public void settle() throws InsufficientFunds { ... }   // checked failure may commit

@Transactional(rollbackFor = InsufficientFunds.class)
public void settleCorrectly() throws InsufficientFunds { ... }
```

Two further traps:

- **Catching inside the boundary.** If the intercepted inner failure triggers rollback
  rules or the resource marks rollback-only, catching it does not repair the transaction.
  The outer commit attempt can fail with `UnexpectedRollbackException`. Consider independent
  work, a supported savepoint, or aborting the whole unit according to business semantics.
- **Swallowing to "make it resilient".** A `catch (Exception e) { log.error(...); }` around
  a write can commit partial work if no rollback-only state was set, or still fail at
  commit if it was. Do not infer the final outcome from the caught exception alone.

Run a proxied entrypoint without an enclosing test transaction, inject failure between
writes, then inspect committed rows in a fresh transaction. Test the configured checked
exception rule and caught inner rollback separately. Activity/name assertions alone cannot
prove rollback or atomic enlistment.

## Keeping the boundary small

```java
@Transactional
public void placeOrder(PlaceOrderCommand command) {
    var order = Order.from(command);
    orders.save(order);
    paymentGateway.charge(order.total());   // ← 3 s p99, sometimes 30 s on timeout
}
```

Once the database work acquires resources, remote latency extends their occupancy. Under
slowdown this can exhaust a shared pool or block competitors; measure the actual scope.

Candidate shapes, selected by business semantics rather than a universal ranking:

1. **Do the remote work outside the transaction**, before or after, and make the write
   idempotent so repetition is safe (`idempotency`). Moving the call alone does not close
   the crash gap: persist intent/outcome and define reconciliation for remote success followed
   by local failure, and local success followed by remote failure.
2. **Outbox**: write the order and a `pending_charge` row in the same transaction; a relay
   reads the outbox after commit and calls the gateway with retries. Atomic locally, at
   least once remotely with durable retry/recovery. A crash after the charge but before
   recording completion can repeat it. Reuse a durable operation ID with the gateway's
   verified idempotency contract; reconcile unknown outcomes when safe repetition cannot
   be guaranteed. The outbox alone does not deduplicate the charge (`idempotency`).
3. **Compensate**: charge, attempt the local change, then refund if recovery requires it.
   First persist a recoverable workflow identity and intent; retain the information needed
   to reconcile charge outcomes and schedule compensation after a crash. The business must
   accept the intermediate state and the gateway must support the required refund.
   Compensation can also fail: persist progress, make retries safe and define escalation
   for unresolved outcomes. A refund is a new business action, not database rollback.

Test a crash after remote success but before recording completion, and a timeout during
compensation. Verify that recovery preserves the operation identity, avoids an extra charge
and retains unresolved work for reconciliation rather than silently marking it complete.

The one shape that is never correct is a remote call inside the transaction with the
justification that "it will be rolled back if the call fails" — the remote side has already
acted, and your rollback does not reach it.

## Batch work

```java
// Potentially costly: one atomic batch; measure its lock/version/resource lifetime.
@Transactional
public void reindexAll() {
    for (var row : repository.findAll()) { ... }
}

// Partial Java 17+ template: imperative Spring TransactionTemplate, domain types omitted.
// Use only when the business contract permits committed partial progress.
// No enclosing transaction; template starts and commits one transaction per execute.
// Repository and checkpoint use the same enlisted database transaction.
public void reindexAll() {
    while (Boolean.TRUE.equals(transactionTemplate.execute(status -> {
        long cursor = checkpoint.load();
        List<Row> chunk = repository.findNextChunk(cursor, 500);
        if (chunk.isEmpty()) return false;
        processChunk(chunk);
        checkpoint.save(chunk.get(chunk.size() - 1).id());
        return true;
    }))) {
        // Start the next chunk only after this chunk commits.
    }
}
```

Keep one transaction when atomicity is required and its measured footprint is acceptable.
Otherwise compare a bounded atomic redesign or staged atomic publication before weakening the
contract. Chunking replaces one all-or-nothing batch with committed partial progress. Design
restartability (a durable cursor), safe repetition (including a crash with an unknown
commit outcome), and a defined intermediate state — other readers will see the batch
half-applied, and someone must decide that is acceptable. Use stable key ordering and a
defined input snapshot/high-water mark. Serialize ownership of each checkpoint or partition
the job; external effects still require duplicate handling. The template alone does not
implement concurrent-worker claiming, cancellation or changing-input semantics.

## Reads

- `readOnly` effects depend on Spring, provider and driver configuration; inspect flush
  mode and entity read-only state. It is neither automatic replica routing nor portable
  write prevention, and performance benefit must be measured. Explicit database enforcement
  (for example, `DataSourceTransactionManager.setEnforceReadOnly`) is a separate configurable
  behavior; verify supported statements and database scope rather than assuming a universal hint.
- Autocommit reads still use connections and database statement transactions. Connection
  reuse depends on the integration. Move incidental long reads before/after the write
  boundary when safe; `NOT_SUPPORTED` alone retains suspended outer resources.
- Repeatability depends on engine isolation, statement semantics and persistence-context
  caching. `READ COMMITTED` can observe changes even inside one transaction; an ORM cache
  can mask them without guaranteeing a consistent multi-query snapshot.

## Checklist for a use case

- [ ] Actual business atomic unit and intercepted entrypoint identified
- [ ] External effects moved out or deliberately bounded with failure recovery documented
- [ ] Rollback rule matches the exceptions actually thrown
- [ ] No reliance on self-invoked transaction attributes
- [ ] Batch atomicity preserved, or partial progress accepted with durable restartability
- [ ] `REQUIRES_NEW` used where independent commit/rollback is required, with capacity
      for actual nested connection demand and no unbounded wait on outer locks
- [ ] The non-atomic edge (message, remote call) has a named strategy: outbox, retry or
      compensation

## Sources

- [Spring propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html): physical versus logical scope, joining attributes and retained resources.
- [Spring rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html): default rules and overrides.
- [Spring transaction annotation settings](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html): proxy interception and the 6.2+ global rollback default. Consult the project's version.
- [Spring 6.2.19 `DataSourceTransactionManager`](https://docs.spring.io/spring-framework/docs/6.2.19/javadoc-api/org/springframework/jdbc/datasource/DataSourceTransactionManager.html): bound JDBC connection access and optional database read-only enforcement; verify the target provider.
- [Spring 6.2 `LazyConnectionDataSourceProxy`](https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/jdbc/datasource/LazyConnectionDataSourceProxy.html): physical connection acquisition can be deferred until statement creation.
- [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html): duplicate delivery and idempotent processing at the remote edge.
- [Azure compensating transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction): recoverable progress, retryable compensation and business-specific restoration.
