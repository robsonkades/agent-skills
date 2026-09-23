# Kafka Streams operation

## Capacity and skew

In Kafka 4.0, a subtopology task can own corresponding partitions from several input topics;
two co-partitioned inputs with P partitions generally give P tasks for that subtopology, not 2P.
Inspect `Topology.describe()` and actual task assignments, including internal repartition edges;
global stores use a separate model. Extra threads beyond assignable active tasks cannot increase
their active processing parallelism. For a capacity claim, use relevant per-partition records,
bytes, process rate, age/lag, task idle/busy time and key-skew evidence. Size for the required
independent consumer groups and aggregate producer workload, shared broker/network/storage limits,
recovery time and future resharding cost. A single producer or slowest-consumer rate is not a
universal partition-count formula; group isolation does not eliminate shared resource demand.
More partitions cannot split one hot key without changing partitioning/aggregation semantics.
Increasing partitions can remap keys and disrupt co-partitioning/order; it is a topology migration,
not an automatically safe runtime knob.

Internal repartition and changelog topics are real network, storage and recovery load. Inventory
their partitions, replication, retention and disk impact rather than counting only source topics.

## State and guarantees

For each store record heap versus persistent implementation, cache, changelog, standby replicas,
restore rate and disk/native budget. A standby trades steady resource cost for lower failover
recovery; it can still be behind and require catch-up. For a changed or unverified recovery promise,
validate relevant reassignment against the restore-time objective in an authorized failure test;
reuse adequate existing evidence for an unchanged contract. Local disk is not sufficient recovery proof when
the host is lost; verify changelog availability and whether logging was disabled for a store.

In Kafka 4.0, `statestore.cache.max.bytes` budgets the on-heap record cache across threads in one
`KafkaStreams` instance; it does not cap RocksDB block caches, index/filter memory or memtables.
Inventory actual RocksDB instances, including standby stores, and their effective settings.
More local tasks/stores can increase native demand while the record-cache setting stays unchanged.
When those native consumers dominate, compare per-store budgets with a shared block cache and
`WriteBufferManager` configured through `RocksDBConfigSetter`. Include index/filter blocks and
charge memtables to the shared cache when using that budgeting scheme; do not sum the same memory
twice. This is not a hard RSS limit: inspect capacity enforcement and reserve space for other native
allocations, buffers and resident file pages. Compare memory with cache misses, write stalls,
compaction, processing and restore rates before accepting a smaller budget.

Give shared native objects a lifetime covering every dependent store. A per-store close callback
must not release a cache or write-buffer manager still used by another store; release exclusively
owned handles there and shared handles after their last user, including task reassignment/shutdown.
The [Kafka 4.0 memory guide](https://kafka.apache.org/40/streams/developer-guide/memory-mgmt/)
describes the distinct caches and shared-budget scheme; the [4.0.0 configuration definition](https://github.com/apache/kafka/blob/4.0.0/streams/src/main/java/org/apache/kafka/streams/StreamsConfig.java)
defines the record-cache key, and the [RocksDBConfigSetter contract](https://github.com/apache/kafka/blob/4.0.0/streams/src/main/java/org/apache/kafka/streams/state/RocksDBConfigSetter.java)
defines ownership obligations for user-created native handles.

With transactional processing, pin the exact processing guarantee and runtime version. When comparing
commit intervals, measure overhead and visibility using representative payload, producer and broker
settings. The guarantee does not include an arbitrary external database or HTTP effect.
Check downstream consumers: `read_committed` is needed to hide aborted/uncommitted Kafka output;
it can wait behind an open transaction's stable-offset boundary. Streams' internal consumer
settings do not configure a separate downstream application. DSL caching/forwarding and sink
consumption add visibility delay, so `commit.interval.ms` is not an end-to-end latency ceiling.
Changing `application.id` or resetting offsets/state can replay effects; preserve the identity and
use a separate authorized migration/replay plan instead of treating reset as performance tuning.

Use the [Kafka 4.0 configuration documentation](https://kafka.apache.org/40/streams/developer-guide/config-streams/)
for the declared contract and startup/runtime evidence when claiming effective deployed settings.
The [Kafka 4.0 architecture](https://kafka.apache.org/40/streams/architecture/) defines partition/task ownership;
use the matching release documentation when the deployed version differs.
