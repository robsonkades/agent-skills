# Parallel streams and gatherers

## What `parallel()` actually does

`stream.parallel()` and `collection.parallelStream()` split the source with a `Spliterator`,
run the pipeline as fork/join tasks on **`ForkJoinPool.commonPool()`**, and combine the
partial results. Three facts follow, and each is a production hazard on its own:

1. **The pool is process-wide and small.** Its parallelism defaults to
   `availableProcessors() - 1`, plus the calling thread. Every parallel stream in the JVM —
   yours, your libraries', a framework's — shares it. In a container with a CPU limit of 1,
   parallelism is effectively 1 and the machinery is pure overhead (container-awareness).
2. **Blocking work occupies those threads.** An HTTP call, a JDBC query, a lock or a
   `Thread.sleep` inside a parallel pipeline holds a common-pool thread for its whole duration.
   With a handful of threads, a few blocking pipelines starve every other parallel stream in
   the process, including ones in code you did not write.
3. **Order and identity of threads are not yours to control.** There is no timeout, no
   cancellation, no priority, and no way to size the pool per call site. Submitting the
   pipeline inside your own `ForkJoinPool` changes which pool is used but keeps every other
   limitation.

The decision rule: parallel streams are for **CPU-bound** work over a **cheaply splittable**
source, with **enough total work** to amortise the coordination, verified by a **measurement**.
Concurrent I/O is a different problem with different tools — `Gatherers.mapConcurrent`,
structured concurrency, or an executor sized for that dependency.

## When it can pay

Sources that split well: arrays, `ArrayList`, `IntStream.range`, `HashMap`/`HashSet` (over
their internal tables), and anything with a `SIZED`/`SUBSIZED` spliterator. Sources that split
badly or not at all: `LinkedList`, `Stream.iterate`, `BufferedReader.lines`, most
`Iterator`-based sources — and for these, parallelism adds cost with no speedup.

Operations that parallelise well: stateless `map`/`filter`, primitive reductions, and
`collect` into a concurrent collector. Operations that fight it: `limit` (it must respect
encounter order), `findFirst` (as opposed to `findAny`), `sorted` on an ordered stream, and
any stateful lambda.

A rough entry criterion before measuring at all: the source has at least tens of thousands of
elements, or each element costs enough that the total is milliseconds rather than microseconds.
Below that, the fork/join overhead dominates. Then measure with JMH (jmh-microbenchmarks) on
the real data shape — a parallel pipeline that is faster on a synthetic array of `int` and
slower on a list of domain objects is the normal outcome, not an anomaly.

## Failure shapes to recognise

- **A latency cliff under load with idle CPU.** Threads are parked in the common pool waiting
  on blocking calls made from parallel pipelines. A thread dump shows `ForkJoinPool.commonPool-worker-N`
  in socket reads; concurrency-diagnostics covers reading it.
- **A `ConcurrentModificationException` or lost updates** from a lambda mutating shared state
  that was safe sequentially.
- **Non-deterministic results** from a pipeline using `findFirst`/`forEach` where the code
  assumed order. `forEachOrdered` restores order at the cost of the parallelism that motivated
  the change.
- **Worse throughput on a bigger machine**, because more common-pool threads contend on the
  same downstream dependency or lock.
- **A parallel stream inside a request handler on a virtual thread.** The pipeline still runs
  on common-pool platform threads, so the "cheap threads" property does not apply, and the
  request now depends on a shared, unbounded-queueing resource.

## Gatherers: the supported extension point

`Stream.gather(...)` with `java.util.stream.Gatherers` (final since Java 24) adds intermediate
operations the JDK does not otherwise ship. The built-ins:

| Gatherer                       | Does                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `windowFixed(n)`               | groups elements into consecutive lists of size `n`                                             |
| `windowSliding(n)`             | overlapping windows of size `n`                                                                |
| `fold(supplier, folder)`       | a single running value, like a lazy `reduce` with a different state type                       |
| `scan(supplier, scanner)`      | emits every intermediate accumulation                                                          |
| `mapConcurrent(limit, mapper)` | applies `mapper` on **virtual threads**, at most `limit` at a time, preserving encounter order |

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
timeout, a retry policy, or partial-failure handling — one failing mapper fails the stream. For
fan-out where those matter, use structured concurrency (structured-concurrency) and keep the
policy explicit; concurrency-limiting-and-bulkheads covers choosing the limit.

Writing a custom `Gatherer` is worthwhile for a genuinely reusable stateful operation
(deduplicate-consecutive, rate-limit, chunk-by-predicate). Prefer it to a custom `Spliterator`,
which is far harder to get right, and prefer both to a `peek`-plus-external-state hack, which
is neither.

## Checklist before merging a `parallel()`

- [ ] The work is CPU-bound; no I/O, no locks, no blocking calls anywhere in the pipeline —
      including inside library calls it makes.
- [ ] The source splits cheaply and is sized.
- [ ] There is a benchmark on realistic data showing the improvement, and it was run on
      hardware resembling production (including the container CPU limit).
- [ ] Nothing in the pipeline mutates shared state; collectors are concurrent-safe.
- [ ] The result does not depend on encounter order, or `forEachOrdered`/`toList` is used
      deliberately.
- [ ] The call site is not on a request path where common-pool contention would couple
      unrelated requests together.
- [ ] If the motivation was concurrent I/O, `Gatherers.mapConcurrent` or structured concurrency
      was considered first.
