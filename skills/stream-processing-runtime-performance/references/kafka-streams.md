# Kafka Streams operation

## Capacity and skew

In Kafka 4.0, a subtopology task can own corresponding partitions from several input topics;
two co-partitioned inputs with P partitions generally give P tasks for that subtopology, not 2P.
Inspect `Topology.describe()` and actual task assignments, including internal repartition edges;
global stores use a separate model. Extra threads beyond assignable active tasks cannot increase
their active processing parallelism. Measure per-partition records, bytes, process
rate, age/lag, task idle/busy time and key skew. Partition sizing must consider both producer and
slowest consumer capacity, recovery time and future resharding cost.
More partitions cannot split one hot key without changing partitioning/aggregation semantics.
Increasing partitions can remap keys and disrupt co-partitioning/order; it is a topology migration,
not an automatically safe runtime knob.

Internal repartition and changelog topics are real network, storage and recovery load. Inventory
their partitions, replication, retention and disk impact rather than counting only source topics.

## State and guarantees

For each store record heap versus persistent implementation, cache, changelog, standby replicas,
restore rate and disk/native budget. A standby trades steady resource cost for lower failover
recovery; it can still be behind and require catch-up. Validate reassignment in an authorized
failure test against the restore-time objective. Local disk is not sufficient recovery proof when
the host is lost; verify changelog availability and whether logging was disabled for a store.

With transactional processing, pin the exact processing guarantee and runtime version. Measure
commit interval effects on transaction overhead and visibility using the same payload, producer and
broker settings. The guarantee does not include an arbitrary external database or HTTP effect.
Check downstream consumers: `read_committed` is needed to hide aborted/uncommitted Kafka output;
it can wait behind an open transaction's stable-offset boundary. Streams' internal consumer
settings do not configure a separate downstream application. DSL caching/forwarding and sink
consumption add visibility delay, so `commit.interval.ms` is not an end-to-end latency ceiling.
Changing `application.id` or resetting offsets/state can replay effects; preserve the identity and
use a separate authorized migration/replay plan instead of treating reset as performance tuning.

Use the [Kafka 4.0 configuration documentation](https://kafka.apache.org/40/streams/developer-guide/config-streams/)
and inspect the effective configuration at startup.
The [Kafka 4.0 architecture](https://kafka.apache.org/40/streams/architecture/) defines partition/task ownership;
use the matching release documentation when the deployed version differs.
