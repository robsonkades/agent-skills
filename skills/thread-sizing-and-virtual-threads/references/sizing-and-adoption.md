# Sizing and adoption

## The two formulas and which one wins

```
Little's Law:   L = λ × W          (concurrency needed for the target rate)
CPU ceiling:    N = N_cpu × U × (1 + W/S)
```

The answer is the **smaller** of the two, capped by what the downstream resource can
actually absorb. Sizing to the larger produces a pool that succeeds at overwhelming
something else.

## The utilisation curve

| ρ    | queue wait |
| ---- | ---------- |
| 0.50 | ~1.0 × S   |
| 0.70 | ~2.3 × S   |
| 0.80 | ~4.0 × S   |
| 0.90 | ~9.0 × S   |

30% headroom is not slack; it is staying on the left of the asymptote.

## Bounded queue with a chosen policy

```java
// Unbounded queue: not the absence of a limit — the exchange of a fast,
// diagnosable rejection for a late OutOfMemoryError that loses every
// pending task with it.
ExecutorService bad = Executors.newFixedThreadPool(10);

ThreadPoolExecutor good = new ThreadPoolExecutor(
    10, 10, 60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(1_000),
    new ThreadPoolExecutor.CallerRunsPolicy());
```

## Thread-per-task, correctly

```java
// Platform threads: reuse them
ExecutorService pool = Executors.newFixedThreadPool(50);

// Virtual threads: thread-per-task is the intended model (JEP 444)
try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Request req : requests) exec.submit(() -> handle(req));
}

// CPU-bound work: the ceiling is the core count, and that does not change
ExecutorService cpu = Executors.newFixedThreadPool(
        Runtime.getRuntime().availableProcessors());
```

With virtual threads, "one thread per task" stops being an anti-pattern and becomes the
recommendation. The inversion is deliberate.

## Naming

```java
ThreadFactory f = Thread.ofVirtual().name("checkout-", 0).factory();
ExecutorService named = Executors.newThreadPerTaskExecutor(f);
```

An unnamed virtual thread has an empty name and shows as `VirtualThread[#38]/runnable`.
Name the factory before you need it.

## ThreadLocal under virtual threads

```java
// Wrong once threads are millions rather than dozens
private static final ThreadLocal<Connection> CONN =
        ThreadLocal.withInitial(DriverManager::getConnection);

// Right for a scarce resource: an explicit pool, scoped to use
try (Connection c = dataSource.getConnection()) { /* ... */ }

// Right for immutable per-request context: ScopedValue (JEP 506, final in 25)
private static final ScopedValue<User> CURRENT = ScopedValue.newInstance();
ScopedValue.where(CURRENT, user).run(() -> process());
```

`ScopedValue` replaces `ThreadLocal` as **context**. It does not replace it as a **cache**
— for that, the answer is a pool.

## Pre-production checklist

- [ ] Pool size derived from Little's Law or the CPU ceiling with **measured** λ and W,
      not inherited from an older configuration
- [ ] The smallest ceiling on the path identified — and it is the one being sized
- [ ] Queue bounded, with a consciously chosen rejection policy
- [ ] `queueSize` and `activeCount` instrumented with alerts (the queue grows _before_
      latency rises)
- [ ] Projected peak utilisation below 0.8
- [ ] Virtual threads: an explicit concurrency limit (semaphore, connection pool) next to
      **every** scarce resource
- [ ] Virtual threads: connection pool re-sized, with its own metric
- [ ] `ThreadLocal` holding expensive objects reviewed — cache became a pool, context
      became `ScopedValue`
- [ ] Libraries with blocking JNI/FFM on the hot path identified and isolated on a platform
      pool
- [ ] Thread factories named descriptively
- [ ] Runbooks use `jcmd Thread.dump_to_file`, not `jstack`
