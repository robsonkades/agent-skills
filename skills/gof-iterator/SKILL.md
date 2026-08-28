---
name: gof-iterator
description: >
  Iterator in modern Java: traversing an aggregate without exposing it, and choosing between
  Iterator, Stream and Spliterator — external pull versus internal lazy pipeline versus the
  parallel decomposition primitive. Covers why implementing Spliterator gives you both, what fail-fast
  really promises and how weakly consistent iterators differ, streams that hold a resource and
  must be closed, remote pagination as iteration with page drift, and the characteristics that
  decide whether a stream can be sized or split. Use when exposing a collection from a type, when
  a custom traversal is being written, when ConcurrentModificationException appears, when a stream
  over a file or a result set leaks, when paging through a remote API, or when a parallel stream
  is not faster. Does not cover stream pipeline design and collectors
  in general, the tree being traversed (gof-composite), adding operations over
  it (gof-visitor), or database paging strategy.
---

# Iterator

## Purpose

Let a caller walk a sequence without knowing how it is stored, and without the sequence handing
out its internals. The pattern is so thoroughly absorbed into Java — `Iterable`, the enhanced
`for`, `Stream` — that the design question is almost never "should we have an iterator" but
"which of the three abstractions should this type expose, and what does each promise".

## Iterator, Stream, Spliterator

```text
Iterator<T>       external, pull. The caller controls the pace and may
                  stop, resume, or interleave two traversals. Stateful,
                  single-use, supports remove(). No parallelism.

Stream<T>         internal, lazy, single-use pipeline. Operations fuse;
                  short-circuiting works; parallelism is available.
                  Not a data structure — it cannot be re-traversed, and
                  it may need closing when backed by a resource.

Spliterator<T>    the primitive underneath Stream: tryAdvance for one
                  element, trySplit for parallel decomposition, plus
                  characteristics that let the pipeline optimise.
                  Implement this and you get both of the above.
```

The practical rule: **expose `Iterable`/`Stream`, implement `Spliterator`.** A hand-written
`Iterator` gives the least and costs the most; `StreamSupport.stream(spliterator, false)` and
`Spliterators.iterator(...)` derive the other two from it.

## When it is the answer

```text
A type owns a collection and must not hand out a mutable reference
        → expose Iterable, Stream, or an unmodifiable view.

The sequence is computed, unbounded, or arrives in pages
        → implement Spliterator; expose a Stream.

Traversal must be resumable, interleaved or two-handed (merge, diff)
        → Iterator. Streams cannot be paused and resumed by the caller.

Traversal must be parallel
        → Spliterator with an honest trySplit and correct characteristics.
```

## When it is not

- **The collection is already a `List` you are willing to expose immutably.** `List.copyOf` or
  `Collections.unmodifiableList` is simpler than a custom traversal.
- **The caller needs random access, size or repeated traversal.** A `Stream` is single-use and a
  custom `Iterator` gives none of these; return a collection.
- **You are writing an `Iterator` by hand for a finite in-memory structure.** Build the list, or
  implement `Spliterator`.
- **The "iteration" is a remote query.** Paging through a remote API is iteration in shape only —
  it has server-side state, latency per page, and consistency questions the interface hides.

## Decision rules

```text
IF the traversal is over a resource — a file, a result set, a socket
THEN the Stream is AutoCloseable and MUST be closed; wrap it in
     try-with-resources and document it. A leaked cursor holds a
     connection until the pool is exhausted.

IF a collection is mutated during traversal
THEN fail-fast is best effort, not a guarantee: ConcurrentModification-
     Exception may not be thrown, and a missed detection means silently
     skipped elements. Never rely on it for correctness.

IF the collection is concurrent (ConcurrentHashMap and friends)
THEN its iterator is weakly consistent: no exception, and it may or may
     not reflect changes made after it was created. Size and content are
     not a snapshot.

IF elements must be removed while traversing
THEN Iterator.remove() or removeIf(), never a structural change through
     the collection reference inside a for-each.

IF a custom Spliterator is written
THEN its characteristics must be true. Claiming SIZED or DISTINCT when
     it is not produces wrong results, not slow ones.

IF trySplit cannot split evenly, or the source is a linked structure
THEN parallel streams will not help and often hurt; measure before
     using them.

IF iteration crosses a network boundary
THEN it is pagination: choose keyset over offset, define what happens
     when the underlying data changes mid-walk, and bound the total.

IF an Iterable is returned from a type whose state may change
THEN say whether the traversal is a snapshot or live. Callers will
     assume whichever is convenient.
```

## Modern Java expression

```text
Expose a collection safely           List.copyOf(...) / unmodifiable view

Expose a computed sequence           Stream, via a Spliterator

Adapt a legacy Iterator to a Stream  StreamSupport.stream(
                                       Spliterators.spliteratorUnknownSize(
                                         it, ORDERED), false)

Stateful or windowed traversal       Gatherers (Java 24+), rather than a
                                     hand-written Iterator with a buffer

Infinite or generated sequences      Stream.iterate / Stream.generate,
                                     with a limit at the source

Two-handed traversal (merge, diff)   Iterator, explicitly — this is the
                                     case Streams genuinely cannot express
```

## Cross-cutting checks

- **Concurrency.** No `Iterator` is thread-safe, and none of the three abstractions makes a
  traversal atomic. The three semantics available are fail-fast (best effort, an exception
  _usually_), weakly consistent (no exception, unspecified visibility of concurrent changes), and
  snapshot (`CopyOnWriteArrayList` — an exact view of the moment it started, at the cost of a copy
  per mutation). Choose deliberately, and document which one a returned traversal offers.
- **Distribution.** Remote iteration is pagination, and the interface hides three things: latency
  per page, server-side cursor state that leaks if the caller abandons the walk, and consistency —
  with offset pagination, rows inserted or deleted mid-walk cause items to be skipped or repeated.
  Keyset pagination removes the drift; a bounded total and a deadline remove the unbounded walk
  (`rpc-and-api-contracts`).
- **Performance.** `Iterator<Integer>` boxes every element; `IntStream` and primitive spliterators
  do not. Correct `Spliterator` characteristics matter more than they look: `SIZED` lets the
  pipeline pre-allocate, `SUBSIZED` enables balanced splitting, `SORTED` and `DISTINCT` let
  operations be elided. A per-loop iterator allocation is usually removed by escape analysis and
  is not worth avoiding (`jit-inlining-and-escape-analysis`).
- **Testing.** The cases that break: empty sequence, single element, exhaustion (`next()` after
  `hasNext()` returns false must throw `NoSuchElementException`), `hasNext()` called twice with no
  `next()` between, and — for resource-backed traversals — that abandoning the stream halfway
  still closes it. For a custom `Spliterator`, assert that sequential and parallel traversals
  produce the same result.

## Review checklist

- [ ] The type exposes `Iterable`/`Stream`, not its internal collection
- [ ] A resource-backed stream is closed by every caller, and this is documented
- [ ] Snapshot versus live semantics is stated for any returned traversal
- [ ] No code depends on `ConcurrentModificationException` being thrown
- [ ] Custom `Spliterator` characteristics are accurate
- [ ] Parallel use is justified by a measurement, not by the source being large
- [ ] Remote iteration uses keyset paging, is bounded, and defines mid-walk consistency
- [ ] `hasNext()` is side-effect-free and repeatable
- [ ] Primitive streams are used where boxing would otherwise dominate

## References

- [Iterator, Stream and Spliterator](references/iterator-stream-spliterator.md) — the three
  compared on control, laziness, reuse, parallelism and closing; the characteristics table and
  what each enables; fail-fast versus weakly consistent versus snapshot semantics; and when a
  hand-written `Iterator` is still the right answer. Read when choosing what a type should return.
- [Worked example](references/worked-example.md) — a paged remote API exposed as a `Stream` via a
  custom `Spliterator`: keyset paging, the deadline and total bound, closing and cancellation, why
  `trySplit` returns `null`, and the tests including sequential/parallel agreement. Read when
  implementing.
