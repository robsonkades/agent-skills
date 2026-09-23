---
name: hot-partitions-and-rebalancing
description: >
  Repairing a partitioned system whose distribution has failed in production: balanced
  key placement does not imply balanced traffic, so one celebrity key or one
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
require different investigation paths. Per-shard evidence distinguishes skew from fleet-wide
pressure; logs, traces or store statistics may supply it when metric labels are missing.
Without that evidence, keep the diagnosis conditional and capture a bounded incident sample.

Inspect the store, driver and topology versions before recommending an online split or
ownership protocol. The Java examples are partial Java 17-compatible sketches, not a storage
implementation; inspect the project's toolchain and APIs without assuming upgrade permission.

## Workflow

1. **Reuse the workload evidence, SLO and recovery budget.** Retain an adequate topology when
   the observed skew meets those requirements with headroom; a ratio alone is not a defect.
   Measure distribution, normalizing comparable demand by each shard's capacity, for offered,
   admitted and completed request rate, errors, queueing, latency, CPU/IO, storage and
   replication lag. Use top-share,
   max/median and a heat map; max/mean is only a screening signal. A ratio near 1 can still
   hide a uniformly saturated fleet, rejected work or heterogeneous instances.
2. **Classify the supported hypothesis** as read-hot, write-hot, storage-hot or mixed using
   request mix and resource evidence, not a ratio alone. Ordinary read caching does not
   remove write throughput requirements. The signature table is `references/detecting-skew.md`.
3. **Identify contributing keys when skew is workload-driven.** A shard-level metric shows
   a measured difference; it does not establish a key-level cause.
   Sample requests on the hot shard and count by key, or read the store's own top-key
   facility. Cheap sampling techniques are in `references/detecting-skew.md`.
4. **Decide whether the key is intrinsically hot or the key choice is wrong.** One celebrity
   key on an otherwise even distribution is a key-level repair. A shard key whose design
   concentrates traffic — a timestamp, an enum, a tenant id in a power-law fleet — may need a
   key change (`sharding-and-partitioning`). Compare that migration with adequate isolation,
   capacity, work reduction or admission controls; preserve atomicity and ordering requirements.
5. **Apply the narrowest repair that fits the classification**, and price it before shipping:
   salting costs read fan-out, a dedicated shard costs an operational special case, a cache
   costs staleness. `references/repairs-and-rebalancing.md` has each with its condition.
6. **If the repair is a move, treat the move as a distributed protocol.** Version the shard
   map, define the double-ownership window, throttle the copy, and make a stale client unable
   to write to the former owner.
7. **Verify the chosen repair and any migration.** Reuse representative checks; where more
   evidence is needed, replay the observed key/work distribution, measure request outcomes,
   tail amplification and catch-up time. For moves, inject stale clients and abort midway.
   Reuse or add bounded-cardinality detection on skew plus saturation; report unexecuted checks.

## Decision block

```text
Salt (split) the key across S buckets when:
- one write-hot key exceeds a single shard's write capacity, and reads for that key are rare
  enough, or aggregate in nature, that fanning them out to S is acceptable; operations can
  be partitioned with a valid merge without violating required atomicity or ordering
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
Investigate fleet capacity or common-mode failure when:
- normalized load is similar across shards and saturation, queueing or rejection is elevated;
  a ratio near 1 alone does not establish overload or justify adding capacity
Change the shard key when:
- the concentration is structural rather than incidental — the key design guarantees it
  recurs and simpler controls cannot meet the required workload/headroom without breaking
  the contract. Price the full migration (sharding-and-partitioning)
```

## Rules

- **Skew is easily hidden by an aggregate.** With N equal shards and one saturated, the fleet
  mean's excess is diluted by roughly N. Report a normalized distribution: maximum or high
  quantile, median, top-shard share and capacity utilization. `max/mean` is useful but highly
  sensitive to one outlier and says nothing about two clusters or heterogeneous capacity.
- Add bounded shard identity before incidents to preserve history. Instrumenting during an
  incident still provides current evidence; record that the historical baseline is missing.
- Read-hot, write-hot and storage-hot are three problems. A cache removes read load and does
  nothing for writes; salting spreads writes and makes reads more expensive; a dedicated
  shard isolates the tenant but only relieves its bottleneck if available capacity is sufficient.
  Name the class first; ordinary read caching does not remove write throughput requirements.
- **Rehashing is not a repair for a hot key.** The key still has one owner under every
  placement function in `consistent-hashing`; the hash decides _which_ node melts, not
  whether one does.
- Salt only when independent operations have a valid merge and the required atomicity and
  ordering survive the split; write heat alone is insufficient evidence.
- Salting is `key#i` for `i` in `[0, S)`: writers route by a deliberate sub-key (random,
  round-robin or an entity identifier), readers query the required buckets and merge. The
  cost includes read fan-out, loss of single-key atomicity/global order, retries and future
  resharding. S logical buckets do not guarantee S physical partitions: verify that the
  store's routing spreads their work onto sufficient capacity. Choose S from measured
  per-partition capacity with headroom; random assignment can still burst and a deterministic
  secondary key is preferable when semantics allow it.
- Salt selectively so other keys avoid unnecessary read fan-out. Adding or removing a key
  from the hot-key configuration changes its layout, just as changing S does; it is not a
  plain routing toggle. Preserve existing data visibility and retry semantics through the
  transition described in `references/repairs-and-rebalancing.md`.
- **A move creates overlapping copies, not two unconstrained authorities.** Name the sole
  write authority for every phase. Publish a monotonic ownership epoch, require it on every
  mutation, and enforce it at the state transition that commits the write. Rejecting stale
  routing only in a client or proxy is insufficient: paused clients and old owners survive
  cutover. The general fencing mechanism is `distributed-locks-and-leases`.
- Throttle the migration copy explicitly, in bytes or rows per second, and treat it as
  production load. An unthrottled rebalance can exhaust the remaining headroom and turn
  the attempted repair into a larger incident.
- Automatic rebalancing can oscillate: a move makes the target hot and triggers a move back.
  Use the supported controller's noise/churn controls, such as sustained thresholds,
  improvement margins and cool-downs, with a budget for concurrent moves.
- Protect the routing and recovery metadata needed under the failures being repaired.
  Synchronous ownership discovery through a saturated shard can block traffic and
  rebalancing. Supported cached routing may keep existing operations serving during a
  map-service outage while topology changes pause, provided the cache validity and
  commit-time ownership rules still hold. Define startup/refresh failure behavior and
  sufficient metadata access for recovery; fail closed when required routing or write
  authority cannot be established.
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

Return the observed distribution and missing evidence, the hypothesis and its falsifier,
the repair or no-change decision and semantic costs, and the available SLO and recovery checks.
Keep unmeasured benefits conditional.

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
