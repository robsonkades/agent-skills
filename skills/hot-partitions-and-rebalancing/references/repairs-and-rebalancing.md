# Repairs, and moving a partition safely

## The repairs, with their prices

| Repair                  | Selected when                                                                   | Price                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Request coalescing      | Many identical concurrent reads of one key                                      | None to correctness; only helps while concurrency is high                |
| Cache in front of key   | Read-hot, value tolerates a TTL's staleness                                     | Staleness, invalidation, memory — `caching-strategies` owns the decision |
| Read replica of a shard | Read-hot and the value must be fresher than a cache allows                      | Replication lag becomes observable — `consistency-models`                |
| Key salting             | Write-hot single key, reads rare or aggregate                                   | Every read of that key fans out to S partitions, permanently             |
| Dedicated shard         | One named, persistently large or hot tenant; the set is small and slow-changing | An operational special case in routing, capacity and runbooks            |
| Composite shard key     | One tenant is too large for any shard and its data subdivides naturally         | A migration — `sharding-and-partitioning`                                |
| Partition split         | Store supports online split and the hot region is a contiguous range            | A move while serving; see below                                          |
| Per-key rate limit      | Immediate mitigation, or the key is abusive rather than popular                 | Rejected requests — `rate-limiting-and-load-shedding`                    |

Coalescing is first in the table on purpose: it is the only repair with no staleness and no
fan-out cost, and it is frequently sufficient for a read-hot key on its own.

## Salting, written out

Split one logical key into S physical keys:

```java
// Write: pick a sub-key. Round-robin per writer thread spreads better than random at low
// rates; random is adequate at high rates and needs no state.
String writeKey = key + '#' + ThreadLocalRandom.current().nextInt(SPLIT_FACTOR);

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
  merge trivially. A single mutable value does not: S copies of one value is S values that
  can disagree.
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
4. **Freeze writes to that partition only**, briefly. The old owner rejects writes with a
   retryable error; clients retry, and the freeze becomes latency rather than errors provided
   it is shorter than the client timeout — that budget is `timeouts-and-deadlines`.
5. **Drain the remaining changes**, verify by comparison (row counts and a checksum over the
   key range, not a spot check).
6. **Publish version v+2** with the new owner authoritative. **The old owner must now reject
   any write stamped with a map version below v+2.** This is the fencing rule and it is not
   optional: a client that was paused in GC or blocked on a slow call may still be holding
   v+1 and will otherwise write to a store nobody reads. The general mechanism is
   `distributed-locks-and-leases`.
7. **Unfreeze, watch, then delete the source copy** — as a separate, later step, so a bad
   cut-over is a rollback rather than a restore.

Stop-the-world migration — reject writes, copy, resume — is the correct choice when the
partition is small enough that the freeze fits inside the client timeout budget, and it is
dramatically simpler. Choose it deliberately rather than defaulting to live migration
because live sounds safer; the live path has more states, and every one of them needs the
version check.

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
