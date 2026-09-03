# Pool mechanics and contracts

## Stable model versus HotSpot/OpenJDK detail

The supported model is work stealing: worker-local queues, external submissions, local execution,
stealing by idle workers, join-aware assistance, and optional managed blocking. Exact queue fields,
scan strides, memory fences, helper method names and control-word encodings are OpenJDK implementation
details and change between releases. Use them to explain a profile only after matching the deployed
JDK source/build; never make application correctness depend on them.

Conceptually, default local scheduling is stack-like for forked work, favoring depth-first execution
and locality. Other workers steal older work, which often represents a larger remaining subtree.
`asyncMode=true` switches local scheduling toward FIFO for event-style tasks that are not joined.
External submissions are not identical to locally forked child tasks, so a benchmark that submits all
leaves from one outside thread does not model recursive work stealing.

## Fork, join and help

`fork()` schedules a task in the current fork/join pool when called from one, or the common pool when
called outside such a computation. Re-forking a task before completion/reinitialization is a usage
error. `join()` waits for completion and reports unchecked failure; the implementation may execute or
help tasks rather than passively blocking.

Join assistance improves liveness for well-formed task DAGs but does not make arbitrary cyclic waits
safe. A child waiting for an unrelated future, lock, socket or another pool can still deadlock or
starve. Draw wait-for edges across executors and synchronizers rather than assuming work stealing
breaks them.

The classic binary pattern is:

```java
left.fork();
R rightResult = right.compute();
R leftResult = left.join();
return combine(leftResult, rightResult);
```

This avoids immediately forking both branches and then waiting while the current worker could compute.
Use `invokeAll` when it improves clarity; benchmark rather than treating source shape as proof of
speed.

## Memory visibility and task state

`ForkJoinTask` documentation warns that modifications made after `fork()` are not necessarily
consistently observable until completion is established with `join`/related methods or a successful
completion check. Future-style result retrieval provides the completion boundary. This does not order
concurrent sibling accesses to a shared mutable object.

Safe pattern:

1. initialize immutable task inputs before scheduling;
2. confine mutable partial result to one task;
3. retrieve/merge only after completion;
4. use locks, atomics, concurrent structures or another documented synchronization edge for any live
   cross-task communication.

Do not mutate task inputs after scheduling unless the data structure and protocol were designed for
concurrent mutation.

## Managed blocking

`ForkJoinPool.managedBlock` repeatedly checks `isReleasable()` before invoking `block()`. In a pool it
may expand/activate spare capacity. Therefore a blocker must:

- make `isReleasable()` cheap, non-blocking and correct under repeated calls;
- return `true` from `block()` only when no further blocking is necessary;
- publish its result safely between these methods;
- propagate/restores interruption according to the enclosing operation's contract;
- release resources on failure and cancellation.

```java
final class AwaitLatch implements ForkJoinPool.ManagedBlocker {
    private final CountDownLatch latch;

    AwaitLatch(CountDownLatch latch) { this.latch = latch; }

    @Override public boolean isReleasable() {
        return latch.getCount() == 0;
    }

    @Override public boolean block() throws InterruptedException {
        latch.await();
        return true;
    }
}
```

Compensation can increase thread count and memory/context-switch pressure. It cannot increase a
database pool, remote quota or disk throughput. Pair it with resource-local admission control.

## Limits and release changes

Java 25 documents `ForkJoinPool` as also implementing `ScheduledExecutorService` and adds scheduling
operations; older LTS releases do not have that surface. The extended constructor exists since Java 9,
but parameter behavior is version-sensitive (`corePoolSize` is documented ignored in Java 25).
`setParallelism` exists since Java 19 and may be unsupported for a property-configured common pool.

The common pool ignores shutdown requests and uses daemon workers. A dedicated pool has normal
executor lifecycle. `shutdownNow()` for a fork/join pool always returns an empty list in Java 25; do
not infer that there was no queued work.

## Authoritative references

- [Java 25 `ForkJoinPool`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [Java 25 `ForkJoinTask`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinTask.html)
- [Java Language Specification §17.4.5](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4.5)
