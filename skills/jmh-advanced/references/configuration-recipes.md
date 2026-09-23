# Advanced configuration recipes

The values below are experiment shapes, not mandatory counts. Derive durations and replications
from pilot behavior, between-fork variance, minimum practical effect, and available budget.
Java examples use Java 17 and JMH 1.37 annotations with its annotation processor enabled.
Put public top-level classes in separate files under a named package; imports are omitted
(`org.openjdk.jmh.annotations.*`, `org.openjdk.jmh.infra.ThreadParams`, and relevant `java.util`
and `java.util.concurrent` types). A plain javac compile without generated JMH harness code
does not establish that a benchmark is runnable.

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

    @Param({"12345", "67890"})
    public long cohortSeed;

    @Setup(Level.Trial)
    public void setup(ThreadParams worker) {
        random = new SplittableRandom(cohortSeed + worker.getThreadIndex());
    }

    int nextKey(int bound) {
        return random.nextInt(bound);
    }
}
```

For the intended claim, establish hit/miss distribution, read/write ratio (including read-only),
operation correctness and relevant seed, thread, placement or invariant checks. Generating a
random key inside the timed operation includes PRNG cost; precompute keys if production does not
pay it, then validate cache/reuse effects.

This seed mapping makes each worker's input sequence reproducible for the same worker index,
cohort and call count; it does not replay interleavings or imply statistically independent
streams. Record the thread topology with the seed. Reusing an identical seed on every worker
would correlate their key sequences. The shown map is read-only after setup and half populated;
it does not measure concurrent mutation. Integer boxing/hash lookup are inside the timed path.

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

For this group, `-t 4` means one producer and three consumers sharing one queue; `-t 8`
forms two independent queues/groups. Use complete group-size multiples and inspect the emitted
thread/group summary. Increasing group count is not a same-queue contention sweep. Returned
`1` values model occupancy only; they cannot detect item loss/duplication/order bugs. Use
sequence identities and a separate correctness oracle when those are relevant.

## Auxiliary counter guardrails

Use counters for realized workload, not decorative diagnostics:

```text
attempts, successes, failures/retries
hits, misses
bytes/items processed
queue full/empty outcomes
invariant violations
```

In JMH 1.37, `@AuxCounters` is allowed only on `Scope.Thread` state. For example, add this
state as a parameter to a benchmark method; increment `attempts` and exactly one of
`successes`/`failures` for each completed attempt:

```java
@AuxCounters(AuxCounters.Type.EVENTS)
@State(Scope.Thread)
public class Outcomes {
    public long attempts;
    public long successes;
    public long failures;
}
```

JMH resets public counter fields before each iteration and reads them afterward. Numeric
getter methods are also metrics but their backing state needs explicit lifecycle management;
keep other helper fields/methods non-public to avoid accidental metrics/name collisions.
Throughput and AverageTime support these counters; verify other modes in the pinned harness.
This is an experimental JMH API, so check the pinned implementation when upgrading it.

Before deriving a fraction or rate, distinguish three boundaries in JMH 1.37:

- **Collection window.** The generated Throughput/AverageTime harness resets auxiliary fields
  before iteration synchronization and reads them after iteration teardown. Benchmark calls in
  the synchronization warmup/warmdown loops can therefore increment counters without increasing
  `measuredOps`. These loops are distinct from configured warm-up iterations: `-wi 0` does not
  establish matching windows. Do not clear counters in iteration teardown before JMH reads them.
- **Operation unit.** The primary count scales measured invocations by
  `opsPerInvocation / batchSize`. `OPERATIONS` passes the raw auxiliary count to the secondary
  rate/time result without that scaling. Matching `ops/s` labels do not establish matching
  meanings. Inspect effective options and generated code, including any getter's own scaling.
- **Aggregation.** `EVENTS` produces a `#` result with sum aggregation across collected
  observations, not a duration-, iteration-, or fork-independent rate. Retain per-iteration/fork
  counts and exposure when comparing runs. `OPERATIONS` produces a time-normalized result;
  Throughput and AverageTime have different dimensions, so a ratio of their scores is not
  automatically an event fraction.

For example, suppose each invocation processes eight items with `@OperationsPerInvocation(8)`,
batch size one, and increments an `OPERATIONS` success counter once when all eight succeed.
Even with matching windows, secondary throughput divided by primary throughput is about `1/8`
at 100% invocation success: the numerator counts successful invocations and the denominator
counts items. Fix the unit definition before interpreting this as a failure rate; the window
check is still required.

For a realized success fraction, aggregate matching `EVENTS` success and attempt counts, then
divide, explicitly labeling the counter population. Check `success + failure = attempts` at
the same update points; do not pool warm-up iterations with measurement or different group roles
unless that population is intentional. That identity can hold even when the counters include
synchronization calls: it does not prove a measurement-only fraction. If that narrower claim
matters, validate the collection boundary in the generated harness and any instrumentation
used to align it. A shared atomic counter outside AuxCounters may create contention being
measured. Calibrate counter overhead against an uninstrumented run.

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

Apply the relevant checks to the claim being published. Reuse adequate artifacts; a missing
measurement limits the claim rather than turning a design or source-contract review into a
mandatory full experiment.

- [ ] Generated benchmark source and effective command are retained.
- [ ] State graph and actor topology are diagrammed or stated precisely.
- [ ] Success denominator and auxiliary counter invariants reconcile.
- [ ] Matrix, seeds, fork/block order, failed runs, and exclusions are preserved.
- [ ] Cold/reset claims have evidence at every named layer.
- [ ] Forced compiler/environment controls have representative companion runs.
- [ ] Any concurrency-correctness or load/production-impact claims have separate supporting validation.

## Authoritative references

- [JMH samples](https://github.com/openjdk/jmh/tree/master/jmh-samples/src/main/java/org/openjdk/jmh/samples)
- [JMH asymmetric sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_15_Asymmetric.java)
- [JMH `AuxCounters` API](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/AuxCounters.html)
- [JMH 1.37 AuxCounters source](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/annotations/AuxCounters.java) — scope, lifecycle and normalization contracts.
- [JMH 1.37 benchmark generator](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/generators/core/BenchmarkGenerator.java) — synchronization loops, reset/read order and primary operation scaling.
- [JMH 1.37 state handler](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/generators/core/StateObjectHandler.java) — raw auxiliary counts, result modes and `EVENTS` sum policy.
- [JMH 1.37 scalar results](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/results/ScalarResult.java) — aggregation of event-count observations.
- [JMH annotations API](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/package-summary.html)
