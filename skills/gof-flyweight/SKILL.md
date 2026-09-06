---
name: gof-flyweight
description: >
  Flyweight in modern Java: sharing one immutable instance across many logical occurrences to
  reduce retained memory, with benefits dependent on duplicate lifetimes and lookup cost. Covers the
  intrinsic/extrinsic split, why cheap TLAB allocation does not make reclamation free, the memory
  arithmetic deciding whether a cache entry costs more than the object it
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

In modern Java it most clearly pays for **many duplicate values retained at once**. Short-lived
objects are often allocated cheaply from thread-local buffers, but reclamation, zeroing, survivor
copying and allocation stalls are not free. Canonicalization can still lose through lookup,
retention and contention, so treat any flyweight proposal as a performance claim requiring
live-set and CPU evidence
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

- **The objects are short-lived and allocation/GC is not the measured bottleneck.** Pooling often
  promotes state and adds lookup work, but high allocation rate can still matter. Compare scalar
  replacement, compact representations and canonicalization with evidence (`gc-fundamentals`).
- **The distinct-value count is not much smaller than the occurrence count.** Sharing saves
  few duplicates; compare their actual size with table overhead before rejecting or accepting it.
- **The saving is smaller than the cache.** Measure map/table, key, reference and alignment
  overhead for the actual JVM options; fixed byte estimates change with compressed references,
  implementation and load factor.
- **The shared object is mutable.** A mutable flyweight is shared mutable state, and when it
  carries tenant or user data, one request's mutation is another's data.
- **Speed is asserted without a mechanism.** Sharing can improve cache locality or avoid repeated
  parsing/compilation, and can also lose through hashing and contention. Benchmark the complete
  access path rather than classifying it as memory-only.
- **It is meant to be shared across processes.** A flyweight pool is process-local; see below.

## Modern Java expression

Snippets use Java 17 APIs and are partial examples. Inspect the project's toolchain, collector and
runtime flags before applying JVM-specific advice; this skill does not authorize upgrades.

```text
Classical                          Modern
─────────────────────────────────  ────────────────────────────────────
FlyweightFactory.get(key)          Map<K, V> canonical, populated at the
with a HashMap                     boundary; or an enum when the set
                                   is closed

intrinsic state in a shared        a deeply immutable class or record;
mutable object                     records are only shallowly final and the
                                   reference still needs safe publication

extrinsic state stored per         extrinsic state as a method
occurrence                         parameter, or a parallel primitive
                                   array

hand-rolled string interning       -XX:+UseStringDeduplication where the
                                   target JDK/collector supports it;
                                   shares backing arrays, with GC/table cost
```

The JDK's own flyweights are the model: `Integer.valueOf` caches −128..127, `Boolean.valueOf`
returns two constants, enum constants are one instance each per defining class loader.
Empty list factories may reuse instances, but `List.of()` has no identity guarantee.

## Decision rules

```text
IF the proposal lacks evidence of duplicate retention or expensive repeated construction
THEN measure first. A heap dump can establish retention; profiles can establish construction cost.
     "Lots of small objects" is not evidence
     (heap-dump-analysis).

IF the duplicates are Strings
THEN evaluate -XX:+UseStringDeduplication on a supported collector before writing
     an intern table. It consumes concurrent GC CPU/table memory and only deduplicates
     eligible backing arrays; compare retained bytes and GC overhead.

IF sharing is introduced
THEN the shared type must be deeply immutable. Enforce it — final
     class, final fields, no mutable components, defensive copies.

IF the cache is unbounded and keyed by data from requests
THEN it is a memory leak with a slow fuse. Bound it and give it an
     eviction policy, or restrict keys to a closed set.

IF the pool is on a hot path shared by many threads
THEN test contention and mapping-function cost. `ConcurrentHashMap.computeIfAbsent`
     provides atomic per-key installation but its blocking/coordination details are
     implementation-specific; mapping functions must be short and non-recursive.

IF any code compares flyweights with ==
THEN require a documented identity contract (such as enums); otherwise use equals.
     Integer.valueOf guarantees caching -128..127 but may cache more; 128 is not a portable miss.

IF the "flyweight" must be seen by other processes
THEN it is not this pattern. Serialisation recreates copies on the
     other side; sharing does not survive the wire.
```

## Cross-cutting checks

- **Concurrency.** Two hazards. The pool itself: a `synchronized` map serialises every lookup,
  while `ConcurrentHashMap.computeIfAbsent` may coordinate competing updates for a key. Expensive
  mapping functions stall peers, and recursive updates can fail or misbehave. The shared
  objects must be deeply immutable and safely published; a mutable shared
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
  it honestly: a smaller live set may reduce marking/copying work, but GC phase times also depend
  on graph shape, collector and workload; verify rather than promise shorter pauses.
- **Testing.** Application behavior must use value equality unless identity is a documented
  contract (enums). Implementation tests may verify reuse itself. Exercise eviction or admission
  bypass according to the bound policy, and separate pools; all must preserve application results.

## Review checklist

- [ ] A heap dump or allocation profile justifies the change
- [ ] Duplicate lifetimes or repeated construction costs justify lookup and retention overhead
- [ ] Avoided duplicate bytes/construction costs are estimated from actual distinctness
- [ ] The saving exceeds the cache's own overhead, with the arithmetic written down
- [ ] The shared type is deeply immutable
- [ ] The cache is bounded, or keyed by a closed set
- [ ] Value comparisons use equals unless identity is an explicit stable contract
- [ ] String deduplication was considered before hand-written interning
- [ ] The pool's contention under the expected thread count was measured

## References

Deliver the sharing key and ownership scope, estimated net saving, correctness constraints and
before/after evidence. Label unmeasured benefits as hypotheses rather than confirmed fixes.

- [When sharing pays](references/when-sharing-pays.md) — the memory arithmetic per object and per
  cache entry, the JDK's own flyweights and their limits, alternatives that usually win
  (deduplication, boundary canonicalisation, primitive and columnar layouts, enums), the
  measurement method before and after, and the leak and contention failure modes. Read before
  writing any pool.
- [Worked example](references/worked-example.md) — a hypothetical ingest pipeline holding 40 million
  records: bounded boundary canonicalisation, lifetime and thread ownership, value equality and
  the measurements required before accepting a saving. Read when implementing.
