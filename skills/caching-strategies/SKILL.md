---
name: caching-strategies
description: >
  Deciding whether to cache, then doing it safely: the h × T_source criterion, bounded size
  or weight, TTL and jitter, stampede and its four distinct scopes, cache-aside versus
  refreshAfterWrite, immutable DTOs rather than JPA entities, invalidation across instances,
  Redis serialisation, and why hit rate alone is a misleading metric. Use when a cache is
  being added or reviewed, when @Cacheable is called from within the same bean, when a cache
  has no size limit or no TTL, when entries are preloaded in bulk with one TTL, when hit
  rate is the only metric on the dashboard, when Old Gen keeps growing, when FLUSHALL
  appears in a deploy pipeline, or when instances disagree about a value. Does not cover the
  pool the cache protects (connection-pool-sizing), the queueing arithmetic
  (littles-law-and-queueing), or GC tuning for the resulting heap (jvm-gc-tuning).
---

# Caching Strategies

## Purpose

Cache is the only technique that attacks `λ` in `L = λ × W`: a query that does not happen
consumes no connection, no planner and no I/O. It is also the only performance technique
whose broken form has **better** metrics than its correct form — which is why the rules
here are mostly about what to measure alongside hit rate.

## Workflow

1. **Measure `T_source`** (p50 and p99) before deciding. Caching something that costs
   0.5 ms buys complexity, staleness risk and memory for almost nothing.
2. **Measure the access distribution** and estimate `h` for the intended `maximumSize`.
3. **Decide on `h × T_source`, not on `h`.** A cache with 20% hit rate over a 200 ms source
   is worth more than one with 90% over a 2 ms source.
4. **Bound it** — by size, or by **weight** when entry sizes vary by orders of magnitude.
   Keep `maximumSize × average_size` at or below ~25% of available heap.
5. **Set a TTL from the business tolerance for stale data**, and add jitter if entries are
   created in bulk.
6. **Define the invalidation strategy and write an automated test for it** — propagation is
   the part that silently stops working.
7. **Instrument four series, not one**: hit rate, Old Gen occupancy after collection,
   `cache.load.duration`, and the invalidation test in CI.

## Rules

- `T_effective = T_cache + (1 − h) × T_source`. In latency the return is **not**
  diminishing: the difference between 95% and 99% is larger than between 50% and 80%. What
  diminishes is the return on memory, because coverage grows with the logarithm of cache
  size.
- **A broken cache has better metrics than a correct one.** No limit, no TTL and no
  invalidation gives the best possible hit rate. This is why hit rate never travels alone.
- Never cache a mutable JPA entity — the cache holds the reference, so any code with that
  object mutates the cache contents without going through `put`, and dirty checking may
  persist the change, or may not, leaving cache and database divergent. Cache immutable
  DTOs (`record`), converted at the boundary.
- `@Cacheable` called via `this` never goes through the proxy and the cache is simply never
  consulted — no error, no log. Same mechanism as `@Transactional`. Extract to a separate
  bean; that is more readable than self-injection.
- Never cache an operation with a side effect. `@Cacheable` on something that _creates_
  means that on a hit the thing is not created and the cache asserts that it was.
  Idempotency belongs to durable storage — a keys table with a unique constraint. A cache
  can accelerate the lookup of that table; it can never replace it.
- Stampede has **four scopes and four different remedies**: jitter desynchronises entries
  created in bulk; singleflight (or a `LoadingCache`) guarantees one reload per key;
  `refreshAfterWrite` removes the miss entirely on hot keys; staggered reload avoids a
  global cold cache. Probabilistic early expiration reduces the spike, it does not remove
  it — and the correct form is `P = exp(−(expiry − now) / (β · δ))`, with β in the
  denominator.
- `FLUSHALL` in a deploy pipeline is a stampede generator. If the service needs the cache to
  serve its load, the cache is an **availability** component, not a performance one. For a
  format change, version the key prefix instead.
- `RedisTemplate`'s default serialiser is `JdkSerializationRedisSerializer`, not JSON —
  unreadable outside the JVM, fragile across class evolution, and with a deserialisation
  security history. `GenericJackson2JsonRedisSerializer` is necessary, not optional. And
  `Jackson2JsonRedisSerializer<>(Object.class)` fails with `ClassCastException` on the first
  hit, because it does not write the type.
- Redis pub/sub is fire-and-forget, so the L1 TTL is the **safety net**, not redundancy. An
  instance disconnected at publish time misses the message and serves stale data until the
  TTL; with no TTL the inconsistency is permanent and silent. Propagate **after commit**
  (`@TransactionalEventListener(AFTER_COMMIT)`), never inside the transaction.
- `sun.misc.Unsafe` for off-heap has an expiry date: memory-access methods were terminally
  deprecated in JDK 23 (JEP 471) and warn since JDK 24 (JEP 498). The standard replacement
  is the FFM API (`MemorySegment`/`Arena`) — check whether your off-heap library has
  migrated.

## References

- [Configuring a cache](references/configuring-a-cache.md) — Caffeine and Spring
  configuration with bounds, weight, jitter and stats; the Redis settings that matter; and
  the near-cache (L1+L2) rules. Read when implementing or reviewing a cache.
- [Cache incident triage](references/incident-triage.md) — the symptom-to-cause table and
  the metric set that makes each cause visible. Read when a cache-related incident is in
  progress.
