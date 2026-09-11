# Detecting skew and finding the key

Skew is a statement about the distribution across shards. Every metric here needs a bounded
`shard` identity (or an equivalent inventory join), and interpretation must account for
capacity, replication role and offered work. A ratio is useful; no single ratio is enough.

## The four series and the ratio

| Series       | Per-shard measure                        | Elevated max/mean means                                     |
| ------------ | ---------------------------------------- | ----------------------------------------------------------- |
| Request rate | offered, accepted and rejected ops/s     | Traffic skew or saturation-induced admission                |
| p99 latency  | per-shard response-time percentile       | Latency differs; inspect queueing and request mix           |
| Storage      | bytes or row count held                  | Data skew — a large tenant or an unbounded key              |
| CPU / IOPS   | demand and utilization per capacity unit | Work skew, which need not track request count               |
| Queue / lag  | queue age/depth and replica/change lag   | Service rate is below arrivals or migration cannot converge |

The derived series to alert on:

```promql
# Equal-capacity primaries; adapt selectors to the metric schema.
# Recording rule shard:requests:rate5m =
#   sum by (cluster, shard) (rate(shard_requests_total{role="primary"}[5m]))
max by (cluster) (shard:requests:rate5m)
  / on (cluster)
(avg by (cluster) (shard:requests:rate5m) > 0)
```

Sum only disjoint counters for the same request population; deduplicate replicated scrapes
and separate offered/accepted and read/write populations. Missing shard series are not zero:
check inventory and missing telemetry. The positive-denominator filter omits idle clusters.

With N equal shards and one saturated, excess in the fleet average is diluted. Pair the
ratio with maximum utilization, top-1/top-5 traffic share, median or p90 shard, rejection
rate and queue age. At low traffic, rates and per-shard p99 are noisy; require minimum sample
counts and sustained windows. For unequal hardware or replica roles, divide demand by an
empirically measured capacity weight before comparing shards.

Two supporting views:

- A per-shard heat map or stacked series over time: skew that appeared at a deploy, at a
  marketing send, or at the top of the hour suggests a correlation to investigate, not a proven cause.
- Per-shard rate divided by per-shard key count. A shard with the mean number of keys and
  several times the mean request rate may carry hot keys or costlier requests; extra keys may indicate placement or tenant
  skew. Confirm with key/tenant samples before selecting a repair.

## Signatures

| Signature                                                                  | Candidate class                    | Investigation / repair direction                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| One shard: high read rate, high CPU, normal storage, writes normal         | **Read-hot key**                   | Cache, request coalescing, or a read replica of that shard                                            |
| One shard: high write rate, write latency and queue depth up, reads normal | **Write-hot key**                  | Salting, or splitting the key's own workload; a cache does nothing                                    |
| One shard: storage far above the others, traffic near the mean             | **Storage-hot**                    | Dedicated shard, or a composite key that splits the large tenant                                      |
| Same logical key dominates before and after remapping                      | **Intrinsic hot key**              | Split/cache/coalesce/isolate that key; remapping cannot divide it                                     |
| Excess load follows different sets of ordinary keys after remapping        | **Placement imbalance**            | Inspect token/range weights, hash quality and virtual-node count                                      |
| All shards: elevated together, ratio near 1                                | **Fleet-wide pressure**            | Check saturation, common dependencies and request mix before capacity or shedding                     |
| One shard: latency up, rate _down_                                         | **Saturation or reduced progress** | Separate offered, admitted and completed work; inspect queues, rejections and local/dependency faults |

These signatures are hypotheses, not proof of a particular key or cause. A shard past its
limit can show _lower_ admitted or completed rate; a dependency or local fault can also
reduce progress. Offered attempts may still rise. Read rates with their population, errors,
latency and queue evidence before selecting a repair.

## Naming the key, cheaply

A comparable shard metric establishes skew in that measured quantity, not its cause.
A key-level repair needs key evidence; a shard-local fault need not have one offending key.

- **Use the store's own facility first.** Many stores expose per-key or per-partition
  statistics, a slow-log carrying the key, or a top-keys command. Check before building
  anything; inspect its overhead and sampling semantics before enabling it under load.
- **Sample the request stream, do not count every key.** Counting every key on the hot path
  adds a map update per request and a cardinality explosion in metrics. Sample at a fixed low
  rate and count only the sample: a frequent key may emerge from a modest sample. Record sampling rate and observation
  window; absence cannot exclude rare, expensive work.
- **Sample by work as well as count.** One rare key may consume most bytes, CPU or lock time.
  Weight or maintain separate sketches for requests, bytes and service time; correct for
  head/tail sampling bias when extrapolating.
- **Bound the counter.** A hot-key detector must have a fixed memory footprint or it becomes
  the outage. A fixed-capacity Space-Saving structure tracks heavy-hitter candidates. A count-min
  sketch estimates counts for supplied keys but does not enumerate top-K itself; pair it
  with bounded candidate tracking and account for estimation error. A `ConcurrentHashMap<String,
LongAdder>` keyed by user input is an unbounded-growth bug with a plausible-looking
  implementation.
- **Never make the key a metric label.** Per-key labels multiply the time-series count by the
  key cardinality and will take down the metrics backend before they identify anything. Emit
  the top-K periodically as a log line, or expose it on an admin endpoint.
- Treat keys as potentially sensitive tenant or user identifiers. Hash with a rotating,
  access-controlled keyed digest or map them to an internal opaque identifier; restrict
  retention and access to top-K output.

```java
// Partial sketch: SAMPLE_RATE > 0; bounded, concurrency-safe offer with measured overhead.
// Random selection still executes on every request.
if (ThreadLocalRandom.current().nextInt(SAMPLE_RATE) == 0) {
    topK.offer(key);              // bounded structure; drops the long tail by design
}
```

## Before concluding

- **Confirm the hot key is not an artefact of a retry storm.** A key that started failing
  gets retried, which raises its rate, which keeps it failing. Rate rising after latency is a clue; compare logical operations with attempts and retry
  timing. Mitigate proven retry amplification (`retries-and-backoff`) while investigating
  the original failure; retries and intrinsic skew can coexist.
- **Check whether the shard was hot before the last membership change.** Track logical keys separately from physical owners. Persistent heat on one physical node
  can reflect hardware or a local fault; intrinsic heat should follow the same logical key.
  Configuration-dependent heat suggests testing placement imbalance (`consistent-hashing`).
- **Record the evidence and window you used.** Keep the distribution with demand, outcomes,
  capacity and SLO evidence; max/mean alone is not a recovery baseline. Note missing history
  rather than reconstructing unrecorded measurements.

## Troubleshooting path

```text
Tail latency/errors rise
  ↓ compare offered, accepted and rejected work by shard and capacity
One shard differs?
  ├─ no → fleet capacity, dependency or common-mode incident
  └─ yes → compare CPU/IO, queue, storage, replication lag and request mix
             ↓
           bounded top-K by count, bytes and service time
             ↓
           identify logical key/range/tenant and retry amplification
             ↓
           replay observed distribution; validate repair and migration invariants
```

Do not average per-shard percentiles to obtain a fleet percentile. Aggregate compatible
histogram buckets or raw distributions with request weighting; see `latency-statistics`.

## Source

[Prometheus operators](https://prometheus.io/docs/prometheus/latest/querying/operators/)
define grouping and filtering; validate the illustrative rule against the deployed metric
schema and Prometheus version.

[Redis count-min sketch](https://redis.io/docs/latest/develop/data-types/probabilistic/count-min-sketch/)
illustrates estimated-frequency queries for supplied items, rather than key enumeration.
