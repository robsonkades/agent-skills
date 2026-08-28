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

Repair a distribution that is correct on paper and broken in production. **A hash function
distributes keys uniformly; it never distributes traffic.** Every shard can hold within a few
per cent of the mean number of keys while one of them is at 100% CPU, because one key on it
is receiving a large share of the requests. Rehashing does not help, raising the virtual-node
count does not help, and adding shards moves the hot key to a different machine.

The failure this prevents is diagnosing the wrong thing. A hot partition and an overloaded
fleet look identical on an aggregate dashboard — elevated p99, elevated error rate — and
their repairs are opposite: one needs a key spread or a cache, the other capacity or load
shedding. The distinguishing evidence is per-shard, and it does not exist unless someone
added the shard label to the metric before the incident.

## Workflow

1. **Get the max-to-mean ratio, per shard, for four series**: request rate, p99 latency,
   storage bytes and CPU. A ratio near 1 across all four means the fleet is uniformly loaded
   and this is a capacity problem, not a skew problem. Stop here if so.
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
7. **Add the detection you did not have.** The per-shard metric with a max/mean ratio and an
   alert on it, so the next occurrence is caught by a dashboard rather than by a user.

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
  with no staleness cost at all, and composes with a cache rather than replacing it
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

- **Skew is invisible in an aggregate.** With N shards and one saturated, the fleet mean
  moves by roughly 1/N and every dashboard stays green. Report `max(by shard) / avg(by
shard)` as a first-class series; it is the only number that makes skew monitorable.
- Every per-shard metric needs the shard as a label from the beginning. Adding the label
  during an incident is the same as not having it: there is no history to compare against.
- Read-hot, write-hot and storage-hot are three problems. A cache removes read load and does
  nothing for writes; salting spreads writes and makes reads more expensive; a dedicated
  shard addresses all three at the cost of an operational special case. Name the class first.
- **Rehashing is not a repair for a hot key.** The key still has one owner under every
  placement function in `consistent-hashing`; the hash decides _which_ node melts, not
  whether one does.
- Salting is `key#i` for `i` in `[0, S)`: writers pick a suffix at random or round-robin,
  readers must read all S and merge. **The read fan-out is the cost and it is permanent** —
  choose S as small as the write rate allows, and never salt a key whose dominant access is a
  point read.
- Do not salt every key. Salt the identified hot keys from a list you can update without a
  deploy; otherwise every read in the system pays the fan-out to fix one key.
- **A partition has one owner at a time — except during a move, when it has two.** That
  window is a correctness problem, not a performance one: a write to the old owner after the
  new one took over is lost silently. The shard map must be versioned and the old owner must
  reject writes stamped with a stale version — fencing, whose general mechanism is
  `distributed-locks-and-leases`.
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
