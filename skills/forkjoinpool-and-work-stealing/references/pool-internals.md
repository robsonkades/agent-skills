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

`awaitQuiescence` is also a helping operation: an external caller may execute queued tasks, with
that caller's thread context rather than a pool worker's. A task it starts can run beyond the
specified wait timeout; that timeout does not cancel or preempt the body. Keep task handles and
actual completion ownership rather than using quiescence as a barrier against new submissions.

The classic binary pattern is this partial snippet inside a task with access to child computation:

```java
left.fork();
R rightResult = right.compute();
R leftResult = left.join();
return combine(leftResult, rightResult);
```

This avoids immediately forking both branches and then waiting while the current worker could compute.
Use `invokeAll` when it improves clarity; benchmark rather than treating source shape as proof of
speed.
If direct `compute()` or combination fails, the forked sibling is still owned work. Define how its
outcome and actual exit are observed before shared resources are released; cancellation alone does
not wait for that exit. `invokeAll` also does not promise that all siblings have stopped on failure.

The default task's `cancel(true)` does not interrupt its worker. By contrast,
`adaptInterruptible(Callable)` (Java 19+) and its `Runnable` overloads (Java 22+) attempt to interrupt
the executing thread when cancelled with `true`. Check the actual task/adapter and release;
interruption is still a request, and a cancelled Future can precede body exit and cleanup.

The submitting context matters too. In the examined OpenJDK 25 implementation, `submit(Callable)`
and the ordinary-`Runnable` submission overloads use interruptible wrappers when called outside any
`ForkJoinWorkerThread`, but ordinary wrappers when called from a worker, even one belonging to a
different pool. `submit(ForkJoinTask)` preserves the supplied task; `submit(Runnable)` also avoids
rewrapping a task that is already a `ForkJoinTask`. The returned type alone does not identify the
cancellation behavior. OpenJDK 17u's examined `submit` implementations use ordinary wrappers for
plain tasks, so do not project the Java 25 behavior backward. When interruption is required, select
an explicit supported adapter and still verify cooperative exit.

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

Compensation rejection is a task failure path. In OpenJDK 25, `compensatedBlock` calls
`tryCompensate` before `block()`, so a reached thread ceiling can throw
`RejectedExecutionException` before the blocker runs. Observe the task's outcome and release any
resources acquired before `managedBlock`, even when submission succeeded. Returning `true` from
`saturate` suppresses that rejection but can leave no worker able to satisfy the wait; establish an
independent progress source rather than assuming acceptance ensures liveness.

This Java 17-compatible class uses imports from `java.util.concurrent`. Confine one blocker instance
to one calling thread and invoke it through `ForkJoinPool.managedBlock(new AwaitLatch(latch))`.

```java
final class AwaitLatch implements ForkJoinPool.ManagedBlocker {
    private final CountDownLatch latch;
    private boolean awaited;

    AwaitLatch(CountDownLatch latch) { this.latch = latch; }

    @Override public boolean isReleasable() {
        return awaited;
    }

    @Override public boolean block() throws InterruptedException {
        latch.await();
        awaited = true;
        return true;
    }
}
```

`getCount() == 0` alone is not the latch API's documented publication boundary. Even for an already
open latch, this example calls `await()` successfully before reporting release; interruption
propagates without claiming completion. The extra managed-block check may cost compensation work,
so measure its suitability rather than treating this as a universal optimal blocker.

Compensation can increase thread count and memory/context-switch pressure. It cannot increase a
database pool, remote quota or disk throughput. Pair it with resource-local admission control.

## Limits and release changes

Java 25 documents `ForkJoinPool` as also implementing `ScheduledExecutorService` and adds scheduling
operations; older LTS releases do not have that surface. The extended constructor exists since Java 9,
but parameter behavior is version-sensitive (`corePoolSize` is documented ignored in Java 25).
`setParallelism` exists since Java 19 and may be unsupported for a property-configured common pool.

The common pool ignores shutdown requests and uses daemon workers. Its `awaitTermination` helps/
waits for quiescence but always returns `false`; that result does not say whether a particular task
succeeded. Its `close()` does not wait or take ownership of shared work. Call a dedicated pool's
waiting `close()` from an owner outside the tasks whose completion it awaits, otherwise the caller
can wait for itself. On interruption, `close()` escalates to `shutdownNow` behavior, prevents waiting
tasks from executing, continues waiting for active bodies to finish, and restores the interrupt
status before returning. It has no timeout and cannot force an uncooperative body to exit.
`shutdownNow()` always returns an empty list in Java 25; do not infer that there was no queued work.

On Java 17, or when any supported release needs bounded teardown, use `shutdown()` and bounded
`awaitTermination` with an explicit timeout/interruption policy instead of relying on `close()`.
Expiry still does not prove bodies exited: retain cleanup ownership and report remaining work.
On Java 25 scheduled delayed tasks can extend orderly shutdown; inspect ownership and
the documented `cancelDelayedTasksOnShutdown()` policy before changing it.

## Authoritative references

- [Java 25 `ForkJoinPool`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinPool.html)
- [Java 25 `ForkJoinTask`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ForkJoinTask.html)
- [OpenJDK 25 `ForkJoinPool` source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/ForkJoinPool.java) — submission wrappers and compensation rejection.
- [OpenJDK 25 `ForkJoinTask` source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/util/concurrent/ForkJoinTask.java) — interruptible wrapper behavior.
- [OpenJDK 17.0.16 `ForkJoinPool` source](https://github.com/openjdk/jdk17u/blob/jdk-17.0.16-ga/src/java.base/share/classes/java/util/concurrent/ForkJoinPool.java) — older `submit` wrappers; do not infer behavior of other submission APIs from these overloads.
- [CountDownLatch publication contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CountDownLatch.html)
- [Java Language Specification §17.4.5](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4.5)
