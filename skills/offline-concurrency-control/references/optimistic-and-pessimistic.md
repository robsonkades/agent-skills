# Optimistic and Pessimistic Offline Locks

## Optimistic offline lock

### The mechanism

Every update carries the version the editor started from; the update applies only if that
version is still current.

```sql
UPDATE customer_order
   SET ship_to = :shipTo,
       version = version + 1
 WHERE id = :id
   AND version = :expectedVersion;
-- affected rows = 0  →  someone else has written since :expectedVersion
```

The whole pattern is that `AND version = :expectedVersion` plus the check of the affected
row count. Everything else is presentation.

### In JPA

```java
@Entity
public class CustomerOrder {
    @Id private Long id;
    @Version private long version;      // Hibernate adds the WHERE clause and the check
    // ...
}
```

The version must travel to the client and back, or the mechanism protects nothing — the
server re-reading the entity and letting Hibernate use the freshly loaded version compares
the row against itself.

```java
public record UpdateOrderRequest(String shipTo, long version) { }

@Transactional
public void updateShipping(OrderId id, UpdateOrderRequest request) {
    CustomerOrder order = orders.byId(id).orElseThrow();
    if (order.version() != request.version()) {         // fail early, with a good message
        throw new StaleOrder(id, request.version(), order.version());
    }
    order.changeShippingAddress(request.shipTo());       // Hibernate re-checks at flush
}
```

Alternatively `orders.findById(id, LockModeType.OPTIMISTIC_FORCE_INCREMENT)` or an
`EntityManager.lock` with the expected version. The explicit comparison above is preferred
in most codebases because the failure is raised where a useful message can be built.

Over HTTP, the natural carrier is a conditional request: `ETag` on the read,
`If-Match` on the write, and `412 Precondition Failed` on conflict. That maps the pattern
onto a standard mechanism intermediaries already understand
(`remote-facade-and-dto`).

### Presenting the conflict

Minimum acceptable: tell the caller what changed, and let them decide.

```java
@ExceptionHandler({ StaleOrder.class, OptimisticLockingFailureException.class })
ProblemDetail onConflict(Exception e) {
    var problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
    problem.setTitle("The order changed while you were editing it");
    problem.setProperty("code", "ORDER_STALE");
    problem.setProperty("currentVersion", currentVersionOf(e));
    return problem;
}
```

Better, where the domain permits it: field-level merge. If A changed the address and B
changed a line quantity, the edits do not conflict in business terms. Detect that by
comparing changed field sets rather than versions — but note that this weakens the
aggregate's invariant guarantee, so it is only safe where the fields are genuinely
independent.

### Retry: the safe and unsafe forms

```java
// UNSAFE — reapplies the user's stale snapshot. Lost update, delayed.
@Retryable(retryFor = OptimisticLockingFailureException.class)
@Transactional
public void update(OrderId id, UpdateOrderRequest request) {
    var order = orders.byId(id).orElseThrow();
    order.overwriteWith(request);          // request was built from version 7
}

// SAFE — reapplies an intent that is still meaningful against fresh state.
@Retryable(retryFor = OptimisticLockingFailureException.class,
           maxAttempts = 3, backoff = @Backoff(delay = 50, random = true))
@Transactional
public void addCredit(AccountId id, Money amount) {
    var account = accounts.byId(id).orElseThrow();
    account.credit(amount);                // "add 10" is valid at any version
}
```

The discriminator: **is the operation expressible as a delta or a state transition that
remains correct against newer state?** Increments, appends and status transitions retry
safely. "Set these fields to what I saw four minutes ago" does not — that one must reach a
human.

Retry must sit outside the transaction, with jitter (`retries-and-backoff`).

## Pessimistic offline lock

### When it earns its place

When losing the work is expensive: a long form, a document being edited, a manual
reconciliation, a case being worked by an agent. Telling the user "this is being edited by
Ana" at the start is far better than telling them "your changes were lost" at the end.

### The lock table

```sql
CREATE TABLE edit_lock (
    resource_type  VARCHAR(64)  NOT NULL,
    resource_id    VARCHAR(64)  NOT NULL,
    owner          VARCHAR(128) NOT NULL,
    acquired_at    TIMESTAMP    NOT NULL,
    expires_at     TIMESTAMP    NOT NULL,
    PRIMARY KEY (resource_type, resource_id)
);
```

Acquisition is a single atomic statement, never a read followed by an insert:

```java
@Transactional
public boolean acquire(String type, String id, String owner, Duration ttl) {
    Instant now = Instant.now(clock);
    // Steal an expired lock or take a free one, in one statement.
    int taken = db.sql("""
            MERGE INTO edit_lock AS target
            USING (VALUES (:type, :id)) AS source(rt, ri)
               ON target.resource_type = source.rt AND target.resource_id = source.ri
             WHEN MATCHED AND target.expires_at < :now THEN
                  UPDATE SET owner = :owner, acquired_at = :now, expires_at = :expires
             WHEN NOT MATCHED THEN
                  INSERT (resource_type, resource_id, owner, acquired_at, expires_at)
                  VALUES (:type, :id, :owner, :now, :expires)
            """)
        .param("type", type).param("id", id).param("owner", owner)
        .param("now", now).param("expires", now.plus(ttl))
        .update();
    return taken == 1;
}
```

A check-then-insert in application code loses to a concurrent caller; the primary key plus
a single statement is what makes acquisition atomic. Where `MERGE` is unavailable, insert
and catch the duplicate-key violation — same guarantee.

### The four mandatory properties

| Property       | Why                                                         | Consequence of omitting it                           |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Owner          | Show who holds it; allow the same user to resume            | "Locked by someone" is an unactionable message       |
| Acquired-at    | Diagnostics and stale-lock reporting                        | No way to see a leaking path                         |
| **Expiry**     | Owners crash, browsers close, pods are evicted              | Rows locked forever; an operator ticket per incident |
| Admin override | Expiry is a compromise; sometimes someone must break a lock | Support cannot help without a database session       |

Renewal (a heartbeat while the editor is open) lets the TTL be short — a short TTL with
renewal is strictly better than a long TTL without, because it bounds the damage from a
crash to the TTL rather than to the maximum plausible edit duration.

### Do not implement it with a held transaction

`SELECT ... FOR UPDATE` at the start of an interaction and a commit after the user submits
holds a pooled connection and a row lock for the whole interaction. At 20 concurrent editors
against a pool of 10, the application stops — including for every unrelated request. The
lock must be a **row of data** whose lifetime is application-managed, not a database lock
whose lifetime is a transaction.

`SELECT ... FOR UPDATE` remains correct for its own purpose: serialising a short
read-then-write **inside a single transaction** (`enterprise-transactions`).

## Proving it works

```java
@Test
void concurrent_updates_only_one_wins() throws Exception {
    var start = new CountDownLatch(1);
    Callable<Boolean> edit = () -> {
        start.await();
        try { service.updateShipping(orderId, new UpdateOrderRequest("addr", 7L)); return true; }
        catch (StaleOrder | OptimisticLockingFailureException e) { return false; }
    };
    var pool = Executors.newVirtualThreadPerTaskExecutor();
    var a = pool.submit(edit);
    var b = pool.submit(edit);
    start.countDown();

    assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder(true, false);
    assertThat(orders.byId(orderId).orElseThrow().version()).isEqualTo(8L);
}
```

Against a real database (Testcontainers), with real transactions. This test is the only
thing that distinguishes a working optimistic lock from a version column that is loaded,
ignored and rewritten (`architecture-testing`).
