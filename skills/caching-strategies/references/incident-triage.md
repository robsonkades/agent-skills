# Cache incident triage

## Symptom to cause

| Symptom                                     | Cause                                           |
| ------------------------------------------- | ----------------------------------------------- |
| Old Gen after collection keeps growing      | no effective size limit                         |
| Periodic miss and source-load spikes        | stampede from synchronised TTL                  |
| Hit rate falling slowly over days           | working set outgrew `maximumSize`               |
| Instances disagree about a value            | cross-instance invalidation failing             |
| `load.duration` rising with hit rate stable | the source degraded; the cache is masking it    |
| Hit rate suddenly zero                      | cold cache: restart, `FLUSHALL`, or bulk expiry |
| Cache never consulted at all, no error      | `@Cacheable` called via `this` — proxy bypassed |

The last row deserves its own check: it produces no error and no log. The only signal is
that the source is being hit at full rate while the cache reports almost no activity.

## The four series that must be on the dashboard

Hit rate alone is misleading, because the **worst** cache — unbounded, no TTL, no
invalidation — has the best hit rate. Track it alongside:

1. **Old Gen occupancy after collection.** Must stabilise, not grow. This answers "is the
   cache actually bounded?"
2. **`cache.load.duration`** — and alert on its **derivative**. It is the earliest detector
   of source degradation, because the cache hides the degradation from latency metrics
   until the miss rate rises.
3. **An invalidation-propagation test in CI.** This answers "is the cache correct?", which
   no production metric answers.

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
maxmemory-policy         # default noeviction REJECTS WRITES when full
evicted_keys             # rising means the instance is undersized
mem_fragmentation_ratio  # below 1.0 indicates swap
```

## The availability question

If the service depends on the cache to serve its load, the cache is an **availability**
component, not a performance one. That reclassification changes what needs testing: graceful
degradation with the cache gone, staggered warm-up after a cold start, and a deploy pipeline
that does not flush it.

Ask this question explicitly before the incident, because the answer determines whether a
cache outage is a latency event or an outage.
