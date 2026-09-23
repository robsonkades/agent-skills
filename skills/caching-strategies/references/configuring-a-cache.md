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

## Bound origin work separately

Separate served requests, hit/miss lookups and actual load attempts. Same-key misses can share
one load; a hit can trigger refresh; scheduled warming can load without a request. Count first
attempts by trigger and retries separately, without counting one refresh twice. The shortcut
`origin rate = request rate × miss ratio` applies only when each miss causes one load and no
other origin work occurs. Background loads can affect foreground latency through shared capacity.

`maximumSize`/`maximumWeight` bound retained cache entries, not admitted loader operations or
their buffers. Test many distinct cold keys against a blocked origin, not only many callers
of one key. Bound concurrent source calls and queued work with an explicit rejection/stale-serve
policy; a fixed-size executor with an unbounded queue merely moves the overload. Cache size,
singleflight and TTL are not substitutes for this admission policy.

Apply the bound where the origin work actually executes. An async loader can ignore Caffeine's
executor and submit to another client/executor. A future timeout need not stop the underlying
request; count work until it actually ends, or abandoned calls can escape the intended limit.
Exercise refresh rejection, timeout and recovery as well as ordinary misses. Sharing a cache's
executor with maintenance requires checking the selected executor/rejection behavior too.

## Authorize cache hits

Derive tenant/principal context from authenticated state; a caller-supplied tenant key is not
proof of access. Keep the authorization check on a path that executes even when the value is
already cached. A per-principal key prevents cross-principal reuse but does not revoke a cached
allow decision when that same principal loses a role or resource access.

For Spring, `@Cacheable` can skip the annotated method body. Inspect the actual proxy/advice
chain and test both hit and miss paths instead of relying on annotation placement alone.
Separate reusable data caching from permission evaluation when useful. If permission decisions
are themselves cached, define their revocation/version/expiry contract explicitly; a long data
TTL must not silently become the access-revocation delay.

Use hostile checks: fill as an authorized caller, revoke access without changing the data key,
then repeat the call; repeat under another tenant and with forged tenant input. The result must
follow the declared authorization contract on hits and misses, without exposing cached data.
These checks target cache integration; they do not establish a complete authorization policy.

Contracts checked 2026-09-19 against the [Caffeine refresh documentation](https://github.com/ben-manes/caffeine/wiki/Refresh),
[3.2.2 builder](https://raw.githubusercontent.com/ben-manes/caffeine/v3.2.2/caffeine/src/main/java/com/github/benmanes/caffeine/cache/Caffeine.java)
and [Spring caching documentation](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html).
The admission and authorization checks are design consequences, not evidence of a target
application's actual executor, advice order or permission behavior.

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
- [ ] Authorization/revocation works on warm hits, including hostile tenant input
- [ ] Distinct-key misses, refresh and warm-up share a measured origin admission budget
- [ ] Cache-outage, loader-timeout, stale-fill race and cold-start behavior tested
