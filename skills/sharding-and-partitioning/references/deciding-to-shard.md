# Deciding to shard, and on what key

For a new topology decision, first establish which ownership/resource boundary must change;
then choose a key/strategy. Compare the feasible alternatives against the actual requirement.
Residency, isolation or recovery can justify a change without a capacity regression. An adequate
existing boundary can remain; a narrow access-path explanation need not reopen the whole decision.

## The alternatives, and the condition that selects each

| Option                      | Selected when                                                                                                     | Buys                                                | Costs                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bigger node                 | Vertical headroom meets SLO/cost/availability horizon                                                             | Preserves application data model                    | Cost/ceiling, larger failure/restore domain, resize interruption risk                                                   |
| Read replicas               | Read QPS or read CPU saturates while write rate is comfortable                                                    | Read throughput, geographic read locality           | Replication lag becomes visible to clients — `consistency-models`                                                       |
| Cache                       | Measured reuse avoids enough source cost to justify lookup/fill/invalidation work under the freshness contract    | Removes eligible reads before they reach the store  | Staleness, misses and invalidation — `caching-strategies` owns the decision                                             |
| Retention / archiving       | Storage grows because nothing is deleted; queries touch only recent rows                                          | Storage and index size, restore time                | A deletion policy someone must own, and an archive read path                                                            |
| Native table partitioning   | Time-based lifecycle/pruning is the requirement                                                                   | Partition detach/drop can avoid row-by-row deletion | Single-node partitioning does not distribute ownership; locking, index and uniqueness restrictions are product-specific |
| Splitting off one hot table | One table dominates writes and its required operations can afford the boundary                                    | Relieves eligible load without row-level sharding   | Two stores to operate; verify joins, constraints and transaction scope across them                                      |
| **Sharding**                | An acceptable ownership domain cannot meet measured capacity/locality/recovery objectives and a viable key exists | Distributed capacity/locality; potential isolation  | Coordination, placement and migration costs below                                                                       |

Record evidence for rejecting relevant alternatives. Replicas may fail the required consistency,
write, residency or recovery contract; write rate alone does not decide their suitability.

## The trajectory test

Sharding for future capacity needs a forecast with uncertainty. Use seasonal peaks, tenant/key
distribution, workload/product scenarios and measured per-node service curves—not blind linear
extrapolation. Put confidence ranges and decision lead time against the largest operationally
acceptable node. If the trigger is beyond architecture/product horizon, preserve an evolution
seam rather than paying distributed cost now.

## The shard-key scorecard

When selecting or changing a key, score the relevant candidates and record mitigations. Some failures are disqualifying (an unbounded
single hot key beyond shard capacity); others can be paid for with a global index or dedicated
tenant placement. Make that cost visible rather than averaging scores blindly.

| Criterion                     | Passes when                                                                                       | How to check                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Query coverage**            | Direct routing or priced index/directory/fan-out paths meet each important operation's SLO        | Use statement statistics plus critical workflows; record rate, cost, routing and transaction scope  |
| **Cardinality/splittability** | Enough independent units exist to rebalance with headroom; a hot unit can be subdivided           | histogram/top-key share against planned shard capacity/count                                        |
| **Traffic uniformity**        | The busiest key's share of requests and of bytes is small enough that one key cannot fill a shard | Per-key request rate over a peak window — not `COUNT(*)`                                            |
| **Key stability**             | Changes are absent or have a supported, affordable move protocol                                  | Inspect key updates, current/possible target owners, transaction semantics and stale-route handling |
| **Growth**                    | Per-key data volume is bounded, or bounded by a policy you control                                | Largest key's row count and byte size, and its trend                                                |

Traffic uniformity is the criterion that gets skipped, because row counts are easy to query
and per-key request rates are not. Skipping it is how a correct shard map ends up with one
saturated shard — the diagnosis and repair are `hot-partitions-and-rebalancing`.

## The wrong keys, and what each produces

- **Tenant id in a fleet with a power-law tenant distribution.** Row counts look plausible
  in aggregate; the largest tenant does not fit a shard, or its traffic saturates one. This
  is not a hashing failure — the key is uniformly hashed and the traffic is not uniform.
  Mitigations: independently routed subkeys for large tenants, or dedicated/larger owners when
  measured capacity suffices. A composite key only helps if its partitioning actually splits the
  hot tenant; a dedicated owner of the same size cannot solve intrinsic oversize.
- **Globally monotonic leading key under simple range partitioning.** Current inserts cluster
  at the growing edge. Multiple leading prefixes can distribute this pressure while retaining
  order within each prefix; global scans then need more coordination/merging.
- **A low-cardinality enum** — status, region, plan tier. The shard count is capped at the
  cardinality for direct unsplit buckets; a secondary routing dimension can lift that limit.
- **An auto-increment primary key with hash partitioning.** Distribution is fine; every
  query that lacks the id needs another access path. Whether that means an index lookup or
  scatter-gather depends on the datastore and query mix, not on auto-increment itself.
- **A mutable key** (a user's current region, an order's current status). Changing the value
  can move ownership across shards. Some datastores support such moves transactionally; others
  require a migration protocol. Two values can also map to the same current owner. Price the
  move, concurrent writes and routing repair rather than assuming ordinary local UPDATE semantics.
- **A key that is null for some rows.** Specify whether null is rejected, routed as one value
  or placed using another stable dimension. A shared null bucket can become a hotspot.

## Partitioning strategies

| Strategy               | Placement                       | Good at                                                    | Gives up / costs                                                                          |
| ---------------------- | ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Range**              | Key intervals map to shards     | Ordered/local scans, targeted split of a range             | Growing-edge hotspot for monotonic traffic; split/merge management                        |
| **Hash**               | `f(key)` maps to a shard        | Approximate uniform placement of keys                      | Global range query needs fan-out/index; resharding moves data                             |
| **Directory / lookup** | An explicit key-to-shard table  | Arbitrary placement, per-key moves, pinning a large tenant | Lookup/cache invalidation and stale-routing fence; not necessarily a hop on every request |
| **Per-tenant**         | One shard (or store) per tenant | Isolation, per-tenant restore, per-tenant residency        | Poor packing for many small tenants; shard count grows with customer count                |

Hash partitioning is a candidate for point lookups by key. A directory supports deliberate
placement and controlled migration, possibly over stable virtual buckets. `hash(key) % N` can
fit a fixed topology; changing N remaps many keys and needs an explicit migration strategy.
`consistent-hashing` owns the mapping trade-offs.

## Capacity and skew proof

For a capacity or resilience claim about candidate key `K`, estimate the busiest logical key/range at peak, per-shard capacity at
the target SLO, replication/migration overhead and failure headroom. Mean keys per shard is not
the decision. Reuse representative checks; add a bounded workload/skew, membership-change or
shard-loss check when its result is needed for the proposed capacity/recovery claim. Select the
arrival/work distribution and failure domain from the contract; power-law traffic and one-shard
loss are useful cases when representative, not a universal campaign. Run failure injection only
in an authorized isolated environment and report any untested recovery claim.

Also evaluate adversarial keys/hash flooding, null/canonicalization across languages, mutable
tenant merges/splits, new region/residency placement and a tenant larger than one shard. A key
that works only for today's median tenant is already a migration plan.

## Primary references

- [Google Cloud Spanner schema design](https://cloud.google.com/spanner/docs/schema-design)
- [Amazon DynamoDB partition-key design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)
- [CockroachDB 25.4 transaction layer](https://www.cockroachlabs.com/docs/v25.4/architecture/transaction-layer)
- [PostgreSQL 18 partitioning limitations](https://www.postgresql.org/docs/18/ddl-partitioning.html)
- [MongoDB 8.0 shard-key values and missing keys](https://www.mongodb.com/docs/v8.0/core/sharding-shard-key/)
- [MongoDB 8.0 shard-key update requirements](https://www.mongodb.com/docs/v8.0/core/sharding-change-shard-key-value/)

These are source/documentation checks, not target-runtime observations. The versioned MongoDB
8.0 and CockroachDB 25.4 examples do not require adopting those releases; inspect the deployed
datastore and configuration. Spanner and DynamoDB documentation describe their managed services.
