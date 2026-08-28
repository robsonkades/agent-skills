# Measuring CAS contention

CAS contention produces no dedicated JFR event — there is nothing equivalent to
`jdk.JavaMonitorEnter`, because a failed CAS is not an instrumented runtime event. Diagnosis
is hardware profiling plus comparative measurement, never a single event filter.

## Symptom to tool

| Observed symptom                                                               | Tool                                                                  | What it shows                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| High CPU, throughput flat as threads increase, no `BLOCKED` frames in `jstack` | `perf stat -e cache-misses,cycles,instructions`                       | A cache-miss rate out of proportion to the data actually touched — the signature of cache-line bouncing |
| Need to identify _which_ cache line is contended                               | `perf c2c record` / `perf c2c report` (Linux, needs hardware support) | Maps contended addresses to the exact cache line and the field offsets responsible                      |
| Threads spinning in `onSpinWait` without obviously showing as CPU consumers    | `async-profiler -e wall`                                              | Wall-clock sampling catches spin time even when the core is in a low-power state between iterations     |
| CAS failure rate and real throughput under contention                          | JMH with attempt counters in the `@State`                             | The only reliable route — instrument the algorithm or measure comparative throughput                    |

```bash
# Confirm cache-line bouncing on a loaded process
perf stat -e cache-misses,cache-references,cycles -p <pid> sleep 10

# Wall-clock profile — catches spinning threads, not only CPU-burning ones
./profiler.sh -e wall -d 30 -o flamegraph -f wall.html <pid>
```

## The hardware cost ladder

CAS is not free even uncontended, and the cost grows by orders of magnitude under real
contention — for the same physical reason that governs every cross-core synchronisation:
cache coherency.

| Operation                                                       | Order of magnitude (illustrative — measure on your hardware) | Why                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Load of a cache line already present (L1 hit, Shared/Exclusive) | ~1 cycle                                                     | No MESI state transition needed                                                                |
| Uncontended CAS (line already Exclusive on the executing core)  | A few to tens of cycles                                      | Local atomic read-modify-write; no cross-core invalidation before it succeeds                  |
| Contended CAS (line disputed between 2+ cores)                  | Tens to hundreds of cycles                                   | MESI forces invalidation of the copies on other cores and a refetch — _cache-line bouncing_    |
| Contended CAS across sockets (NUMA)                             | Hundreds to thousands of cycles                              | The line crosses the inter-socket interconnect; coherency latency grows with physical distance |
| Monitor inflation plus park (the contended `synchronized` path) | Microseconds to tens of microseconds                         | `ObjectMonitor` allocation and a kernel transition (`futex`/`park`)                            |

The structural point: contended CAS is not free "because it is not a lock". It is cheaper
than an inflated monitor because it never crosses the user/kernel boundary, but it still pays
the physical cost of invalidating and refetching a disputed cache line.

CAS maps to `lock cmpxchg` on x86-64 and to `ldaxr`/`stlxr` on ARM64.

## Choosing the approach

| Approach                         | Use when                                                                                                                                                                                                | Do not use when                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AtomicLong` / `AtomicInteger`   | Simple operations (increment, one CAS); low contention — heuristically under about four threads on the same field, but measure, since the real threshold depends on write rate and cache topology       | Sustained high contention — prefer `LongAdder`                                                  |
| `LongAdder` / `LongAccumulator`  | High-contention counters; maximum throughput for sum, max, min. Contention is spread across a `Cell[]`, each cell in its own memory region, so fewer cache lines are effectively disputed per increment | An arbitrary CAS on the value is needed — only cumulative operations work                       |
| `AtomicReference` + retry loop   | Custom lock-free structures; CAS over complex references                                                                                                                                                | Very high contention with no backoff — starvation becomes possible                              |
| Ring-buffer pipeline (Disruptor) | Very high throughput message queues; multi-consumer pipelines; predictable latency from low GC pressure                                                                                                 | A `BlockingQueue` already meets the requirement — the API is more complex and the size is fixed |

## Spinning, correctly

```java
// Bad: unbounded retry with no backoff — threads burn cycles competing indefinitely
while (!ref.compareAndSet(expected, newValue)) {
    expected = ref.get();
}

// Better: Thread.onSpinWait() (JDK 9+) emits PAUSE on x86 and cuts the energy cost
while (!ref.compareAndSet(expected, newValue)) {
    expected = ref.get();
    Thread.onSpinWait();
}
```

## Benchmarking rules

An ad-hoc `System.nanoTime()` loop in `main()` is wrong in three concrete ways:

- **No isolated fork** — running several benchmarks in one JVM contaminates each with the
  previous one's JIT compilation state.
- **No warmup/measurement split** — the first iterations include interpretation, C1
  compilation, possible deoptimisation and C2 recompilation, mixed into the steady state you
  meant to measure.
- **No `Blackhole` or consumed return** — the JIT eliminates calls whose result is never
  read, inflating the measured throughput.

Use JMH with `@Fork`, separate `@Warmup` and `@Measurement`, and a consumed result. Vary the
thread count across 1, 2, 4, 8 and 16+, because CAS contention is not linear in the number of
competitors. Record the analytical prediction _before_ running, so the benchmark confirms or
refutes a mechanism rather than merely producing numbers.

## Before you investigate

- Confirm the symptom really is CAS contention (cache-line bouncing) and not allocation, GC
  or I/O — `perf` or async-profiler before assuming.
- Check whether `java.util.concurrent` or `java.util.concurrent.atomic` already ships the
  structure before rewriting one from scratch.
- Have a hypothesis about which variable or cache line is disputed before instrumenting.

## Validating the fix

- CAS attempts per successful operation actually fell (for striping), or the contention
  profile genuinely changed — not just that throughput rose.
- The change did not introduce false sharing between the new fields or cells. Striping cures
  CAS contention and can create a new false-sharing problem if the alignment is wrong.
- If the algorithm recycles nodes, ABA was checked rather than assumed away. "It is Java, so
  it is fine" is only true when no object pool is involved.
