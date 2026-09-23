# Apache Flink operation

## Diagnose the graph

For a bottleneck diagnosis, follow busy/backpressured/idle time and records/bytes through the relevant
job graph. Downstream tracing is a starting heuristic, not proof that the first low-output vertex
owns the root cause. Check source starvation, skew, serialization, blocking I/O, sink quota, shared
CPU/network/storage and checkpoint uploads before adding task slots; coupled work can span vertices.
Busy/backpressured/idle measurements describe task execution, not CPU consumption or each chained
operator independently. Async work on other threads is not fully represented by task-thread time.
Correlate stacks, CPU and source/sink waits. A watermark held by an idle
input can stall event-time output while record processing is healthy; follow
`streaming-pipeline-topologies` before changing idleness or lateness semantics.

## Checkpoints and visibility

For a checkpoint or visibility question, inspect relevant interval, timeout, minimum pause,
concurrent-checkpoint limit, aligned/unaligned mode, state
bytes, duration by phase, failures and completed-checkpoint age. Barriers coordinate a consistent
snapshot; they are not a global application lock. For two-phase sinks, output visibility may wait
for checkpoint completion and the sink's actual commit/notification path. For a changed or unverified
recovery promise, exercise the relevant failure points before/after prepare, during notification or
restore in an authorized scope; reuse adequate evidence for an unchanged contract.
Separate barrier travel/alignment from synchronous snapshot, asynchronous upload and sink commit.
In Flink 2.0, unaligned checkpoints can bypass alignment delays by including in-flight buffers,
at the cost of checkpoint bytes and recovery I/O. Check `EXACTLY_ONCE` mode and a maximum of one
concurrent checkpoint before enabling them. In 2.0.0, graph generation warns and disables unaligned
mode with `AT_LEAST_ONCE`; coordinator configuration rejects more than one concurrent checkpoint
while unaligned mode is enabled. A configured flag alone therefore does not establish effective
mode. Check the graph's supported exchanges and recovery constraints too, especially custom partitioners.
Use unaligned checkpoints when barrier travel/alignment is the limiting phase; additional channel
state can worsen storage I/O pressure, and it does not fix a blocked user callback.
Incremental checkpoint upload bytes are not the total retained/restorable state.
Track shared files, restore downloads and retained checkpoint/storage growth separately.

Before rescale/upgrade, preserve stable operator UIDs, compatible state serializers and supported
key-group/max-parallelism mappings. A savepoint is not proof that an arbitrary new job restores;
exercise the exact job/connector pair and recovery path without duplicating external effects.

## State and memory

For Flink 2.0 DataStream keyed state, enable TTL on the owning descriptor; constructing a config
alone does nothing. Its TTL uses processing time, not a watermark. Verify update policy and
expired-value visibility separately from physical cleanup; logical expiry does not immediately
shrink RocksDB or erase retained checkpoints. TTL policy belongs to the running job, not the saved
checkpoint; lengthening it can change visibility of retained values. Do not assume TTL-enabled and
non-TTL state restore interchangeably in 2.0: its documentation warns of migration incompatibility.
Check the actual backend/serializer and supported migration path before changing those contracts,
with relevant restore tests for a proposed deployment. SQL retention and window cleanup follow
their own contracts.

Flink 2.0 EmbeddedRocksDBStateBackend normally budgets caches/write buffers through managed memory.
Inspect the effective slot/backend budget before overriding per-store sizes, and account for other
native consumers plus page cache/container charging without summing overlapping categories.
Only close native handles owned by custom integration code at its documented release point;
do not close Flink-owned/shared caches while tasks still use them. Measure state growth and
compaction/I/O as well as heap allocation and RSS.

Connector classes and configuration keys change between major releases. Pin Flink and connector
versions; compile added or changed executable API examples against them. Source/API evidence can
establish capability without a running cluster, while effective deployment settings require their
own evidence. For example, [Flink 2.0.0 RocksDBOptions](https://github.com/apache/flink/blob/release-2.0.0/flink-state-backends/flink-statebackend-rocksdb/src/main/java/org/apache/flink/state/rocksdb/RocksDBOptions.java)
defines `state.backend.rocksdb.memory.managed` with default `true`; that does not establish the
effective budget or overrides in a particular job. Use the versioned
[Flink 2.0 backpressure guide](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/monitoring/back_pressure/),
[checkpoint trade-offs](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/state/checkpointing_under_backpressure/),
[state TTL](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/dev/datastream/fault-tolerance/state/),
and [state backend memory/recovery](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/state/state_backends/).
For unaligned mode, the 2.0.0 [job-graph validation](https://github.com/apache/flink/blob/release-2.0.0/flink-runtime/src/main/java/org/apache/flink/streaming/api/graph/StreamingJobGraphGenerator.java)
and [checkpoint coordinator configuration](https://github.com/apache/flink/blob/release-2.0.0/flink-runtime/src/main/java/org/apache/flink/runtime/jobgraph/tasks/CheckpointCoordinatorConfiguration.java)
establish the disabling and concurrency checks; match the actual release before predicting a failure mode.
For restore changes, also read [savepoint mapping and rescaling](https://nightlies.apache.org/flink/flink-docs-release-2.0/docs/ops/state/savepoints/)
and the [2.0.0 TTL contract](https://github.com/apache/flink/blob/release-2.0.0/docs/content/docs/dev/datastream/fault-tolerance/state.md#state-time-to-live-ttl).
Release-2.0 documentation may include patch updates; match the deployed patch/backend before relying
on migration behavior from a newer release.
