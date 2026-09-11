# Pool incident triage

Use this sequence when the cause is unknown; reuse evidence that already resolves a step.
Each step should distinguish a cause or identify the next check. Raising the pool without
database headroom and aggregate budget evidence can relocate the bottleneck.

## 1. Is it the pool at all?

```
hikaricp.connections.pending        > 0 sustained → threads are waiting
hikaricp.connections.acquire p99    compare with remaining request budget
hikaricp.connections.timeout        correlate with active/total/max, creation and validation failures
```

A sampled zero pending count does not rule out bursts between scrapes. Acquisition timeouts can
also accompany inability to create/validate connections, not just a fully occupied healthy pool.
Check acquisition distributions, timeout deltas, effective limits and connectivity together.

## 2. Is W inflated, and for whom?

```
hikaricp.connections.usage  p50 vs p99
```

A p50 of 15 ms and p99 of 3 s identifies a long tail worth tracing, but does not determine its
contribution or root cause. Use timer sum/count for mean hold time and inspect outstanding borrows
that have not completed. Compare slow endpoints/transactions, lock waits, driver behavior and leaks.

## 3. Is there non-database work inside the transaction?

```sql
SELECT pid, state, now() - state_change AS idle_duration,
       now() - xact_start AS transaction_age, backend_xmin, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY idle_duration DESC;
```

`idle in transaction` says exactly: a transaction is open and the backend is not currently
executing a statement. It does not identify the application-side cause. Correlate transaction age,
traces, and stack samples to distinguish an HTTP call, a queue publish, user think time, or business
logic inside `@Transactional`. Confirm that a connection is held across the external work;
transaction annotations alone do not prove physical checkout timing. Snapshot/cleanup impact
depends on isolation, locks and transaction state; READ COMMITTED does not retain one query
snapshot for the entire transaction. Check `backend_xmin` and blockers before assigning that cause.

In default Spring proxy mode, `this.method()` bypasses that method's transaction advice. An outer
transaction may still exist; inspect propagation and caller context, and distinguish AspectJ mode.
If outer transactions hold all pool connections while `REQUIRES_NEW` calls wait for additional
ones, the database may have spare capacity while no borrower can progress. Confirm the nested
acquisition dependency; changing propagation also changes commit/rollback semantics.

## 4. Is it N+1?

PostgreSQL examples assume `pg_stat_statements` is installed/configured and the operator can read
the required statistics. Compare deltas over the incident window, accounting for resets and workload
mix; all-time totals do not isolate one endpoint or deploy. Query text may contain sensitive literals.

```sql
-- by total time: the expensive queries
SELECT query, calls, total_exec_time FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;

-- by call count: THIS is where N+1 shows up
SELECT query, calls, mean_exec_time FROM pg_stat_statements
ORDER BY calls DESC LIMIT 20;
```

High calls may be legitimate high traffic; N+1 requires per-operation correlation with result count.
Statements may also be slow individually. Compare query-count growth for different parent counts;
select a fetch plan or batch-fetch/projection strategy that preserves pagination and avoids row
explosion, then test that behavior (`orm-fetch-and-batching-performance`).

## 5. Is the query itself the problem?

Start with a non-executing plan. The following is a template, not runnable SQL; `ANALYZE` executes
the statement, including functions and its real workload cost. Use a bounded, representative safe
environment for execution and the target engine's timeout controls.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

Compare row estimates with actual rows, loops, filtering, lock/I/O waits and useful output. A
sequential scan can be appropriate for a large fraction of a table; a buffer read is not necessarily
physical storage I/O because OS caching intervenes. Wide projections can increase transfer and
hydration cost; measure the difference rather than promising orders of magnitude. Route plan
changes to `postgresql-performance` or `sql-query-performance`.

## 6. Fine-grained waiting

```bash
jfr configure --input default --output fine.jfc jdk.ThreadPark#threshold=1ms
```

Hikari's contended borrow path can park; inspect `jdk.ThreadPark` stacks and blocker identity to
attribute waits to the pool. Other libraries/modes can differ. Inspect the runtime's JFC thresholds;
short waits below them are invisible. This command only creates configuration: use it for a bounded
recording and inspect loss/overhead before interpreting zero events.

## Serialisation failures

PostgreSQL 40001 requires retrying the complete transaction, including decision-making reads,
under a bounded deadline/attempt policy. It can occur at REPEATABLE READ as well as SERIALIZABLE.
Backoff/jitter reduces synchronized retry pressure; ensure external effects are safe and report
retry exhaustion. Do not retry only the last statement in an aborted transaction.

## What not to do first

Before raising `maximumPoolSize`, check hold time and competing causes: external waits, N+1,
slow queries and nested acquisition can contribute. Their presence does not prove the local
pool is adequate. A bounded increase can be justified by measured database headroom, aggregate
session budgets and request SLOs, including as a temporary mitigation; compare useful throughput,
waits and database health with explicit rollback bounds. Keep an adequate pool unchanged.

Primary references: [PostgreSQL 17 statistics](https://www.postgresql.org/docs/17/pgstatstatements.html),
[transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html), and
[EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).
