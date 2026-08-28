# Configuration recipes and variance diagnosis

## Scenario to configuration

| Scenario                                              | `BenchmarkMode`                 | `@State` scope                 | Minimum forks                                               |
| ----------------------------------------------------- | ------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| Compare two pure algorithms (no I/O, no shared state) | `AverageTime` or `Throughput`   | `Scope.Thread`                 | 5 (default)                                                 |
| Validate a data structure under real contention       | `Throughput` with `@Threads(N)` | `Scope.Benchmark`              | 5                                                           |
| Investigate tail latency against a p99 SLO            | `SampleTime`                    | mirror the real access pattern | 5, longer measurement                                       |
| Cold start or a non-repeatable operation              | `SingleShotTime`                | `Scope.Thread`                 | typically more forks, fewer iterations each                 |
| Compare JDK builds                                    | same mode on both runs          | same on both runs              | 5, same hardware, same flags except the variable under test |

## What each `Scope` simulates

- `Scope.Benchmark` — one instance shared by **all** measurement threads. Simulates real
  concurrent access to a shared structure.
- `Scope.Thread` — one instance per benchmark thread, no sharing. Simulates
  single-threaded use or per-thread partitioned data.
- `Scope.Group` — one instance per thread group, used with `@Group`/`@GroupThreads` to
  model asymmetric roles such as producers and consumers.

The wrong choice produces neither a compile error nor an obviously absurd number. It
produces a plausible number measuring the wrong scenario.

Worked case: eight threads comparing `HashMap` behind external `synchronized` against
`ConcurrentHashMap`, declared `@State(Scope.Thread)`. Each thread gets its own map, so the
`synchronized` never contends and `ConcurrentHashMap`'s coordination overhead never pays
for itself. The benchmark measures single-threaded access to each structure, multiplied by
eight independent threads — not the contention scenario that is the entire reason to
choose between them.

## Templates

```java
// Sub-microsecond precision
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 10, time = 1, timeUnit = TimeUnit.SECONDS)
@Measurement(iterations = 10, time = 1, timeUnit = TimeUnit.SECONDS)
@Fork(value = 5, jvmArgsAppend = {
    "-XX:+UseG1GC",
    "-Xms256m", "-Xmx256m",   // fixed heap: no expansion during measurement
    "-XX:+AlwaysPreTouch"     // pages pre-mapped: no page faults mid-measurement
})
@State(Scope.Benchmark)
public class PreciseBenchmark { /* ... */ }
```

```java
// Latency distribution
@BenchmarkMode(Mode.SampleTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@Warmup(iterations = 5, time = 5, timeUnit = TimeUnit.SECONDS)
@Measurement(iterations = 10, time = 10, timeUnit = TimeUnit.SECONDS)
@Fork(5)
// SampleTime reports P50, P90, P95, P99, P99.9, P99.99, P100 in the extended output
public class LatencyBenchmark { /* ... */ }
```

Fixing `-Xms` to `-Xmx` matters because heap expansion commits and zeroes memory, and that
cost lands on exactly the early warmup iterations that are supposed to be stabilising.

## `@Fork`, precisely

```java
public @interface Fork {
    int value() default -1;                // forks; -1 means use the runner default (5)
    int warmups() default -1;              // discarded warmup forks (rare)
    String jvm() default "";               // path to an alternative java binary
    String[] jvmArgs() default {};         // REPLACES the default JVM arguments
    String[] jvmArgsPrepend() default {};  // added BEFORE the defaults
    String[] jvmArgsAppend() default {};   // added AFTER the defaults
}
```

```java
@Fork(-jvmVersion = "25")                       // does not exist
@Fork(jvm = "/opt/jdk-25/bin/java")             // the real attribute
```

Each `@Benchmark` accepts one `@Fork`, so comparing two JDKs for the **same** method is
normally done by running the JAR twice with `-jvm <path>`, holding everything else
identical.

`warmups` creates whole forks that run and are discarded before the counted ones. It is
different from `@Warmup`, which is iterations inside each counted fork. The use case is
narrow — environments where the _first_ fork suffers system effects (cold disk cache,
other JVMs competing for the host) that later forks do not. Leave it at the default
otherwise; setting it only lengthens the run.

## `@Param`

```java
@State(Scope.Benchmark)
public class MyBenchmark {
    @Param({"10", "100", "1000", "10000"})
    int size;

    List<Integer> list;

    @Setup(Level.Trial)
    public void setup() {
        list = new ArrayList<>(size);
        for (int i = 0; i < size; i++) list.add(i);
    }

    @Benchmark
    public int binarySearch() {
        return Collections.binarySearch(list, size / 2);
    }
}
```

JMH runs the full cartesian product across every `@Param` field and reports one row per
combination — never an average. Two parameters of four values each under `@Fork(5)` is
twenty complete warmup-plus-measurement runs.

## `@Setup` levels

`Level.Trial` populates the fixture once per fork and holds it stable through warmup and
measurement. It is correct for any read-only fixture.

```java
@Setup(Level.Invocation)          // runs before EVERY invocation
public void setupData() { data = new byte[1024]; }   // at 1M ops/s, 1M setups per second
```

Use `Level.Iteration` when the fixture is mutated and must be renewed, and reserve
`Level.Invocation` for fixtures that genuinely cannot survive one invocation — accepting
that its cost enters the measurement.

## Constant folding

```java
@State(Scope.Benchmark)
public class FoldingProblem {
    final int x = 42;                    // constant — the compiler can fold x * x

    @Benchmark
    public int bad() { return x * x; }   // may become the literal 1764; nothing is measured

    int y;

    @Setup(Level.Trial)
    public void setup() { y = 42; }

    @Benchmark
    public int good() { return y * y; }  // non-final: the compiler cannot assume the value
}
```

## `@CompilerControl`

When a helper method is called from inside the benchmark, the JIT may inline it
differently between two compared variants, and the comparison stops being fair.

```java
@CompilerControl(CompilerControl.Mode.DONT_INLINE)
private int helperIndex() {
    return ThreadLocalRandom.current().nextInt(size);
}
```

Modes: `INLINE`, `DONT_INLINE`, `FORCE_INLINE`, `EXCLUDE` — the last keeps the method
interpreted, never JIT-compiled, which isolates interpreter cost in a specific comparison.
This is a surgical instrument. Applying it to every helper by default introduces more bias
than it removes; reach for it only on a concrete suspicion of asymmetric inlining.

## When `Error` will not settle

Work down this list before concluding the benchmark is inherently noisy.

1. **Is it actually high?** `Error` is a 99.9% confidence interval, so it is conservative
   by default. Below roughly 5% of `Score` is stable; above roughly 10% is worth
   investigating.
2. **Is `@Fork` at 1?** Then the reported `Error` understates the real noise — it cannot
   see the JIT's structural variance at all, which is the 3–10% band where most production
   regressions live.
3. **Is GC running during measurement?** Fix the heap and add `AlwaysPreTouch`.
4. **Is `@Setup` at `Level.Invocation`?** Setup cost, and its own variance, is inside the
   measurement.
5. **Do `Throughput` and inverted `AverageTime` disagree?** Throughput is a harmonic mean
   of per-operation times, `AverageTime` an arithmetic mean; by AM >= HM they diverge in
   proportion to per-operation cost variance. A bimodal operation (cache hit versus miss)
   makes them visibly differ, and neither is wrong — they answer different questions. Run
   `Mode.SampleTime` and look at the distribution before reporting a single number.
6. **Is the host quiet?** CPU governor on performance, no other processes contending for
   cores.

## Before publishing

- Same JDK, same flags except the variable under test, same hardware on both sides.
- `@Fork` at 5 or the default, or an explicit written justification for less.
- Every `@Benchmark` returns a value or consumes through `Blackhole` — no discarded result.
- The number reviewed against production behaviour under equivalent load where possible.
- Someone else reviewed the benchmark's **code**, not just its final number.
