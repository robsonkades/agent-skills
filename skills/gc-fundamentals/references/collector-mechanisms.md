# Collector mechanisms

## The three base algorithms

| Algorithm    | Moves objects | Fragments | Cost proportional to | Space overhead    |
| ------------ | ------------- | --------- | -------------------- | ----------------- |
| Mark-sweep   | no            | yes       | heap size (sweep)    | none              |
| Mark-compact | yes           | no        | live data (moving)   | none              |
| Copying      | yes           | no        | **survivors only**   | reserved to-space |

Copying is why a young collection is cheap: with 99% mortality, almost nothing is copied,
and the whole Eden is reclaimed by moving a pointer. This is also why the same collection
becomes expensive the moment survival rises — the algorithm did not change, the input did.

## Where the generational hypothesis fails

The hypothesis — most objects die young — is empirical. It breaks in three recognisable
shapes:

- **Caches.** Entries are created to survive. Everything promoted, nothing reclaimed
  cheaply.
- **Object pools.** The same objects live forever by design and are repeatedly scanned.
- **High downstream latency.** By `N = λ × R`, slower dependencies mean more requests in
  flight, so more per-request objects are alive at any young collection. GC gets more
  expensive without anything in the JVM having changed.

The third is the one that gets misdiagnosed as a GC problem. The fix is upstream.

## Write barriers

Generational and regional collectors need to know about references that cross their
boundary, and the only way is to intercept every reference store.

- **Card table** — the classic scheme: mark the card containing the modified field.
  Cheap, coarse.
- **G1** — SATB pre-barrier (records the overwritten value so concurrent marking stays
  correct) plus a post-barrier that enqueues cross-region references for the remembered
  sets. Substantially more expensive per store than the classic scheme.
- **ZGC / Shenandoah** — load barriers rather than store barriers; the cost moves to
  reads and buys concurrent relocation.

This is why "the same code" has different throughput under different collectors even when
no collection happens: the barrier runs on every reference store or load regardless.

## Allocation on the fast path

TLAB allocation is a pointer bump — a few nanoseconds. TLAB refill is sub-microsecond.
The millisecond spikes people attribute to allocation are the **collection** the slow path
eventually triggers, not the allocation itself.

The consequence: "don't create objects" is almost never the right answer. Managing
allocation _rate_ and object _lifetime_ almost always is.

## The JDK 25 collector landscape

| Collector  | Pause depends on heap size | Generational          | Design point                      |
| ---------- | -------------------------- | --------------------- | --------------------------------- |
| Serial     | yes                        | yes                   | tiny heaps, single core           |
| Parallel   | yes                        | yes                   | throughput, batch, no latency SLO |
| G1         | partly (target-driven)     | yes                   | balanced default                  |
| ZGC        | **no**                     | yes, by definition    | large heaps, latency SLO          |
| Shenandoah | **no**                     | generational, product | large heaps, latency SLO          |

Two baseline corrections that invalidate older comparisons:

- `-XX:+ZGenerational` **does not exist** any more (JEP 490, JDK 24). ZGC is generational,
  period. Carrying the flag forward is an upgrade failure, not dead configuration: measured,
  Temurin 25.0.4 starts and warns `Ignoring option ZGenerational`, while Temurin 26.0.2
  **refuses to start** with `Unrecognized VM option 'ZGenerational'`.
- Generational Shenandoah is product (JEP 521), not experimental — but still not the default
  through JDK 27. JEP 535 makes it the default and is **Targeted for JDK 28**.

## Humongous allocations

An object larger than half a G1 region is allocated directly into contiguous humongous
regions, bypassing the young path. They are reclaimed less eagerly and fragment the heap.

```bash
grep -i humongous gc.log
```

If they are frequent, the fix is the allocation site (a large array, a big buffer), not a
collector flag.
