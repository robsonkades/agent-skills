# Repairs, and moving a partition safely

## The repairs, with their prices

| Repair                  | Selected when                                                                   | Price                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Request coalescing      | Many semantically identical concurrent reads                                    | Shared failure/latency/cancellation; auth and consistency must be keyed  |
| Cache in front of key   | Read-hot, value tolerates a TTL's staleness                                     | Staleness, invalidation, memory — `caching-strategies` owns the decision |
| Read replica of a shard | Read-hot and replica consistency/lag satisfies the read contract                | Lag and stale routing become observable — `consistency-models`           |
| Key salting             | Write-hot single key, reads rare or aggregate                                   | Every read of that key fans out to S partitions, permanently             |
| Dedicated shard         | One named, persistently large or hot tenant; the set is small and slow-changing | An operational special case in routing, capacity and runbooks            |
| Composite shard key     | One tenant is too large for any shard and its data subdivides naturally         | A migration — `sharding-and-partitioning`                                |
| Partition split         | Store supports online split and the hot region is a contiguous range            | A move while serving; see below                                          |
| Per-key rate limit      | Immediate mitigation, or the key is abusive rather than popular                 | Rejected requests — `rate-limiting-and-load-shedding`                    |

Coalescing can remove burst duplication without TTL staleness or storage, but it is not free:
one slow request delays all waiters and one failure fans out to all of them. Include tenant,
authorization scope, consistency level and representation in the key; decide whether one
waiter's cancellation cancels shared work; bound waiter count and execution time.

## Salting, written out

Split one logical key into S physical keys:

```java
// Write: a stable entity/event id gives deterministic retry routing. Random selection needs
// the chosen bucket to be persisted with the idempotency record.
int bucket = Math.floorMod(stableHash(eventId), SPLIT_FACTOR);
String writeKey = key + '#' + bucket;

// Read: every sub-key must be consulted and the results merged.
List<Entry> merged = IntStream.range(0, SPLIT_FACTOR)
        .mapToObj(i -> store.get(key + '#' + i))
        .flatMap(List::stream)
        .toList();
```

Consequences to accept before shipping it:

- **Read cost multiplies by S**, and read latency becomes the maximum over S partitions
  rather than one — the tail amplification of `tail-latency-analysis` applies to a fan-out
  of S exactly as it does to a fan-out over shards.
- **S is baked into the data.** Changing S later means rewriting the key's rows; treat it
  like a shard key and choose the smallest S that carries the write rate.
- **Only append-style workloads salt cleanly.** Counters, event streams and append-only lists
  can have defined merges, but global ordering, uniqueness and atomic aggregate checks no
  longer come for free. A single mutable value does not: S copies can disagree.
- **Retries must return to the same bucket.** Randomly choosing again can duplicate an event
  across buckets and defeats per-bucket idempotency. Persist the choice or derive it from a
  stable operation/entity identifier.
- **Salt selectively.** Keep the hot-key list in configuration that can change without a
  deploy, and salt only those keys; the alternative is charging every read in the system the
  fan-out to fix one key.

## Moving a partition while it serves

The correctness problem in a live migration is the **double-ownership window**: an interval
during which both the old and the new owner believe they own the partition. Any write that
lands on the old owner after the new one is authoritative is lost, and nothing logs it.

Sequence:

1. **Bump the shard map to version v+1**, with the partition marked _migrating_, old owner
   still authoritative. Clients keep reading and writing to the old owner.
2. **Bulk-copy the partition**, throttled, from a consistent snapshot. Record the snapshot
   position.
3. **Stream the changes since the snapshot** to the new owner until the lag is small and
   stable. "Small and stable" is the go/no-go signal — a lag that is not converging means the
   cut-over will need a longer freeze than planned.
4. **Establish the cutover fence.** Stop admission at the old epoch (or use a store-supported
   atomic ownership transition), drain accepted writes and persist the final change
   position. Clients may observe retryable errors, deadline expiry or latency; a short freeze
   does not guarantee success, so preserve idempotency and remaining deadlines.
5. **Drain the remaining changes**, verify by comparison (row counts and a checksum over the
   key range, not a spot check).
6. **Publish version v+2** with the new owner authoritative. Every commit path validates the
   current ownership epoch; the old owner rejects all mutations for the moved partition,
   including a request carrying a newer map but routed to the wrong endpoint. A paused client
   or owner must be unable to commit. The general mechanism is
   `distributed-locks-and-leases`.
7. **Unfreeze, reconcile, and retain the source under quarantine.** Delete it only after the
   rollback window and restore evidence pass. The old copy is not automatically a rollback:
   after cutover it lacks new writes. Roll back by assigning a new epoch and reverse-copying
   or replaying the post-cutover log, never by reactivating v+1.

Stop-the-world migration — reject writes, copy, resume — is the correct choice when the
partition is small enough for the agreed maintenance/degraded-service budget and lost
availability is acceptable. It is simpler than live migration, but client timeouts do not
make it transparent. Choose deliberately; every live state needs an epoch check and a
restartable, idempotent transition.

## Throttling and hysteresis

- **Throttle the copy in bytes or rows per second** and treat it as production load against
  both the source and the target. An unthrottled rebalance to relieve a hot shard is the
  second incident.
- **Cap concurrent moves**, and never move more than one replica of the same partition at a
  time — that is a durability decision disguised as a throughput one.
- **Automatic rebalancing needs hysteresis or it oscillates.** Three rules, all necessary:
  trigger only when the skew ratio exceeds the threshold for a sustained window; require a
  cool-down before the same partition may move again; and require the projected post-move
  ratio to be better by a margin, not merely better. Without the margin, the balancer chases
  noise.
- **Give the balancer a rate limit on its own decisions**, and an off switch that an operator
  can reach without a deploy. Every automatic rebalancer eventually makes an incident worse
  once, and the response time is how long it takes to turn it off.

## Proving the repair

- Replay the incident's traffic shape — the recorded per-key distribution, not a uniform
  load — against the repaired system, and assert the max/mean skew ratio stays under
  tolerance. A uniform synthetic load cannot reproduce a hot partition and will pass
  regardless of whether the repair works.
- For the migration path, inject the failure that matters: pause a client between reading the
  shard map and issuing its write, complete the cut-over, then release it. Assert the write is
  rejected. A migration test that does not include a stale writer has not tested the fencing.
- Crash and restart the controller after every state transition. Resume from a durable
  migration record without repeating destructive steps; verify that source and target
  checksums use a stable snapshot/cut position rather than racing live writes.
- Model migration bandwidth and write amplification against foreground SLO headroom. Abort
  or reduce rate when replication lag, queue age or error-budget burn crosses its guardrail;
  do not let the controller optimize balance by violating durability.

## Primary references

- [Apache Kafka operations: partition reassignment throttling](https://kafka.apache.org/documentation/#basic_ops_cluster_expansion)
- [Amazon DynamoDB adaptive capacity and split-for-heat behavior](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)
- [Google Cloud Spanner: schema design and hotspot avoidance](https://cloud.google.com/spanner/docs/schema-design)
