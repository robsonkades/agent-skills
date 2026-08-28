# Choosing a construct

## From requirement to construct

| The requirement, stated plainly                              | Start with                                     | Exceptions and costs                                                               |
| ------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Handle many concurrent requests that mostly wait on I/O      | virtual threads, thread-per-request            | needs an explicit limit at every scarce resource; no help if CPU-bound             |
| Call three services concurrently inside one request and join | `StructuredTaskScope`                          | preview API on every released JDK; version-locked class files                      |
| The same, without a preview API                              | virtual-thread executor + explicit joins       | you own cancellation and leak prevention by hand                                   |
| Split one CPU-bound computation across cores                 | `ForkJoinPool` / parallel stream               | granularity matters; the common pool is shared; no blocking inside                 |
| Run a task later, or periodically                            | `ScheduledExecutorService`                     | a throw unschedules it forever; single-threaded by default                         |
| Compose stages where each depends on the previous            | `CompletableFuture`                            | executor must be explicit; exceptions wrap; cancel does not stop work              |
| Adapt a callback-only client to a value                      | `CompletableFuture`                            | complete it on every path, or the caller waits forever                             |
| Consume a stream whose producer can outrun the consumer      | Reactive Streams, or a bounded queue           | operators can silently unbound the buffer; blocking inside is an outage            |
| Limit how many calls run at once                             | `Semaphore` next to the resource               | it is not a rate limit; it bounds one JVM only                                     |
| Limit how many calls run per second                          | token bucket                                   | different mechanism; divides across replicas cleanly, unlike permits               |
| Carry request context to indirect callees                    | `ScopedValue`                                  | inherited only by `StructuredTaskScope` forks; frameworks still read `ThreadLocal` |
| Cache an expensive object per worker                         | a pool                                         | **not** a `ThreadLocal` once threads are per-request                               |
| Guarantee one execution at a time, cluster-wide              | a distributed lease                            | nothing in `java.util.concurrent` does this                                        |
| Guarantee ordering of related operations                     | a single-threaded executor, or per-key queue   | this is correctness; do not "modernise" it away                                    |
| Produce a result from whichever replica answers first        | `StructuredTaskScope` + `anySuccessfulOrThrow` | doubles downstream load; `CompletableFuture.anyOf` is _not_ this                   |
| Share mutable state safely between threads                   | `java.util.concurrent` collections, or a lock  | see `java-memory-model` before designing anything custom                           |

## Constructs commonly chosen for the wrong reason

**`CompletableFuture` because "async is faster".** It is not faster; it releases a thread
while waiting. Virtual threads release the thread too, and keep the stack trace. Choose
`CompletableFuture` when the value genuinely arrives by callback, or when the stages form a
graph you would otherwise have to build by hand.

**Reactive because "blocking does not scale".** Blocking a _virtual_ thread scales. Choose
reactive for demand-driven streams and time-shaped operators, not to avoid blocking a thread.
See `reactive-and-virtual-thread-selection`.

**Virtual threads because "they are faster".** They are cheaper to _wait_ on. On CPU-bound
work they change nothing except adding scheduling overhead and removing the pool that used to
bound the work.

**A bigger thread pool because latency is high.** If latency is high and CPU is low, the
system is queueing, and the queue is usually downstream. Adding threads adds arrivals to a
queue that is already the problem. `littles-law-and-queueing`.

**`ReentrantLock` instead of `synchronized` to avoid pinning.** Obsolete since JDK 24
(JEP 491). Choose between them on semantics — `tryLock`, timeouts, `lockInterruptibly`,
fairness, multiple conditions.

**`parallelStream()` because the collection is large.** It runs on the shared common pool,
gives no cancellation, and is wrong for anything that blocks. `forkjoinpool-and-work-stealing`.

**A `ThreadLocal` for per-request context.** Right for twenty years, wrong once threads are
per-request and number in the millions. `scoped-values` — and note that the framework
contexts around you are still `ThreadLocal` and must be bridged rather than replaced.

## Composition: what goes with what

```text
Virtual threads   +  StructuredTaskScope   →  the intended pairing; scopes fork virtual threads
Virtual threads   +  ScopedValue           →  context that costs nothing per thread
Virtual threads   +  Semaphore             →  the bound that the pool used to provide
Virtual threads   +  ForkJoinPool          →  fine, for the CPU-bound part only
Reactive          +  virtual threads       →  only at the edges (boundedElastic), never in operators
CompletableFuture +  virtual threads       →  works; usually a sign the chain could be sequential code
StructuredTaskScope + long-lived work      →  wrong: a scope ends with its block
Semaphore(1)      +  mutual exclusion      →  wrong: not reentrant; use a lock
```

## The questions to answer before writing any of it

1. What is the scarce resource, and what is its capacity?
2. What bounds the number of concurrent operations against it, and where is that written?
3. What happens when that bound is reached — reject, queue, degrade, or fall over?
4. Who cancels, and does the cancellation actually reach the work?
5. How will this be observed: what metric rises first when it goes wrong?
6. What does the test look like that fails if the answer to (3) or (4) is wrong?

A design that cannot answer these has not chosen a concurrency construct; it has chosen a
syntax. The answers are also, in practice, the review: every one of them is checkable against
the diff.
