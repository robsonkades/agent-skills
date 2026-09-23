---
name: cache-sharding-and-replication
description: >
  Topology for a cache that no longer fits one node: client-side sharded, proxy-fronted,
  clustered, and fully replicated, compared on failure behaviour, cost and client
  complexity; and why a read after a write on a replicated cache is not read-your-writes.
  Estimates origin load when a cache node fails from its measured request share and the
  surviving copies, routing and capacity — mitigated by
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
restarted for a routine upgrade; with N balanced nodes, consistent hashing and no replicas,
about 1/N of the keyspace loses its cached copy. After fail-fast remapping, requests for those
keys can reach the origin until refill, while survivors continue serving. The cache tier
reports a modest dip in hit rate. The database saturates. Nobody investigating the database
is looking at the cache, because the cache is up.

## Workflow

Before recommending changes, reuse the request, configuration and existing measurements: cache
product/version, relevant clients and runtimes, routing/retry configuration, replica placement,
working-set bytes, per-node request share and origin capacity at the required SLO. Ask only about
unresolved constraints that change the decision, such as permitted stale reads or replica locations;
continue independent analysis with explicit assumptions. This skill is language-independent and
declares no Java baseline or executable Java examples; do not infer support for a client feature
or authorize an upgrade. With missing measurements, provide conditional estimates and the exact
measurement needed, not a production sizing or confirmed incident diagnosis.

1. **Classify the cache first: performance or availability.** If the origin cannot serve the
   full request rate with the cache empty, the cache is an availability component. Separate this
   from durability: the cache does not become the authoritative data store by being essential.
2. **Do the node-loss arithmetic before choosing a topology.** Measure the request share owned by
   each node; `total_rate / N` is only the uniform approximation. Establish which requests
   actually lose a usable cache path: cluster coverage/quorum policy can affect healthy shards
   too. Apply the configured fallback, error or shedding behavior before estimating origin
   demand, including secondary evictions and retries. Compare rate, concurrency,
   query mix and duration to the origin's measured capacity. The worked example is
   `references/node-loss-and-origin-protection.md`.
3. **Choose sharding or full replication from the working set.** If the whole working set
   fits comfortably in one node's memory and reads dominate, replicating everything can remove a
   network hop only when the replica is process-local. It avoids key loss after a node failure if
   routing and remaining capacity work, and costs roughly `N ×` value memory plus metadata.
4. **Choose the topology** — client-sharded, proxy, or clustered — on operational cost and
   client complexity and measured end-to-end latency. The comparison is `references/topologies.md`.
5. **Set the replication factor from step 2**, not from a default. Replication exists here to
   keep the shard served when a node dies; if the arithmetic says the origin survives a node
   loss, RF=1 is a legitimate, cheaper answer. RF counts all copies including the primary;
   place them across the failure domains being protected and check promotion/quorum requirements.
6. **Exercise failure under load**—crash, partition/timeout, promotion and rejoin—and assert bounds
   on origin rate/concurrency, client errors and recovery, not only cache hit rate.
7. **Add a local L1 only for a measured reason**, and accept that invalidation now has to
   reach every instance's L1 as well as the shared tier.

## Decision block

```text
Sharded cache (each key has an owner shard, with optional replicas) when:
- the working set exceeds one node's memory, or memory cost makes N copies unattractive
- writes and invalidations are frequent enough that keeping N copies converged is work
Fully replicated cache (every node holds everything) when:
- the working set fits one node's memory with headroom, reads dominate heavily, and the
  value of surviving node loss exceeds N × memory; only process-local copies remove the hop
- typically the shape of small reference data: feature flags, rates, configuration
Replicate each shard (RF > 1) when:
- the measured node-loss arithmetic exceeds origin headroom
- or one shard is read-hot and the product can route reads to replicas within the required
  consistency model
Keep RF = 1 when:
- the origin demonstrably absorbs a node loss, and the memory is better spent on a larger
  working set; replicas can also serve reads if the product and consistency contract allow it
Prefer a proxy or a clustered cache over client-side sharding when:
- its routing/discovery protocol reduces coordination across numerous or polyglot clients;
  check actual client capabilities, because dynamic client-side membership can also avoid deploys
Prefer client-side sharding when:
- clients are few and share a runtime, and the extra network hop is a measurable share of
  the cache's own latency — the point of a cache is that it is fast
Adding owner shards does not split a hot key:
- replica reads may distribute its read load if the product, routing and consistency contract
  allow it; adding a shard alone does not divide the key's work (hot-partitions-and-rebalancing)
```

## Rules

- **Losing a cache node is an origin-load event.** Size the origin, or the protection in
  front of it, for the loss of one cache node — that is a routine occurrence (upgrade,
  eviction, spot reclaim), not a disaster scenario.
- A rolling restart can cause repeated remapping or replica promotion. Gate each next restart
  on origin headroom, client SLOs and restored replica readiness, not just recovered hit rate.
- Stable placement limits movement: changing N in `hash(key) % N` can remap a large fraction,
  depending on the divisors and node-index mapping. The moved keys' request share, surviving
  copies and refill policy determine miss traffic; compare resulting origin demand with measured
  capacity before predicting an outage. Consistent hashing is one option; fixed slots can also
  preserve placement. The mapping function belongs to `consistent-hashing`.
- Node loss has a **second-order** cost when keys remap and refill on survivors: their
  memory did not grow, so insufficient headroom can raise evictions on previously healthy shards.
  Measure this effect rather than assuming the hit-rate dip equals the lost key share.
- **Replication alone does not give read-your-writes.** With asynchronous replication, a write
  acknowledged by one replica and a read served by another may return the old value. If the requirement is that a
  user sees their own change, route to a copy known to have applied that write, or bypass stale
  cache copies and read an origin endpoint that supplies the guarantee. Arbitrary replica affinity
  and invalidation alone are insufficient; promotion may lose an acknowledged write.
  `consistency-models` owns the guarantee, including the behavior across failover.
- Replication guarantees are product/configuration-specific. Asynchronous replicas have no useful
  convergence deadline unless lag is bounded and monitored. TTL bounds how long a missed
  invalidation can survive only if expiry forces a correct reload; it is not a consistency proof.
- Client-side sharding puts the topology in every client. Adding a node means every client
  must use compatible node lists, virtual-node counts and hashes; overlapping versions need
  an explicit migration/invalidation protocol. A
  disagreement is two clients writing the same key to two different nodes, and both of them
  may read stale. Distribute membership through one source, versioned; versioning alone does
  not make an overlapping rollout coherent.
- Replica and L1 placement must respect data-access and residency constraints. Preserve tenant
  and authorization distinctions in keys and access checks; a key prefix is not access control.
  Check whether one tenant's refill can consume the shared origin budget before widening replication.
- A proxy costs one extra network hop on the cache path, which is the path chosen for being
  fast. Measure hit and miss paths and end-to-end tail latency against their budgets. A slow
  origin does not justify violating the cache-hit latency target. Weigh that cost against
  simpler routing coordination and topology changes without client deploys where supported.
- A clustered cache with server-owned placement moves membership out of application config.
  Cross-slot multi-key semantics vary by product; Redis Cluster rejects many such operations,
  while other systems coordinate them at extra latency/availability cost. Check the exact command
  and failure contract against the access pattern.
- **A near-cache (local L1 in front of the shared L2) is a second cache with its own
  coherence problem**, and it is per-instance. An L2 acknowledgement alone does not establish
  that every L1 is current; a product may propagate invalidations, with delivery/loss-recovery
  semantics to verify. `caching-strategies` owns that protocol and the source-age budget across
  layers; the topology consequence is up to `instances caching the key + RF` copies per key,
  excluding temporary migration copies.
- Every entry crossing the network is serialised, so the value size is a throughput decision,
  not a detail. A large value multiplied by the fan-out of a warm-up is a network incident —
  `serialization-performance` owns the format cost.

## Deliverable

Scale the result to the task. For a topology decision, return the recommendation (including
keeping the current design), the materially relevant alternative and why it loses, measured
inputs versus assumptions, node-loss origin-load estimate, replica placement/read policy, and
failure-test acceptance bounds with rollout abort criteria. State what evidence would change
the decision. Stop discovery when the remaining unknowns do not change it; otherwise name the
specific measurement or experiment needed. An incident diagnosis need not choose a replacement
topology: distinguish observed timing/counters from the cache-loss hypothesis and name evidence
that would refute it. State which checks actually ran; a paper estimate is not demonstrated
failure tolerance.

## Primary sources

- [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)
- [Hazelcast 5.6 Near Cache](https://docs.hazelcast.com/hazelcast/5.6/cluster-performance/near-cache) —
  an example of invalidation propagation and loss reconciliation, not a universal L1 guarantee.
- [Amazon Dynamo paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)

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
