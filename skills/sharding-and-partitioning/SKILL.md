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
waits for the slowest required shard. The second failure is a key chosen without comparing
domain consistency boundaries with the measured query/workload mix.

## Workflow

1. **Name the resource/SLO actually constrained**, with workload distribution: read/write
   CPU/IOPS, storage/working set, lock/index contention, locality/residency, restore time or
   blast radius. Sharding can scale reads and improve locality too, but replicas/cache/global
   indexes may be cheaper depending on consistency and query shape.
2. **Exhaust the cheaper options first** and record why each was rejected: a bigger node,
   read replicas, a cache, retention and archiving, or moving cold columns out. The table of
   alternatives and the condition that selects each is `references/deciding-to-shard.md`.
3. **Combine query evidence with consistency boundaries.** Enumerate operations by rate, cost
   and SLO criticality; for each candidate key record direct routing, index/directory lookup,
   fan-out and write-transaction scope. Key presence alone does not determine query routing.
4. **Score the candidate key** on query coverage, cardinality, traffic uniformity,
   key stability and growth (`references/deciding-to-shard.md`). Uniform by _traffic_, not by
   row count: an even row split with one tenant sending most of the writes is a skewed set.
5. **Write down which operations lose locality** before committing: keyless queries, joins,
   transactions, uniqueness and referential checks. Some distributed databases implement
   these globally; price their coordination, latency, availability and hotspot behavior rather
   than declaring them impossible.
6. **Choose the partitioning strategy from the access pattern** — range for ordered scans,
   hash for point routing with extra work for global ranges, a directory for flexibility with
   lookup/cache/fencing costs, per-tenant placement for isolation. The mapping function itself is
   `consistent-hashing`.
7. **Plan migration and resharding before review ends**: authoritative change stream/outbox,
   version-aware backfill, continuous verification, ownership epochs, cutover and a rollback
   that includes post-cutover deltas — `references/what-sharding-forbids.md`.

Inspect the target datastore/version, partitioner, driver/ORM and transaction configuration;
logical partition, physical node and failure domain are not interchangeable. This skill has no
Java API baseline or executable Java example: adapt guidance to the project's toolchain without
adding libraries or upgrading it. Report the chosen boundary/key, rejected alternatives with
evidence, operation-locality changes and migration/rollback checks. Missing workload or topology
evidence makes the choice conditional; identify the measurement needed before commitment.

## Decision block

```text
Shard when:
- read/write throughput, storage, locality or recovery/isolation objective cannot be met
  economically by a single ownership domain
- measured storage/IO/working-set pressure cannot meet the objective on an acceptable node
- one failure domain is unacceptable: a corruption, a runaway query or a restore must affect
  a bounded fraction of tenants rather than all of them
- a key has sufficient splittability, stable routing and affordable access paths for the
  measured operation mix, including critical low-volume queries and transactions
Avoid sharding when:
- replicas, indexes, cache or vertical scaling meet the read SLO and consistency contract more
  cheaply than distributed ownership
- one ownership domain meets the measured objectives; fitting RAM alone does not establish this
- permitted retention/archiving solves the constraint without violating required history
- the argument is "future scale" and there is no measured growth curve with a date on it
- every candidate needs non-local coordination whose measured cost violates the objective
Prefer instead:
- read replicas or a cache (caching-strategies) when reads dominate
- vertical scaling plus permitted retention/archiving when forecast headroom covers migration lead time
- moving the state out of the process (stateless-service-design) when the thing being split
  is per-instance state rather than stored data
- table partitioning inside one node when the goal is bulk deletion by time — drop-partition
  preserves local joins/transactions but requires checking product-specific constraints and locks
```

## Rules

- **Uniform by rows is not uniform by traffic.** Evaluate a candidate key against per-key
  request rate and byte volume, not `COUNT(*) GROUP BY key`. Key distribution is
  `consistent-hashing`; traffic skew is `hot-partitions-and-rebalancing`, and no hash
  function prevents it.
- A globally monotonic leading key sends current inserts toward the newest range under
  simple range partitioning. Hash/shard prefixes or independent leading tenant keys can spread
  writes, at the cost of more scan/merge work for a global ordered query. Test the actual key order.
- A low-cardinality key caps direct buckets and pins each value's traffic unless combined with
  a secondary dimension. Required headroom depends on skew, split strategy and target shard
  count; “orders of magnitude” is not a universal threshold.
- An indivisible tenant key limits that tenant to its owner's capacity. Dedicated placement
  can isolate noisy neighbors but cannot make an oversized tenant fit the same-capacity shard.
  Compare a larger owner with a splittable composite key and the cost of losing tenant locality.
- A cross-shard write is not atomically committed **merely because each shard uses a local
  transaction**. A datastore may provide distributed transactions; otherwise use a saga/
  coordination protocol and expose intermediate/recovery semantics
  (`distributed-transactions-and-sagas`). Name participants, isolation, failure recovery and
  latency rather than writing only “transaction”.
- Local unique constraints hold within their enforcement domain. Global uniqueness needs
  datastore-supported global indexes/transactions, the unique
  column as a correctly canonicalized routing key plus owner-local enforcement, or a separate
  claim service/table. Define collation, normalization, null policy and stale-owner fencing;
  the claim service is an availability dependency of operations needing that uniqueness claim.
- Identically configured `AUTO_INCREMENT` sequences per independent shard collide globally.
  Choose the id scheme with the key —
  per-shard offset ranges, a UUIDv4, a time-ordered id with a node component, or a central
  block allocator; they differ in index locality and coordination cost, and the comparison is
  in `references/what-sharding-forbids.md`.
- A query lacking routing information needs a global/local secondary index, directory,
  replicated view or scatter-gather. For all-shard gather, latency includes the maximum required
  leaf and availability follows joint failure; `scatter-gather` owns the mechanics.
- A logical shard is an ownership unit; failure isolation depends on physical placement,
  replicas and shared infrastructure. More independent components can increase incidents. A
  keyed request usually depends on one shard, so user availability is traffic-weighted; an
  all-shard query depends on all required shards and can amplify failures. Blast-radius isolation
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
