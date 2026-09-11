---
name: caching-strategies
description: >
  Deciding whether to cache, then doing it safely: saved origin work and latency, bounded size
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

A cache can reduce the arrival rate seen by an origin in `L = λ × W`: a hit consumes no origin
connection, planner or I/O. Batching, admission control and eliminating work can also reduce
origin demand, so caching is one option rather than a unique law. A stale, unbounded cache can
show excellent hit rate; correctness, memory and origin protection must be measured beside it.

## Workflow

Inspect the target's Maven/Gradle release/toolchain, resolved Caffeine/Spring Data/Jackson
versions, runtime image and cache configuration before choosing APIs. No universal Java baseline
is declared here; the configuration reference states its example baseline. Preserve project
versions and do not enable preview features or upgrade dependencies to fit an example. If workload,
freshness requirements or measurements are absent, identify the gap and offer a conditional
decision and measurement plan rather than inventing a hit rate or safe TTL.

1. **Measure source cost and capacity** (latency distribution, CPU/I/O and rate) before deciding.
   Even a sub-millisecond lookup may matter at very high volume; latency alone is not the case.
2. **Measure the access distribution** and estimate `h` for the intended `maximumSize`.
3. **Model saved work and latency, not hit rate alone.** Estimate origin work avoided by hit
   distribution and compare `h·T_hit + (1-h)·T_miss` (including queueing/load cost) with the
   uncached distribution. Tail latency cannot be derived from averages.
4. **Bound it**—by count or a measured weight proxy. Account for keys, values, node metadata,
   allocator/GC headroom and concurrent load buffers; a weigher's logical bytes are not measured
   heap retention. Validate with heap/allocation evidence under representative occupancy.
5. **Choose a freshness contract.** Immutable content/version keys whose value cannot change may
   need capacity eviction without TTL or invalidation; verify that identity contract and handle
   retention, authorization and revocation separately. For changing values, derive a TTL or another freshness
   mechanism from the business tolerance for stale data, and add jitter if expiring entries are
   created in bulk. Keep the longest jittered lifetime inside that tolerance, accounting for
   source lag and load time. Access-based expiry does not bound the age of frequently read data.
6. **Define and test invalidation where required** — propagation is the part that silently stops
   working. If it is unnecessary, state and verify the identity/freshness contract that permits it.
7. **Instrument outcomes**: request-weighted and byte-weighted hit/miss, origin rate and load
   latency/failures, eviction/admission, retained memory, and stale-age/version/invalidation lag
   where applicable to the freshness contract.

## Rules

- For a simple cache-aside path, `E[T] ≈ h·T_hit + (1-h)·T_miss`; miss cost includes cache lookup,
  origin queueing/load and fill. Increasing hit rate has linear average benefit only if those
  distributions stay fixed; near saturation, queueing can make the system nonlinear. Hit-rate
  gain per byte depends on the observed popularity/size distribution, not a universal logarithm.
- **Hit rate does not establish correctness.** Keeping entries longer can improve hits while
  violating freshness or memory bounds. Judge lifetime and invalidation against the value's
  contract, not their mere presence or absence.
- Avoid putting managed/mutable JPA entities in an application cache—the cache may retain aliases,
  lazy proxies and persistence-context assumptions. Cache immutable projections/value snapshots
  with an explicit version. A provider's second-level cache is a separate coordinated mechanism,
  not evidence that arbitrary entity references are safe.
- In Spring's default proxy mode, `@Cacheable` self-invocation via `this` bypasses interception.
  AspectJ mode or direct programmatic caching differs. Test the deployed mode; extracting a
  collaborator is often clearer than self-injection.
- Never cache an operation with a side effect. `@Cacheable` on something that _creates_
  means that on a hit the thing is not created and the cache asserts that it was.
  For idempotency that must survive eviction, restart and retries, use a durable record with an
  atomic relationship to the effect; a unique key alone does not supply that relationship.
  Delegate the operation contract to `idempotency`.
- Stampede has several scopes: jitter desynchronizes bulk expiry; singleflight/`LoadingCache`
  coalesces per key only within its process/cache instance unless backed by distributed
  coordination; `refreshAfterWrite` serves an old value while a hot-key refresh runs; staged
  warm-up avoids a
  global cold cache. Probabilistic early expiration reduces the spike, it does not remove
  it — and the correct form is `P = exp(−(expiry − now) / (β · δ))`, with β in the
  denominator and `δ` representing measured recomputation duration. Validate the algorithm and
  clock/units rather than copying the equation without its assumptions: require positive β and
  δ, consistent time units, and treat already expired entries as misses rather than probabilities
  greater than one.
- `FLUSHALL` in a deploy pipeline is a stampede generator. If the service needs the cache to
  serve its load, the cache is an **availability** component, not a performance one. For a
  format change, version the key prefix, but stage and rate-limit warming: switching every
  caller to an empty namespace is also a cold-cache event. Budget old/new namespaces together.
- Spring Data Redis defaults `RedisTemplate`/`RedisCache` to JDK serialization in current
  documentation; override it explicitly. Prefer a typed schema/serializer. In Spring Data Redis
  4, Jackson 3 uses `JacksonJsonRedisSerializer<T>` or `GenericJacksonJsonRedisSerializer`;
  Jackson-2-named serializers are deprecated, and the old generic serializer enabled default
  typing by default. Do not solve lost type information by enabling payload-selected classes
  (java-serialization-hardening).
- Redis pub/sub is fire-and-forget. An L1 TTL limits local retention, not end-to-end staleness:
  expiry may refill from an already stale L2 or origin replica. Derive the age budget across
  layers, propagate versions/remaining freshness, or reload from a sufficiently fresh source.
  Publish only after a successful commit,
  but recognize that an `AFTER_COMMIT` listener can crash before publishing. Use an outbox/CDC or
  version-checked reads where bounded reliable invalidation is required.
- Cache-aside has races: an old slow read can fill after a newer write invalidates, resurrecting
  stale data. A version field alone does not reject the old fill. Define the check against the
  authoritative version or invalidation watermark, including absent entries and deletes.
  Write-through/CDC still need ordering against concurrent fills; use a tolerated stale window
  only when the consistency requirement permits it.
- A key is an authorization boundary. Include tenant, locale, entitlement/principal dimensions
  that affect the result; canonicalize them; never let one tenant reuse another's cached response.
  Avoid secrets/PII in keys because keys appear in metrics, logs and admin tools.
- Negative caching protects against penetration only with a short bounded TTL and input/cardinality
  controls. Caching every attacker-chosen miss is itself an unbounded-memory attack.
  Cache absence only when the source confirms it under the key's visibility contract; a timeout,
  unavailable dependency or loader failure leaves existence unknown. Explicit failure caching
  can suppress repeated origin calls, but represent failures separately from not-found results,
  with bounded retention and an accepted retry/recovery policy. Preserve the failure outcome
  rather than reporting confirmed absence.

## Deliverable

For a design/review, return the cache/no-cache decision, measured inputs and assumptions, key/value
contract, memory/freshness bounds, invalidation race handling and origin-outage policy. State the
targeted tests and acceptance bounds. For an incident, report evidence, competing hypotheses and
the next discriminating measurement; do not label an untested hypothesis a confirmed fix.

## Primary sources

- [Spring Data Redis object mapping and serializers](https://docs.spring.io/spring-data/redis/reference/redis/template.html)
- [Spring Data Redis 4 migration guide](https://docs.spring.io/spring-data/redis/reference/upgrading.html)
- [Caffeine refresh semantics](https://github.com/ben-manes/caffeine/wiki/Refresh)
- [Caffeine 3.2.2 builder API contracts](https://github.com/ben-manes/caffeine/blob/v3.2.2/caffeine/src/main/java/com/github/benmanes/caffeine/cache/Caffeine.java)
- [Redis Pub/Sub delivery](https://redis.io/docs/latest/develop/pubsub/)
- [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/)
- [AWS caching failure responses and recovery trade-offs](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)

## References

- [Configuring a cache](references/configuring-a-cache.md) — Caffeine and Spring
  configuration with bounds, weight, jitter and stats; the Redis settings that matter; and
  the near-cache (L1+L2) rules. Read when implementing or reviewing a cache.
- [Cache incident triage](references/incident-triage.md) — the symptom-to-cause table and
  the metric set that makes each cause visible. Read when a cache-related incident is in
  progress.
