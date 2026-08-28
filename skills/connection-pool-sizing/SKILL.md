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
2. **Compute `L = λ_db × W`** with a 1.5× margin.
3. **Apply the database-side ceiling**:
   `min(max_connections × 0.8, db_cores × 2 + spindles) / instances`. If `L_target` exceeds
   the ceiling, the plan is to reduce `W` or `λ` — not to raise the pool.
4. **Set the timeouts and lifetimes** deliberately (see Rules).
5. **On an incident, check in order**: `pending` and `acquire` p99 (is it the pool?),
   `usage` p50 versus p99 (does a minority hold connections far too long?),
   `pg_stat_activity` for `idle in transaction` (is there non-database work inside the
   transaction?), then `pg_stat_statements` ordered by `total_exec_time` **and** by `calls`
   — the second reveals N+1.

## Rules

- Reducing `W` is worth more than raising `c`. Since `μ = 1/W`, halving hold time doubles
  pool capacity without opening a single new database connection.
- The pool queue is M/M/c and the wait grows hyperbolically. With `c = 10` and 50 ms
  service: 0.4 ms at ρ = 0.5, 10 ms at 0.8, 33 ms at 0.9, 475 ms at 0.99. Between ρ = 0.90
  and 0.99 the load rises 10% and the wait rises 14×. There is no linear margin above 0.9.
- Never equate the pool to the container's thread count. Threads waiting for a connection
  is backpressure working, not a defect. 200 connections per instance also exhausts
  PostgreSQL's default `max_connections` of 100 outright.
- `connection-timeout` must never be 0. HikariCP's default is **30,000 ms** (5.x and 6.x),
  which is far too high for most web endpoints; the accepted minimum is 250 ms. Failing fast
  is what enables a circuit breaker, backoff retry and a degraded response — a long wait
  converts partial saturation into total unavailability.
- Set `max-lifetime` a few seconds **below** the smallest network or database timeout on the
  path. Firewalls, load balancers and NAT gateways drop idle TCP connections silently; the
  connection stays "available" in the pool and dead on the wire. HikariCP's default is
  1,800,000 ms (30 min), and `0` means infinite. Enable `keepaliveTime` (default 0,
  disabled) below `max-lifetime`.
- `@Transactional` only exists when the call crosses the bean boundary. `this.method()`
  bypasses the proxy silently — no error, no log, no transaction. Extracting to a private or
  protected method in the same class does **not** fix I/O-inside-transaction; you need a
  separate bean with public methods, or `TransactionTemplate`.
- `idle in transaction` is the most specific signal in the catalogue: it says exactly "there
  is non-database code running inside an open transaction". A 300 ms HTTP call inside
  `@Transactional` caps throughput at `pool_size / 0.3` and holds the snapshot, delaying
  `VACUUM` for the whole database.
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
