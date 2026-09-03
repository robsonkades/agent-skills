# Detecting skew and finding the key

Skew is a statement about the distribution across shards. Every metric here needs a bounded
`shard` identity (or an equivalent inventory join), and interpretation must account for
capacity, replication role and offered work. A ratio is useful; no single ratio is enough.

## The four series and the ratio

| Series       | Per-shard measure                        | Elevated max/mean means                                     |
| ------------ | ---------------------------------------- | ----------------------------------------------------------- |
| Request rate | offered, accepted and rejected ops/s     | Traffic skew or saturation-induced admission                |
| p99 latency  | per-shard response-time percentile       | One shard is saturated or queueing                          |
| Storage      | bytes or row count held                  | Data skew — a large tenant or an unbounded key              |
| CPU / IOPS   | demand and utilization per capacity unit | Work skew, which need not track request count               |
| Queue / lag  | queue age/depth and replica/change lag   | Service rate is below arrivals or migration cannot converge |

The derived series to alert on:

```promql
# Screening ratio for equal-capacity primary shards; guard an empty denominator.
max(rate(shard_requests_total[5m])) by (cluster)
  /
avg(rate(shard_requests_total[5m])) by (cluster)
```

With N equal shards and one saturated, excess in the fleet average is diluted. Pair the
ratio with maximum utilization, top-1/top-5 traffic share, median or p90 shard, rejection
rate and queue age. At low traffic, rates and per-shard p99 are noisy; require minimum sample
counts and sustained windows. For unequal hardware or replica roles, divide demand by an
empirically measured capacity weight before comparing shards.

Two supporting views:

- A per-shard heat map or stacked series over time: skew that appeared at a deploy, at a
  marketing send, or at the top of the hour has a cause you can name from the shape.
- Per-shard rate divided by per-shard key count. A shard with the mean number of keys and
  several times the mean request rate is carrying a hot key; a shard with several times the
  keys is carrying a large tenant. Different repairs.

## Signatures

| Signature                                                                  | Class                      | Repair direction                                                    |
| -------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| One shard: high read rate, high CPU, normal storage, writes normal         | **Read-hot key**           | Cache, request coalescing, or a read replica of that shard          |
| One shard: high write rate, write latency and queue depth up, reads normal | **Write-hot key**          | Salting, or splitting the key's own workload; a cache does nothing  |
| One shard: storage far above the others, traffic near the mean             | **Storage-hot**            | Dedicated shard, or a composite key that splits the large tenant    |
| Same logical key dominates before and after remapping                      | **Intrinsic hot key**      | Split/cache/coalesce/isolate that key; remapping cannot divide it   |
| Excess load follows different sets of ordinary keys after remapping        | **Placement imbalance**    | Inspect token/range weights, hash quality and virtual-node count    |
| All shards: elevated together, ratio near 1                                | **Overloaded fleet**       | Capacity or shedding, not skew                                      |
| One shard: latency up, rate _down_                                         | **Saturated and shedding** | The shard has stopped accepting; measure queue depth and rejections |

The last row is the trap: a shard past its limit shows _lower_ request rate because it is
failing or timing out, so a rate-only dashboard points at the wrong shard entirely. Always
read rate together with error rate and latency.

## Naming the key, cheaply

A shard metric proves skew exists. The repair needs the key.

- **Use the store's own facility first.** Many stores expose per-key or per-partition
  statistics, a slow-log carrying the key, or a top-keys command. Check before building
  anything; the cost of the built-in is usually far below a sampler.
- **Sample the request stream, do not count every key.** Counting every key on the hot path
  adds a map update per request and a cardinality explosion in metrics. Sample at a fixed low
  rate and count only the sample: a key taking a large share of traffic dominates a sample of
  a few thousand requests, which is the only case you are looking for. Rare keys are
  invisible in the sample, and that is correct — they are not the problem.
- **Sample by work as well as count.** One rare key may consume most bytes, CPU or lock time.
  Weight or maintain separate sketches for requests, bytes and service time; correct for
  head/tail sampling bias when extrapolating.
- **Bound the counter.** A hot-key detector must have a fixed memory footprint or it becomes
  the outage. A count-min sketch, or a Space-Saving / "top-K with eviction" structure of
  fixed capacity, gives approximate top-K in constant space. A `ConcurrentHashMap<String,
LongAdder>` keyed by user input is an unbounded-growth bug with a plausible-looking
  implementation.
- **Never make the key a metric label.** Per-key labels multiply the time-series count by the
  key cardinality and will take down the metrics backend before they identify anything. Emit
  the top-K periodically as a log line, or expose it on an admin endpoint.
- Treat keys as potentially sensitive tenant or user identifiers. Hash with a rotating,
  access-controlled keyed digest or map them to an internal opaque identifier; restrict
  retention and access to top-K output.

```java
// Conceptual: sampled top-K, fixed capacity, off the hot path except for one branch.
if (ThreadLocalRandom.current().nextInt(SAMPLE_RATE) == 0) {
    topK.offer(key);              // bounded structure; drops the long tail by design
}
```

## Before concluding

- **Confirm the hot key is not an artefact of a retry storm.** A key that started failing
  gets retried, which raises its rate, which keeps it failing. The signature is rate rising
  _after_ latency, not before — and the fix is `retries-and-backoff`, not a key split.
- **Check whether the shard was hot before the last membership change.** A shard that is hot
  in every configuration is carrying an intrinsically hot key; one that is hot only in this
  configuration may genuinely be a placement imbalance, which is `consistent-hashing`.
- **Record the numbers you used.** The max/mean ratio at the time of the incident is the
  baseline against which the repair is judged, and it is unrecoverable afterwards if nobody
  wrote it down.

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
