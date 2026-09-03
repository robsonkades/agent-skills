# Deciding to shard, and on what key

Two decisions, in order. First prove which ownership/resource boundary must change with
measured alternatives; then choose a key/strategy. “Not yet” is common, but do not make the
answer dogmatic when residency, isolation or recovery—not raw capacity—is the driver.

## The alternatives, and the condition that selects each

| Option                      | Selected when                                                                                    | Buys                                             | Costs                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| Bigger node                 | Vertical headroom meets SLO/cost/availability horizon                                            | Preserves application data model                 | Cost/ceiling, larger failure/restore domain, resize interruption risk |
| Read replicas               | Read QPS or read CPU saturates while write rate is comfortable                                   | Read throughput, geographic read locality        | Replication lag becomes visible to clients — `consistency-models`     |
| Cache                       | A small key set serves a large share of reads, and `h × T_source` justifies it                   | Removes reads before they reach the store        | Staleness and invalidation — `caching-strategies` owns the decision   |
| Retention / archiving       | Storage grows because nothing is deleted; queries touch only recent rows                         | Storage and index size, restore time             | A deletion policy someone must own, and an archive read path          |
| Native table partitioning   | Growth is time-ordered and bulk deletion by age is the real requirement                          | `DROP PARTITION` instead of a bulk `DELETE`      | Still one node — no write-capacity or blast-radius gain               |
| Splitting off one hot table | One table dominates writes and is only loosely joined to the rest                                | Buys time without a key decision                 | Two stores to operate; the join you thought was loose usually is not  |
| **Sharding**                | Write throughput, storage or blast radius is exhausted on the largest node, **and** a key exists | Capacity beyond one node; per-shard blast radius | Everything below                                                      |

Rejecting an option requires the measurement that rejects it, recorded. "Replicas would not
help" is admissible only next to a write-rate number.

## The trajectory test

Sharding for future capacity needs a forecast with uncertainty. Use seasonal peaks, tenant/key
distribution, workload/product scenarios and measured per-node service curves—not blind linear
extrapolation. Put confidence ranges and decision lead time against the largest operationally
acceptable node. If the trigger is beyond architecture/product horizon, preserve an evolution
seam rather than paying distributed cost now.

## The shard-key scorecard

Score every candidate and record mitigations. Some failures are disqualifying (an unbounded
single hot key beyond shard capacity); others can be paid for with a global index or dedicated
tenant placement. Make that cost visible rather than averaging scores blindly.

| Criterion                     | Passes when                                                                                       | How to check                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Query coverage**            | The key is present in the overwhelming majority of queries weighted by rate and by cost           | Take the top queries from the slow log or statement statistics and mark presence per query  |
| **Cardinality/splittability** | Enough independent units exist to rebalance with headroom; a hot unit can be subdivided           | histogram/top-key share against planned shard capacity/count                                |
| **Traffic uniformity**        | The busiest key's share of requests and of bytes is small enough that one key cannot fill a shard | Per-key request rate over a peak window — not `COUNT(*)`                                    |
| **Immutability**              | A row's key value never changes                                                                   | Look for `UPDATE ... SET <key>` anywhere; a mutable key means a cross-shard move per update |
| **Growth**                    | Per-key data volume is bounded, or bounded by a policy you control                                | Largest key's row count and byte size, and its trend                                        |

Traffic uniformity is the criterion that gets skipped, because row counts are easy to query
and per-key request rates are not. Skipping it is how a correct shard map ends up with one
saturated shard — the diagnosis and repair are `hot-partitions-and-rebalancing`.

## The wrong keys, and what each produces

- **Tenant id in a fleet with a power-law tenant distribution.** Row counts look plausible
  in aggregate; the largest tenant does not fit a shard, or its traffic saturates one. This
  is not a hashing failure — the key is uniformly hashed and the traffic is not uniform.
  Mitigations: a composite key (`tenant_id, entity_id`) for large tenants, or a dedicated
  shard for the known-large ones.
- **Timestamp or any monotonic id, under range partitioning.** Every insert lands on the
  newest range; the other shards hold cold data and serve almost no writes. Ordered scans
  were the reason to pick range partitioning, so the hotspot is intrinsic, not a bug.
- **A low-cardinality enum** — status, region, plan tier. The shard count is capped at the
  cardinality, and all traffic for one value is pinned to one shard forever.
- **An auto-increment primary key with hash partitioning.** Distribution is fine; every
  query that does not carry the id — which is most of them, since users search by other
  attributes — becomes scatter-gather.
- **A mutable key** (a user's current region, an order's current status). Changing the value
  means deleting from one shard and inserting into another, without a transaction spanning
  both. This is the worst of the list because it converts an `UPDATE` into a distributed
  write.
- **A key that is null for some rows.** Those rows need a placement rule of their own, and
  they will all land together.

## Partitioning strategies

| Strategy               | Placement                       | Good at                                                    | Gives up / costs                                                                          |
| ---------------------- | ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Range**              | Key intervals map to shards     | Ordered/local scans, targeted split of a range             | Growing-edge hotspot for monotonic traffic; split/merge management                        |
| **Hash**               | `f(key)` maps to a shard        | Approximate uniform placement of keys                      | Global range query needs fan-out/index; resharding moves data                             |
| **Directory / lookup** | An explicit key-to-shard table  | Arbitrary placement, per-key moves, pinning a large tenant | Lookup/cache invalidation and stale-routing fence; not necessarily a hop on every request |
| **Per-tenant**         | One shard (or store) per tenant | Isolation, per-tenant restore, per-tenant residency        | Poor packing for many small tenants; shard count grows with customer count                |

Hash partitioning is the default when the access pattern is point lookups by key. Reach for
a directory only when placement must be per-key — which is precisely the case a known-large
tenant creates. The mapping function underneath hash partitioning, and why `hash(key) % N` is
the wrong one, is `consistent-hashing`.

## Capacity and skew proof

For candidate key `K`, estimate the busiest logical key/range at peak, per-shard capacity at
the target SLO, replication/migration overhead and failure headroom. Mean keys per shard is not
the decision. Load-test a recorded or synthetic power-law distribution, membership change and
one-shard loss; verify the remaining fleet can serve/recover without a cascade.

Also evaluate adversarial keys/hash flooding, null/canonicalization across languages, mutable
tenant merges/splits, new region/residency placement and a tenant larger than one shard. A key
that works only for today's median tenant is already a migration plan.

## Primary references

- [Google Cloud Spanner schema design](https://cloud.google.com/spanner/docs/schema-design)
- [Amazon DynamoDB partition-key design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)
- [CockroachDB transaction layer](https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer)
