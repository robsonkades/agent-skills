# Configuring a cache

These are partial snippets, not standalone applications. Caffeine snippets target the 3.x API
(Java 11+), checked with Caffeine 3.2.2 and `javac --release 11`; import the Caffeine cache types,
`java.time.Duration` and `java.util.concurrent.ThreadLocalRandom`. Supply an immutable
`ProductDto` and a bounded `loadFromSource` implementation. The Redis snippet separately requires
Spring Data Redis 4/Jackson 3 and its supported Java baseline; inspect the project's versions.

## Bounded by weight when entry sizes vary

```java
// maximumSize counts entries and assumes they cost roughly the same
Cache<String, byte[]> cache = Caffeine.newBuilder()
        .maximumWeight(200L * 1024 * 1024)                 // logical weight budget
        .weigher((String url, byte[] bytes) -> Math.max(1, bytes.length))
        .expireAfterWrite(Duration.ofMinutes(10))
        .recordStats()
        .build();
```

When entry sizes vary by orders of magnitude—HTTP responses, lists, documents—logical weight is
usually better than entry count. The example uses value bytes with a positive floor: Caffeine
does not consider zero-weight entries for size eviction, so empty values otherwise escape that
bound. The floor is not an overhead estimate; choose it and the budget together to limit the
permitted entry count as well as payload weight. A floor of one still permits many tiny entries.
Real retained heap also contains keys, arrays/objects, cache nodes and allocator alignment;
calibrate the weigher against a heap profile rather than calling 200 MiB a hard heap bound.

The `byte[]` values are mutable references. Keep the cache private and copy at insertion and
return boundaries, or establish exclusive ownership that prevents mutation through either alias.
Caffeine does not copy values or reweigh an object when its contents mutate; weights are computed
on entry creation/replacement. Test empty values and caller mutation as well as typical payloads.

Choose a memory budget from container/JVM headroom, live non-cache set, allocation rate and pause
SLO. A percentage such as 25% can be an experiment starting point, never a portable limit. Verify
post-GC occupancy and behavior at maximum occupancy; eviction/maintenance may be asynchronous.

## Jitter for bulk-created entries

```java
Cache<Long, ProductDto> cache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfter(new Expiry<Long, ProductDto>() {
            private final Duration base = Duration.ofMinutes(10);
            private long jittered() {
                long b = base.toNanos();
                return b - ThreadLocalRandom.current().nextLong(b / 5);   // >80%..100%
            }
            public long expireAfterCreate(Long k, ProductDto v, long now) { return jittered(); }
            public long expireAfterUpdate(Long k, ProductDto v, long now, long d) { return jittered(); }
            public long expireAfterRead(Long k, ProductDto v, long now, long d) { return d; }
        })
        .recordStats()
        .build();
```

This uses ten minutes as the maximum local lifetime, not the midpoint. Subtract source lag and
load duration from a business age budget first. Jitter helps when expiry clusters after preload,
deploys or invalidation; measure correlations even when entries usually arrive individually.

Note that `expireAfter(Expiry)` is **mutually exclusive** with `expireAfterWrite`.

## Removing the miss on hot keys

```java
Caffeine.newBuilder()
        .maximumSize(10_000)
        .refreshAfterWrite(Duration.ofMinutes(5))
        .expireAfterWrite(Duration.ofMinutes(30))
        .recordStats()
        .build(key -> loadFromSource(key));
```

`refreshAfterWrite` makes an entry eligible; the first later access initiates asynchronous reload
and normally receives the old value. Failed refresh retains it until expiry; expiration makes it
invisible to cache lookups even if physical cleanup occurs later. A completed reload can itself
be stale, so entry lifetime is not source-data age. Configure an owned executor with bounded
loader concurrency and deadlines when blocking work matters; close it with the application.

For async loading, `AsyncCacheLoader.asyncLoad` takes `(K key, Executor executor)` — **two**
parameters and returns a future. `buildAsync` also accepts a one-argument `CacheLoader` returning
a value, which Caffeine executes asynchronously. Choose the overload by loader contract;
do not accidentally create a cache whose values are themselves futures.

## Redis

```java
// Spring Data Redis 4 / Jackson 3: use a typed serializer when the cache has one value schema
template.setValueSerializer(new JacksonJsonRedisSerializer<>(ProductDto.class));
```

For Spring Data Redis 3.x/Jackson 2 the class names differ. Do not use `Object.class` and then
assume concrete types reappear; untyped JSON normally yields maps unless explicit safe type
metadata is configured. Spring Data Redis 4's generic Jackson 3 serializer does not enable
default typing by default; the deprecated Jackson 2 generic serializer did.

- `maxmemory-policy` explicitly configured — the default `noeviction` **rejects memory-growing writes**
  when full.
- Monitor `evicted_keys`, rejected writes, RSS/allocator fragmentation and host/container swap or
  major faults. `mem_fragmentation_ratio` alone is not a reliable swap detector.
- Version the key prefix for format changes and stage the cold-namespace transition within origin
  capacity. Coexistence also consumes memory; `FLUSHALL` is not a safe warming strategy.

## Near-cache (L1 + L2)

- [ ] Cross-instance freshness contract explicit; invalidation implemented if needed (pub/sub, Kafka or CDC)
- [ ] For changing values, L1 stale-age bound derived across layers; TTL can limit a lost event's impact
- [ ] Metrics separated per layer (L1, L2, source) — an aggregate hit rate hides which
      layer is working
- [ ] L2 outage policy tested: bounded fallback/origin traffic, stale serve, rejection or load shedding
- [ ] Invalidation propagation, or the identity/freshness contract permitting its absence, tested

Redis pub/sub is fire-and-forget. An instance disconnected at publish time misses the
message. TTL removes that local entry, but refilling from stale L2 can extend observed staleness.
Carry source versions/freshness budgets through both layers. Publish only after commit; if loss between commit and publish exceeds the
staleness policy, an `AFTER_COMMIT` listener is insufficient—use transactional outbox/CDC or
version-checked cache reads.

## Before implementing

- [ ] Source latency distribution, origin work and sustainable capacity measured
- [ ] Access distribution measured from real data
- [ ] `h` projected from that distribution for the intended `maximumSize`
- [ ] Saved origin work and full hit/miss latency costs compared with the uncached path
- [ ] `maximumSize` or `maximumWeight` set — weight if entry sizes vary widely
- [ ] Logical weight calibrated to retained memory; full-cache post-GC/SLO headroom verified
- [ ] TTL/other freshness mechanism derived from stale-data tolerance, or immutable identity verified
- [ ] Jitter in the TTL if expiring entries are created in bulk
- [ ] Values are immutable/versioned projections; entity-cache semantics are explicit
- [ ] `recordStats()` enabled
- [ ] Invalidation strategy defined **and** tested where the freshness contract requires it
- [ ] Cache key includes every tenant/authorization/locale dimension affecting the value
- [ ] Cache-outage, loader-timeout, stale-fill race and cold-start behavior tested
