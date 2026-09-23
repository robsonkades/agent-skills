# Read-your-writes on a Java/Spring read-replica setup

The requirement: the session that just wrote must observe its own write. Everything else may
read a replica. This is a session guarantee, not linearizability. Routing can enforce it when
the selected node is known to contain the write and the read snapshot includes it.

The Java blocks are partial Spring/JDBC sketches: imports, data-source registration,
`PrimaryReadWindow`, session storage and event publication are application-specific. Inspect
the project's JDK, Spring and driver versions and transaction/proxy configuration before adapting
them; no dependency upgrade or preview feature is required by this guidance.

## What `@Transactional(readOnly = true)` is and is not

Spring exposes it as transaction metadata; a transaction manager, ORM or JDBC driver may use it
for flush/dirty-checking/connection optimizations, with version-specific behavior. It does **not**
by itself choose a data source or wait for replication. It becomes routing policy only when code
such as an `AbstractRoutingDataSource` deliberately reads the flag.

Example routing input:

```java
public class ReplicaRoutingDataSource extends AbstractRoutingDataSource {
    @Override protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                && !PrimaryReadWindow.active()      // probabilistic freshness override
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

**Routing chooses a connection, not a destination for every statement.** With
`DataSourceTransactionManager` and transaction-aware JDBC access, an acquired connection stays
bound to that transaction. Set the session override before physical acquisition; activating it
after the first query does not move subsequent queries to the primary. A participating
`PROPAGATION_REQUIRED` method normally inherits the outer transaction's read-only setting, so
its own annotation does not establish a new route. Inspect the effective transaction boundary;
adding `REQUIRES_NEW` changes atomicity and connection demand and is not a transparent routing fix.

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

- Prefer a window **per session or per entity**: a global pin sends all reads to the primary
  after any write and can defeat read offloading.
- Store the pin where the session lives: a request attribute for one
  request, a short-lived Redis entry keyed by session or user id for a pin that must survive
  across requests and instances. A `ThreadLocal` will not survive a request boundary and will
  not follow work handed to another thread.
- Five seconds is not a constant to copy. Derive it from the chosen lag percentile and define
  what happens beyond it; re-derive after topology/failover changes.
- An after-commit callback can fail or the process can die before the pin is recorded.
  Do not advertise strict read-your-writes based on this callback. Define write-response/token
  delivery and session-state failure behavior if clients depend on the guarantee.

**Position-based is stronger where the engine exposes a token tied to the committed write.** A
pre-commit “current WAL position” may precede the commit record and is not sufficient. Obtain a
documented commit/causal token, require a replica watermark at least that high, and bound the wait
by the request deadline before falling back/rejecting. PostgreSQL LSN and MySQL GTID mechanisms
need engine/version-specific commit semantics and privilege checks.
Compare tokens only within a documented compatible history/epoch. A promoted asynchronous
replica may lack an acknowledged write; routing to the new primary cannot restore it. Verify
the acknowledgement/durability policy, preserve the session's requirement across failover, and
reject or wait when no surviving path can satisfy it. A stale response with a marker explicitly
relaxes the strict contract.

**Replica readiness must precede the data snapshot.** PostgreSQL 18 `REPEATABLE READ` retains
the snapshot established by the first non-transaction-control statement. If that snapshot
predates the required commit, later replay progress cannot refresh it; a watermark query can
itself establish the snapshot too early. Establish readiness for the selected server before
creating the data snapshot, or restart the whole read transaction at a safe boundary. Verify
that connection routing/failover does not switch to an unchecked server between the two steps.
When an existing transaction cannot safely restart, wait/retry policy alone cannot repair its
old snapshot: refuse the strict read or change the surrounding transaction design.

## Detecting stale reads in tests

A healthy-replica test may miss the defect because lag is near zero. Make the lag real.

- **Introduce deterministic lag.** Testcontainers with a real primary/replica pair, then
  pause replication apply with the engine's supported control while keeping the replica readable.
  Suspending its whole container tests unavailability instead. Establish its old watermark,
  commit a new version, read through the application, and assert the route and observed version.
- **Assert on the route, not only on the value.** Record the selected target at physical
  connection acquisition and correlate executed queries with that connection. Assert that a
  post-write read inside the window used the primary. A lookup key recomputed per query may
  disagree with the already bound connection; a value-only check passes when lag happens to be zero.
  Test an override activated before acquisition versus after the first query, and a read-only
  inner `REQUIRED` scope participating in an outer read-write transaction.
- **Keep an old snapshot open while the server catches up.** On a lagged PostgreSQL replica,
  establish a repeatable-read snapshot before the required write is applied, then resume replay
  and verify readiness externally. The old snapshot should still miss the write; a fresh read
  transaction on that caught-up server should include it. The application's freshness gate must
  reject or safely restart the old transaction instead of returning stale success.
- **Separate session tests.** For read-your-writes, reject a snapshot missing the session's own
  committed write. For monotonic reads, reject regression below any previously observed state.
  These are distinct guarantees; in a totally ordered version history, writing version 1 then
  reading versions 3 and 2 satisfies the first but violates the second. Exercise token loss,
  window expiry with lag still present and failover with controlled watermarks.
- **Fault injection for the partition case.** If a requirement claims behaviour during a
  partition, integration evidence should create one—block traffic between the
  application and the primary and assert the documented behavior. Under strict read-your-writes,
  a successful read must still include the write; otherwise wait within the deadline or refuse.

## Anti-patterns, as shapes

```java
// 1. Uniqueness check on a replica: stale read decides a write.
if (!repo.existsByEmail(email)) { repo.save(new User(email)); }   // duplicates unless constrained

// 2. Read-modify-write across the split.
var balance = replicaRepo.findBalance(id);      // stale
primaryRepo.updateBalance(id, balance - amount); // lost update, no error

// 3. A cache in front of the primary, populated by a replica read.
//    TTL starts at fill time and does not bound the age of the replica's source data.
```

For mutable decision state, authoritative transaction reads can avoid some stale proposals, but
the invariant still needs a conditional write/constraint/version predicate. A replica-sourced
proposal can be safe when the authority atomically validates every relevant condition and the
caller handles rejection before any side effect. A fresh read alone still races another writer.
For caches, check the endpoint's actual version/freshness and return-eligibility contract rather
than banning caching: unchanged bytes can become inaccessible through mutable authorization,
deletion or retention rules. Verify their enforcement where the endpoint requires them.

For proxy acquisition semantics, consult the
[Spring LazyConnectionDataSourceProxy API](https://docs.spring.io/spring-framework/docs/7.0.x/javadoc-api/org/springframework/jdbc/datasource/LazyConnectionDataSourceProxy.html)
and verify the corresponding documentation and behavior for the project's resolved version.
For effective transaction settings and connection reuse, see
[Spring transaction propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
and the [Spring 6.2.0 DataSourceTransactionManager source](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-jdbc/src/main/java/org/springframework/jdbc/datasource/DataSourceTransactionManager.java).
Snapshot timing above follows [PostgreSQL 18 isolation semantics](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-REPEATABLE-READ);
other engines and isolation levels require their own verification.
