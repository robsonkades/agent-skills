---
name: gof-flyweight
description: >
  Flyweight in modern Java: sharing one immutable instance across many logical occurrences to
  reduce retained memory, with benefits dependent on duplicate lifetimes and lookup cost. Covers the
  intrinsic/extrinsic split, why cheap TLAB allocation does not make reclamation free, the memory
  arithmetic deciding whether a cache entry costs more than the object it
  saves, string deduplication and boundary canonicalisation as candidate alternatives, the
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

Reuse the workload, object graph, lifetime and memory/CPU budget already available. Identify which
values really repeat, which backing objects are already shared, and what varies by request,
tenant or configuration version. Ask only about material missing semantics or evidence. If ordinary
objects already meet the requirements, retaining them is a valid outcome; an estimate can justify a
focused experiment without being presented as a measured saving.

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
THEN compare applicable GC deduplication, existing sharing and boundary canonicalisation.
     Deduplication only shares eligible backing arrays and has GC/table costs; it is not a
     mandatory experiment when object lifetimes or the target collector make it unsuitable.

IF sharing is introduced
THEN preserve immutable intrinsic state and safe use of its reachable graph. For owned types,
     use defensive copies and prevent mutation through aliases; final fields alone are insufficient.
     For library objects, verify the documented immutability/thread-safety contract.

IF the cache is unbounded and keyed by data from requests
THEN inspect cardinality and lifetime: long-lived retention of arbitrary keys can grow without
     limit. Bound admission/bytes, use eviction where appropriate, or validate a closed domain;
     even operation-scoped pools need a peak-memory budget.

IF the pool is on a hot path shared by many threads
THEN test contention and mapping-function cost. `ConcurrentHashMap.computeIfAbsent`
     provides atomic per-key installation but its blocking/coordination details are
     implementation-specific; mapping functions must be short and non-recursive.

IF any code compares flyweights with ==
THEN require a documented identity scope (such as enums); otherwise compare semantic values/keys.
     equals is sufficient only when that type defines the required value equality.
     Integer.valueOf guarantees caching -128..127 but may cache more; 128 is not a portable miss.

IF the "flyweight" must be seen by other processes
THEN distinguish protocol value identity from process-local object identity. A receiver may
     canonicalise locally, but a JVM reference does not cross the wire.
```

## Cross-cutting checks

- **Concurrency.** Two hazards. The pool itself: a `synchronized` map serialises every lookup,
  while `ConcurrentHashMap.computeIfAbsent` may coordinate competing updates for a key. Expensive
  mapping functions stall peers, and recursive updates can fail or misbehave. The shared
  intrinsic values must be immutable and safely published. Unsynchronized mutation can race;
  even synchronized mutation of shared request data can leak it across consumers
  (`java-memory-model`, `false-sharing-and-contended`). A shared immutable `Pattern` with confined
  per-use `Matcher` state is a library example of the intrinsic/extrinsic split.
- **Distribution.** Process-local, always. A flyweight pool is not a distributed cache: it shares
  references, and references do not cross a process boundary. Each node interns its own copies,
  and transmitted values are reconstructed or resolved within the receiver. Where an
  identifier must be canonical across nodes, canonicalise the _value_ (a code, an id), not the
  object (`caching-strategies`).
- **Lifetime.** A resident-entry bound does not bound objects retained by callers after eviction;
  re-creation may leave several equal instances live. If shared descriptors own native/rendering
  resources, define who releases them after the last permitted use; eviction alone must not close
  resources still in use (`java-resource-management`).
- **Performance.** Lookup/retention costs compete with avoided construction and storage. Compare live-set
  size before and after, measured from a heap dump, alongside allocation rate and GC overhead
  measured before and after (`gc-log-analysis`). Watch for the second-order effect that motivates
  it honestly: a smaller live set may reduce marking/copying work, but GC phase times also depend
  on graph shape, collector and workload; verify rather than promise shorter pauses.
- **Testing.** Application behavior must use semantic equality/keys unless identity is a documented
  contract (enums). Implementation tests may verify reuse itself. Exercise eviction or admission
  bypass according to the bound policy, and separate pools; all must preserve application results.

## Review checklist

- [ ] Available workload/graph evidence justifies a change or a focused experiment
- [ ] Duplicate lifetimes or repeated construction costs justify lookup and retention overhead
- [ ] Avoided duplicate bytes/construction costs are estimated from actual distinctness
- [ ] Net memory/construction benefit includes the pool's overhead and is verified or explicitly hypothetical
- [ ] Intrinsic state and reachable aliases satisfy the sharing contract; varying state stays per-use
- [ ] Admission/retention and caller-held lifetimes fit the budget; semantic key scope is valid
- [ ] Value comparisons use a suitable equality/key contract unless identity has an explicit stable scope
- [ ] Relevant alternatives were compared without requiring an unrelated collector or representation change
- [ ] Lookup cost is checked; contention is measured when the pool is actually shared and at risk

## References

Deliver the sharing key and ownership scope, selected or retained design, estimated net benefit,
correctness constraints and actual evidence or focused next check. Label unmeasured benefits as
hypotheses rather than confirmed fixes.

- [When sharing pays](references/when-sharing-pays.md) — the memory arithmetic per object and per
  cache entry, the JDK's own flyweights and their limits, relevant alternatives
  (deduplication, boundary canonicalisation, primitive and columnar layouts, enums), the
  measurement method before and after, and the leak and contention failure modes. Read before
  writing any pool.
- [Worked example](references/worked-example.md) — a hypothetical ingest pipeline holding 40 million
  records: bounded boundary canonicalisation, lifetime and thread ownership, value equality and
  the measurements required before accepting a saving. Read when implementing.
