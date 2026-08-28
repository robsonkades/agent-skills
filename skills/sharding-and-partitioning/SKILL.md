---
name: sharding-and-partitioning
description: >
  Whether to split data across owners at all, and on which key: what sharding buys — write
  capacity, data volume, blast-radius isolation — against what it permanently costs: no
  cross-shard atomicity or joins, fan-out for any keyless query, rebalancing as standing
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

Decide whether to shard, and — only then — on what key. Sharding is the one scaling decision
that is effectively irreversible: the key is baked into every query, every index, every
routing table and every backfill job, and changing it later is a second migration of the
whole dataset. Everything else on the scaling menu can be undone in an afternoon.

The failure this prevents is sharding a system that did not need it. A read-heavy service
gets sharded, keeps its single-node write rate, loses joins and transactions, gains a shard
map and a rebalancing story, and is _slower_ — the query that hit one index now fans out and
waits for the slowest shard. The second failure is the key chosen from the domain model
rather than the query log, discovered when the query that omits it becomes the main feature.

## Workflow

1. **Name the resource that is actually exhausted**, with a number: write IOPS, storage
   bytes, working-set-to-RAM ratio, or blast radius. "It is growing" is not a resource. If
   the constraint is read throughput or read latency, stop — sharding is the wrong tool.
2. **Exhaust the cheaper options first** and record why each was rejected: a bigger node,
   read replicas, a cache, retention and archiving, or moving cold columns out. The table of
   alternatives and the condition that selects each is `references/deciding-to-shard.md`.
3. **Take the query log, not the schema.** Enumerate the top queries by rate and by cost, and
   for each candidate key record whether the key is present. A key that appears in fewer than
   the overwhelming majority of queries by volume commits you to fan-out as the normal case.
4. **Score the candidate key** on query coverage, cardinality, traffic uniformity,
   immutability and growth (`references/deciding-to-shard.md`). Uniform by _traffic_, not by
   row count: an even row split with one tenant sending most of the writes is a skewed set.
5. **Write down what the key forbids** before committing: the queries that become
   scatter-gather, the transactions that become multi-shard, the unique constraints that stop
   being enforceable, the foreign keys that must go. If that list is unacceptable, the key is
   wrong — or sharding is.
6. **Choose the partitioning strategy from the access pattern** — range for ordered scans,
   hash for uniform placement without range queries, a directory for flexibility at the cost
   of a hop and a new dependency, per-tenant for isolation. The mapping function itself is
   `consistent-hashing`.
7. **Plan the migration before the design review ends**: dual-write, backfill, verify, cut
   over, keep the rollback — `references/what-sharding-forbids.md`.

## Decision block

```text
Shard when:
- write throughput or write IOPS is saturated on the largest instance you can buy
- the dataset outgrows one node's storage, or its working set outgrows one node's RAM
- one failure domain is unacceptable: a corruption, a runaway query or a restore must affect
  a bounded fraction of tenants rather than all of them
- a key exists that is present in the overwhelming majority of queries by volume, is
  immutable per row, and has cardinality far exceeding the intended shard count
Avoid sharding when:
- the bottleneck is read throughput or read latency — replicas and a cache address that
  without giving up joins or transactions
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
- A low-cardinality key (status, region, plan tier) caps the shard count at its cardinality
  and pins each value's whole traffic to one shard. Cardinality must exceed the shard count
  by orders of magnitude, not by a factor.
- Tenant id is the correct key only when no tenant can outgrow a shard. In any fleet with a
  power-law tenant size distribution, the largest tenant becomes a single-shard problem;
  plan a composite key or a dedicated shard for it up front.
- **A cross-shard write is not a transaction.** Two shards are two independent stores; a
  failure between them leaves the system inconsistent unless a saga or a two-phase protocol
  is in place (`distributed-transactions-and-sagas`). Never write "we will use a transaction"
  in a sharded design without naming the boundary it holds within.
- Unique constraints hold **within a shard only**. Global uniqueness needs either the unique
  column as the shard key, or a separate single-owner allocator or uniqueness table — and
  that table is then an availability dependency of every write.
- `AUTO_INCREMENT` per shard produces colliding ids. Choose the id scheme with the key —
  per-shard offset ranges, a UUIDv4, a time-ordered id with a node component, or a central
  block allocator; they differ in index locality and coordination cost, and the comparison is
  in `references/what-sharding-forbids.md`.
- Any query lacking the shard key becomes scatter-gather: its latency is the maximum over N
  shards, not the mean, so it inherits every shard's tail — `tail-latency-analysis` for the
  amplification, `scatter-gather` for the mechanics.
- **A shard is a failure domain, and sharding multiplies the number of things that can
  fail.** With N independent shards and any-shard-down counting as an outage, availability
  falls as N rises unless each shard is itself replicated. Blast-radius isolation is a real
  benefit only when the application degrades per-shard instead of failing whole
  (`failure-models`).
- The shard map is a distributed system: it must be versioned, readable when the data plane
  is unhealthy, and able to stop a stale client writing to a former owner — the fencing rules
  are `hot-partitions-and-rebalancing`.
- Never migrate by "stop writes, copy, restart". Dual-write, backfill, verify by comparison,
  then cut reads over with a flag you can flip back.

## References

- [Deciding to shard, and on what key](references/deciding-to-shard.md) — the alternatives
  with the observable condition that selects each, the shard-key scorecard, the wrong-key
  catalogue with the failure each produces, and the four partitioning strategies compared.
  Read before agreeing that a system needs sharding, and again when a key is proposed.
- [What sharding forbids, and the migration](references/what-sharding-forbids.md) —
  cross-shard reads and writes, global uniqueness and id generation compared by mechanism,
  referential integrity, and the dual-write/backfill/verify/cut-over sequence with its
  failure points. Read when designing around a chosen key, or when planning the move from
  one database to many.
