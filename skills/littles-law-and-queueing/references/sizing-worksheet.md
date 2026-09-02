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

That number is the **demand**: how many requests are in flight at the target rate. It says
nothing about whether the machine can run that many at once, which is the second formula.

## The CPU ceiling, and reconciling it with demand

```
N_ceiling = N_cpu × U_target × (1 + W/S)

  N_cpu     effective processor count — the container quota (`ActiveProcessorCount`),
            not the host, minus what GC, JIT and other pools take
  U_target  the CPU utilisation you are willing to run at (0.7–0.8 for a latency SLO)
  S         CPU time per request on this pool (service)
  W         off-CPU time per request on this pool — blocked on I/O, a lock, a downstream
```

Derivation: one thread keeps a core busy for the fraction `S / (S + W)` of its life, so
`N_cpu × U` busy cores need `N_cpu × U × (S + W) / S` threads. The two limiting cases are
the ones people quote as rules:

- **CPU-bound (`W ≈ 0`):** `N ≈ N_cpu`. More threads than cores add context switches and
  cache eviction and reduce throughput; the pool is a bulkhead, not a capacity lever.
- **I/O-bound (`W ≫ S`):** `N ≈ N_cpu × W/S`, which is why a 4-core service that spends
  2 ms on CPU and 40 ms waiting on the database runs 60–80 threads at full CPU.

Worked, for the same service as above:

```
λ_target = 800 req/s, R_total = 200 ms      → demand   N = 800 × 0.200 × 1.25 = 200 threads
N_cpu = 4, U = 0.75, S = 8 ms, W = 192 ms   → ceiling  N = 4 × 0.75 × (1 + 24) = 75 threads

Demand exceeds the ceiling: the CPU saturates at 75 threads, ρ_cpu = 800 × 0.008 / 4 = 1.6.
A 200-thread pool does not deliver 800 req/s; it delivers ~375 req/s and a queue that grows for as long as the overload lasts.
The finding is "CPU capacity", not "pool size".
```

Rule: **size the pool at the smaller of demand and ceiling, and when demand is the larger,
report the ceiling as the capacity limit.** Assumptions the formula depends on, each a way
it silently goes wrong:

- `S` is **CPU time**, measured (JFR `jdk.ThreadCPULoad`, or thread CPU time around the
  request), not wall time minus an estimate. A wall-time `S` counts `W` twice.
- `W` is time **off** the CPU. A thread that spins, busy-polls or runs a tight retry loop
  is not waiting; it is `S`. Lock wait counts as `W` only when the lock parks the thread.
- Requests are homogeneous enough that one `W/S` describes them. A bimodal mix (a 1%
  report path at 2 s of CPU) needs its own pool; see the utilisation reference.
- `N_cpu` is what this process actually gets. In a container it is the quota, and GC
  threads, JIT threads, the common pool and other executors share it; the ceiling is for
  the sum of all runnable threads, not for one pool.
- Virtual threads remove the pool but not the ceiling: `N_cpu × U × (1 + W/S)` is still the
  number of mounted-plus-parked threads the CPU can sustain, and beyond it the carriers
  saturate. Thread cost and adoption are `thread-sizing-and-virtual-threads`.

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
