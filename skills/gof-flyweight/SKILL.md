---
name: gof-flyweight
description: >
  Flyweight in modern Java: sharing one immutable instance across many logical occurrences to
  bound memory, and why the modern JVM makes that pay only for long-lived duplicates. Covers the
  intrinsic/extrinsic split, why allocation of short-lived objects is nearly free so pooling them
  loses, the memory arithmetic deciding whether a cache entry costs more than the object it
  saves, string deduplication and boundary canonicalisation as cheaper alternatives, the
  unbounded intern map as a leak, and the == trap. Use
  when object pooling or interning is proposed, when a heap dump shows millions of duplicate
  values, when someone suggests caching small objects for speed, when a shared instance is
  mutable, or when a flyweight cache is described as a distributed cache. Does
  not cover application-level caching policy (caching-strategies),
  finding the duplicates (heap-dump-analysis), allocation cost in general (allocation-profiling),
  or one-instance-with-global-access (gof-singleton).
---

# Flyweight

## Purpose

Reduce the memory a large population of objects occupies, by storing what they share once and
passing in what differs. The state that is shared is _intrinsic_; the state that varies is
_extrinsic_ and moves to the caller or to a parameter.

In modern Java this pays in one situation: **many duplicates that stay alive**. Short-lived
objects are allocated by a pointer bump in a thread-local buffer and collected without ever being
copied, so pooling them adds bookkeeping, cache misses and contention in exchange for nothing.
Treat any flyweight proposal as a performance claim requiring a measurement
(`allocation-profiling`, `heap-dump-analysis`).

## When it is the answer

```text
Millions of long-lived objects, most of which are duplicates of a
small set of distinct values
        → Flyweight, usually as canonicalisation at the boundary.

A large population shares heavy immutable state — a descriptor, a
schema, a rendering resource, a compiled pattern
        → keep one; pass the varying part as a parameter.

The distinct-value count is small and bounded, and known in advance
        → an enum or a static table. The pattern with no cache at all.
```

## When it is not

- **The objects are short-lived.** Escape analysis may remove them entirely; if not, young-
  generation collection of dead objects is close to free. Pooling makes them long-lived, which is
  strictly worse (`gc-fundamentals`).
- **The distinct-value count is not much smaller than the occurrence count.** Sharing saves
  nothing and the map costs everything.
- **The saving is smaller than the cache.** A `HashMap` entry costs roughly 40–50 bytes plus the
  key; sharing objects that are smaller than that loses memory.
- **The shared object is mutable.** A mutable flyweight is shared mutable state, and when it
  carries tenant or user data, one request's mutation is another's data.
- **Speed was the motivation.** This pattern trades CPU (hashing, lookup, contention) for memory.
  It is not an optimisation for time.
- **It is meant to be shared across processes.** A flyweight pool is process-local; see below.

## Modern Java expression

```text
Classical                          Modern
─────────────────────────────────  ────────────────────────────────────
FlyweightFactory.get(key)          Map<K, V> canonical, populated at the
with a HashMap                     boundary; or an enum when the set
                                   is closed

intrinsic state in a shared        a record: immutable by construction,
mutable object                     safe to share without publication
                                   concerns

extrinsic state stored per         extrinsic state as a method
occurrence                         parameter, or a parallel primitive
                                   array

hand-rolled string interning       -XX:+UseStringDeduplication (G1/ZGC),
                                   which deduplicates the char arrays
                                   with no code and no cache
```

The JDK's own flyweights are the model: `Integer.valueOf` caches −128..127, `Boolean.valueOf`
returns two constants, enum constants are one instance each, `List.of()` returns a shared empty
list. All are immutable, all are bounded, none is a general-purpose pool.

## Decision rules

```text
IF the proposal is not backed by a heap dump showing the duplicates
THEN measure first. "Lots of small objects" is not evidence
     (heap-dump-analysis).

IF the duplicates are Strings
THEN try -XX:+UseStringDeduplication before writing code. It reclaims
     the backing arrays automatically and costs nothing to revert.

IF sharing is introduced
THEN the shared type must be deeply immutable. Enforce it — final
     class, final fields, no mutable components, defensive copies.

IF the cache is unbounded and keyed by data from requests
THEN it is a memory leak with a slow fuse. Bound it and give it an
     eviction policy, or restrict keys to a closed set.

IF the pool is on a hot path shared by many threads
THEN it is a contention point. computeIfAbsent on a hot key serialises
     threads on one bin; measure before assuming a map is free.

IF any code compares flyweights with ==
THEN it works by accident and will break when a value falls outside
     the cache or an entry is evicted. Use equals; the Integer 127/128
     boundary is the canonical demonstration.

IF the "flyweight" must be seen by other processes
THEN it is not this pattern. Serialisation recreates copies on the
     other side; sharing does not survive the wire.
```

## Cross-cutting checks

- **Concurrency.** Two hazards. The pool itself: a `synchronized` map serialises every lookup,
  and even `ConcurrentHashMap.computeIfAbsent` holds a bin lock while the mapping function runs —
  an expensive function under a hot key is a stall, and a recursive one deadlocks. And the shared
  objects: immutability is what makes sharing safe without publication concerns; a mutable shared
  flyweight under concurrency is both a race and, when it carries request data, a cross-request
  leak (`java-memory-model`, `false-sharing-and-contended`).
- **Distribution.** Process-local, always. A flyweight pool is not a distributed cache: it shares
  references, and references do not cross a process boundary. Each node interns its own copies,
  and anything sent over the wire is serialised and re-created by the receiver. Where an
  identifier must be canonical across nodes, canonicalise the _value_ (a code, an id), not the
  object (`caching-strategies`).
- **Performance.** The pattern is a memory optimisation with a CPU cost. Judge it on the live-set
  size before and after, measured from a heap dump, and on allocation rate and GC overhead
  measured before and after (`gc-log-analysis`). Watch for the second-order effect that motivates
  it honestly: a smaller live set means shorter concurrent marking and less copying work, which
  can improve pause times more than the byte count suggests.
- **Testing.** Test that flyweights are equal by value, never that they are identical, unless
  identity is a documented guarantee for a closed set (enums). Include an eviction in the test if
  the cache is bounded: code that silently relied on stable identity fails only after eviction,
  which in production means under load.

## Review checklist

- [ ] A heap dump or allocation profile justifies the change
- [ ] The duplicated objects are long-lived, not per-request garbage
- [ ] Distinct values are far fewer than occurrences
- [ ] The saving exceeds the cache's own overhead, with the arithmetic written down
- [ ] The shared type is deeply immutable
- [ ] The cache is bounded, or keyed by a closed set
- [ ] No code depends on `==` between flyweights
- [ ] String deduplication was considered before hand-written interning
- [ ] The pool's contention under the expected thread count was measured

## References

- [When sharing pays](references/when-sharing-pays.md) — the memory arithmetic per object and per
  cache entry, the JDK's own flyweights and their limits, alternatives that usually win
  (deduplication, boundary canonicalisation, primitive and columnar layouts, enums), the
  measurement method before and after, and the leak and contention failure modes. Read before
  writing any pool.
- [Worked example](references/worked-example.md) — an ingest pipeline holding 40 million parsed
  records: the heap dump that justified canonicalisation, the boundary interning that replaced a
  per-object cache, the numbers before and after, the `==` trap that appeared during the change,
  and what was reverted. Read when implementing.
