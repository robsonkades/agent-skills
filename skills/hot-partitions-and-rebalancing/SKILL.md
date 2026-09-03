---
name: hot-partitions-and-rebalancing
description: >
  Repairing a partitioned system whose distribution has failed in production: a hash
  distributes keys uniformly and says nothing about traffic, so one celebrity key or one
  large tenant saturates a shard while the map is correct. Covers detection — per-shard
  rate, latency and storage, and the max-to-mean ratio, because an aggregate dashboard hides
  skew; naming the key by top-K sampling; the read-hot, write-hot, storage-hot and
  overloaded-fleet signatures; the repairs and their prices; and the rebalance, with its
  double-ownership window and versioned map. Use when one shard runs far above the others
  while the fleet average looks fine, when a shard is hot before and after a rehash, when
  one tenant dominates a shard, or when a rebalance is planned or is itself the incident.
  Not the mapping function (consistent-hashing), the key choice (sharding-and-partitioning),
  caching (caching-strategies), capping the caller (rate-limiting-and-load-shedding), the
  tail (tail-latency-analysis), or the numbers (latency-statistics).
---

# Hot Partitions And Rebalancing

## Purpose

Repair a distribution that is correct on paper and broken in production. **A suitable hash
can make non-adversarial key placement approximately uniform; it says nothing about traffic,
value size or work per request.** Every shard can hold close to the mean key count while one
is at 100% CPU because a single key receives a large share of requests. Rehashing, more
virtual nodes or more shards can repair placement variance, but cannot divide an indivisible
hot key; they usually move that bottleneck to a different owner.

The failure this prevents is diagnosing the wrong thing. A hot partition and an overloaded
fleet look identical on an aggregate dashboard — elevated p99, elevated error rate — and
their repairs are opposite: one needs a key spread or a cache, the other capacity or load
shedding. The distinguishing evidence is per-shard, and it does not exist unless someone
added the shard label to the metric before the incident.

## Workflow

1. **Measure distribution, normalized by each shard's capacity**, for accepted and offered
   request rate, errors, queueing, latency, CPU/IO, storage and replication lag. Use top-share,
   max/median and a heat map; max/mean is only a screening signal. A ratio near 1 can still
   hide a uniformly saturated fleet, rejected work or heterogeneous instances.
2. **Classify the skew** as read-hot, write-hot, storage-hot or mixed from which ratio is
   elevated. They have different repairs, and a cache fixes exactly one of them. The
   signature table is `references/detecting-skew.md`.
3. **Name the key.** A shard-level metric proves skew exists; it does not say what to fix.
   Sample requests on the hot shard and count by key, or read the store's own top-key
   facility. Cheap sampling techniques are in `references/detecting-skew.md`.
4. **Decide whether the key is intrinsically hot or the key choice is wrong.** One celebrity
   key on an otherwise even distribution is a key-level repair. A shard key whose design
   concentrates traffic — a timestamp, an enum, a tenant id in a power-law fleet — is a key
   problem, and the repair is a migration (`sharding-and-partitioning`).
5. **Apply the narrowest repair that fits the classification**, and price it before shipping:
   salting costs read fan-out, a dedicated shard costs an operational special case, a cache
   costs staleness. `references/repairs-and-rebalancing.md` has each with its condition.
6. **If the repair is a move, treat the move as a distributed protocol.** Version the shard
   map, define the double-ownership window, throttle the copy, and make a stale client unable
   to write to the former owner.
7. **Prove steady state and recovery.** Replay the observed power-law key distribution,
   measure tail amplification and catch-up time, inject stale clients and abort midway.
   Then add bounded-cardinality per-shard detection and alerts on skew plus saturation.

## Decision block

```text
Salt (split) the key across S sub-partitions when:
- one write-hot key exceeds a single shard's write capacity, and reads for that key are rare
  enough, or aggregate in nature, that fanning them out to S is acceptable
Give the tenant a dedicated shard when:
- one known, named tenant is persistently large or hot, the set of such tenants is small and
  changes slowly, and per-tenant isolation is independently valuable
Put a cache in front of the key when:
- the key is READ-hot, the value tolerates the staleness a TTL implies, and the value is
  small enough to cache — a cache does nothing for write skew (caching-strategies)
Coalesce concurrent requests for the key when:
- many identical in-flight reads for one key arrive together; this removes duplicate work
  when identity, authorization, consistency level and response semantics are part of the
  coalescing key; define cancellation and failure sharing explicitly
Split the partition when:
- the store supports online split, the hot range is contiguous, and the skew is a range
  boundary rather than a single key
Do nothing but add capacity when:
- max/mean is near 1 on every per-shard series — the fleet is uniformly loaded, so this is
  capacity-planning or rate-limiting-and-load-shedding, not skew
Change the shard key when:
- the concentration is structural rather than incidental — the key design guarantees it
  recurs. Accept that this is a full migration (sharding-and-partitioning)
```

## Rules

- **Skew is easily hidden by an aggregate.** With N equal shards and one saturated, the fleet
  mean's excess is diluted by roughly N. Report a normalized distribution: maximum or high
  quantile, median, top-shard share and capacity utilization. `max/mean` is useful but highly
  sensitive to one outlier and says nothing about two clusters or heterogeneous capacity.
- Every per-shard metric needs the shard as a label from the beginning. Adding the label
  during an incident is the same as not having it: there is no history to compare against.
- Read-hot, write-hot and storage-hot are three problems. A cache removes read load and does
  nothing for writes; salting spreads writes and makes reads more expensive; a dedicated
  shard addresses all three at the cost of an operational special case. Name the class first.
- **Rehashing is not a repair for a hot key.** The key still has one owner under every
  placement function in `consistent-hashing`; the hash decides _which_ node melts, not
  whether one does.
- Salting is `key#i` for `i` in `[0, S)`: writers route by a deliberate sub-key (random,
  round-robin or an entity identifier), readers query the required buckets and merge. The
  cost includes read fan-out, loss of single-key atomicity/global order, retries and future
  resharding. Choose S from measured per-partition capacity with headroom; random assignment
  can still burst and a deterministic secondary key is preferable when semantics allow it.
- Do not salt every key. Salt the identified hot keys from a list you can update without a
  deploy; otherwise every read in the system pays the fan-out to fix one key.
- **A move creates overlapping copies, not two unconstrained authorities.** Name the sole
  write authority for every phase. Publish a monotonic ownership epoch, require it on every
  mutation, and enforce it at the state transition that commits the write. Rejecting stale
  routing only in a client or proxy is insufficient: paused clients and old owners survive
  cutover. The general fencing mechanism is `distributed-locks-and-leases`.
- Throttle the migration copy explicitly, in bytes or rows per second, and treat it as
  production load. An unthrottled rebalance to relieve a hot shard is a second, larger
  incident caused by the fix.
- Automatic rebalancing without hysteresis oscillates: it moves a partition off a hot node,
  the target becomes hot, and it moves back. Require the threshold to be exceeded for a
  sustained window, cap concurrent moves, and impose a per-partition cool-down.
- A shard-map read must not depend on the data plane it describes. If clients discover
  ownership by querying the shards, the hot shard's saturation makes the map unavailable
  precisely when a rebalance needs it.
- Latency figures from the hot shard are still latency figures: do not average p99 across
  shards to decide whether the fleet is healthy — that is the error `latency-statistics`
  exists to prevent, and the per-shard decomposition is `tail-latency-analysis`.
- Protecting the hot shard by rejecting the excess is legitimate and often the fastest
  mitigation, but it is a per-key limit, not a global one — `rate-limiting-and-load-shedding`
  owns the mechanism.

## Operational invariants

- At most one ownership epoch may commit writes for a partition.
- Every acknowledged pre-cutover write is present at the target before target activation.
- Every accepted post-cutover write is routed to or forwarded into the target epoch.
- Map publication is monotonic, cacheable only with bounded staleness, and observable by
  version; rollback uses a new epoch rather than resurrecting an old one.
- Replica safety is preserved throughout: moving data must not remove enough healthy copies
  to violate the store's durability/quorum rule.
- Source deletion starts only after a retention window, reconciliation and a tested restore
  point. Retention alone is not rollback unless post-cutover writes are reverse-replicated or
  replayable.

## Anti-patterns

| Anti-pattern               | Symptom                                               | Better alternative                                                 |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Average-only dashboard     | fleet looks healthy while one shard rejects work      | normalized per-shard heat maps and top-share                       |
| Key as metric label        | telemetry cardinality becomes the outage              | bounded sketches; protected top-K logs with redaction              |
| Add shards for one hot key | bottleneck changes owner but not capacity             | split/coalesce/cache/isolate the logical key                       |
| Blind salting              | reads fan out, ordering and uniqueness silently break | derive bucket and merge semantics before migration                 |
| Reactive auto-balancer     | partitions ping-pong and copy traffic amplifies load  | prediction, hysteresis, move budget and kill switch                |
| Copy then flip             | writes disappear across snapshot/cutover              | snapshot position, change catch-up, epoch fence and reconciliation |

## References

- [Detecting skew and finding the key](references/detecting-skew.md) — the per-shard metric
  set and the max/mean ratio, the query shapes that expose skew, cheap top-K sampling to name
  the offending key, and the signatures separating read-hot, write-hot, storage-hot and a
  uniformly overloaded fleet. Read at the start of an incident where one shard looks
  different, or when instrumenting a sharded system.
- [Repairs and rebalancing](references/repairs-and-rebalancing.md) — each mitigation with the
  condition that selects it, the salting scheme with its read fan-out cost, the live-migration
  sequence with the double-ownership and shard-map-version rules, and rebalance throttling and
  hysteresis. Read once the hot key is identified, or before moving a partition under load.
