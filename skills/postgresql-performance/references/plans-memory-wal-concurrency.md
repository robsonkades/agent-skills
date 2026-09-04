# PostgreSQL plans, memory, WAL, and concurrency

## Reading the executed plan

Use the production statement shape and representative parameters. Read:

1. first deep node where estimated and actual rows diverge;
2. `loops`, because node timing is per loop;
3. shared reads/hits and total buffers;
4. hash `Batches > 1` and temporary I/O;
5. external sort/disk evidence;
6. `Heap Fetches` on index-only scans;
7. rows removed by filter and residual work.

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

JIT trades fixed compilation for cheaper per-row work. Inspect compilation time and total execution;
high plan cost with short OLTP execution can cross the threshold and regress latency.
