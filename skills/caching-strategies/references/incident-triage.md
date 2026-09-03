# Cache incident triage

## Symptom to cause

| Symptom                                     | Cause                                                        |
| ------------------------------------------- | ------------------------------------------------------------ |
| Old Gen after collection keeps growing      | cache warm-up/growth, ineffective bound, or another retainer |
| Periodic miss and source-load spikes        | stampede from synchronised TTL                               |
| Hit rate falling slowly over days           | working set outgrew `maximumSize`                            |
| Instances disagree about a value            | cross-instance invalidation failing                          |
| `load.duration` rising with hit rate stable | the source degraded; the cache is masking it                 |
| Hit rate suddenly zero                      | cold cache: restart, `FLUSHALL`, or bulk expiry              |
| Cache never consulted at all, no error      | `@Cacheable` called via `this` — proxy bypassed              |

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

- `cache.evictions` — high evictions with low hit rate means the cache is too small.
- `cache.loads{result="failure"}` — the loader is failing.
- Alert on hit rate relative to the **service's own baseline**, never to a universal number.

## Stampede: four scopes, four remedies

| Scope                               | Remedy                                       |
| ----------------------------------- | -------------------------------------------- |
| Many keys expiring together         | jitter on creation                           |
| One hot key, many concurrent misses | singleflight, or a `LoadingCache`            |
| One hot key, periodic miss          | `refreshAfterWrite`                          |
| Whole cache cold                    | staggered reload; never `FLUSHALL` on deploy |

Probabilistic early expiration reduces the spike; it does not remove it. The correct form is
`P = exp(−(expiry − now) / (β · δ))`, with β in the **denominator** — the inverted form
circulates widely and behaves the opposite way.

## Redis-side

```
maxmemory-policy         # inspect explicitly; noeviction rejects memory-growing writes at maxmemory
evicted_keys             # rising means the instance is undersized
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
