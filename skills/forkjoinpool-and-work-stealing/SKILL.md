---
name: forkjoinpool-and-work-stealing
description: >
  ForkJoinPool and work stealing: the per-worker deque, submission versus worker queues,
  the pseudorandom stealing scan, the join-time help mechanism, the common pool and
  everything that shares it, ManagedBlocker and compensation, parallel-stream behaviour,
  task-granularity calibration, and diagnosing a starved or over-subscribed pool. Use
  when a parallelStream or CompletableFuture stalls, when blocking I/O runs inside a
  ForkJoinPool task, when effective parallelism silently drops under load, when 256 is
  quoted as a pool ceiling, when fork has no matching join, when a division threshold was
  copied from another project, or when sibling tasks write shared mutable state. Does not
  cover platform versus virtual threads and general pool sizing
  (thread-sizing-and-virtual-threads), the sizing arithmetic itself
  (littles-law-and-queueing), or reactive stream backpressure (reactive-backpressure).
---

# ForkJoinPool and Work Stealing

## Purpose

Decide whether a `ForkJoinPool` is delivering the parallelism it was configured for, and
what to change when it is not. The failure this prevents is silent: a task blocks on I/O
without telling the pool, effective parallelism collapses below the configured value, and
nothing in the logs says so — the symptom is throughput that stops responding to load.

The second failure is inherited numbers. A division threshold that worked elsewhere, or
256 copied from the common pool as if it were an architectural ceiling, are both decisions
made without measuring this workload.

## Workflow

1. **Establish which pool is involved.** `parallelStream()` and executor-less
   `CompletableFuture` both run on `ForkJoinPool.commonPool()`, shared with every other
   subsystem and third-party library in the JVM. A dedicated pool is a different problem
   from a polluted common one.
2. **Read the pool's own state.** `pool.toString()` gives `parallelism`, `size`, `active`,
   `running`, `steals`, `tasks` and `submissions` with no external tooling. The metrics are
   plain instance methods — there is no `ThreadPoolMXBean` for this type.
3. **Compare against a healthy baseline** before suspecting granularity.
   `getStealCount()`, `getActiveThreadCount()` and `getQueuedTaskCount()` mean nothing in
   isolation.
4. **Separate "searching for work" from "doing work".** Run async-profiler in wall mode
   and compare time in `ForkJoinPool.scan` / `runWorker` against `ForkJoinTask.doExec`. A
   high ratio of the first is the signature of tasks that are too small.
5. **Look for an unannounced block.** Any blocking call inside a task, without
   `ManagedBlocker`, removes a worker from the pool with no signal and no compensation.
   Check thread dumps for workers in `WAITING`/`BLOCKED` rather than `RUNNABLE`.
6. **Fix by isolation first, mechanism second.** Move I/O to a dedicated executor composed
   via `CompletableFuture`; use `ManagedBlocker` only for occasional blocking inside
   otherwise CPU-bound tasks. See `references/diagnosing-and-sizing.md`.
7. **Recalibrate the threshold with JMH**, against the real per-element cost, never with
   `System.nanoTime()` around a loop.

## Rules

- Never run a blocking call inside a `ForkJoinPool` task without `ManagedBlocker` or a
  dedicated pool. Without the signal the pool cannot know a worker stopped progressing and
  cannot compensate.
- Never put long or blocking work on the common pool. It is shared by parallel streams,
  every executor-less `CompletableFuture`, and any library that defaults to it.
- 256 is the common pool's `maximumSpares` default
  (`java.util.concurrent.ForkJoinPool.common.maximumSpares`), not a ceiling. The
  architectural limit of any instance is `MAX_CAP = 32,767`. Size a dedicated pool's
  `maximumPoolSize` from the workload's real blocking profile, using the nine-argument
  constructor (Java 9+).
- Every `fork()` needs a matching `join()`, or the work must be a `RecursiveAction` driven
  by `invoke()`. A forked, never-joined task can be silently abandoned.
- Use `left.fork(); rightResult = right.compute(); left.join();` — not two forks and two
  joins. The second form wastes the calling thread while both joins wait.
- `ForkJoinTask` guarantees happens-before on exactly two edges: fork → task, and task →
  `join()` on that same task. There is **no** edge between sibling tasks. Sibling tasks
  writing shared mutable state are a data race regardless of sharing a pool.
- Combine results by returning them from `RecursiveTask` and merging in the parent's
  `compute()`, never through a shared `static` accumulator.
- Calibrate the threshold by _time per leaf task_ — low microseconds to a few
  milliseconds — not by element count. A workload with a higher per-element cost needs
  fewer elements per leaf.
- Do not benchmark pool changes with `System.nanoTime()` around a loop. Use JMH with
  `@Warmup`, `@Measurement` and `@Fork`; ad-hoc timing hides tiered compilation and
  dead-code elimination.
- `jdk.ThreadPark` and `jdk.JavaMonitorWait` default to a 20 ms threshold in
  `default.jfc` and 10 ms in `profile.jfc`. Lower it
  (`jfr configure jdk.ThreadPark#threshold=1ms`) before ruling out fine-grained waiting.
- Stealing is a pseudorandom cyclic scan over **all** pool queues, not a neighbour lookup.
  Steals concentrated on one queue mean that queue held large tasks, not that workers are
  topologically adjacent.
- Set `asyncMode = true` (FIFO) for stream-like or event-driven submissions with no nested
  `join()`; `false` (LIFO) for classic recursive divide-and-conquer.
- Java assertions need `-ea` at run time. A correctness check without it verifies nothing
  while appearing to.

## References

- [Pool internals](references/pool-internals.md) — the `WorkQueue` deque and why the owner
  path needs no CAS, the stealing scan step by step, what `fork()` and `join()` actually
  do including the help mechanism, and the happens-before guarantee in full. Read when you
  need the mechanism to explain an observation, or when reconciling against documentation
  that mentions `helpStealer()`.
- [Diagnosing and sizing](references/diagnosing-and-sizing.md) — the `toString()` field
  table, the instance-metric calls, the collection commands, threshold calibration, the
  I/O sizing formula with `ManagedBlocker`, and the incident checklist. Read when
  collecting evidence from a live pool or choosing a pool topology.
