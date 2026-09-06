# Cache incident triage

## Symptom to hypothesis

| Symptom                                 | Candidate explanation                                        | Discriminating evidence                                                |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Old Gen after collection keeps growing  | Cache growth, ineffective bound or another retainer          | Heap dominators, cache occupancy and retained bytes                    |
| Periodic miss and source-load spikes    | Correlated expiry, scheduled workload or retries             | Align expiration/invalidation events with offered traffic and attempts |
| Hit rate falling over days              | Working-set or popularity drift, key-format change           | Compare key cardinality/distribution, eviction and deployments         |
| Instances disagree about a value        | Lost invalidation, stale fill, replica lag or key mismatch   | Trace value versions, fill/write ordering and invalidation offsets     |
| Load latency rises with stable hit rate | Origin slowdown or loader executor queueing                  | Separate queue delay, origin service time and in-flight work           |
| Hit rate suddenly zero                  | Cold namespace, reset metrics, bulk expiry or routing change | Check absolute hit/miss counts, restarts, key prefixes and ownership   |
| Cache never consulted, no error         | Proxy bypass or caching disabled/misconfigured               | Verify Spring mode, invocation path and an intercepted external call   |

The last row deserves its own check: it produces no error and no log. The only signal is
that the source is being hit at full rate while the cache reports almost no activity.

## The four series that must be on the dashboard

Hit rate alone is misleading, because the **worst** cache — unbounded, no TTL, no
invalidation — has the best hit rate. Track it alongside:

1. **Post-GC retained occupancy by cache/value class.** It should converge near the intended
   working-set bound under steady input; total Old Gen alone cannot identify the owner.
2. **Load latency distribution, failures and in-flight loads**, correlated with origin rate and
   saturation. A derivative of a timer is not a portable signal.
3. **Invalidation lag/stale-age/version mismatch in production plus propagation tests in CI.** CI
   proves a path can work; production signals reveal missed events and skew.

Plus:

- `cache.evictions` — high eviction with low hit rate suggests capacity or poor reuse; distinguish
  useful working-set pressure from scans, churn and oversized entries before allocating memory.
- `cache.loads{result="failure"}` — the loader is failing.
- Alert on hit rate relative to the **service's own baseline**, never to a universal number.

## Stampede: four scopes, four remedies

| Scope                               | Remedy                                       |
| ----------------------------------- | -------------------------------------------- |
| Many keys expiring together         | jitter on creation                           |
| One hot key, many concurrent misses | singleflight, or a `LoadingCache`            |
| One hot key, periodic miss          | `refreshAfterWrite`                          |
| Whole cache cold                    | staggered reload; never `FLUSHALL` on deploy |

Probabilistic early expiration reduces correlated refresh; it does not cap origin traffic.
Use the equation and parameter constraints in the skill's stampede rule, then measure origin
concurrency and apply admission control independently.

## Redis-side

```
maxmemory-policy         # inspect explicitly; noeviction rejects memory-growing writes at maxmemory
evicted_keys             # correlate with misses and workload; eviction alone does not prove undersizing
allocator_frag_ratio / allocator_frag_bytes
used_memory_rss + host/container swap and major faults
```

## The availability question

If the origin cannot meet admitted load without the cache, the cache is an **availability**
component. Test explicit degradation/load shedding, loader timeout/bulkhead behavior, staggered
warm-up and recovery—not an impossible promise that every request still succeeds with the cache
gone.

Ask this question explicitly before the incident, because the answer determines whether a
cache outage is a latency event or an outage.
