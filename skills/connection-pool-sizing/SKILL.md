---
name: connection-pool-sizing
description: >
  Sizing and diagnosing a JDBC connection pool: L = λ × W where W is connection hold time
  rather than query latency, the database-side ceiling, HikariCP timeouts and lifetimes,
  transaction boundaries and idle-in-transaction, N+1 detection, JDBC batching, and what
  virtual threads change. Use when choosing maximumPoolSize, when connection-timeout is 0 or
  30 s, when threads wait for connections under load, when HTTP or queue calls happen inside
  @Transactional, when connections die silently behind a firewall or load balancer, when
  hibernate.jdbc.batch_size appears not to work, or when raising the pool is proposed as the
  fix. Does not cover the general queueing arithmetic (littles-law-and-queueing), thread
  pool sizing (thread-sizing-and-virtual-threads), or caching to reduce load
  (caching-strategies).
---

# Connection Pool Sizing

## Purpose

Size a database pool from measurement and distinguish insufficient local capacity from database
saturation, leaks and long-held connections. Raising `maximumPoolSize` helps only if measured
database headroom can absorb the extra concurrent work within the required SLO.

## Workflow

Before applying settings, inspect compiler/runtime, resolved HikariCP, Spring Boot, Hibernate and
JDBC driver versions, database engine/version, metrics binding and transaction/connection release
mode. No single Java baseline is declared for this diagnostic workflow; the SQL examples target
PostgreSQL, and virtual-thread APIs require Java 21+. Preserve target versions. Missing workload or
capacity evidence requires a measurement plan and conditional recommendation, not an invented size.

1. **Measure `W`**, the mean connection **hold** time, with `hikaricp.connections.usage`;
   inspect p50/p99 separately for tails. Hold time runs from successful checkout until return to
   the pool, which can include time before the first statement and after commit. Verify the metric
   adapter; completed-use samples can omit connections still stuck or leaked.
2. **Compute mean concurrency `L = λ_borrow × mean(W)`** using completed borrows/second and
   hold durations from the same pool and stable interval, not query rate or a percentile. Then model a candidate pool against the
   arrival distribution and latency/error budget. A fixed 1.5× margin is a starting hypothesis,
   not a sizing law.
3. **Establish the database-side budget** with the database owner: reserved administrative
   connections, total application instances, workload classes, CPU saturation, storage latency,
   lock pressure, and failover topology. The familiar `cores × 2 + spindles` expression is a
   benchmark heuristic, not a portable ceiling. If demand exceeds the measured safe budget, reduce
   hold time or arrival rate before adding concurrency.
4. **Set the timeouts and lifetimes** deliberately (see Rules).
5. **On an incident, check in order**: `pending` and `acquire` p99 (is it the pool?),
   `usage` p50 versus p99 (does a minority hold connections far too long?),
   `pg_stat_activity` for long `idle in transaction` sessions (what code is holding a transaction
   open while no statement runs?), then `pg_stat_statements` ordered by `total_exec_time` **and** by `calls`
   — the second reveals N+1.

## Rules

- At a fixed pool size, halving mean hold time doubles the ideal borrow-service capacity only
  if the workload and other bottlenecks remain unchanged. Confirm useful throughput and database
  health rather than treating that arithmetic as a measured end-to-end speedup.
- Pool waiting grows non-linearly near saturation, but a real database pool is not automatically
  M/M/c: arrivals may be bursty, hold times heavy-tailed, transactions correlated, and the database
  itself slows as concurrency rises. Use Erlang-C only as an explicit approximation and validate
  candidate sizes with production distributions or a representative load test.
- Never equate the pool to the container's thread count. Threads waiting for a connection can be
  intentional backpressure, but their wait must still fit the request deadline. Across instances,
  pool maxima must fit the database's configured connection budget; do not assume a vendor default
  or managed-service limit.
- Avoid `connection-timeout=0`, which HikariCP treats as effectively unbounded. Its default is
  **30,000 ms** and its accepted minimum is 250 ms. Choose a finite value inside the caller's
  remaining deadline and validate the resulting rejection behaviour. Failing fast
  is what enables a circuit breaker, backoff retry and a degraded response — a long wait
  converts partial saturation into total unavailability.
  This timeout is pool-wide and covers acquisition, not query execution or the whole request.
  For shorter remaining budgets than the supported minimum, use deadline-aware upstream admission
  and a client cancellation policy; do not assume setting a sub-minimum value works.
- Set `max-lifetime` a few seconds **below** an enforced database or infrastructure connection
  lifetime when one exists; do not derive it from unrelated idle or request timeouts. Firewalls,
  load balancers and NAT gateways may drop idle TCP connections; pool keepalive, driver/OS TCP
  keepalive, validation, and JDBC socket timeouts cover different parts of that failure. HikariCP's
  `maxLifetime` default is 1,800,000 ms (30 min), and `0` means infinite. Current HikariCP defaults `keepaliveTime` to
  120,000 ms; older releases and some integrations used `0`. Verify the resolved version and
  effective configuration. Driver/OS TCP keepalive and JDBC socket timeouts address different
  failure modes.
  In-use connections are retired after return, so `maxLifetime` is not protection against an
  infrastructure cutoff during a long borrow. Account for hold duration and recovery margin.
- In Spring's default proxy mode, self-invocation such as `this.method()` bypasses transactional
  interception. Method visibility support depends on proxy type and Spring version; a separate
  proxied collaborator or `TransactionTemplate` makes the boundary explicit. AspectJ weaving has
  different semantics, so inspect the configured advice mode before diagnosing from source alone.
- `idle in transaction` says that a transaction is open while the backend is not executing a
  statement. Correlate application traces and transaction age before attributing the gap to HTTP,
  messaging, user think time, or business logic. A 300 ms HTTP call inside
  `@Transactional`, while a connection is held, contributes at least 300 ms to that borrow.
  Only if every borrow has that delay is `pool_size / 0.3` an ideal upper bound. Old transactions
  may retain locks or cleanup horizons; inspect isolation, transaction age and `backend_xmin`
  rather than assuming every READ COMMITTED transaction holds one snapshot throughout.
- N+1 can consist of individually fast or slow statements and costs both round trips and database
  work. High `pg_stat_statements.calls` is a lead, not proof: correlate statement-count deltas
  with one endpoint invocation and result cardinality. Choose fetching/batching/projection from
  access and pagination needs, then test the count envelope across multiple cardinalities.
- `flush()` sends pending changes; `clear()` controls persistence-context retention. JDBC batch
  configuration is separate. Hibernate 6.6 disables insert batching with identity generation;
  changing ID strategy requires schema/compatibility evidence. Delegate fetch and batch design to
  `orm-fetch-and-batching-performance`; prepared-statement count alone does not prove batching.
- Hikari's contended borrow path can appear in `jdk.ThreadPark`; verify stack/blocker identity
  rather than treating every park as pool contention. Runtime JFC thresholds filter short waits;
  inspect them before concluding that absent events mean no queueing.
- Inspect effective isolation rather than assuming the engine default. For PostgreSQL 40001,
  retry the whole transaction in a fresh transaction, including reads and decisions, with bounded
  attempts/backoff/jitter only when external effects are safe. It also occurs at REPEATABLE READ;
  repeated failure or exhaustion remains an application-visible failure requiring diagnosis.
- Virtual threads do not change Little's arithmetic; they change where the bottleneck sits.
  Replacing a fixed worker pool can remove implicit admission control. The JDBC pool still bounds
  checked-out connections, but waiting tasks/memory need separate bounded admission and deadlines
  (`concurrency-limiting-and-bulkheads`).

## References

Return the measurement interval/population, mean and tail hold times, borrow rate, candidate pool
and aggregate database budget, competing diagnosis, and validation/rollback bounds. State which
checks ran and which claims remain conditional.

- [Sizing and configuration](references/sizing-and-configuration.md) — the calculation, the
  HikariCP settings with their real defaults, and the pre-deploy and monitoring checklists.
  Read when configuring or reviewing a pool.
- [Pool incident triage](references/incident-triage.md) — the ordered diagnostic path from
  pool metrics to `pg_stat_activity` to `pg_stat_statements` to `EXPLAIN`. Read during an
  incident where threads are waiting on the database.
