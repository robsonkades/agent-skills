# Apache Flink operation

## Diagnose the graph

Follow busy/backpressured/idle time and records/bytes through the job graph. Continue downstream from
a backpressured vertex until the first operator with reduced output and no equivalent upstream cause.
Check skew, serialization, blocking I/O, sink quota and network buffers before adding task slots.
Busy/backpressured/idle measurements describe task execution, not CPU consumption or each chained
operator independently. Correlate stacks, CPU and source/sink waits. A watermark held by an idle
input can stall event-time output while record processing is healthy; follow
`streaming-pipeline-topologies` before changing idleness or lateness semantics.

## Checkpoints and visibility

Record interval, timeout, minimum pause, concurrent-checkpoint limit, aligned/unaligned mode, state
bytes, duration by phase, failures and completed-checkpoint age. Barriers coordinate a consistent
snapshot; they are not a global application lock. For two-phase sinks, output visibility may wait
for checkpoint completion. Exercise failure before prepare, after prepare, during notification and
during restore.
Separate barrier travel/alignment from synchronous snapshot, asynchronous upload and sink commit.
In Flink 2.0, unaligned checkpoints can bypass alignment delays by including in-flight buffers,
at the cost of checkpoint bytes and recovery I/O; they do not fix a slow state store or blocked
user callback. Incremental checkpoint upload bytes are not the total retained/restorable state.
Track shared files, restore downloads and retained checkpoint/storage growth separately.

Before rescale/upgrade, preserve stable operator UIDs, compatible state serializers and supported
key-group/max-parallelism mappings. A savepoint is not proof that an arbitrary new job restores;
exercise the exact job/connector pair and recovery path without duplicating external effects.

## State and memory

For Flink 2.0 DataStream keyed state, enable TTL on the owning descriptor; constructing a config
alone does nothing. Its TTL uses processing time, not a watermark. Verify update policy and
expired-value visibility separately from physical cleanup; logical expiry does not immediately
shrink RocksDB or erase retained checkpoints. Changing TTL/serializer configuration on restore
needs compatibility tests. SQL retention and window cleanup follow their own contracts.

Flink 2.0 EmbeddedRocksDBStateBackend normally budgets caches/write buffers through managed memory.
Inspect the effective slot/backend budget before overriding per-store sizes, and account for other
native consumers plus page cache/container charging without summing overlapping categories.
Only close native handles owned by custom integration code at its documented release point;
do not close Flink-owned/shared caches while tasks still use them. Measure state growth and
compaction/I/O as well as heap allocation and RSS.

Connector classes and configuration keys change between major releases. Pin Flink and connector
versions, compile against them, and compare effective configuration. Use the versioned
[Flink 2.0 backpressure guide](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/monitoring/back_pressure/),
[checkpoint trade-offs](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/state/checkpointing_under_backpressure/),
[state TTL](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/dev/datastream/fault-tolerance/state/),
and [state backend memory/recovery](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/state/state_backends/).
