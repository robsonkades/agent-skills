# Pool incident triage

Follow the order. Each step either closes the question or hands you the next one, and
skipping to "raise the pool" ends the investigation with the bottleneck relocated rather
than removed.

## 1. Is it the pool at all?

```
hikaricp.connections.pending        > 0 sustained → threads are waiting
hikaricp.connections.acquire p99    > 10 ms       → the wait is material
hikaricp.connections.timeout        any increment → saturation, not slowness
```

If `pending` is flat at zero, the pool is not the constraint and the rest of this document
does not apply.

## 2. Is W inflated, and for whom?

```
hikaricp.connections.usage  p50 vs p99
```

A p50 of 15 ms with a p99 of 3 s means a minority of requests hold connections far too
long. That minority is the whole problem: by `ρ = λW/c`, a small fraction with a large `W`
dominates utilisation.

## 3. Is there non-database work inside the transaction?

```sql
SELECT pid, state, now() - state_change AS duration, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY duration DESC;
```

`idle in transaction` says exactly: a transaction is open and nothing is running on it.
That is an HTTP call, a queue publish, or business logic inside `@Transactional`. A 300 ms
external call there caps throughput at `pool_size / 0.3` and holds the snapshot, delaying
`VACUUM` for the entire database.

Watch for the silent variant: `this.method()` inside the same bean does not go through the
proxy, so the transaction people believe exists does not.

## 4. Is it N+1?

```sql
-- by total time: the expensive queries
SELECT query, calls, total_exec_time FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;

-- by call count: THIS is where N+1 shows up
SELECT query, calls, mean_exec_time FROM pg_stat_statements
ORDER BY calls DESC LIMIT 20;
```

N+1 never appears as a slow query — each one is fast. Order by `calls`. Fix with
`JOIN FETCH`, `@EntityGraph` or a DTO projection, and then **lock the statement count in a
test**; without that the next refactor reintroduces it.

## 5. Is the query itself the problem?

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

Look for `Seq Scan` on a large table and high `read` (as opposed to `hit`) buffer counts.
Also consider what the query returns: `SELECT *` costs in three places — database read,
network transfer, and deserialisation in the JVM — and with large columns (`TEXT`, `JSONB`,
`BYTEA`) the difference is orders of magnitude. In JPA the equivalent is loading full
entities where a projection would do, which additionally populates the persistence context
and pays dirty checking at commit.

## 6. Fine-grained waiting

```bash
jfr configure --input default.jfc --output fine.jfc jdk.ThreadPark#threshold=1ms
```

Pool waiting is `LockSupport.park` → `jdk.ThreadPark`, **not** a monitor event. At the
default 20 ms threshold, thousands of short waits per second are invisible, and "zero
events" reads as "no contention".

## Serialisation failures

Under SERIALIZABLE, `SQLSTATE 40001` is not an application error — it is the mechanism
working. Retry with backoff **and jitter**; without jitter, the transactions that collided
retry in lockstep and collide again.

## What not to do first

Raising `maximumPoolSize` is the last step, not the first. Before it: check
`hikaricp.connections.usage`. If `W` is inflated by external I/O, N+1 or a slow query, the
pool is not the problem, and enlarging it moves the queue into the database.
