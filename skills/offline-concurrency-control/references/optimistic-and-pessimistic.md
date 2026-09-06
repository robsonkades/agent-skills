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
-- affected rows = 0 → stale version, missing row, or another predicate rejected it
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

The editor's original version must travel to the client and back. Re-reading on submission
protects against a concurrent database write after that read, but does not detect an edit
that became stale during the user's thinking time.

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

`EntityManager.lock(order, OPTIMISTIC_FORCE_INCREMENT)` accepts a lock mode, not the
client's expected version. It can complement this comparison when a child edit must
advance the root version; it does not replace the original-version check.

Over HTTP, the natural carrier is a conditional request: `ETag` on the read,
`If-Match` on the write, and `412 Precondition Failed` on conflict. That maps the pattern
onto a standard mechanism intermediaries already understand
(`remote-facade-and-dto`).

### Presenting the conflict

Return a stable conflict code and authorized recovery information. Use 412 when an
`If-Match` precondition fails (strong ETag comparison); a business version supplied in a
request body may instead use the API's documented 409 conflict contract. Do not map every
optimistic failure to 409 regardless of the conditional request.

An exception may not contain the current database version. Roll back first; if useful,
read it again in a fresh transaction, with normal authorization, and label it as the state
observed by that later read. Preserve the user's submitted work for reload or merge.

Field-level merge needs the original base, current state and proposed changes. Disjoint
fields can still participate in one invariant. Revalidate the combined result, then use
a version predicate against the current state used for the merge; another writer can race
the merge itself.

### Retry: the safe and unsafe forms

A retry that reloads and overwrites with a stale full-state request loses updates.
Reapplying an intent such as "add credit" is only conditionally valid: account status,
limits and other invariants must be checked again. Increments, appends and state transitions
are not automatically safe to retry.

Put a bounded retry with jitter outside the transaction. Each attempt must use a fresh
transaction and persistence context; confirm Spring interceptor ordering and proxy invocation
rather than assuming colocated `@Retryable` and `@Transactional` annotations establish it.
Do not reuse a rollback-only transaction after an optimistic failure.

Retry only known rolled-back work whose intent remains valid. External effects and an
uncertain commit require idempotency or reconciliation, not blind reapplication
(`idempotency`, `retries-and-backoff`).

## Pessimistic offline lock

### When it earns its place

When losing the work is expensive: a long form, a document being edited, a manual
reconciliation, a case being worked by an agent. Telling the user "this is being edited by
Ana" at the start is far better than telling them "your changes were lost" at the end.

### The lease protocol

Use a unique resource key, owner, acquisition time, expiry and a fresh acquisition token.
Owner identity alone cannot distinguish an old browser tab from a new lease by the same
user. The following is a protocol sketch, not portable executable SQL:

1. Acquire an absent or expired resource atomically using the database's documented
   conditional update/insert semantics and unique constraint. Choose an authoritative
   time source and define its clock assumptions; independent application clocks can
   disagree about expiry.
2. Commit acquisition before reporting success. A conflict means busy or a bounded retry
   in a fresh transaction, according to the database's error semantics.
3. Renew only the matching token while it is still unexpired. Release only the matching
   token. Inspect affected-row counts; an old release must not delete a successor's lease.
4. On save, validate token and expiry together with the data write, using a short database
   transaction that serializes against takeover (for example, locking the lease row until
   commit). Check the editor's original data version and domain invariants too. A check
   in one transaction followed by a write in another leaves a race.
5. If a separate resource accepts the effects, require that resource to reject obsolete
   fencing generations. A random acquisition token or a TTL alone is not a monotonic fence;
   generations must not reset when lease rows are deleted.

A single `MERGE` is not a portable successful-acquisition guarantee. For example,
[PostgreSQL 17 MERGE](https://www.postgresql.org/docs/17/sql-merge.html) can raise a uniqueness
violation for concurrent insertion; its behavior differs from `INSERT ... ON CONFLICT`.
Verify the chosen dialect and isolation level with two competing sessions, including expiry
takeover and failed acquisition. A unique key alone does not validate the protected write.

### Recovery and renewal

Show the owner and acquisition time, and provide authorized, audited administrative recovery.
A lease needs expiry and safe renewal. A durable checkout can instead require explicit
release plus administrative recovery; it makes a different abandonment trade-off.

Short TTLs with heartbeats shorten crash recovery but increase false expiry during pauses,
network loss or browser suspension. Choose the TTL from those conditions, test takeover,
and tell the old editor that ownership was lost. Neither a long TTL nor renewal removes
the need to reject stale owners.

### Do not implement it with a held transaction

`SELECT ... FOR UPDATE` at the start of an interaction and a commit after the user submits
holds a pooled connection and a row lock for the whole interaction. At 20 concurrent editors
against a pool of 10, the application stops — including for every unrelated request. The
lock must be a **row of data** whose lifetime is application-managed, not a database lock
whose lifetime is a transaction.

`SELECT ... FOR UPDATE` remains correct for its own purpose: serialising a short
read-then-write **inside a single transaction** (`enterprise-transactions`).

## Proving it works

Use the deployed provider and database, with independent persistence contexts and real
transactions. These are integration-test recipes, not an already executed test suite:

1. **Stale client:** commit B's edit from v7, then submit A's different edit carrying v7.
   Reject A and preserve B. This tests the client-version contract.
2. **Flush race:** load v7 in two separate transactions, synchronize after both loads and
   before either flush, then change to distinct addresses. Let both attempt commit and assert
   exactly one commits; inspect the final address and advanced version in a third fresh
   transaction. A barrier before entering the service is insufficient to guarantee both
   reads occurred before either write.
3. **Child race:** edit scalar fields on two existing children under the same root version;
   assert one transaction fails and the aggregate invariant holds. Separately test collection
   membership changes and bulk/native paths.
4. **Expired lease:** acquire token A, expire it, acquire B, then attempt A's renewal,
   release and save. All must fail without changing B's ownership or protected data.

Bound waits and database lock/statement timeouts. On failure, release barriers, roll back
transactions and stop owned executors so a broken locking protocol cannot hang the suite.
Do not count a successful flush as a successful commit.

JPA snippets here are partial application code using Java records (Java 16+, commonly
Java 17 projects) and an existing JPA/Spring stack. Inspect the project's actual Java,
namespace, provider and database versions; no upgrade is implied. The locking and bulk
operation contracts are documented in
[Jakarta Persistence 3.2, sections 3.5 and 4.11](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).
