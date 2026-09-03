# Read-your-writes on a Java/Spring read-replica setup

The requirement: the session that just wrote must observe its own write. Everything else may
read a replica. This is a session guarantee, not linearizability, and it is achievable with
routing rather than coordination.

## What `@Transactional(readOnly = true)` is and is not

Spring exposes it as transaction metadata; a transaction manager, ORM or JDBC driver may use it
for flush/dirty-checking/connection optimizations, with version-specific behavior. It does **not**
by itself choose a data source or wait for replication. It becomes routing policy only when code
such as an `AbstractRoutingDataSource` deliberately reads the flag.

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

**Connection acquisition order is part of the design.** Depending on transaction manager and
proxy order, a routing data source may be asked before the read-only context is established.
`LazyConnectionDataSourceProxy` can defer physical acquisition until the first statement, but
verify the actual proxy chain and transaction-manager behavior with route assertions:

```java
@Bean DataSource dataSource(ReplicaRoutingDataSource routing) {
    return new LazyConnectionDataSourceProxy(routing);
}
```

## The bounded primary-read window

After a write, routing that session to the authoritative writer for a window can meet a bounded
freshness SLO. It cannot prove strict read-your-writes after rare lag/failover beyond the window.

```java
// Time-based: simple, probabilistic estimate. Size from measured end-to-end visibility lag.
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
- Five seconds is not a constant to copy. Derive it from the chosen lag percentile and define
  what happens beyond it; re-derive after topology/failover changes.

**Position-based is stronger where the engine exposes a token tied to the committed write.** A
pre-commit “current WAL position” may precede the commit record and is not sufficient. Obtain a
documented commit/causal token, require a replica watermark at least that high, and bound the wait
by the request deadline before falling back/rejecting. PostgreSQL LSN and MySQL GTID mechanisms
need engine/version-specific commit semantics and privilege checks.

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
- **Deterministic sequence test.** Drive a session through replicas with controlled watermarks and
  failover, asserting its observed version never decreases. Uncontrolled virtual-thread loops can
  pass without exercising lag and are stress signals, not proof.
- **Fault injection for the partition case.** If a requirement claims behaviour during a
  partition, integration evidence should create one—block traffic between the
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

Rule for all three: route a decision read to the authoritative write transaction when supported,
and always enforce the invariant with a conditional write/constraint/version predicate. A fresh
read alone still races another writer.
