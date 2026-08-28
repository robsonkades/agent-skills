---
name: cache-sharding-and-replication
description: >
  Topology for a cache that no longer fits one node: client-side sharded, proxy-fronted,
  clustered, and fully replicated, compared on failure behaviour, cost and client
  complexity; and why a read after a write on a replicated cache is not read-your-writes.
  Owns the arithmetic nobody does before an incident: removing one of N nodes remaps about
  1/N of keys and every one of those misses hits the origin at once — mitigated by
  replication, warming, coalescing and admission control. Use when choosing between client
  sharding, a proxy and cluster mode, when a cache node loss or rolling restart took the
  database with it, when replicas of a cache disagree, or when deciding between sharding the
  cache and replicating all of it. Does not cover whether to cache, TTL, stampede or
  invalidation (caching-strategies), the key-to-node mapping (consistent-hashing), a single
  hot cache key (hot-partitions-and-rebalancing), entry serialisation cost
  (serialization-performance), or what a replicated read observes (consistency-models).
---

# Cache Sharding And Replication

## Purpose

Decide how a cache is laid out across nodes, and what happens when one of those nodes goes
away. This is a topology skill only: whether to cache, how long to keep an entry, and how to
invalidate it are `caching-strategies`, and everything here assumes those decisions are
already made.

The failure this prevents is the one that never looks like a cache incident. A cache node is
restarted for a routine upgrade; with N nodes and consistent hashing, about 1/N of the
keyspace instantly has no cached copy; every request for those keys becomes an origin
request, all at once, while the rest of the cache continues serving normally. The cache tier
reports a modest dip in hit rate. The database saturates. Nobody investigating the database
is looking at the cache, because the cache is up.

## Workflow

1. **Classify the cache first: performance or availability.** If the origin cannot serve the
   full request rate with the cache empty, the cache is an availability component, and every
   topology decision below is a durability decision. Say which one it is out loud.
2. **Do the node-loss arithmetic before choosing a topology.** Losing one of N nodes sends
   about `total_rate / N` requests to the origin as misses, on top of the existing miss rate.
   Compare that number to the origin's measured capacity. The worked example is
   `references/node-loss-and-origin-protection.md`.
3. **Choose sharding or full replication from the working set.** If the whole working set
   fits comfortably in one node's memory and reads dominate, replicating everything to every
   node removes the network hop and the node-loss problem entirely, and costs `N ×` memory.
4. **Choose the topology** — client-sharded, proxy, or clustered — on operational cost and
   client complexity, not performance. The comparison is `references/topologies.md`.
5. **Set the replication factor from step 2**, not from a default. Replication exists here to
   keep the shard served when a node dies; if the arithmetic says the origin survives a node
   loss, RF=1 is a legitimate, cheaper answer.
6. **Test it by killing a node under load** and asserting a bound on the origin's request
   rate, not on the cache's hit rate. That test is the only proof that any of this works.
7. **Add a local L1 only for a measured reason**, and accept that invalidation now has to
   reach every instance's L1 as well as the shared tier.

## Decision block

```text
Sharded cache (each key on one node, mapped by consistent-hashing) when:
- the working set exceeds one node's memory, or memory cost makes N copies unattractive
- writes and invalidations are frequent enough that keeping N copies converged is work
Fully replicated cache (every node holds everything) when:
- the working set fits one node's memory with headroom, reads dominate heavily, and the
  value of removing both the network hop and the node-loss miss storm exceeds N × memory
- typically the shape of small reference data: feature flags, rates, configuration
Replicate each shard (RF > 1) when:
- the node-loss arithmetic says the origin cannot absorb total_rate / N extra misses
- or one shard is read-hot and a second copy adds read throughput for that shard
Keep RF = 1 when:
- the origin demonstrably absorbs a node loss, and the memory is better spent on a larger
  working set — a bigger cache reduces misses every second, RF > 1 only helps on failure
Prefer a proxy or a clustered cache over client-side sharding when:
- clients are polyglot, numerous, or cannot be redeployed together; the topology then
  changes without touching them
Prefer client-side sharding when:
- clients are few and share a runtime, and the extra network hop is a measurable share of
  the cache's own latency — the point of a cache is that it is fast
Do not add a cache node to fix a hot key:
- one key has one owner under every mapping function (hot-partitions-and-rebalancing)
```

## Rules

- **Losing a cache node is an origin-load event.** Size the origin, or the protection in
  front of it, for the loss of one cache node — that is a routine occurrence (upgrade,
  eviction, spot reclaim), not a disaster scenario.
- A rolling restart of the cache tier is N sequential node losses. Without a pause between
  nodes long enough to re-warm, it is a sustained elevated miss rate for the whole rollout,
  and it is self-inflicted. Restart one node at a time, with a wait keyed to the observed
  recovery of the hit rate.
- Consistent hashing is what makes a node loss survivable at all: `hash(key) % N` remaps
  nearly the entire keyspace on a membership change, turning one node's loss into a total
  miss storm. The mapping function belongs to `consistent-hashing`; this is the consequence.
- Node loss has a **second-order** cost: the remapped keys land on the surviving nodes, whose
  memory did not grow, so eviction rises on shards that were previously fine. The hit-rate
  dip is therefore larger than 1/N and lasts beyond the re-warm.
- **A replicated cache does not give read-your-writes.** A write applied to one replica and a
  read served by another returns the old value with no error. If the requirement is that a
  user sees their own change, pin that session's reads to one replica, or invalidate and read
  through the origin — `consistency-models` owns the guarantee, this is where it bites.
- Replication of a cache is best-effort by construction: replicas converge, and "eventually"
  has no deadline unless you measure and alert on the lag. A TTL is the bound that makes
  divergence self-correcting; a cache entry with no TTL and a missed invalidation is
  permanently wrong on some replicas and correct on others.
- Client-side sharding puts the topology in every client. Adding a node means every client
  must agree, at the same time, on the same node list, virtual-node count and hash — a
  disagreement is two clients writing the same key to two different nodes, and both of them
  read stale. Distribute membership through one source, versioned.
- A proxy costs one extra network hop on the cache path, which is the path chosen for being
  fast. Measure the hop against `T_source` before rejecting it: a fraction of a millisecond
  in front of a source costing tens of milliseconds is usually the right trade, and it buys
  topology changes without client deploys.
- A clustered cache with its own slot mapping moves membership into the server, and its
  multi-key operations are constrained to keys hashing to the same slot — primitives and
  transactions across slots are not available. Check that against the access pattern before
  adopting the mode, not after.
- **A near-cache (local L1 in front of the shared L2) is a second cache with its own
  coherence problem**, and it is per-instance: invalidating the L2 invalidates no L1.
  `caching-strategies` owns invalidation propagation and the L1 TTL as the safety net; the
  topology consequence is that the copies to invalidate now number `instances + replicas`.
- Every entry crossing the network is serialised, so the value size is a throughput decision,
  not a detail. A large value multiplied by the fan-out of a warm-up is a network incident —
  `serialization-performance` owns the format cost.

## References

- [Cache topologies](references/topologies.md) — client-side sharded, proxy-fronted,
  clustered and fully replicated compared on failure behaviour, operational cost, client
  complexity and consistency, with the near-cache layer and a decision table. Read when
  choosing or changing a topology, or when a client library's sharding is in question.
- [Node loss and origin protection](references/node-loss-and-origin-protection.md) — the miss
  storm computed from real numbers, replication factor as the lever, warming, coalescing,
  origin admission control, and the kill-a-node-under-load test with the bound it asserts.
  Read before sizing a cache tier, after any incident where the origin saturated, or when
  planning a cache upgrade or restart.
