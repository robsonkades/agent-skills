---
name: java-streams
description: >
  Stream pipelines as a design decision: when a stream is clearer than a loop and when it is
  not, side-effect-free stages and mutable reduction with collectors, the toMap and
  groupingBy traps, Collection versus Stream as a return type, streams that hold an open
  resource, parallel streams and the shared common pool, and Gatherers for custom
  intermediate operations. Use when a pipeline mutates state outside itself or uses forEach
  to accumulate, when Collectors.toMap throws IllegalStateException or NullPointerException,
  when a method returns a Stream that callers iterate twice, when a stream over Files.lines
  or a JDBC cursor is never closed, when parallelStream() appears — especially with blocking
  I/O — or when a loop is being rewritten as a stream for its own sake. Does not cover
  lambda capture and functional interfaces (java-lambdas-and-functional-interfaces),
  ForkJoinPool internals (forkjoinpool-and-work-stealing), or collection choice and
  complexity.
---

# Java Streams

## Purpose

Use streams where they express a transformation better than a loop, and keep them honest:
pure stages, mutable state only inside a collector, and no pipeline that quietly holds a
database cursor or hijacks the process-wide common pool. Two failure modes: the `forEach` that
is a `for` loop with worse debuggability and hidden shared-state mutation; and
`parallelStream()` applied to blocking work, where every replica's requests contend on one
`ForkJoinPool.commonPool` sized to the machine's cores.

## Workflow

1. **Ask what the code is doing.** Transform-filter-aggregate over a collection → stream.
   Loop with early exit on complex conditions, index arithmetic, two collections in lockstep,
   mutation of local state, or a checked exception per element → loop.
2. **Keep every intermediate stage pure.** `map`, `filter`, `sorted`, `flatMap` compute; they
   do not write to anything outside themselves. Accumulation happens in `collect` or `reduce`.
3. **Pick the collector deliberately**, not the first one that compiles: `toList` when order
   matters, `toMap` with an explicit merge function, `groupingBy` with an explicit downstream,
   `teeing` when two aggregates are needed in one pass.
4. **Decide the return type at the API boundary.** A `Collection` for anything already in
   memory; a `Stream` only when laziness or size genuinely demands it — and then say in the
   Javadoc whether it must be closed.
5. **Only consider parallel with a measurement, and never with blocking work.** The default
   executor is shared by the whole JVM.
6. **Verify the pipeline is single-pass and side-effect free** by reading it aloud: source,
   what each stage computes, what the terminal operation produces.

## Rules

- A stream is not a better loop; it is a different expression of one. Prefer a stream when the
  pipeline reads as a description of the result. Prefer a loop when the code needs an early
  `return` mid-iteration, `break` with several conditions, index or neighbour access, mutation
  of local variables, or a `try`/`catch` per element.
- No side effects in intermediate operations. A `map` or `filter` that adds to an external
  list, increments a counter, writes a log per element, or calls a mutating service is not a
  pipeline stage — it is a loop body in disguise, and its behaviour depends on the pipeline
  being sequential and eagerly evaluated, neither of which is guaranteed.
- `forEach` belongs at the end and, ideally, only for output — printing, publishing, writing.
  Accumulating into a collection with `forEach(list::add)` is a mutable reduction written the
  unsafe way: use `collect`, which is correct sequentially and in parallel.
- `Collectors.toMap` without a merge function throws `IllegalStateException` on the first
  duplicate key — a defect that appears with production data and not with fixtures. Always
  pass a merge function, and choose it deliberately (keep first, keep last, or fail with a
  message naming the key). It also throws `NullPointerException` when a **value** is null,
  because it goes through `Map.merge`; `groupingBy` with a `mapping(..., toList())` downstream,
  or an explicit loop, handles nullable values.
- Give `groupingBy` an explicit downstream collector whenever the group is not a plain list —
  `counting()`, `summingLong(...)`, `mapping(..., toList())`, `reducing(...)`. Nested
  `groupingBy` beyond two levels usually wants a purpose-built record key instead.
- `reduce` is for associative, side-effect-free combination into an immutable result. Anything
  that accumulates into a mutable container is `collect`. A `reduce` whose accumulator mutates
  its first argument is wrong sequentially and catastrophically wrong in parallel.
- Return a `Collection`, not a `Stream`, from a method whose result is already materialised. A
  stream is single-use — a caller who iterates it twice gets `IllegalStateException` — cannot
  be sized, and cannot be indexed. Return a `Stream` when the result is lazily produced, is
  large enough that materialising it is a real cost, or is backed by a resource.
- A stream backed by a resource is a resource. `Files.lines`, `Files.walk`, `Files.list`,
  `Files.find` and JDBC/JPA result streams hold an open handle or cursor until closed; they
  belong in `try`-with-resources and their Javadoc must say so — see java-resource-management.
  A repository method returning a `Stream` also requires the caller to still be inside the
  transaction that owns the cursor.
- Streams are lazy: nothing runs until the terminal operation, and short-circuiting operations
  (`findFirst`, `anyMatch`, `limit`) stop early. Use `peek` only for debugging, and expect it
  to be skipped for elements the pipeline never needs.
- `parallelStream()` and `Stream.parallel()` submit to `ForkJoinPool.commonPool()`, which is
  shared by the whole JVM and sized to available processors minus one. Any blocking operation
  in a parallel pipeline occupies a common-pool thread for the duration, and every other user
  of that pool — including other requests and library code — waits. Parallel streams are for
  CPU-bound work over a splittable source, with a measurement to show it helps.
- Virtual threads do not make parallel streams safe for I/O. The common pool is platform
  threads and the pipeline blocks them; the construct for concurrent I/O per element is a
  structured fan-out or `Gatherers.mapConcurrent`, not `parallel()`.
- Prefer `IntStream`/`LongStream`/`DoubleStream` when processing primitives in bulk; a
  `Stream<Integer>` boxes every element. `mapToInt(...).sum()` and `summaryStatistics()` exist
  for exactly this.
- Use `Gatherers` (final since Java 24) for intermediate operations the JDK does not ship —
  fixed and sliding windows, `scan`, `fold`, and `mapConcurrent`, which runs a mapper on
  virtual threads with a concurrency limit and preserves encounter order. It is the supported
  extension point; writing a custom `Spliterator` for the same job rarely is.

## References

- [Collectors and purity](references/collectors-and-purity.md) — read when choosing or
  composing collectors, when a pipeline accumulates state, when `toMap`/`groupingBy` misbehave
  on real data, or when deciding between `reduce` and `collect`.
- [Parallel streams and gatherers](references/parallel-and-gatherers.md) — read before adding
  `parallel()`, when a parallel pipeline is slower or is starving the common pool, or when a
  pipeline needs windowing, running state or bounded concurrency per element.
