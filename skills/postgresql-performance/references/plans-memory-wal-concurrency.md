# PostgreSQL plans, memory, WAL, and concurrency

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

Apply the main skill's execution/scope checks before ANALYZE. Where supported, `TIMING OFF`
reduces per-node clock overhead while retaining row counts and overall execution time; it does
not prevent execution. Add WAL evidence when relevant, but do not treat per-statement WAL bytes
as commit latency, fsync duration or total cluster WAL. Use interval counters and waits for those layers.

Planner `cost` is dimensionless and anchored to relative cost constants. Calibrate a cost constant
only from a representative plan population and hardware evidence; do not convert it to milliseconds
or copy “SSD values.”

## Memory and connections

Count simultaneous sort/hash nodes, parallel workers, and sessions when modeling `work_mem`; hashes
may use `hash_mem_multiplier`. Prefer scoped `SET LOCAL` for a known job over raising the global value
for every connection.

Each connection has a backend process and contributes private/shared bookkeeping and snapshot work.
Use a pool and a fleet-wide budget; raising `max_connections` expands memory and coordination capacity
requirements rather than database throughput.

## WAL and checkpoints

Measure WAL bytes/rate, checkpoint requested versus timed, write/sync duration, full-page images,
archive/replica lag, and storage latency. A larger WAL budget can absorb bursts and reduce requested
checkpoints but lengthens recovery and uses disk; it does not increase sustained I/O capacity.

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
