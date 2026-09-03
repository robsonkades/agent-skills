---
name: sharding-and-partitioning
description: >
  Whether to split data across owners at all, and on which key: what sharding buys — write
  capacity, locality, data volume and isolation — against distributed transactions/indexes,
  non-local query routing, rebalancing as standing
  work, and a shard map that is itself a distributed system; the alternatives that usually
  win; the shard-key scorecard and classic wrong keys. Use when sharding is proposed for
  future scale with no measured growth curve, when a table is called too big before
  retention is checked, when a shard key is chosen or changed, when a query appears that
  does not carry the key, or when cross-shard joins or unique constraints are discussed.
  Does not cover the mapping function (consistent-hashing), a distribution already gone
  wrong (hot-partitions-and-rebalancing), sharding a cache (cache-sharding-and-replication),
  keyless-query fan-out (scatter-gather), replica interchangeability
  (stateless-service-design), or what a cross-shard read observes (consistency-models).
---

# Sharding And Partitioning

## Purpose

Decide whether to distribute ownership and—only then—on what key and using which datastore
semantics. Sharding is reversible only through an expensive data/contract migration: the key
affects routing, locality, indexes, transactions and backfills. Preserve an abstraction and
versioned mapping so evolution is possible; do not call any infrastructure alternative an
afternoon rollback without evidence.

The failure this prevents is sharding a system that did not need it. A read-heavy service
gets sharded, keeps its single-node write rate, loses joins and transactions, gains a shard
map and a rebalancing story, and is _slower_ — the query that hit one index now fans out and
waits for the slowest shard. The second failure is the key chosen from the domain model
rather than the query log, discovered when the query that omits it becomes the main feature.

## Workflow

1. **Name the resource/SLO actually constrained**, with workload distribution: read/write
   CPU/IOPS, storage/working set, lock/index contention, locality/residency, restore time or
   blast radius. Sharding can scale reads and improve locality too, but replicas/cache/global
   indexes may be cheaper depending on consistency and query shape.
2. **Exhaust the cheaper options first** and record why each was rejected: a bigger node,
   read replicas, a cache, retention and archiving, or moving cold columns out. The table of
   alternatives and the condition that selects each is `references/deciding-to-shard.md`.
3. **Take the query log, not the schema.** Enumerate the top queries by rate and by cost, and
   for each candidate key record whether the key is present. A key that appears in fewer than
   the overwhelming majority of queries by volume commits you to fan-out as the normal case.
4. **Score the candidate key** on query coverage, cardinality, traffic uniformity,
   immutability and growth (`references/deciding-to-shard.md`). Uniform by _traffic_, not by
   row count: an even row split with one tenant sending most of the writes is a skewed set.
5. **Write down which operations lose locality** before committing: keyless queries, joins,
   transactions, uniqueness and referential checks. Some distributed databases implement
   these globally; price their coordination, latency, availability and hotspot behavior rather
   than declaring them impossible.
6. **Choose the partitioning strategy from the access pattern** — range for ordered scans,
   hash for uniform placement without range queries, a directory for flexibility at the cost
   of a hop and a new dependency, per-tenant for isolation. The mapping function itself is
   `consistent-hashing`.
7. **Plan migration and resharding before review ends**: authoritative change stream/outbox,
   version-aware backfill, continuous verification, ownership epochs, cutover and a rollback
   that includes post-cutover deltas — `references/what-sharding-forbids.md`.

## Decision block

```text
Shard when:
- read/write throughput, storage, locality or recovery/isolation objective cannot be met
  economically by a single ownership domain
- the dataset outgrows one node's storage, or its working set outgrows one node's RAM
- one failure domain is unacceptable: a corruption, a runaway query or a restore must affect
  a bounded fraction of tenants rather than all of them
- a key exists that is present in the overwhelming majority of queries by volume, is
  immutable per row, and has cardinality far exceeding the intended shard count
Avoid sharding when:
- replicas, indexes, cache or vertical scaling meet the read SLO and consistency contract more
  cheaply than distributed ownership
- the working set fits one node's memory, whatever the total table size
- growth is retention rather than volume: the table is large because nothing is ever deleted
- the argument is "future scale" and there is no measured growth curve with a date on it
- no candidate key covers the queries, so the design already depends on fan-out
Prefer instead:
- read replicas or a cache (caching-strategies) when reads dominate
- vertical scaling plus retention and archiving when the growth curve gives you a year
- moving the state out of the process (stateless-service-design) when the thing being split
  is per-instance state rather than stored data
- table partitioning inside one node when the goal is bulk deletion by time — drop-partition
  without giving up joins or transactions
```

## Rules

- **Uniform by rows is not uniform by traffic.** Evaluate a candidate key against per-key
  request rate and byte volume, not `COUNT(*) GROUP BY key`. Key distribution is
  `consistent-hashing`; traffic skew is `hot-partitions-and-rebalancing`, and no hash
  function prevents it.
- A monotonic key — timestamp, `AUTO_INCREMENT`, a time-ordered UUID — sends every insert to
  the newest range under range partitioning. The hotspot is the whole point of the key being
  ordered; you cannot have both.
- A low-cardinality key caps direct buckets and pins each value's traffic unless combined with
  a secondary dimension. Required headroom depends on skew, split strategy and target shard
  count; “orders of magnitude” is not a universal threshold.
- Tenant id is the correct key only when no tenant can outgrow a shard. In any fleet with a
  power-law tenant size distribution, the largest tenant becomes a single-shard problem;
  plan a composite key or a dedicated shard for it up front.
- A cross-shard write is not atomically committed **merely because each shard uses a local
  transaction**. A datastore may provide distributed transactions; otherwise use a saga/
  coordination protocol and expose intermediate/recovery semantics
  (`distributed-transactions-and-sagas`). Name participants, isolation, failure recovery and
  latency rather than writing only “transaction”.
- Local unique constraints hold within their enforcement domain. Global uniqueness needs
  datastore-supported global indexes/transactions, the unique
  column as the shard key, or a separate single-owner allocator or uniqueness table — and
  that table is then an availability dependency of every write.
- Identically configured `AUTO_INCREMENT` sequences per independent shard collide globally.
  Choose the id scheme with the key —
  per-shard offset ranges, a UUIDv4, a time-ordered id with a node component, or a central
  block allocator; they differ in index locality and coordination cost, and the comparison is
  in `references/what-sharding-forbids.md`.
- A query lacking routing information needs a global/local secondary index, directory,
  replicated view or scatter-gather. For all-shard gather, latency includes the maximum required
  leaf and availability follows joint failure; `scatter-gather` owns the mechanics.
- A shard is an ownership/failure domain and more shards create more component incidents. A
  keyed request usually depends on one shard, so user availability is traffic-weighted; an
  all-shard query depends on all required shards and amplifies failure. Blast-radius isolation
  is a benefit only when routing/degradation contains the failure
  (`failure-models`).
- The shard map is a distributed system: it must be versioned, readable when the data plane
  is unhealthy, and able to stop a stale client writing to a former owner — the fencing rules
  are `hot-partitions-and-rebalancing`.
- Choose offline migration when a measured write freeze fits the agreed availability budget—it
  is simpler and can be safer. For online migration, avoid uncoordinated application dual-write;
  use one authoritative commit plus outbox/CDC/log, resumable version-aware backfill,
  reconciliation and fenced cutover.

## Decision record requirements

- forecast with ranges and trigger date, including skew/hot-key growth and restore time;
- query/workload coverage by rate, bytes and service cost—not only row count;
- per-operation consistency, transaction and uniqueness scope;
- mapping/directory availability, cache staleness and stale-client fencing;
- resharding bandwidth, write amplification, replica/quorum safety and rollback log horizon;
- tenant isolation/noisy-neighbor, residency, encryption key and backup/restore boundaries;
- cost model for steady state, peak, rebalancing and operator/on-call complexity.

## References

- [Deciding to shard, and on what key](references/deciding-to-shard.md) — the alternatives
  with the observable condition that selects each, the shard-key scorecard, the wrong-key
  catalogue with the failure each produces, and the four partitioning strategies compared.
  Read before agreeing that a system needs sharding, and again when a key is proposed.
- [What sharding makes distributed, and the migration](references/what-sharding-forbids.md) —
  cross-shard reads and writes, global uniqueness and id generation compared by mechanism,
  referential integrity, and the dual-write/backfill/verify/cut-over sequence with its
  failure points. Read when designing around a chosen key, or when planning the move from
  one database to many.
