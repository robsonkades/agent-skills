# PostgreSQL plans, memory, WAL, and concurrency

## Sampling monitoring counters

On PostgreSQL 17/18, default `stats_fetch_consistency` caches accessed cumulative statistics until
the observer transaction ends. Repeated polling inside one `BEGIN` can therefore appear flat;
current-query snapshots can also persist within a transaction. Use short separate monitoring
transactions or `pg_stat_clear_snapshot()` to refresh the observer's cached information. This
neither resets counters nor forces other backends to publish pending statistics; allow for reporting
lag. Do not use `pg_stat_reset()` merely to refresh a read.

Compute rates and HOT-ratio deltas for the same instance/objects and reset interval. Inspect available
`stats_reset` markers, known object-specific resets and restart/failover history; discard intervals
that cannot be compared. Disabled timing collection or restricted `pg_stat_activity` fields are
evidence gaps, not proof of zero I/O time or an absent session.

## Choosing a planner-statistics remedy

For a consequential row-estimate error, inspect `pg_stats`, analyze history, distribution changes
and the actual predicates/parameters. Monitoring counters are not the planner's column statistics.
After substantial data changes, targeted `ANALYZE` can refresh stale distributions. If fresh
histograms/most-common values undersample important skew, consider a higher per-column statistics
target and re-analyze; it increases collection/planning overhead, so check the affected estimates
and workload rather than raising the database-wide default reflexively.

Fresh single-column statistics do not describe cross-column dependence. For same-table distributions,
consider `CREATE STATISTICS`: `dependencies` for correlated column-to-constant equality/`IN` conditions,
`mcv` for common value combinations, or `ndistinct` for misestimated groups. Collect with `ANALYZE`
after creating the object; its definition alone supplies no measurements. Dependencies do not fix
range predicates or detect incompatible value combinations. On PostgreSQL 17/18, extended
statistics do not directly estimate join-clause selectivity, though better base-relation estimates
can affect the resulting join plan. Do not promise that one statistics object fixes all correlation.

For an expression-estimate problem, expression statistics can avoid adding an index solely to
collect statistics; they do not provide an index access path. Retain adequate estimates and compare
the consequential plan/work after a justified change, including representative skewed parameters.

Autovacuum can analyze ordinary partitions but does not analyze the partitioned parent. When parent
statistics matter, arrange explicit parent `ANALYZE` after significant distribution changes;
recent child autoanalyze timestamps do not establish parent freshness. Inheritance-child changes
also do not trigger parent autoanalyze. Preserve a working maintenance policy.

## Reading the executed plan

Use the production statement shape and representative parameters. Read:

1. first deep node where estimated and actual rows diverge;
2. `loops`, because actual rows and node timing are averages per loop; multiply to estimate
   total row work/node time, accounting for rounding and parallel worker detail;
3. shared reads/hits and total buffers;
4. hash `Batches > 1` and temporary I/O;
5. external sort/disk evidence;
6. `Heap Fetches` on index-only scans;
7. rows removed by filter and residual work.

Parent timing and buffer counters include child work: summing nodes double-counts it, and
parallel node time is not elapsed wall time. Buffer hits/reads count accesses, not unique pages;
a shared read can be served from the OS cache and does not prove physical device I/O. Rows removed
are also per-loop averages where reported. LIMIT/early termination can explain partially consumed
nodes; distinguish that from a cardinality estimate error. EXPLAIN execution time does not include
all client transfer/materialization; correlate with application measurements.

Apply the main skill's execution/scope checks before EXPLAIN ANALYZE. Where supported, `TIMING OFF`
reduces per-node clock overhead while retaining row counts and overall execution time; it does
not prevent execution. Add WAL evidence when relevant, but do not treat per-statement WAL bytes
as commit latency, fsync duration or total cluster WAL. Use interval counters and waits for those layers.

Planner `cost` uses an arbitrary relative scale, conventionally based on sequential page fetches.
It can be calibrated to time units, but remains a model estimate, not observed elapsed latency.
Calibrate only from a representative plan population and hardware evidence; do not assume a
milliseconds conversion or copy “SSD values.”

## Memory and connections

Count simultaneous sort/hash nodes, parallel workers, and sessions when modeling `work_mem`; hashes
may use `hash_mem_multiplier`. Private sorts or nonparallel hash tables can be replicated among
participants, while Parallel Hash builds shared state and can combine participant allowances before
batching. Count that shared allowance once, not once per worker again. Account for overlapping
lifetimes, actual workers/leader participation and concurrent queries; not every plan node is live
at the same time. This allowance is neither a per-connection reservation nor a hard process-RSS cap;
include other memory/overhead. A justified scoped `SET LOCAL` experiment may avoid changing every job.

Each direct server connection has a backend process and associated private/shared bookkeeping;
active transaction/snapshot work depends on what it does. Distinguish these from pooler client
connections. Keep a fleet-wide admission/resource budget. Raising `max_connections` increases
allocated server resources and may help a demonstrated admission bottleneck with database headroom;
it does not itself establish higher safe execution capacity. Retain an adequate limit or pool design.

## WAL and checkpoints

Measure WAL bytes/rate, checkpoint requested versus timed, write/sync duration, full-page images,
archive/replica lag, and storage latency. A larger WAL budget can absorb bursts and reduce requested
checkpoints when WAL volume triggers them; it can increase replay work/recovery time and disk use,
not necessarily every observed recovery. `max_wal_size` is a soft checkpoint-related limit, not a
hard disk cap; retention, archiving and replication can keep more WAL. It does not increase sustained
I/O capacity. Compare the actual checkpoint causes and recovery/storage contract before changing it.

PostgreSQL 18 changes I/O defaults/capabilities, so validate `io_method`, effective I/O concurrency,
filesystem/device behavior, and version before applying older tuning guidance.

## Locks and isolation

Plain MVCC reads and row DML usually do not block each other, but writers, explicit locks, DDL, and
session/advisory locks still do. Find the head blocker and transaction age, then connect it to the
application boundary.

REPEATABLE READ can raise serialization failures for concurrent update conditions; SERIALIZABLE uses
SSI and may abort to prevent anomalies. Retry only operations with defined repeat safety and a bounded
deadline/backoff policy.
Retry the entire transaction, not only its final failed statement, and recompute decisions from
the new snapshot. Investigating a blocker does not by itself justify terminating it; identify
owner, transaction consequences and established operational authority.

JIT trades fixed compilation for cheaper per-row work. Inspect compilation time and total execution;
high plan cost with short OLTP execution can cross the threshold and regress latency.

Sources: [Using EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html),
[EXPLAIN execution semantics](https://www.postgresql.org/docs/18/sql-explain.html), and
[serialization failure handling](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html).
Sampling semantics: [PostgreSQL 17 statistics](https://www.postgresql.org/docs/17/monitoring-stats.html)
and [PostgreSQL 18 statistics](https://www.postgresql.org/docs/18/monitoring-stats.html).
Planner remedies: [planner statistics](https://www.postgresql.org/docs/18/planner-stats.html),
[CREATE STATISTICS and join limitations](https://www.postgresql.org/docs/18/sql-createstatistics.html),
[parent-table analysis](https://www.postgresql.org/docs/18/routine-vacuuming.html#VACUUM-FOR-STATISTICS),
and [cost scale](https://www.postgresql.org/docs/18/runtime-config-query.html#RUNTIME-CONFIG-QUERY-CONSTANTS).
Memory scope: [parallel plans](https://www.postgresql.org/docs/17/parallel-plans.html),
[resource settings](https://www.postgresql.org/docs/18/runtime-config-resource.html) and
[PostgreSQL 18.0 hash sizing](https://github.com/postgres/postgres/blob/REL_18_0/src/backend/executor/nodeHash.c).
For instance changes, check [connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html)
and [WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html) on the target version.
