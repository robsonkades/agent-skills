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

Size a database pool from measurement and diagnose the pool-shaped incidents that are not
about the pool. Raising `maximumPoolSize` is the correction that always appears to work in
the short term and is almost never right: it moves the bottleneck into the database, where
it is more expensive to diagnose and slower to reverse.

## Workflow

1. **Measure `W`**, the connection **hold** time, with `hikaricp.connections.usage` (p50
   and p99). `W` covers everything between the first statement and the commit, including
   code that never touches the database. Estimating it from endpoint latency errs in both
   directions and hides the very defect that matters most.
2. **Compute the observed concurrency `L = λ_db × W`**, then model a candidate pool against the
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

- Reducing `W` is worth more than raising `c`. Since `μ = 1/W`, halving hold time doubles
  pool capacity without opening a single new database connection.
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
- Set `max-lifetime` a few seconds **below** an enforced database or infrastructure connection
  lifetime when one exists; do not derive it from unrelated idle or request timeouts. Firewalls,
  load balancers and NAT gateways may drop idle TCP connections; pool keepalive, driver/OS TCP
  keepalive, validation, and JDBC socket timeouts cover different parts of that failure. HikariCP's
  `maxLifetime` default is 1,800,000 ms (30 min), and `0` means infinite. Current HikariCP defaults `keepaliveTime` to
  120,000 ms; older releases and some integrations used `0`. Verify the resolved version and
  effective configuration. Driver/OS TCP keepalive and JDBC socket timeouts address different
  failure modes.
- In Spring's default proxy mode, self-invocation such as `this.method()` bypasses transactional
  interception. Method visibility support depends on proxy type and Spring version; a separate
  proxied collaborator or `TransactionTemplate` makes the boundary explicit. AspectJ weaving has
  different semantics, so inspect the configured advice mode before diagnosing from source alone.
- `idle in transaction` says that a transaction is open while the backend is not executing a
  statement. Correlate application traces and transaction age before attributing the gap to HTTP,
  messaging, user think time, or business logic. A 300 ms HTTP call inside
  `@Transactional` caps throughput at `pool_size / 0.3` and holds the snapshot, delaying
  PostgreSQL cleanup of versions visible to that old snapshot; the impact depends on transaction
  age, write volume, and affected relations.
- N+1 does not show up as a slow query. Each query is fast; the cost is doing 101 of them,
  and it is round-trip cost, not database work. Find it by ordering `pg_stat_statements` by
  `calls`, fix with `JOIN FETCH`/`@EntityGraph`/DTO projection, and **lock the statement
  count in a test** — without that, the next refactor reintroduces it.
- `flush()`/`clear()` does not batch. It controls persistence-context memory. Without
  `hibernate.jdbc.batch_size` Hibernate emits one round trip per entity — and with
  `GenerationType.IDENTITY` it cannot batch inserts at all, because it needs the generated
  ID per row. Use `SEQUENCE` with `allocationSize`.
- Pool waiting is `LockSupport.park`, so `jdk.ThreadPark` — not `jdk.JavaMonitorEnter`. And
  the default thresholds (20 ms in `default.jfc`, 10 ms in `profile.jfc`) hide fine-grained
  contention entirely.
- Isolation defaults differ: READ COMMITTED in PostgreSQL, REPEATABLE READ in MySQL/InnoDB.
  Under SERIALIZABLE, `SQLSTATE 40001` is the mechanism working, and needs retry with
  backoff **and jitter** — without jitter the colliding transactions re-collide in sync.
- Virtual threads do not change Little's arithmetic; they change where the bottleneck sits.
  Without the container thread pool's implicit limit, all concurrency reaches the connection
  pool, which becomes the only backpressure mechanism — which is exactly why
  `connection-timeout` has to be right.

## References

- [Sizing and configuration](references/sizing-and-configuration.md) — the calculation, the
  HikariCP settings with their real defaults, and the pre-deploy and monitoring checklists.
  Read when configuring or reviewing a pool.
- [Pool incident triage](references/incident-triage.md) — the ordered diagnostic path from
  pool metrics to `pg_stat_activity` to `pg_stat_statements` to `EXPLAIN`. Read during an
  incident where threads are waiting on the database.
