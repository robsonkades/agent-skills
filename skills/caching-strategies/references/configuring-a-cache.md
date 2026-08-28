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

When entry sizes vary by orders of magnitude — HTTP responses, lists, documents —
`maximumWeight` is the correct control, because memory is what matters, not the count.

Keep `maximumSize × average_size` at or below ~25% of available heap. Above that, the cache
becomes a GC problem before it becomes a hit-rate problem.

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
            public long expireAfterUpdate(Long k, ProductDto v, long now, long d) { return d; }
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

`refreshAfterWrite` reloads asynchronously on the first access after the interval, serving
the stale value meanwhile. `expireAfterWrite` remains as the hard bound for keys that stop
being accessed.

For async loading, `AsyncCacheLoader.asyncLoad` takes `(K key, Executor executor)` — **two**
parameters. A one-argument lambda in `buildAsync` does not compile.

## Redis

```java
// The default serialiser is JdkSerializationRedisSerializer, not JSON
template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
```

`Jackson2JsonRedisSerializer<>(Object.class)` fails with `ClassCastException` on the first
hit, because it does not write the type.

- `maxmemory-policy` explicitly configured — the default `noeviction` **rejects writes**
  when full.
- Monitor `evicted_keys` and `mem_fragmentation_ratio` (below 1.0 indicates swap).
- Version the key prefix for format changes. `FLUSHALL` in a deploy pipeline is a stampede
  generator.

## Near-cache (L1 + L2)

- [ ] Cross-instance invalidation implemented (pub/sub, Kafka or CDC)
- [ ] L1 TTL **short**, as the safety net for lost events
- [ ] `TTL_L1 < TTL_L2`
- [ ] Metrics separated per layer (L1, L2, source) — an aggregate hit rate hides which
      layer is working
- [ ] Graceful degradation tested: with L2 down, the service still responds
- [ ] Invalidation-propagation test running in CI

Redis pub/sub is fire-and-forget. An instance disconnected at publish time misses the
message and serves stale data until its TTL expires — which is why the TTL is a safety net
rather than redundancy. Propagate **after commit**
(`@TransactionalEventListener(AFTER_COMMIT)`), never inside the transaction.

## Before implementing

- [ ] `T_source` **measured** (p50 and p99), not estimated
- [ ] Access distribution measured from real data
- [ ] `h` projected from that distribution for the intended `maximumSize`
- [ ] Decision made on `h × T_source`, not on `h` alone
- [ ] `maximumSize` or `maximumWeight` set — weight if entry sizes vary widely
- [ ] `maximumSize × average_size` ≤ ~25% of available heap
- [ ] TTL derived from the business tolerance for stale data
- [ ] Jitter in the TTL if entries are created in bulk
- [ ] Values are immutable DTOs, never JPA entities
- [ ] `recordStats()` enabled
- [ ] Invalidation strategy defined **and** covered by an automated test
