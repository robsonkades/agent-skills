# Kafka Streams operation

## Capacity and skew

One active task owns each input partition for a subtopology. More application threads or instances
than assignable tasks do not add useful parallelism. Measure per-partition records, bytes, process
rate, age/lag, task idle/busy time and key skew. Partition sizing must consider both producer and
slowest consumer capacity, recovery time and future resharding cost.

Internal repartition and changelog topics are real network, storage and recovery load. Inventory
their partitions, replication, retention and disk impact rather than counting only source topics.

## State and guarantees

For each store record heap versus persistent implementation, cache, changelog, standby replicas,
restore rate and disk/native budget. A standby trades steady resource cost for lower failover
recovery; validate kill-and-reassign under load.

With transactional processing, pin the exact processing guarantee and runtime version. Measure
commit interval effects on transaction overhead and visibility using the same payload, producer and
broker settings. The guarantee does not include an arbitrary external database or HTTP effect.

Use the versioned [Kafka Streams configuration documentation](https://kafka.apache.org/documentation/streams/developer-guide/config-streams.html)
and inspect the effective configuration at startup.
