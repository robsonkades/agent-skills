# Concurrency versus parallelism

## The distinction, and why it decides the design

```text
Concurrency   how many operations are IN PROGRESS at once
              bounded by memory, connections, and whatever else each holds
              raised cheaply by virtual threads

Parallelism   how many operations are EXECUTING at once
              bounded by cores, and by nothing you can configure
              raised only by more cores, or less work
```

A service with 50 000 requests in flight on 8 cores has a concurrency of 50 000 and a
parallelism of at most 8. That is not a defect; for I/O-bound work it is the entire point,
because 49 992 of those requests are waiting on someone else.

The practical consequence is a rule with no exceptions: **raising concurrency helps only for
work that waits.** For work that computes, the ceiling is the core count, and everything past
it is scheduling overhead plus memory.

## Classifying a workload with evidence

Do not classify by intuition; the answer is measurable in minutes.

```bash
# Where does wall-clock time go? On-CPU vs waiting.
asprof -e wall -d 60 -f wall.html <pid>
asprof -e cpu  -d 60 -f cpu.html  <pid>
```

| Observation                                        | Classification                                             |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Wall graph dominated by socket/file/lock frames    | I/O-bound — concurrency helps                              |
| CPU graph resembles the wall graph                 | CPU-bound — only parallelism helps                         |
| Process CPU near `cores × 100 %` under load        | CPU-bound, and already at the ceiling                      |
| Process CPU low while latency is high              | queueing or waiting, never idleness                        |
| Throughput flat as threads are added, CPU flat too | a downstream bound, not a local one                        |
| Throughput flat as threads are added, CPU rising   | contention — `lock-inflation`, `universal-scalability-law` |

The fourth row is the one most often misdiagnosed. **Low CPU with high latency is a queue.**
Adding threads to a queue that is already full adds arrivals, not service.

## Why more concurrency stops helping

Little's Law states the relationship: `L = λ × W` — concurrency equals arrival rate times
time in system. Read it backwards, which is the useful direction: at a fixed arrival rate,
concurrency is determined by _latency_, not chosen. If concurrency is rising and the arrival
rate is not, latency has risen, and the extra concurrency is a symptom rather than a lever.

Past the point where a resource saturates, adding concurrency does three things, all bad:
each operation holds its resources longer, the queue in front of the bottleneck grows, and
the failure moves from a fast rejection to a slow timeout. The utilisation curve is
hyperbolic — at 80 % utilisation the queue wait is already about 4× the service time, at 90 %
about 9× — so the last 20 % of headroom is not slack, it is the whole latency budget.

`littles-law-and-queueing` carries the arithmetic; `universal-scalability-law` carries the
part where added parallelism goes _negative_ because of coherence costs.

## What each metric responds to

| Goal                | Responds to                                          | Does not respond to                          |
| ------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Throughput (rps)    | removing the bottleneck; more cores if CPU-bound     | more threads, if the bottleneck is elsewhere |
| Median latency      | less work per request; a faster dependency           | concurrency                                  |
| Tail latency (p99)  | less queueing, less GC pause, fewer retries, hedging | average-case optimisation                    |
| Memory per request  | smaller working sets; fewer in-flight requests       | thread type alone                            |
| Resource efficiency | not blocking an OS thread while waiting              | anything, if the work is CPU-bound           |

Tail latency is where concurrency decisions show up first and most painfully: a bound that is
slightly too high does not change the median at all and moves p99 by an order of magnitude.
`latency-statistics` and `tail-latency-analysis`.

## The Java specifics

- **Virtual threads raise concurrency, not parallelism.** The scheduler's parallelism defaults
  to `availableProcessors()`. A million virtual threads running CPU-bound work behave like a
  fixed pool of that size, plus a million stacks on the heap.
- **`ForkJoinPool` and parallel streams raise parallelism**, for CPU-bound decomposable work,
  and are the wrong tool for anything that blocks.
- **Asynchronous is not parallel.** A `CompletableFuture` chain on one thread is concurrent
  and entirely sequential. Async removes waiting; it does not add cores.
- **Non-blocking is not parallel either.** An event loop with 8 threads on 8 cores has the
  same parallelism as a fixed pool of 8 — it just holds far more concurrent operations.
- **The core count the JVM sees is not always the machine's.** In a container,
  `availableProcessors()` reflects the CPU limit, and every pool, the common pool and the
  virtual-thread scheduler are sized from it. A CPU limit of 1 changes several defaults at
  once. `container-awareness`.

## The two sentences worth keeping

Concurrency is a structure of the program; parallelism is a property of the execution. Java
lets you have an enormous amount of the first almost for free, and exactly as much of the
second as you have cores.
