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
timeout, a retry policy, or partial-failure handling. A mapper failure encountered while delivering
its result downstream fails traversal; a speculative result never consumed need not report its
failure. For
fan-out where those matter, use structured concurrency (structured-concurrency) and keep the
policy explicit; concurrency-limiting-and-bulkheads covers choosing the limit.

The limit applies to one pipeline evaluation, not all requests sharing a dependency; use shared
admission control where required. A downstream short circuit can leave speculative mapper calls
whose results are never consumed. Cancellation is best effort and does not undo side effects;
encounter-ordered results do not imply ordered mapper effects. Set client timeouts explicitly.
Fixed windows include a final short batch, and both window gatherers produce unmodifiable lists;
verify that the batch consumer accepts those contracts.

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

- [Java 25 Gatherers](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Gatherers.html)
- [JEP 485: Stream Gatherers, final in Java 24](https://openjdk.org/jeps/485)
- [Java 25 ForkJoinPool](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
