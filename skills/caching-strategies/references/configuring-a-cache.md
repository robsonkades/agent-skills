# Configuring a cache

## Bounded by weight when entry sizes vary

```java
// maximumSize counts entries and assumes they cost roughly the same
Cache<String, byte[]> cache = Caffeine.newBuilder()
        .maximumWeight(200L * 1024 * 1024)                 // 200 MB
        .weigher((String url, byte[] bytes) -> bytes.length)
        .expireAfterWrite(Duration.ofMinutes(10))
        .recordStats()
        .build();
```

When entry sizes vary by orders of magnitude—HTTP responses, lists, documents—logical weight is
usually better than entry count. The example weighs only value bytes; real retained heap also
contains keys, objects, cache nodes and allocator alignment, so calibrate the weigher against a
heap profile rather than calling 200 MB a hard heap bound.

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
                return b + ThreadLocalRandom.current().nextLong(b / 5);   // +0..20%
            }
            public long expireAfterCreate(Long k, ProductDto v, long now) { return jittered(); }
            public long expireAfterUpdate(Long k, ProductDto v, long now, long d) { return jittered(); }
            public long expireAfterRead(Long k, ProductDto v, long now, long d) { return d; }
        })
        .recordStats()
        .build();
```

Jitter is unnecessary when entries arrive naturally, one at a time — they are already
desynchronised. It is necessary exactly when they arrive together: preload, post-deploy
repopulation, recovery after a bulk invalidation.

Note that `expireAfter(Expiry)` is **mutually exclusive** with `expireAfterWrite`.

## Removing the miss on hot keys

```java
Caffeine.newBuilder()
        .refreshAfterWrite(Duration.ofMinutes(5))
        .expireAfterWrite(Duration.ofMinutes(30))
        .recordStats()
        .build(key -> loadFromSource(key));
```

`refreshAfterWrite` makes an entry eligible; the first later access initiates asynchronous reload
and normally receives the old value. Failed refresh retains the old value. `expireAfterWrite` is
an eligibility/removal policy rather than a wall-clock guarantee, and keys not accessed after
refresh eligibility may expire. Configure a dedicated executor when common-pool contention or
blocking loaders matter.

For async loading, `AsyncCacheLoader.asyncLoad` takes `(K key, Executor executor)` — **two**
parameters. A one-argument lambda in `buildAsync` does not compile.

## Redis

```java
// Spring Data Redis 4 / Jackson 3: use a typed serializer when the cache has one value schema
template.setValueSerializer(new JacksonJsonRedisSerializer<>(ProductDto.class));
```

For Spring Data Redis 3.x/Jackson 2 the class names differ. Do not use `Object.class` and then
assume concrete types reappear; untyped JSON normally yields maps unless explicit safe type
metadata is configured. Spring Data Redis 4's generic Jackson 3 serializer does not enable
default typing by default; the deprecated Jackson 2 generic serializer did.

- `maxmemory-policy` explicitly configured — the default `noeviction` **rejects writes**
  when full.
- Monitor `evicted_keys`, rejected writes, RSS/allocator fragmentation and host/container swap or
  major faults. `mem_fragmentation_ratio` alone is not a reliable swap detector.
- Version the key prefix for format changes. `FLUSHALL` in a deploy pipeline is a stampede
  generator.

## Near-cache (L1 + L2)

- [ ] Cross-instance invalidation implemented (pub/sub, Kafka or CDC)
- [ ] L1 TTL **short**, as the safety net for lost events
- [ ] L1 TTL/stale-age bound derived explicitly (often no greater than L2, but consistency policy decides)
- [ ] Metrics separated per layer (L1, L2, source) — an aggregate hit rate hides which
      layer is working
- [ ] L2 outage policy tested: bounded fallback/origin traffic, stale serve, rejection or load shedding
- [ ] Invalidation-propagation test running in CI

Redis pub/sub is fire-and-forget. An instance disconnected at publish time misses the
message and serves stale data until its TTL expires — which is why the TTL is a safety net
rather than redundancy. Publish only after commit; if loss between commit and publish exceeds the
staleness policy, an `AFTER_COMMIT` listener is insufficient—use transactional outbox/CDC or
version-checked cache reads.

## Before implementing

- [ ] Source latency distribution, origin work and sustainable capacity measured
- [ ] Access distribution measured from real data
- [ ] `h` projected from that distribution for the intended `maximumSize`
- [ ] Decision made on `h × T_source`, not on `h` alone
- [ ] `maximumSize` or `maximumWeight` set — weight if entry sizes vary widely
- [ ] Logical weight calibrated to retained memory; full-cache post-GC/SLO headroom verified
- [ ] TTL derived from the business tolerance for stale data
- [ ] Jitter in the TTL if entries are created in bulk
- [ ] Values are immutable/versioned projections; entity-cache semantics are explicit
- [ ] `recordStats()` enabled
- [ ] Invalidation strategy defined **and** covered by an automated test
- [ ] Cache key includes every tenant/authorization/locale dimension affecting the value
- [ ] Cache-outage, loader-timeout, stale-fill race and cold-start behavior tested
