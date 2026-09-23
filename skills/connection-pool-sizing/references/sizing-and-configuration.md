# Sizing and configuration

## The calculation

```
1. Measure mean W with hikaricp.connections.usage; inspect p50/p99 separately
2. Mean checked-out connections L = completed borrows/second × mean W in seconds
3. Obtain a per-workload connection budget from measured database saturation, reserved
   administrative capacity, all application instances, and failover topology
4. Model a candidate maximumPoolSize against the latency/error budget
5. Load-test the candidate; if demand exceeds the safe database budget, reduce W or λ
```

`W` is time from successful checkout to return, not query or transaction duration. Use one pool
and a stable measurement interval. For 200 borrows/s and mean hold time 0.020 s, mean occupancy is
4 connections; a p99 of 0.200 s does not change that estimate to 40. Tails still govern wait/SLO
risk. Stuck borrows may not yet appear in the completed-use timer: cross-check active counts,
transaction age and checkout traces.

For HikariCP 5.1.0/6.3.3 with its Micrometer tracker, use the interval increase in
`hikaricp.connections.usage` count divided by interval seconds for completed borrows/s, and the
matching usage sum/count for mean `W`; handle counter resets and units. The acquisition timer
records successful checkouts **and acquisition timeouts**, so its count is not a successful-borrow
count. Usage records returned borrows, including ones whose SQL failed; distinguish borrow
throughput from successful business operations. Verify these event boundaries for the resolved
version/adapter before deriving rates. See HikariCP 6.3.3's
[pool metric recording](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-6.3.3/src/main/java/com/zaxxer/hikari/pool/PoolBase.java)
and [Micrometer mapping](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-6.3.3/src/main/java/com/zaxxer/hikari/metrics/micrometer/MicrometerMetricsTracker.java).

`L` describes work that obtained connections. A saturated four-connection pool completing 200
borrows/s with mean `W = 0.020 s` yields `L = 4` even when another 200 attempts/s time out. That
does not prove four connections satisfy demand. Record offered acquisition attempts, successful
checkouts, timeouts, cancellations and upstream rejections separately; request rate needs the
number of borrows per request. Validate candidate sizes at the intended offered load, including
error and queue-wait budgets. Do not multiply attempted acquisitions by completed-use `W` and
call the result observed occupancy, or assume `W` stays fixed as database concurrency increases.

For direct connections, sum each pool's maximum over peak coexisting replicas, including rolling
deployments, batch workers and other clients of the same database. Keep administrative/recovery
reserve available; neither an average replica count nor one pool per process is a safe assumption.
The configured session limit is not a target for useful concurrent queries: validate the workload's
safe execution concurrency separately. If a proxy such as PgBouncer multiplexes sessions, account
for its client limits, backend pools per user/database, pooling mode and queue/deadline behavior;
application pool maxima no longer map one-to-one to database sessions. Do not introduce a proxy
solely to hide excess demand.

## HikariCP settings and their real defaults

| Property                   | Default (5.x/6.x)                                           | What to set                                                                        |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `connection-timeout`       | 30,000 ms                                                   | inside the endpoint's latency budget; **never 0**; min 250 ms                      |
| `max-lifetime`             | 1,800,000 ms                                                | below an enforced connection-age cutoff with margin; not an idle/request timeout   |
| `keepalive-time`           | version-dependent; 120,000 ms upstream since HikariCP 6.2.1 | below `max-lifetime` when application-level keepalive is needed                    |
| `leak-detection-threshold` | 0 (disabled)                                                | choose above legitimate hold durations; diagnostic warning, not forced reclamation |
| `maximum-pool-size`        | 10                                                          | from the calculation above                                                         |

HikariCP logs the effective configuration at startup at `DEBUG` level. Confirm bound values rather
than trusting the file — a property in the wrong prefix may be silently ignored.

Illustrative Spring Boot properties, not portable production settings. The lifetime below assumes
a verified connection-age cutoff above 280 seconds; the acquire timeout requires a request budget
above three seconds plus execution/cleanup. Verify binding and version support before adapting.

```properties
spring.datasource.hikari.connection-timeout=3000
spring.datasource.hikari.max-lifetime=280000
spring.datasource.hikari.keepalive-time=120000
spring.datasource.hikari.leak-detection-threshold=60000
spring.jpa.open-in-view=false
```

Open-in-view keeps the persistence context available through web rendering; physical connection
holding depends on acquisition/release mode, transaction boundaries and lazy access. Measure
checkout/return across rendering before attributing hold time to it. If disabling it, supply the
needed projection/fetch plan inside the service boundary and test serialization/lazy-loading behavior.

## Batching

Illustrative loop inside an existing transaction; `events` are persistable values and `em` is the
project's EntityManager (javax/jakarta package depends on the target). This demonstrates flush
boundaries, not a complete runnable application or proof of JDBC batch execution.

```java
// Flush can execute configured batches; clear bounds managed-state retention.
for (int i = 0; i < events.size(); i++) {
    em.persist(events.get(i));
    if ((i + 1) % 50 == 0) { em.flush(); em.clear(); }
}
em.flush(); // remaining tail, still inside the transaction
em.clear();
```

```yaml
spring:
  jpa:
    properties:
      hibernate.jdbc.batch_size: 50
      hibernate.order_inserts: true
      hibernate.order_updates: true
```

Periodic flush/clear is useful for large persistence contexts; it is not required for every small
batch. Hibernate 6.6 disables insert batching for identity-generated identifiers. Sequence-based
allocation can enable batching where the database and schema support it, but a generator migration
must preserve existing IDs and mixed-version operation. Do not change it solely to fit this example.

Verify JDBC `addBatch`/`executeBatch` calls and batch sizes with driver instrumentation or a
representative integration test. `Statistics.getPrepareStatementCount()` counts prepared-statement
acquisition, not network round trips or batch executions. Driver rewrite settings may affect wire
behavior separately; compare hold time and database load as well as statement counts.

## Pre-deploy checklist

- [ ] Mean `W` measured from checkout to return; p50/p99 and outstanding borrows inspected
- [ ] `L = λ_borrow × mean(W)` calculated for one pool and stable interval
- [ ] Direct/proxied session budgets and safe execution concurrency agreed across all pools,
      peak instances, admin/recovery reserve, workload classes and failover
- [ ] Candidate pool size validated at intended offered load, including failed/rejected work and
      wait/error budgets; margin justified by evidence
- [ ] `connection-timeout` inside the endpoint's latency budget, never 0
- [ ] `max-lifetime` derived from connection-age cutoff; in-use retirement and idle drops handled separately
- [ ] Effective `keepalive-time` verified for the resolved HikariCP version and kept below `max-lifetime`
- [ ] Leak-detection threshold, if enabled, distinguishes suspected leaks from legitimate long work
- [ ] Open-in-view choice validated against physical hold time and lazy-loading contract

## Monitoring

- [ ] Pending/acquire latency and timeout rate assessed against request budgets and service SLO
- [ ] Mean occupancy `L` cross-checked against interval-average active connections; `L/c` is the
      occupied fraction of configured capacity `c`, not a connection count
- [ ] Transaction age, idle-in-transaction duration and blockers monitored against workload expectations
- [ ] Server idle-transaction timeout, if used, tested for rollback/client recovery and legitimate idle work

## Before committing database access code

- [ ] Query count scales as intended with endpoint result cardinality and fetch strategy
- [ ] **An automated test locking the statement count** on the critical path
- [ ] External waits removed from connection hold time where the consistency contract permits;
      remaining waits justified and bounded. Moving an effect across commit changes failure/atomicity
      semantics and needs an accepted recovery contract
- [ ] Transaction interception mode verified; in default proxy mode, calls cross the proxy and do
      not use self-invocation. Method visibility is checked against proxy type and Spring version
- [ ] Nested transactions/additional borrows cannot strand all outer borrowers waiting for another
      connection; propagation semantics and capacity both reviewed
- [ ] Bulk write batch execution verified for the actual provider, driver and identifier strategy
- [ ] Owned JDBC resources closed on every path; use `try-with-resources` for connections the code
      owns. Spring `DataSourceUtils.getConnection` pairs with `releaseConnection` in `finally` so
      a transaction-bound connection is not prematurely closed; verify wrapper/framework ownership

Sources: [HikariCP configuration](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby)
and [Hibernate 6.6 batching](https://docs.hibernate.org/orm/6.6/userguide/html_single/#batch).
For the relevant boundary, consult [PgBouncer client and backend configuration](https://www.pgbouncer.org/config.html),
[Spring transaction propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
and [Spring DataSourceUtils ownership](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/DataSourceUtils.html).
