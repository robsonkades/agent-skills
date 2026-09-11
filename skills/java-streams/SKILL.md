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
non-interfering callbacks, state owned by the reduction or transformation, and explicit resource
and execution ownership. Two failure modes: required effects hidden in elidable intermediate
callbacks or unsafe parallel mutation; and `parallelStream()` applied to blocking work,
where requests within each JVM can contend on its shared `ForkJoinPool.commonPool` whose
effective parallelism depends on runtime configuration
and the processors visible to the JVM.

## Workflow

Inspect the project JDK, source ownership, null/order/mutability contract and workload before
rewriting. Core examples target Java 21; Gatherers require Java 24+, and structured-concurrency
alternatives need their exact preview policy checked. Do not upgrade or enable preview for a
pipeline cleanup. Examples are partial snippets with application types and imports omitted.

1. **Ask what the code is doing.** Transform-filter-aggregate over a collection → consider a stream.
   Loop with early exit on complex conditions, index arithmetic, two collections in lockstep,
   mutation of local state, or a checked exception per element → loop.
2. **Keep required effects out of elidable callbacks.** Use non-interfering, stateless
   behavioral parameters; supported stateful operations and gatherers own their internal state.
   Choose an explicit terminal action or loop when effects are part of the result contract.
3. **Pick the collector deliberately**, not the first one that compiles: `toList` when order
   matters, `toMap` with deliberate duplicate rejection or merge policy, `groupingBy` with an explicit downstream,
   `teeing` when two aggregates are needed in one pass.
4. **Decide the return type at the API boundary.** Prefer a `Collection` for materialized
   results needing repeated access. A `Stream` can express lazy traversal or an existing
   supported API; preserve compatibility and document whether the caller must close it.
5. **Only consider parallel with a measurement.** Blocking work needs explicit concurrency,
   cancellation and executor ownership; default parallel streams commonly use the shared
   common pool.
6. **Trace and verify the contract:** source, what each stage computes, terminal result/effects
   and cleanup. A single-use stream can buffer or make multiple processing passes internally;
   reuse adequate checks and investigate only the remaining material gaps.

## Rules

- A stream is not a better loop; it is a different expression of one. Prefer a stream when the
  pipeline reads as a description of the result. Prefer a loop when the code needs an early
  `return` mid-iteration, `break` with several conditions, index or neighbour access, mutation
  of local variables, or a `try`/`catch` per element.
- Require non-interference and statelessness for behavioral parameters. A `map` or `filter` that adds to an external
  list, increments a counter, writes a log per element, or calls a mutating service is not a
  reliable place for required effects: even an explicitly sequential pipeline may elide a stage
  or short-circuit. Put required effects in an explicit loop or suitable terminal action.
- `forEach` is a terminal action, including output or mutation under an explicit ownership
  contract. A confined sequential `forEach(list::add)` can be correct; a lawful collector often
  expresses the result better and supports isolated parallel accumulation. Preserve callers'
  null/mutability contract rather than mechanically replacing it with `toList()`.
- `Collectors.toMap` without a merge function deliberately rejects duplicate keys; use it when
  uniqueness is an invariant and test the failure. Supply a keep/merge policy only when duplicates
  are valid. Current JDK implementations also reject null mapped values through merge mechanics;
  do not depend on implementation-specific null tolerance—normalize, use a suitable custom
  collector/map, or write an explicit loop.
- Give `groupingBy` an explicit downstream collector whenever the group is not a plain list —
  `counting()`, `summingLong(...)`, `mapping(..., toList())`, `reducing(...)`. Deep nesting is a
  readability/shape signal; a record key or explicit result model may be clearer, without a fixed threshold.
- `reduce` is for associative, side-effect-free combination or selection of a result. Anything
  that accumulates into a mutable container is `collect`. Mutating a reduction's identity can
  appear to work sequentially but violates the contract and can corrupt parallel results.
- Prefer a `Collection` for a new API exposing already materialised results for repeated access. A
  stream is single-use—a second terminal traversal is invalid—has no collection-style size/index
  API even though its spliterator may know an exact size. Return a `Stream` when the result is lazily produced, is
  large enough that materialising it is a real cost, or is backed by a resource. Preserve an
  adequate existing `Stream` contract; changing a public return type is not a syntax cleanup.
- A stream backed by a resource is a resource. `Files.lines`, `Files.walk`, `Files.list`,
  `Files.find` hold open resources; JDBC/JPA result streams may hold a cursor/connection depending
  on driver/provider and execution mode. Resource-backed streams
  belong in `try`-with-resources and their Javadoc must say so — see java-resource-management.
  Terminal traversal does not itself close the stream. When ownership transfers to a caller,
  keep the resource alive through consumption and let that owner close it, including on failure.
  If a repository stream depends on a transaction-bound cursor, consumption must finish inside
  that transaction; verify the provider contract rather than assuming every repository stream does.
- Streams are lazy: traversal work starts at a terminal operation, and short-circuiting operations
  (`findFirst`, `anyMatch`, `limit`) may stop early. `peek` is an intermediate side-effect hook,
  not a guaranteed per-source-element callback; optimization and short-circuiting may skip it.
- Parallel streams commonly execute in `ForkJoinPool.commonPool()` when initiated normally;
  pool selection from custom ForkJoin tasks is implementation-sensitive, and common parallelism
  is configurable/container-aware rather than always processors-minus-one. Blocking can starve or
  distort other common-pool workloads. Parallel streams are primarily for
  CPU-bound work over a splittable source, with a measurement to show it helps.
- Virtual threads do not change a parallel stream's execution policy. For concurrent I/O per
  element, prefer explicit structured fan-out or `Gatherers.mapConcurrent`, not `parallel()`.
- Prefer `IntStream`/`LongStream`/`DoubleStream` when primitive representation matters; a
  `Stream<Integer>` carries boxed references, though traversal does not necessarily allocate new
  boxes when the source is already boxed. `mapToInt(...).sum()` and `summaryStatistics()` exist
  for exactly this.
- Use `Gatherers` (final since Java 24) for intermediate operations the JDK does not ship —
  fixed and sliding windows, `scan`, `fold`, and `mapConcurrent`, which runs a mapper on
  virtual threads with a concurrency limit and preserves encounter order. It is the supported
  extension point on those releases. Keep an adequate existing `Spliterator` or loop when it
  fits the source/transform contract or the supported Java baseline cannot use gatherers.

- Parallel correctness requires more than “no shared list”: reduction/collector operations need
  associative combination, a true identity, compatible accumulator/combiner behavior, and honest
  `Collector.Characteristics`. Encounter order (`findFirst`, `forEachOrdered`) can limit
  parallelism; choose `findAny`/unordered processing only when semantics permit.

Report the preserved null, duplicate, order, mutability and resource-lifetime contracts, the
smallest justified rewrite (or decision to keep the loop), and tests/measurements actually run.
Do not infer a performance improvement from shorter syntax.

## References

- [Collectors and purity](references/collectors-and-purity.md) — read when choosing or
  composing collectors, when a pipeline accumulates state, when `toMap`/`groupingBy` misbehave
  on real data, or when deciding between `reduce` and `collect`.
- [Parallel streams and gatherers](references/parallel-and-gatherers.md) — read before adding
  `parallel()`, when a parallel pipeline is slower or is starving the common pool, or when a
  pipeline needs windowing, running state or bounded concurrency per element.
