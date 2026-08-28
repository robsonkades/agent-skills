# Diagnosing and sizing a ForkJoinPool

## Reading the pool's state

```java
pool.toString()
// java.util.concurrent.ForkJoinPool@...
// [Running, parallelism = 8, size = 8, active = 3,
//  running = 2, steals = 1547, tasks = 0, submissions = 0]
```

| Field         | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `parallelism` | Configured target parallelism                                                     |
| `size`        | Worker threads that currently exist (may exceed `parallelism` under compensation) |
| `active`      | Threads currently running a task — not idle, not blocked                          |
| `running`     | Threads not blocked in managed waiting                                            |
| `steals`      | Cumulative steal count since pool creation                                        |
| `tasks`       | Tasks queued in worker `WorkQueue`s                                               |
| `submissions` | Tasks in the external submission queues, not yet picked up by a worker            |

## Metrics are instance methods

There is no `ThreadPoolMXBean` for `ForkJoinPool` — that class does not exist for this
purpose in the JDK, and nothing is exposed through JMX natively. These are plain public
methods, callable on any reference including `ForkJoinPool.commonPool()`:

```java
pool.getStealCount();
pool.getActiveThreadCount();
pool.getRunningThreadCount();
pool.getQueuedTaskCount();
pool.getQueuedSubmissionCount();
pool.getPoolSize();
pool.getParallelism();
pool.isQuiescent();
```

Exposing them over JMX means writing your own MBean that delegates to these. The JDK ships
none.

## Collection

```bash
# thread dump — check whether pool workers are RUNNABLE (working or scanning)
# or WAITING/BLOCKED (stopped)
jcmd <pid> Thread.dump_to_file -format=json dump.json
```

```bash
# wall-clock profile: compare scan time against execution time
./profiler.sh -e wall -t -d 30 -f stealing.html <pid>
#   ForkJoinPool.scan / ForkJoinPool.runWorker  -> looking for work
#   ForkJoinTask.doExec                          -> doing work
# a high first-to-second ratio means task granularity is too fine
```

```bash
# JFR: jdk.ThreadPark appears when a worker actually blocks waiting for work
# or compensation. Default thresholds hide fine-grained waiting:
jfr configure jdk.ThreadPark#threshold=1ms
```

`jdk.JavaMonitorWait` is relevant only when application code inside a task uses
`wait()`/`notify()` explicitly; it is not the pool's own waiting path.

## Calibrating the division threshold

```
too small: fork/join overhead (ForkJoinTask allocation, deque push/pop,
           possible steal) exceeds the leaf task's useful work
too large: fewer leaf tasks than workers — cores sit idle with nothing to steal

The right threshold is the element count that, multiplied by YOUR workload's real
per-element cost, produces a leaf task of low microseconds to a few milliseconds.
A higher per-element cost therefore needs FEWER elements per leaf, which is why a
fixed number like 10,000 does not transport between workloads.
```

Measure it with JMH, varying the threshold at a fixed known per-element cost. A
memory-bandwidth-bound workload (a plain sum over a large array) masks the effect entirely
— you measure the hardware's bandwidth ceiling, not granularity.

## The CPU-bound recipe

```java
ForkJoinPool pool = new ForkJoinPool(Runtime.getRuntime().availableProcessors());

class SumTask extends RecursiveTask<Long> {
    protected Long compute() {
        if (to - from <= threshold) return sumSequential(array, from, to);
        int mid = (from + to) / 2;
        SumTask left  = new SumTask(array, from, mid, threshold);
        SumTask right = new SumTask(array, mid, to, threshold);
        left.fork();                          // asynchronous
        long rightResult = right.compute();   // synchronous — the caller stays useful
        return left.join() + rightResult;
    }
}
```

## The I/O-bound recipe: goal and mechanism

The sizing formula has the same shape as Goetz's:

```
effective_parallelism ≈ nCPU × (1 + wait/service)
```

It describes **how many threads the pool would need to keep working simultaneously** to
saturate the CPU given that part of each task is spent waiting. On its own it is not a
licence to run blocking I/O inside a `ForkJoinPool`.

`ManagedBlocker` is the mechanism that lets the pool actually reach and hold that number,
by telling it a thread is about to become unavailable:

```java
ForkJoinPool.managedBlock(new ForkJoinPool.ManagedBlocker() {
    public boolean block() throws InterruptedException {
        result = blockingCall();   // this is where it may genuinely block
        return true;
    }
    public boolean isReleasable() {
        return result != null;
    }
});
```

Without it, a task blocking on I/O tells nobody. The pool cannot know the worker stopped
progressing, has no signal to create or activate a replacement, and effective parallelism
falls silently below the configured value — the exact opposite of what the formula assumes.

The formula is the goal; `ManagedBlocker` is the mechanism. Using the formula without the
mechanism sizes for a target the pool cannot reach; using the mechanism without the formula
applies the right technique to an arbitrary thread count.

For real I/O-bound pipelines the simpler and usually better option is to isolate the I/O in
its own executor and compose:

```java
ExecutorService ioPool = Executors.newFixedThreadPool(ioParallelism);

CompletableFuture<Result> pipeline =
    CompletableFuture.supplyAsync(this::fetchFromDB, ioPool)
        .thenApplyAsync(this::transform, computePool)   // CPU-bound: ForkJoinPool
        .thenApplyAsync(this::writeToCache, ioPool);    // I/O: separate pool
```

| Situation                                                                     | Choice                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Occasional I/O inside a mostly CPU-bound `ForkJoinPool` task                  | `ManagedBlocker`, applied precisely to the blocking call |
| Pipeline with clearly separable I/O and CPU stages                            | Distinct pools composed via `CompletableFuture`          |
| `parallelStream()` / `CompletableFuture` on the common pool with blocking I/O | Never — isolate the I/O stage out of the common pool     |

## Pre-production checklist

- [ ] Threshold calibrated with JMH against this workload's per-element cost, not copied.
- [ ] No blocking call inside a pool task without `ManagedBlocker` or a dedicated pool.
- [ ] If the common pool is used via `parallelStream()` or executor-less
      `CompletableFuture`: no blocking or long-running stage runs on it.
- [ ] `maximumPoolSize` of any dedicated pool sized from the real blocking profile — not
      copied from the common pool's 256 nor from `MAX_CAP`.
- [ ] All result combination goes through `RecursiveTask` return values and `join()`; no
      sibling task writes shared mutable state.
- [ ] Every `fork()` has a matching `join()`, or is a `RecursiveAction` driven by
      `invoke()`.
- [ ] Metrics instrumented as direct method calls, not through a non-existent
      `ThreadPoolMXBean`.

## Incident checklist

- [ ] Thread dump taken; pool workers classified `RUNNABLE` versus `WAITING`/`BLOCKED`.
- [ ] `getStealCount()`, `getActiveThreadCount()`, `getQueuedTaskCount()` compared to a
      healthy baseline before suspecting granularity.
- [ ] JFR collected with `jdk.ThreadPark` threshold lowered, if fine-grained waiting is
      suspected.
- [ ] async-profiler wall mode run, and the scan-to-`doExec` ratio checked.
- [ ] If the common pool is involved: confirmed which other subsystem is competing for it.
- [ ] Data race between unrelated sibling tasks ruled out specifically, before attributing
      a wrong result to an intermittent bug.
