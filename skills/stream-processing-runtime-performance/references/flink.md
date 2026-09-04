# Apache Flink operation

## Diagnose the graph

Follow busy/backpressured/idle time and records/bytes through the job graph. Continue downstream from
a backpressured vertex until the first operator with reduced output and no equivalent upstream cause.
Check skew, serialization, blocking I/O, sink quota and network buffers before adding task slots.

## Checkpoints and visibility

Record interval, timeout, minimum pause, concurrent-checkpoint limit, aligned/unaligned mode, state
bytes, duration by phase, failures and completed-checkpoint age. Barriers coordinate a consistent
snapshot; they are not a global application lock. For two-phase sinks, output visibility may wait
for checkpoint completion. Exercise failure before prepare, after prepare, during notification and
during restore.

## State and memory

State TTL exists only when enabled on the descriptor that owns the state. Test expiry behavior;
constructing a TTL object proves nothing. Bound RocksDB block cache and write buffers across all
stores/operators, close native objects according to the exact integration API, and reconcile heap,
managed memory, native RSS, mapped files and container limit.

Connector classes and configuration keys change between major releases. Pin Flink and connector
versions, compile against them, and compare effective configuration. Use the versioned
[Flink performance guide](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/monitoring/back_pressure/)
and [checkpoint documentation](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/checkpoints/).
