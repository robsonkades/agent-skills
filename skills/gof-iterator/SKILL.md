---
name: gof-iterator
description: >
  Iterator in modern Java: traversing an aggregate without exposing it, and choosing between
  Iterator, Stream and Spliterator — external pull versus internal lazy pipeline versus the
  parallel decomposition primitive. Covers when a Spliterator can adapt to both, what fail-fast
  really promises and how weakly consistent iterators differ, streams that hold a resource and
  must be closed, remote pagination as iteration with page drift, and the characteristics that
  decide whether a stream can be sized or split. Use when exposing a collection from a type, when
  a custom traversal is being written, when ConcurrentModificationException appears, when a stream
  over a file or a result set leaks, when paging through a remote API, or when a parallel stream
  is not faster. Does not cover stream pipeline design and collectors
  in general (java-streams), the tree being traversed (gof-composite), adding operations over
  it (gof-visitor), or database paging strategy.
---

# Iterator

## Purpose

Let a caller walk a sequence without knowing how it is stored, and without the sequence handing
out its internals. The pattern is so thoroughly absorbed into Java — `Iterable`, the enhanced
`for`, `Stream` — that the design question is almost never "should we have an iterator" but
"which of the three abstractions should this type expose, and what does each promise".

Inspect compiler release/toolchains, source ownership, null/mutation contracts and resource lifetime
before choosing. Examples use Java 17 (partial domain types/imports omitted); Gatherers are
standard in Java 24 ([JEP 485](https://openjdk.org/jeps/485)) and are optional, not a reason
to upgrade a target project.

Start with ordinary traversal, an advanced consumer such as interleaved passes, and an early-exit
or failure path. Inspect existing callers and provider contracts for replay, order, mutation and
ownership before asking about gaps. Keep an adequate loop, collection view or iterator; add a new
abstraction only for a required consumer capability.

## Iterator, Stream, Spliterator

```text
Iterator<T>       external, pull. The caller controls the pace and may
                  stop, resume, or interleave two traversals. Stateful,
                  single-use, remove() is optional. No splitting API.

Stream<T>         internal, lazy, single-use pipeline. Operations fuse;
                  short-circuiting works; parallelism is available.
                  Not a data structure — it cannot be re-traversed, and
                  it may need closing when backed by a resource.

Spliterator<T>    the primitive underneath Stream: tryAdvance for one
                  element, trySplit for parallel decomposition, plus
                  characteristics that let the pipeline optimise.
                  Implement this and you get both of the above.
```

Choose the smallest contract consumers need. `Spliterator` is useful when splitting or stream
characteristics are meaningful, and adapters can derive an `Iterator` or `Stream` from it. A
direct `Iterator` is often simpler for stateful pull protocols and must not be replaced merely to
follow a universal rule.

## When it is the answer

```text
A type owns a collection and must not hand out a mutable reference
        → expose a read-only traversal or unmodifiable view;
          an Iterable alone may still allow iterator.remove().

The sequence is computed, unbounded, or arrives in pages
        → choose Iterator for pull control or Spliterator for stream adaptation;
          bound remote work separately from the number of emitted elements.

Traversal must be resumable, interleaved or two-handed (merge, diff)
        → Iterator. Streams cannot be paused and resumed by the caller.

Traversal must be parallel
        → Spliterator with an honest trySplit and correct characteristics.
```

## When it is not

- **The collection is already a `List` you can expose.** `List.copyOf` gives an unmodifiable
  structural snapshot and rejects null elements; `Collections.unmodifiableList(source)` gives
  a live unmodifiable view. If the existing API permits nulls, a snapshot can use
  `Collections.unmodifiableList(new ArrayList<>(source))` to preserve that contract. None of
  these freezes mutable elements. Obtain a snapshot under the source's synchronization policy;
  see the [Java 17 List contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html).
- **The caller needs random access or collection-style size.** A collection may be the right
  contract when materialization fits. Repeated traversal alone can use a repeatable `Iterable` or
  a factory for fresh traversals; specify independent state, replay consistency and reopening cost.
  Neither an `Iterable` nor a stream-returning method alone guarantees repeatability.
- **You are writing an `Iterator` for an existing collection with an adequate iterator.** Delegate
  or expose an immutable view. For a custom structure, Iterator may remain the simplest correct
  traversal; add Spliterator only for useful stream/splitting semantics.
- **The "iteration" is a remote query.** Paging adds latency and consistency questions and may
  hold server-side cursor state. Inspect the provider contract rather than inferring stateful
  resources or snapshot semantics from the traversal interface.

## Decision rules

```text
IF the traversal is over a resource — a file, a result set, a socket
THEN the Stream is AutoCloseable and MUST be closed; wrap it in
     try-with-resources and document it. A leaked cursor holds a
     connection until the pool is exhausted.

IF a collection is mutated during traversal
THEN fail-fast is best effort, not a guarantee: ConcurrentModification-
     Exception may not be thrown, and traversal may be incorrect.
     Never rely on it for correctness.

IF the collection is concurrent
THEN inspect its iterator contract: ConcurrentHashMap is weakly consistent,
     CopyOnWriteArrayList is a structural snapshot. Neither implies deep
     immutability of elements or safe concurrent driving of one iterator.

IF elements must be removed while traversing
THEN use Iterator.remove() when supported, or a supported removeIf() outside
     the traversal; concurrent collections may explicitly permit other mutation.

IF a custom Spliterator is written
THEN its characteristics must be true. Claiming SIZED or DISTINCT when
     it is not produces wrong results, not slow ones.

IF trySplit cannot split evenly, or the source is a linked structure
THEN parallel streams may not amortize splitting/coordination; measure before
     using them.

IF iteration crosses a network boundary
THEN it is pagination: compare cursor, keyset and offset semantics; define snapshot,
     duplicate/skip behavior under mutations, cancellation and a total/deadline bound.

IF an Iterable is returned from a type whose state may change
THEN say whether the traversal is a snapshot or live. Callers will
     assume whichever is convenient.
```

## Modern Java expression

```text
Expose a collection safely           List.copyOf(...) for non-null elements;
                                     choose a snapshot or live view preserving null policy

Expose a computed sequence           Stream, via a Spliterator

Adapt a legacy Iterator to a Stream  StreamSupport.stream(
                                       Spliterators.spliteratorUnknownSize(
                                         it, ORDERED), false)

Stateful pipeline transformation     Consider Gatherers (Java 24+); a pull
                                     cursor may still need an Iterator

Infinite or generated sequences      Stream.iterate / Stream.generate,
                                     with a limit at the source

Two-handed traversal (merge, diff)   Iterator for explicit control; Stream.iterator()
                                     is an escape hatch with source closing retained
```

## Cross-cutting checks

- **Concurrency.** Do not assume an iterator can be driven concurrently unless its contract says
  so, and none of the three abstractions inherently makes traversal atomic. Common semantics are
  fail-fast (best-effort interference detection), weakly consistent (no
  `ConcurrentModificationException`, may reflect later changes), and structural snapshot
  (`CopyOnWriteArrayList`, with copying costs on updates). Inspect the concrete contract;
  snapshot references do not freeze mutable elements.
- **Distribution.** Remote iteration is pagination, and the interface can hide latency per page,
  server-side cursor resources needing release when present, and consistency —
  with offset pagination, rows inserted or deleted mid-walk can cause items to be skipped or repeated.
  Keyset pagination avoids offset drift for a stable unique ordering but is not a snapshot: updates
  to sort keys and isolation level still matter. A cursor/snapshot token may be required
  (`rpc-and-api-contracts`).
- **Performance.** An `Iterator<Integer>` exposes boxed values; whether boxing allocates during
  traversal depends on the source. `IntStream` and primitive spliterators preserve primitive
  representation. Correct `Spliterator` characteristics matter: `SIZED` can let the
  pipeline pre-allocate, `SUBSIZED` promises sized descendant splits, `SORTED` and `DISTINCT` let
  operations be optimized. Treat iterator-allocation elimination as a compilation hypothesis and
  verify it only on a measured hot path (`jit-inlining-and-escape-analysis`).
- **Testing.** The cases that break: empty sequence, single element, exhaustion (`next()` after
  `hasNext()` returns false must throw `NoSuchElementException`), `hasNext()` called twice with no
  `next()` between, and — for resource-backed traversals — that abandoning the stream halfway
  still closes it. For a custom `Spliterator`, assert that sequential and parallel traversals
  produce the same result, and verify claimed size/comparator and split coverage where supported.
  An unsplittable source's equality check does not test parallel decomposition.

## Review checklist

Return the chosen traversal contract, ownership/closing obligation, observed failure or
compatibility constraint, and executed versus pending checks. When remote consistency or
resource ownership is unknown, inspect the provider contract before promising complete traversal.

- [ ] The exposure prevents unauthorized structural mutation, including Iterator.remove()
- [ ] A resource-backed stream is closed by every caller, and this is documented
- [ ] Snapshot versus live semantics is stated for any returned traversal
- [ ] No code depends on `ConcurrentModificationException` being thrown
- [ ] Custom `Spliterator` characteristics are accurate
- [ ] Parallel use is justified by a measurement, not by the source being large
- [ ] Remote paging strategy is justified, bounded, cancellable, and defines mid-walk consistency
- [ ] Repeated `hasNext()` does not skip elements; documented prefetch may perform I/O
- [ ] Primitive streams are used where boxing would otherwise dominate

## References

- [Iterator, Stream and Spliterator](references/iterator-stream-spliterator.md) — the three
  compared on control, laziness, reuse, parallelism and closing; the characteristics table and
  what each enables; fail-fast versus weakly consistent versus snapshot semantics; and when a
  hand-written `Iterator` is still the right answer. Read when choosing what a type should return.
- [Worked example](references/worked-example.md) — a paged remote API exposed as a `Stream` via a
  custom `Spliterator`: cursor semantics, the deadline and total bound, closing and cancellation, why
  `trySplit` returns `null`, and the tests including sequential/parallel agreement. Read when
  implementing.
