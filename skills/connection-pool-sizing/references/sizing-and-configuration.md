# Sizing and configuration

## The calculation

```
1. Measure W with hikaricp.connections.usage (p50 AND p99)
2. L_target = λ_db × W × 1.5
3. ceiling  = min(max_connections × 0.8, db_cores × 2 + spindles) / instances
4. maximumPoolSize = min(L_target, ceiling)
5. If L_target > ceiling: the plan is to reduce W or λ, not to raise the pool
```

`W` is **hold** time, not query latency. It includes everything between the first statement
and the commit — serialisation, business logic, and any I/O someone put inside the
transaction. That last item is precisely the defect that estimating `W` from endpoint
latency would hide.

## HikariCP settings and their real defaults

| Property                   | Default (5.x/6.x) | What to set                                                           |
| -------------------------- | ----------------- | --------------------------------------------------------------------- |
| `connection-timeout`       | 30,000 ms         | inside the endpoint's latency budget; **never 0**; min 250 ms         |
| `max-lifetime`             | 1,800,000 ms      | a few seconds **below** the smallest network/DB timeout; 0 = infinite |
| `keepalive-time`           | 0 (disabled)      | enabled, and below `max-lifetime`                                     |
| `leak-detection-threshold` | 0 (disabled)      | 60 s in production, lower in staging                                  |
| `maximum-pool-size`        | 10                | from the calculation above                                            |

HikariCP logs the effective configuration at startup at `DEBUG` level. Confirm there rather
than trusting the file — a property in the wrong prefix is accepted silently.

```properties
spring.datasource.hikari.connection-timeout=3000
spring.datasource.hikari.max-lifetime=280000
spring.datasource.hikari.keepalive-time=120000
spring.datasource.hikari.leak-detection-threshold=60000
spring.jpa.open-in-view=false
```

`open-in-view=true` (the Spring Boot default) extends `W` to the whole request, including
view rendering. Turning it off is usually the single largest reduction in `W` available.

## Batching

```java
// This is NOT batching — it controls persistence-context memory only
for (int i = 0; i < events.size(); i++) {
    em.persist(events.get(i));
    if (i > 0 && i % 50 == 0) { em.flush(); em.clear(); }
}
```

```yaml
spring:
  jpa:
    properties:
      hibernate.jdbc.batch_size: 50
      hibernate.order_inserts: true
      hibernate.order_updates: true
```

Both mechanisms are needed and they are independent. With `GenerationType.IDENTITY`
Hibernate **cannot** batch inserts at all — it needs the generated ID after each row. Use
`SEQUENCE` with `allocationSize`.

Verify it worked by counting statements with `Statistics.getPrepareStatementCount()`, not
by the absence of slowness.

## Pre-deploy checklist

- [ ] `W` **measured** with `hikaricp.connections.usage` (p50 and p99), not estimated
- [ ] `L = λ_db × W` calculated with a 1.5× margin
- [ ] Ceiling checked: `min(max_connections × 0.8, db_cores × 2 + spindles) / instances`
- [ ] `maximumPoolSize = min(L_target, ceiling)` — and a plan if `L_target` exceeds it
- [ ] `connection-timeout` inside the endpoint's latency budget, never 0
- [ ] `max-lifetime` below the smallest network/database timeout on the path
- [ ] `keepalive-time` configured and below `max-lifetime`
- [ ] `leak-detection-threshold` active
- [ ] `spring.jpa.open-in-view=false`

## Monitoring

- [ ] Alert on `hikaricp.connections.pending > 0` sustained for more than 5 s
- [ ] Alert on any increment of `hikaricp.connections.timeout`
- [ ] Dashboard for `hikaricp.connections.acquire` p99 (threshold: 10 ms)
- [ ] **Dashboard for computed `L/c`** — it warns before crossing 1, which latency does not
- [ ] Alert on `pg_stat_activity` with `idle in transaction` beyond a few seconds
- [ ] `idle_in_transaction_session_timeout` set server-side as a safety net

## Before committing database access code

- [ ] Query count per endpoint verified (1–3 typical, not N+1)
- [ ] **An automated test locking the statement count** on the critical path
- [ ] No external I/O (HTTP, gRPC, queue, sleep) inside `@Transactional`
- [ ] `@Transactional` methods are `public` and called from **another** bean — never via
      `this`
- [ ] `hibernate.jdbc.batch_size` configured for bulk operations, with `SEQUENCE` not
      `IDENTITY`
- [ ] `try-with-resources` on every manual JDBC access
