# Proving false sharing and fixing it

## Hardware counters

```bash
perf stat -e cache-misses,cache-references,L1-dcache-load-misses,\
LLC-load-misses,node-load-misses \
    java -jar app.jar
```

The signal is `cache-misses` and `LLC-load-misses` disproportionately high relative to the
volume of data the code actually touches — few bytes per logical operation, many misses per
physical operation.

## Two flame graphs over the same interval

```bash
./profiler.sh -e cpu -d 30 -f cpu.html <pid>
./profiler.sh -e L1-dcache-load-misses -d 30 -f l1miss.html <pid>
```

Frames prominent in the L1-miss profile but modest in the CPU profile are strong
candidates: the time is not spent computing, it is spent waiting for the line to arrive.

## Confirming the layout with JOL

JOL is the reference tool for inspecting real field layout and header size, including the
effect of `@Contended` and of Compact Object Headers. It is maintained by **Aleksey
Shipilëv** at [github.com/openjdk/jol](https://github.com/openjdk/jol) under the OpenJDK
project (not by Nitsan Wakart — a common misattribution).

```java
// org.openjdk.jol:jol-core — check Maven Central for the current version;
// the API used below has been stable since the early 0.x releases.
import org.openjdk.jol.info.ClassLayout;

System.out.println(ClassLayout.parseInstance(new PaddedCounter()).toPrintable());
```

Run under `--add-exports` plus `-XX:-RestrictContended`, the output shows the padding bytes
inserted around the annotated field explicitly — the direct way to confirm the annotation
is taking effect, rather than trusting a throughput delta. Run with
`-XX:+UseCompactObjectHeaders`, the same command shows the 8-byte header and the
corresponding shift of the first field.

## What JFR can and cannot do here

JFR has no false-sharing event. Do not confuse it with monitor-contention events such as
`jdk.JavaMonitorEnter` — false sharing passes through no monitor at all. The indirect
signal is `jdk.ExecutionSample` showing CPU time in methods doing trivial arithmetic,
correlated with the hardware counters above. Treat JFR here as a tool for temporal
correlation — _when_ the pattern appeared — not for detection.

## Mitigation decision matrix

| Strategy                                      | When to use                                                                                                                   | Cost                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `@Contended`                                  | Few hot fields, high concurrent write frequency, and you control the deploy flags (`--add-exports`, `-XX:-RestrictContended`) | +128 bytes per annotated field (padding before and after)            |
| Manual padding fields                         | Environments where module flags cannot be added; portability to JVMs that do not implement `@Contended`                       | Fragile — see the field-layout discussion; requires JOL confirmation |
| Array with stride                             | Per-thread or per-shard counters in an indexable collection                                                                   | +7× memory per useful slot (stride of 8 longs to protect 1)          |
| Thread-local accumulation with periodic flush | Very high frequency counters where even `LongAdder`'s `sum()` overhead does not pay                                           | Temporal precision lost — the global value lags until the flush      |
| `LongAdder` / `LongAccumulator`               | Aggregate counter under high contention where the exact value is read only occasionally                                       | `sum()` is O(number of cells); unsuitable for a hot-path read        |

## Stride

```java
class StridedCounters {
    // 8 longs per entry = 64 bytes = one whole cache line per logical counter.
    private final long[] data = new long[N_THREADS * 8];

    void increment(int threadId) { data[threadId * 8]++; }

    long total() {
        long sum = 0;
        for (int i = 0; i < N_THREADS; i++) sum += data[i * 8];
        return sum;
    }
}
```

## Thread-local accumulation

```java
class ThreadLocalCounter {
    private long localCount = 0;
    private final LongAdder global;
    private static final int FLUSH_THRESHOLD = 1000;

    void increment() {
        if (++localCount >= FLUSH_THRESHOLD) {
            global.add(localCount);
            localCount = 0;
        }
    }
}
```

## Adjacent objects

```java
Metrics m1 = new Metrics(); // thread 0 writes here
Metrics m2 = new Metrics(); // thread 1 writes here
// Allocated in sequence in the same TLAB, m1 and m2 can land on the same
// cache line or on neighbouring ones when each object is small.
```

Prefer grouping per-thread data into a single object with explicit internal padding over
spreading individual objects that depend on an allocation accident not to collide. With
Compact Object Headers enabled the risk rises slightly for small objects, since more of
them fit per line.

## Triage checklist

- [ ] Does throughput really worsen, or scale sub-linearly, as threads are added — with
      high CPU and no obvious I/O wait?
- [ ] Is there any logically shared variable between the threads (lock, `Atomic*`,
      collection)? If so, rule out real data contention before suspecting false sharing.
- [ ] Are there `volatile` or atomic fields written at high frequency by different threads
      and physically close — same class, or an array without stride?

## Observation checklist

- [ ] `perf stat` run with `cache-misses` and `LLC-load-misses`; are the numbers
      disproportionate to the data volume touched?
- [ ] `cpu` flame graph compared against an `L1-dcache-load-misses` flame graph over the
      same interval; do the hot frames diverge?

## Measurement checklist

- [ ] The benchmark uses JMH — not a manual `Thread[]` with `System.nanoTime()` — with
      `@Warmup`, `@Measurement`, `@Fork`, and real contending threads via
      `@Group`/`@GroupThreads` or `@Threads` as the design requires.
- [ ] If the candidate fix uses `@Contended`, does the fork include `--add-exports` **and**
      `-XX:-RestrictContended`? Confirmed via JOL that the padding was actually inserted?
- [ ] Results compared across three or more forks, not a single run.

## Validation checklist

- [ ] Is the throughput gain the order of magnitude that eliminating an RFO round trip
      predicts — and not a disproportionately "magical" improvement, which signals another
      variable changed at the same time?
- [ ] Has the additional memory footprint from padding been weighed against the service's
      memory budget?
- [ ] Was the fix tested at the real production thread count, not merely at the development
      machine's core count?
