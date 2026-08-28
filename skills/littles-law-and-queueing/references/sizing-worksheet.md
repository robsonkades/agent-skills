# Sizing worksheet

## Inputs to establish first

- `λ_target` — arrival rate at the expected **peak**, not the average.
- `R` estimated **per component**: `R_total`, `R_db`, `R_http_client` separately.
- The latency SLO, which fixes the safe utilisation band.
- A safety factor of 1.2–1.5.

## Thread pool

```
N_threads = λ_target × R_total × factor
```

Then check the resulting utilisation: `N_needed / N_configured ≤ 0.75–0.80`. If it is
above that band, the pool is sized for throughput and will miss the latency SLO.

For CPU-bound work this calculation does not apply — the optimum is near
`availableProcessors()` and stays there. Threads beyond that add context switching and
cache pressure.

## Downstream pool

Size it with the residence time of _that_ component:

```
N_db = N_threads × (R_db / R_total)

Example: 200 request threads, R_total = 200 ms, R_db = 15 ms
         N_db = 200 × (15 / 200) = 15 connections

         200 connections would be 13× oversized — and idle connections are not
         free: memory in the JVM, a backend process on the database server.
```

## The ThreadPoolExecutor growth rule

`ThreadPoolExecutor` creates a thread beyond `corePoolSize` **only when the queue refuses
a task**. With a queue bounded at 100, a `(10, 50)` pool stays at 10 threads until 100
tasks are already waiting. With an unbounded queue it never grows at all, and
`maximumPoolSize` is dead configuration.

This is why `Executors.newFixedThreadPool` grows its queue to an `OutOfMemoryError`
instead of rejecting: the queue is a `LinkedBlockingQueue` with no bound.

```java
// Bounded queue with an explicitly chosen rejection policy
new ThreadPoolExecutor(
    50, 50, 0, TimeUnit.MILLISECONDS,
    new ArrayBlockingQueue<>(500),
    new ThreadPoolExecutor.CallerRunsPolicy());
```

`CallerRunsPolicy` throttles by occupying the producer, not by blocking it. Accept that
the calling thread stops doing its own work, that task ordering is no longer guaranteed,
and that an event loop or I/O thread would be blocked by it. In an HTTP server with an
external producer, rejecting with `429` is usually the better trade.

## Validation in production

- `N ≈ λ × R` reconciles from three independently measured numbers.
- Steady state confirmed before any number is reported.
- Thread state from `jcmd <pid> Thread.dump_to_file -format=json` (`jstack` does not list
  virtual threads).
- Connector MBeans: `currentThreadsBusy / maxThreads` below 80% in normal operation.
- HikariCP MBeans: `ThreadsAwaitingConnection` consistently at 0.
- `SQLTransientConnectionException` tracked as a saturation metric, not only as an error.
- Queue depth (`workQueue.size()`) instrumented — it grows _before_ latency rises, which
  makes it the earlier signal.
