---
name: executors-and-task-lifecycle
description: >
  The lifecycle of a task inside an ExecutorService: submit versus execute and which one
  loses the exception, the enqueue-before-grow rule that makes maximumPoolSize dead
  configuration, rejection policies as a deliberate choice, ScheduledExecutorService
  cancelling a periodic task forever on its first throw, and shutdown versus shutdownNow
  versus close. Use when a submitted task appears never to have run, when a periodic job
  stopped silently after an incident, when Executors.newFixedThreadPool or
  newCachedThreadPool is chosen by habit, when a pool is shared between a fast and a slow
  workload, when shutdownNow is expected to stop work, or when a virtual-thread executor
  replaced a pool and the concurrency limit went with it. Not deriving the pool size
  (littles-law-and-queueing), platform versus virtual threads
  (thread-sizing-and-virtual-threads), the work-stealing pool
  (forkjoinpool-and-work-stealing), composing stages (completablefuture-composition), or
  stopping a running task (cancellation-and-interruption).
---

# Executors and Task Lifecycle

## Purpose

Make a task's whole lifecycle — accepted, queued, executed, failed, observed, drained —
something the code states rather than something the JDK defaults decide. Two failures
dominate, and both are silent: the task whose exception was captured into a `Future` that
nobody ever reads, and the executor that either never stops or stops without draining.

An executor is four decisions, not one: which threads run the work, what happens when
they are all busy, how failure becomes visible, and what happens at shutdown. The
`Executors` factory methods answer all four for you, and three of the answers are usually
wrong for a server.

## Workflow

1. **Classify the work first.** CPU-bound: a fixed pool sized to cores. I/O-bound at high
   concurrency: a virtual-thread executor _plus_ an explicit limit on the scarce resource.
   Recursive decomposition: `ForkJoinPool`. Periodic: `ScheduledExecutorService`.
2. **Bound the queue and choose the rejection policy out loud.** A rejection you can see
   is a design; an unbounded queue is the same limit deferred to the heap.
3. **Decide how a failure becomes visible** before the first submission. `execute` and
   `submit` differ here, and the difference is the most common cause of "the task never
   ran".
4. **Decide the shutdown contract**: who calls it, with what timeout, and what happens to
   the tasks still in the queue.
5. **Instrument queue depth, active count and rejections.** The queue grows before latency
   does; it is the earliest signal available and it is free.
6. **Give each purpose its own executor.** A shared pool makes every workload's latency
   depend on the slowest one that uses it.

## Rules

- `execute(Runnable)` lets an uncaught exception reach the thread's
  `UncaughtExceptionHandler`. `submit(...)` captures it into the `Future`, where it stays
  invisible until someone calls `get()`. **A task submitted with `submit` and never joined
  fails in complete silence** — this is the single most common way work disappears.
- `ThreadPoolExecutor` **enqueues before it grows**: it creates a thread beyond
  `corePoolSize` only when the queue _refuses_ an offer. With an unbounded queue,
  `maximumPoolSize` is dead configuration that will never be reached.
- `Executors.newFixedThreadPool` and `newSingleThreadExecutor` use an unbounded
  `LinkedBlockingQueue`; `newCachedThreadPool` uses a `SynchronousQueue` with
  `maximumPoolSize = Integer.MAX_VALUE`, so it never queues and never stops creating
  platform threads. Neither is a safe default for work arriving from the network.
- The rejection policy is a product decision. `AbortPolicy` (the default) throws
  `RejectedExecutionException` — visible, and the right default. `CallerRunsPolicy` pushes
  backpressure onto the submitting thread, which is the point and also means the accept
  loop stops accepting. `DiscardPolicy` and `DiscardOldestPolicy` lose work silently and
  must never sit under a request with a caller waiting for an answer.
- **A periodic task that throws is never rescheduled**, and nothing is logged. The
  exception is held in the `ScheduledFuture` that no code holds. Every
  `scheduleAtFixedRate` body needs its own `try { … } catch (Throwable t) { log; }`.
- `ScheduledThreadPoolExecutor` is a core-size-only pool with an unbounded delay queue:
  `maximumPoolSize` has no effect. One long task on a single-threaded scheduler delays
  every other schedule on it.
- `scheduleAtFixedRate` with a task slower than the period does **not** overlap on a given
  scheduler thread — executions bunch up back-to-back instead. That is not a distributed
  lock and not an overlap guarantee across replicas.
- `ExecutorService` is `AutoCloseable` since Java 19, and `close()` is
  `shutdown()` + **wait indefinitely**, escalating to `shutdownNow()` only if the closing
  thread is interrupted. try-with-resources around tasks that can hang converts a hang
  into a hang at shutdown, which is harder to diagnose, not easier.
- `shutdown()` refuses new work and lets the queue drain. `shutdownNow()` drains the queue
  into the returned list — that list is the work you just dropped and is your only chance
  to persist it — and **interrupts** running tasks, which stops only tasks that respond to
  interruption.
- `Executors.newVirtualThreadPerTaskExecutor()` has no pool size, no queue and no rejection
  policy. It cannot reject, so if it replaced a bounded pool, the bound is gone and must
  be re-declared next to each scarce resource.
- `Future.get()` with no timeout is an unbounded wait on a thread you own. Bound it, or
  own the reason it cannot be bounded.
- `invokeAll` returns only when every task has completed or been cancelled, so it inherits
  the slowest task's latency; the timed overload cancels the unfinished ones.
- Instrument `getQueue().size()`, `getActiveCount()`, `getCompletedTaskCount()` and a
  rejection counter. An executor with no queue-depth metric is an unobservable buffer.

## References

- [Shutdown, rejection and drain](references/shutdown-and-rejection.md) — the factory-method
  table with each one's real queue and failure mode, the shutdown recipe with a bounded
  wait, choosing a rejection policy, and draining on SIGTERM. Read when configuring a new
  executor or when work is lost at deploy time.
- [Scheduled and periodic tasks](references/scheduled-and-periodic.md) — fixed-rate versus
  fixed-delay, the swallow-and-die trap with a working wrapper, drift, scheduler starvation
  and what a scheduler does not give you across replicas. Read when a job runs late, twice,
  or stopped without a trace.
