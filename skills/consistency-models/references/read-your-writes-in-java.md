# Read-your-writes on a Java/Spring read-replica setup

The requirement: the session that just wrote must observe its own write. Everything else may
read a replica. This is a session guarantee, not linearizability, and it is achievable with
routing rather than coordination.

## What `@Transactional(readOnly = true)` is and is not

It is a hint. Spring sets it on the transaction definition; Hibernate uses it to put the
session in `FlushMode.MANUAL` and skip dirty checking, and the JDBC driver may set the
connection read-only. It does **not** choose a data source, does not wait for replication,
and does not weaken or strengthen any consistency guarantee. Marking a method `readOnly`
and observing that stale reads appear is a coincidence of routing, not causation.

It becomes a _routing input_ only when an `AbstractRoutingDataSource` reads it:

```java
public class ReplicaRoutingDataSource extends AbstractRoutingDataSource {
    @Override protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                && !PrimaryReadWindow.active()      // read-your-writes override
                ? "replica" : "primary";
    }
}
```

**The trap:** without `LazyConnectionDataSourceProxy` wrapping the routing data source, the
connection is acquired when the transaction begins — before the read-only flag is visible to
`determineCurrentLookupKey` — so every lookup returns the primary and the routing appears to
work in tests and never route in production, or vice versa depending on the transaction
manager's ordering. Wrap it, and acquire the connection at first statement:

```java
@Bean DataSource dataSource(ReplicaRoutingDataSource routing) {
    return new LazyConnectionDataSourceProxy(routing);
}
```

## The bounded primary-read window

After a write, pin that session's reads to the primary for a window. Two ways to size it,
and they are not equivalent.

```java
// Time-based: simple, and an estimate. Size from measured replication lag p99.9.
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
void onWrite(EntityWritten event) {
    PrimaryReadWindow.pin(Duration.ofSeconds(5));   // scoped to the session, not the thread
}
```

- The window must be **per session or per entity**, never global — a global pin routes the
  whole fleet's reads to the primary after any write and removes the reason replicas exist.
- Store the pin where the session lives: a `ScopedValue` or a request attribute for one
  request, a short-lived Redis entry keyed by session or user id for a pin that must survive
  across requests and instances. A `ThreadLocal` will not survive a request boundary and will
  not follow work handed to another thread.
- Five seconds is not a constant to copy. Derive it from replication lag p99.9 and re-derive
  it when the topology changes.

**Position-based is strictly better where the driver exposes it.** Capture the write's
replication position and require the replica to have reached it — PostgreSQL exposes LSNs
(`pg_current_wal_lsn()` on the primary, `pg_last_wal_replay_lsn()` on the standby); MySQL
exposes GTIDs and a wait primitive. The read then blocks or falls back to the primary on a
fact rather than on a guess, and it is correct even when lag exceeds the estimate.

## Detecting stale reads in tests

A test against a healthy local replica proves nothing: lag is near zero, so every read looks
fresh and an incorrect implementation passes. Make the lag real.

- **Introduce deterministic lag.** Testcontainers with a real primary/replica pair, then
  pause replication (suspend the replica container, or use the engine's own delay control) so
  the replica is provably behind for the duration of the assertion. Write, then read, then
  assert which node answered.
- **Assert on the route, not only on the value.** Record the resolved lookup key per query
  and assert that a post-write read inside the window went to the primary. Asserting the
  returned value alone gives a green test whenever lag happens to be zero.
- **Property-style interleaving.** Two virtual threads, one writing and one reading the same
  key in a loop, asserting the reader's observed sequence never goes backwards. This is the
  cheapest test for monotonic reads and it catches sticky-routing regressions that a
  single-request test cannot.
- **Fault injection for the partition case.** If a requirement claims behaviour during a
  partition, the only evidence is a test that creates one — block traffic between the
  application and the primary and assert the documented behaviour (refuse, or serve stale
  with a marker). An untested partition claim is not a claim.

## Anti-patterns, as shapes

```java
// 1. Uniqueness check on a replica: stale read decides a write.
if (!repo.existsByEmail(email)) { repo.save(new User(email)); }   // on a replica: two rows

// 2. Read-modify-write across the split.
var balance = replicaRepo.findBalance(id);      // stale
primaryRepo.updateBalance(id, balance - amount); // lost update, no error

// 3. A cache in front of the primary, populated by a replica read.
//    The path's staleness is now the cache TTL and the write invalidates nothing.
```

Rule for all three: **a read whose result decides a write goes to the primary**, or is
protected by a conditional write (a unique constraint, a version predicate) that turns the
stale read into a failed write rather than a wrong one.
