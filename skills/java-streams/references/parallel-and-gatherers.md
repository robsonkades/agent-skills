# Parallel streams and gatherers

## What `parallel()` actually does

`stream.parallel()` and `collection.parallelStream()` split the source with a `Spliterator`
and normally execute fork/join tasks using **`ForkJoinPool.commonPool()`**. Pool inheritance
inside a custom fork/join computation is an implementation-sensitive technique, not a portable
per-pipeline executor API. Three facts follow:

1. **The normal pool is process-wide.** Its default target parallelism is derived from processors
   visible to the JVM and can be changed by common-pool properties/runtime configuration. Calling
   threads may also help. Treat exact worker counts as something to observe, not a constant. In a
   low-CPU container, splitting and coordination can easily cost more than they save
   (container-awareness).
2. **Blocking work occupies those threads.** An HTTP call, a JDBC query, a lock or a
   `Thread.sleep` inside a parallel pipeline can occupy a common-pool worker (or the helping
   caller). Unmanaged blocking can exhaust useful workers and delay unrelated work; compensation
   depends on the operation/runtime and is not an isolation or downstream-capacity guarantee.
3. **Order and identity of threads are not yours to control.** The stream API has no per-pipeline
   executor, deadline or structured cancellation policy. Wrapping a pipeline in a custom
   `ForkJoinPool` is not a specified ownership mechanism and still leaves failure/cancellation
   policy implicit.

The decision rule: parallel streams are for **CPU-bound** work over a **cheaply splittable**
source, with **enough total work** to amortise the coordination, verified by a **measurement**.
Concurrent I/O is a different problem with different tools — `Gatherers.mapConcurrent`,
structured concurrency, or an executor sized for that dependency.

## When it can pay

Sources that commonly split well: arrays, `ArrayList`, `IntStream.range`, and spliterators with
accurate size and balanced `trySplit` behaviour. Linked structures, generated streams,
`BufferedReader.lines`, and iterator-backed sources often split less cheaply or less evenly.
`SIZED`/`SUBSIZED` help planning but do not prove useful speedup; element cost, locality and split
balance still matter.

Operations that can parallelise well: stateless `map`/`filter`, primitive reductions, and
collectors with associative, compatible combination. A collector need not be `CONCURRENT`:
ordinary collectors can safely accumulate isolated partial containers and combine them.
Operations that fight parallelism include ordered `limit`, `findFirst` (as opposed to
`findAny`), `sorted` on an ordered stream, and any stateful lambda.

There is no portable element-count threshold: a few expensive elements can benefit while millions
of trivial or poorly splitting elements may not. Estimate total useful work versus splitting,
scheduling, merging and memory-traffic cost, then measure with JMH (jmh-microbenchmarks) on the real
data shape and production-like CPU quotas. A result on a synthetic `int[]` does not transfer to a
list of pointer-heavy domain objects.

## Failure shapes to recognise

- **A latency cliff under load with idle CPU.** Threads are parked in the common pool waiting
  on blocking calls made from parallel pipelines. A thread dump shows `ForkJoinPool.commonPool-worker-N`
  in socket reads; concurrency-diagnostics covers reading it.
- **A `ConcurrentModificationException` or lost updates** from a lambda mutating shared state
  that was safe sequentially.
- **Non-deterministic observation order** from `forEach`, whose contract does not preserve
  encounter order in parallel. `findFirst` preserves encounter-order semantics but may constrain
  execution; `findAny` trades that semantic for more freedom. `forEachOrdered` restores ordering
  at a synchronization/throughput cost that must be measured.
- **Worse throughput on a bigger machine**, because more common-pool threads contend on the
  same downstream dependency or lock.
- **A parallel stream inside a request handler on a virtual thread.** Forked work commonly uses
  common-pool platform threads while the caller can help; a virtual caller does not make every
  callback virtual or remove coupling to work outside the request scope.

## Bounded output versus bounded traversal

Short-circuiting is necessary but not sufficient for an infinite pipeline to finish. For an
unsorted source, `sorted().limit(3)` requests the globally smallest three values and may need
to read and buffer the whole input; `limit(3).sorted()` sorts only the first three. With input
`[9, 8, 7, 1]`, those answers differ. Move the bound only if the consumer's requested population
permits it. A selective `filter` or a search for more distinct values may likewise exhaust a
finite source or never satisfy downstream demand on an infinite one.

Ask which bound is required: returned elements, source elements examined, retained state or
elapsed time. A pipeline can satisfy one and violate another. Prefer a bounded source/query or
explicit traversal control when that matches the contract; keep source/client timeout ownership
explicit for blocking reads. Parallelism does not supply a deadline or make a global sort of
unbounded input complete. Verify stage-order changes with data whose desired elements occur
after the proposed cutoff, and observe source consumption rather than only result length.

## Gatherers: the supported extension point

`Stream.gather(...)` with `java.util.stream.Gatherers` (final since Java 24) adds intermediate
operations the JDK does not otherwise ship. The built-ins:

| Gatherer                       | Does                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `windowFixed(n)`               | groups elements into consecutive lists of size `n`                                             |
| `windowSliding(n)`             | overlapping windows of size `n`, or one short window when the entire input is shorter          |
| `fold(supplier, folder)`       | emits one final aggregate after consuming upstream, including order-dependent folds            |
| `scan(supplier, scanner)`      | emits every intermediate accumulation                                                          |
| `mapConcurrent(limit, mapper)` | applies `mapper` on **virtual threads**, at most `limit` at a time, preserving encounter order |

`fold` must finish its upstream before emitting its one result; a downstream `findFirst()` or
`limit(1)` does not make it incremental. Use `scan` when each accumulated prefix is required.
An unbounded upstream therefore needs a semantically justified bound before `fold`; `scan`
can emit incrementally, but a downstream terminal `toList()` still needs a finite result stream.

```java
// Batch a large feed into chunks of 500 for bulk insertion
records.stream()
       .gather(Gatherers.windowFixed(500))
       .forEach(repository::insertBatch);

// Call a dependency for each id, at most 8 in flight, results in order
List<Detail> details = ids.stream()
       .gather(Gatherers.mapConcurrent(8, client::fetchDetail))
       .toList();
```

`mapConcurrent` is the one that replaces most bad uses of `parallelStream()`: the work is
I/O-bound, the concurrency limit is explicit and local to this call site, the threads are
virtual, and encounter order is preserved. Note what it still does not give you: a per-element
timeout, a retry policy, or partial-failure handling. A mapper failure encountered while delivering
its result downstream fails traversal; a speculative result never consumed need not report its
failure. For
fan-out where those matter, use structured concurrency (structured-concurrency) and keep the
policy explicit; concurrency-limiting-and-bulkheads covers choosing the limit.

The limit applies to one pipeline evaluation, not all requests sharing a dependency; use shared
admission control where required. A downstream short circuit can leave speculative mapper calls
whose results are never consumed. Cancellation is best effort and does not undo side effects;
encounter-ordered results do not imply ordered mapper effects. Set client timeouts explicitly.
Both window gatherers produce no windows for empty input. Fixed windows include a final short
batch. Sliding windows produce one short window when the entire input is shorter than the
requested size; otherwise they produce only full windows, without trailing partial suffixes.
Both produce unmodifiable lists. Check empty, shorter-than-window, exact-size and longer input;
the consumer must accept short windows or explicitly filter/pad them according to its contract
before accessing fixed positions. Do not silently discard short input when it must be preserved.

On Java 24+, consider a custom `Gatherer` for a reusable stream transformation
(deduplicate-consecutive or chunk-by-predicate). A `Spliterator` still fits source traversal or
an adequate compatible implementation; a loop may be simpler for one use. Do not replace either
with a `peek`-plus-external-state scheme whose required callbacks can be skipped.

## Checklist before merging a `parallel()`

- [ ] Useful parallel work outweighs overhead; inspect blocking/lock behavior in callbacks and
      libraries. Concurrent I/O usually needs an explicit bounded execution/lifetime policy.
- [ ] The source splits usefully; size characteristics are accurate when present, not mandatory.
- [ ] Representative evidence supports the performance and shared-resource budget under relevant
      load/CPU limits. Reuse adequate existing measurements; fill material gaps before claiming benefit.
- [ ] No unsafe or interfering external mutation; intentional shared terminal actions have
      the required synchronization/ordering contract. Collector identity/associativity and
      accumulator-combiner compatibility hold; `CONCURRENT` requires safe accumulation into
      one result container.
- [ ] The result does not depend on encounter order, or `forEachOrdered`/`toList` is used
      deliberately.
- [ ] Any request-path/common-pool coupling is acceptable under the actual load and latency
      contract; otherwise use an appropriate isolated execution design.
- [ ] If the motivation was concurrent I/O, `Gatherers.mapConcurrent` or structured concurrency
      was considered first.

## Primary references

- [Java 21 stream operations, buffering and short-circuiting](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html#StreamOps)
- [Java 25 Gatherers](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Gatherers.html)
- [Java 24 window contracts](https://docs.oracle.com/en/java/javase/24/docs/api/java.base/java/util/stream/Gatherers.html)
- [JEP 485: Stream Gatherers, final in Java 24](https://openjdk.org/jeps/485)
- [Java 25 ForkJoinPool](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
