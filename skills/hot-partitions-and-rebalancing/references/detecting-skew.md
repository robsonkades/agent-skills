# Detecting skew and finding the key

Skew is a statement about the _spread_ across shards. Every metric here must therefore carry
a `shard` label, and the derived series that matters is a ratio, not a total.

## The four series and the ratio

| Series       | Per-shard measure                       | Elevated max/mean means                        |
| ------------ | --------------------------------------- | ---------------------------------------------- |
| Request rate | ops/s accepted by the shard             | Traffic skew — the classic hot partition       |
| p99 latency  | per-shard response-time percentile      | One shard is saturated or queueing             |
| Storage      | bytes or row count held                 | Data skew — a large tenant or an unbounded key |
| CPU / IOPS   | utilisation of the shard's own resource | Work skew, which need not track request count  |

The derived series to alert on:

```promql
# Skew ratio: 1.0 is perfect, and anything sustained above your tolerance is the incident
max(rate(shard_requests_total[5m])) by (cluster)
  /
avg(rate(shard_requests_total[5m])) by (cluster)
```

With N shards and one saturated, the **average** rises by roughly 1/N — invisible. The
maximum rises by whatever the skew is. Only the ratio makes the condition monitorable, and
it is worth a panel and an alert before any incident, because it costs nothing when healthy.

Two supporting views:

- A per-shard heat map or stacked series over time: skew that appeared at a deploy, at a
  marketing send, or at the top of the hour has a cause you can name from the shape.
- Per-shard rate divided by per-shard key count. A shard with the mean number of keys and
  several times the mean request rate is carrying a hot key; a shard with several times the
  keys is carrying a large tenant. Different repairs.

## Signatures

| Signature                                                                        | Class                      | Repair direction                                                    |
| -------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| One shard: high read rate, high CPU, normal storage, writes normal               | **Read-hot key**           | Cache, request coalescing, or a read replica of that shard          |
| One shard: high write rate, write latency and queue depth up, reads normal       | **Write-hot key**          | Salting, or splitting the key's own workload; a cache does nothing  |
| One shard: storage far above the others, traffic near the mean                   | **Storage-hot**            | Dedicated shard, or a composite key that splits the large tenant    |
| One shard: high everything, and it is always the same shard after a rehash       | **Structural key problem** | The shard key concentrates by design — `sharding-and-partitioning`  |
| One shard: high everything, and the identity of the shard moves with each rehash | **Incidental collision**   | Genuine placement imbalance — raise V or re-check the hash function |
| All shards: elevated together, ratio near 1                                      | **Overloaded fleet**       | Capacity or shedding, not skew                                      |
| One shard: latency up, rate _down_                                               | **Saturated and shedding** | The shard has stopped accepting; measure queue depth and rejections |

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
- **Bound the counter.** A hot-key detector must have a fixed memory footprint or it becomes
  the outage. A count-min sketch, or a Space-Saving / "top-K with eviction" structure of
  fixed capacity, gives approximate top-K in constant space. A `ConcurrentHashMap<String,
LongAdder>` keyed by user input is an unbounded-growth bug with a plausible-looking
  implementation.
- **Never make the key a metric label.** Per-key labels multiply the time-series count by the
  key cardinality and will take down the metrics backend before they identify anything. Emit
  the top-K periodically as a log line, or expose it on an admin endpoint.

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
