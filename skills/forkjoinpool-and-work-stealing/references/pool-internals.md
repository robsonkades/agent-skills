# ForkJoinPool internals

## The `WorkQueue` deque

Each worker owns a deque (a private static class inside `java.util.concurrent.ForkJoinPool`
— an implementation detail, not public API):

```
class WorkQueue {
    ForkJoinTask<?>[] array;   // circular buffer, resized on demand
    volatile int base;         // read and CAS-written by thieves
    int top;                   // read and written only by the owner, no CAS needed
}
```

- **push** (owner only): write `array[top]`, increment `top`. Publication uses a release
  barrier so a thief that sees the new `top` also sees the array contents.
- **pop** (owner only): decrement `top`; resolves via CAS only if it collides with a thief
  taking the same slot — the rare path.
- **poll** (thieves): CAS `base` forward to claim the oldest entry; on failure, move on.

The point: **the owner's path needs no atomic instruction in the common case.** The owner
works LIFO from the top, which is also good for cache locality of recursive forks; thieves
take approximately FIFO from the base, which tends to steal the largest remaining subtree.

This is what `ForkJoinPool` solves that a single-queue `ThreadPoolExecutor` does not — the
shared queue is a contention point every worker must pass through on every task.

## The stealing scan

An idle worker does not ask "who is next to me":

```
1. Pick a pseudorandom starting index over the array of WorkQueues,
   which includes every worker queue AND the external submission queues.
2. Sweep the array cyclically with a pseudorandom stride, testing each slot:
     a. empty or null -> next slot in the cycle
     b. non-empty     -> CAS on 'base' to steal the oldest task
     c. CAS failed    -> try the NEXT queue; do not retry the same victim
3. If a full sweep finds nothing, the worker may become partially and then
   fully inactive, to be reactivated when a task appears in any queue.
```

Any worker can steal from any other, with a probability that does not depend on position —
only on which queues have work at scan time. Steals concentrated on one queue mean that
queue held large tasks while the others ran dry; the cause is never topological.

The randomisation is what keeps several thieves from converging on the same victim.

The formal guarantee behind randomised work stealing (Blumofe & Leiserson, 1999) is
`T_P ≤ T_1/P + O(T_∞)`, with an expected steal count of `O(P · T_∞)` — the reason it scales
with low communication overhead.

## What `fork()` and `join()` actually do

```
task.fork()
  -> caller is a ForkJoinWorkerThread: push() onto its own local WorkQueue
     (common path, no CAS)
  -> caller is outside the pool: external submission, into a dedicated
     submission queue

task.join()
  -> already complete: return the result immediately (most common, fastest)
  -> still on the caller's own WorkQueue, unstolen: the caller runs it
     directly ("unforking") rather than waiting at all
  -> stolen and running elsewhere: the caller enters the pool's HELP
     mechanism instead of blocking naively
```

**The help mechanism is not called `helpStealer()`.** That name is plausible but
corresponds to no method in the current `ForkJoinPool` source. The real mechanism is
`helpJoin`, with `helpComplete` for the `CountedCompleter` pattern (which propagates
completion through the task tree rather than by return value). A thread that called
`join()` and cannot re-run the task locally looks for other useful pool work to run while
it waits — preferably work that advances the same task tree, otherwise anything available.
Only when there is nothing useful left does the pool decide between parking the thread —
potentially triggering compensation so parallelism is not lost — and continuing to try.

This is why `ForkJoinTask.join()` is safe against the pool-exhaustion deadlock that a naive
`Future.get()` produces in a fixed-size `ThreadPoolExecutor`, where all N threads can end
up waiting on each other with none free to unwind the dependency. A joining thread here
stays productive.

## Parallelism, threads and the ceiling

```java
ForkJoinPool pool = new ForkJoinPool(
    parallelism,                                        // default: availableProcessors()
    ForkJoinPool.defaultForkJoinWorkerThreadFactory,
    null,                                               // UncaughtExceptionHandler
    asyncMode);                                         // true = local FIFO
```

| Parameter     | CPU-bound divide-and-conquer    | Streams / event-driven, no nested join                                                    |
| ------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `parallelism` | `nCPU`                          | `nCPU`, adjusted to the load profile                                                      |
| `asyncMode`   | `false` (local LIFO — locality) | `true` (local FIFO — avoids the first submission never running under a continuous stream) |

`parallelism` is a target, not by itself a hard thread ceiling. The common pool allows up
to **256 spare threads** beyond it by default, to compensate for `ManagedBlocker` blocking;
that number is the common pool's default (`java.util.concurrent.ForkJoinPool.common.maximumSpares`),
not a universal limit. The architectural ceiling of any instance, common pool included, is
`MAX_CAP = 32,767` (`0x7fff`, an internal constant).

A dedicated pool sets its own ceiling through the nine-argument constructor (Java 9+):

```java
public ForkJoinPool(int parallelism,
                    ForkJoinWorkerThreadFactory factory,
                    UncaughtExceptionHandler handler,
                    boolean asyncMode,
                    int corePoolSize,
                    int maximumPoolSize,     // this pool's thread ceiling
                    int minimumRunnable,
                    Predicate<? super ForkJoinPool> saturate,
                    long keepAliveTime,
                    TimeUnit unit)
```

## The happens-before guarantee, exactly

The `ForkJoinTask` Javadoc's memory-consistency section establishes two edges and only two:

- Actions by a thread **before** calling `fork()` happen-before the actions of the task.
- Actions of the task happen-before actions by any thread **after** a successful `join()`
  on that same task (or an equivalent return, such as `invoke()`).

It says nothing about two **sibling** tasks, both forked from the same `compute()` and
running concurrently without one joining the other. Two siblings incrementing a shared
`static` field are in a data race in the strict JMM sense; sharing a pool creates no
ordering.

This is why `left.fork(); rightResult = right.compute(); return left.join() + rightResult;`
is safe to combine at the point after `join()`, and a shared accumulator is not.

## The virtual thread connection

The virtual-thread scheduler is itself a dedicated `ForkJoinPool`, with `asyncMode = true`
(FIFO) and compensation that reuses the `ManagedBlocker` protocol.
