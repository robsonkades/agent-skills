# Advanced configuration recipes

The values below are experiment shapes, not mandatory counts. Derive durations and replications
from pilot behavior, between-fork variance, minimum practical effect, and available budget.

## Shared data structure

```java
@State(Scope.Benchmark)
public class SharedMapBench {
    private ConcurrentMap<Integer, Integer> map;

    @Param({"1024", "1048576"})
    int keySpace;

    @Setup(Level.Trial)
    public void setup() {
        map = new ConcurrentHashMap<>();
        for (int i = 0; i < keySpace / 2; i++) map.put(i, i);
    }

    @Benchmark
    public Integer read(ThreadState thread) {
        return map.get(thread.nextKey(keySpace));
    }
}

@State(Scope.Thread)
public class ThreadState {
    private SplittableRandom random;

    @Setup(Level.Trial)
    public void setup() {
        random = new SplittableRandom(/* predeclared cohort seed */);
    }

    int nextKey(int bound) {
        return random.nextInt(bound);
    }
}
```

This shape still needs hit/miss distribution, read/write ratio, thread sweep, CPU placement,
operation correctness, seed cohorts, and post-run invariants. Generating a random key inside the
timed operation includes PRNG cost; precompute keys if production does not pay it, then validate
cache/reuse effects.

## Asymmetric producer/consumer group

```java
@State(Scope.Group)
public class QueueState {
    ArrayBlockingQueue<Integer> queue;

    @Setup(Level.Iteration)
    public void reset() {
        queue = new ArrayBlockingQueue<>(1024);
    }

    @Benchmark
    @Group("pipeline")
    @GroupThreads(1)
    public boolean produce() {
        return queue.offer(1);
    }

    @Benchmark
    @Group("pipeline")
    @GroupThreads(3)
    public Integer consume() {
        return queue.poll();
    }
}
```

Returned success/failure contributes observability, but aggregate throughput still cannot tell how
many offers failed or polls returned null. Add `@AuxCounters` carefully or separate result labels.
Measure occupancy/drift and decide whether nonblocking `offer/poll` represents production.

## Auxiliary counter guardrails

Use counters for realized workload, not decorative diagnostics:

```text
attempts, successes, failures/retries
hits, misses
bytes/items processed
queue full/empty outcomes
invariant violations
```

Counter update must have the right ownership. A shared atomic counter can create the contention
being measured; per-thread counters may be aggregated later. Validate arithmetic such as
`success + failure = attempts` and state whether the benchmark score denominator is attempts or
successes.

## Parameter matrix budget

Before a full launch:

```text
methods: 4
parameter cells: 3 sizes * 4 thread counts * 2 distributions = 24
JDK variants: 2
forks per cell: derived from pilot
warm-up/measurement seconds per fork: measured, not only configured minimum
```

Profile only selected sentinel cells if profiling every cell is not necessary. Do not select cells
after seeing favorable outcomes without marking the analysis exploratory and independently
confirming it.

## Cold-state reset matrix

| Claimed state                | Minimum reset                                  | Evidence                                          |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| first invocation in warm JVM | invocation/fixture                             | class/JIT/cache state retained explicitly         |
| first use after class load   | fresh class loader or JVM as semantics require | class init/load events                            |
| process startup              | new fork/JVM                                   | launch timestamp and startup phases               |
| cold page/data cache         | OS/host protocol                               | cache-state evidence; operational impact reviewed |
| cold remote dependency       | dependency-specific reset                      | connection/TLS/DNS/server cache evidence          |

Avoid destructive host-cache resets on shared workers. A cold-state experiment often belongs in a
disposable isolated environment rather than a JMH fixture.

## Fork/block protocol

For baseline/candidate comparison:

1. Create immutable benchmark artifacts and record digests.
2. Define host/worker as a blocking factor.
3. Randomize order within blocks or use a justified crossover.
4. Run enough fresh forks/blocks for the practical effect and observed variance.
5. Retain per-iteration/per-fork raw results, failures, placement, and environment metrics.
6. Analyze an effect per block/fork; inspect period/order interactions.
7. Confirm a fresh run or next-layer benchmark.

Running all baseline forks before candidate can alias with temperature, cloud placement, background
work, or host aging.

## Compiler-control experiment

When inlining is the hypothesis, treat it as factorial:

```text
variant: baseline/candidate
compiler context: representative/forced-no-inline (or other targeted control)
```

Compare interactions, compilation logs, and assembly. Do not publish only the forced context as
the production result. `EXCLUDE` can leave a method interpreted; `DONT_INLINE` still allows its own
compilation. Confirm current JMH/JDK semantics and effective compiler commands.

## Troubleshooting invocation fixtures

```text
throughput unexpectedly high or pauses missing
  -> per-invocation timing/omission warning; compare iteration/trial design
scaling collapses with shared state
  -> fixture arbitration or counter synchronization; profile generated path
fixture state appears concurrently inconsistent
  -> helper overlap/ownership and lifecycle contract; add invariant checks
short operation changes dramatically
  -> timestamp floor dominates; redesign boundary/batching with semantic controls
```

## Publication checklist

- [ ] Generated benchmark source and effective command are retained.
- [ ] State graph and actor topology are diagrammed or stated precisely.
- [ ] Success denominator and auxiliary counter invariants reconcile.
- [ ] Matrix, seeds, fork/block order, failed runs, and exclusions are preserved.
- [ ] Cold/reset claims have evidence at every named layer.
- [ ] Forced compiler/environment controls have representative companion runs.
- [ ] Concurrency correctness and load/production impact are validated separately.

## Authoritative references

- [JMH samples](https://github.com/openjdk/jmh/tree/master/jmh-samples/src/main/java/org/openjdk/jmh/samples)
- [JMH asymmetric sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_15_Asymmetric.java)
- [JMH `AuxCounters` API](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/AuxCounters.html)
- [JMH annotations API](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/package-summary.html)
