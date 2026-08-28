# Attributing the tail to a cause

## Taxonomy by duration

The duration of the excursion narrows the candidate set before any tool is opened.

| Band            | Candidate causes                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| µs to ms        | Safepoint stop-the-world pause; TTSP; OS scheduling jitter; L3 miss / NUMA remote access; lock contention               |
| ms to ~100 ms   | Full GC pause; JIT compilation burst; disk I/O (log flush, config read); database contention — pool exhausted, row lock |
| 100 ms and over | OOM pressure and continuous GC churn; TCP retransmission (200 ms–1 s); container CPU throttling; noisy neighbour        |

A stop-the-world GC pause is a special case for tail purposes: it blocks every thread, so
one event delays thousands of in-flight requests by the same interval simultaneously. That
is why a modest pause count can dominate p99.9 while leaving p50 untouched.

## Confirming the cause with JFR

```bash
# Aggregated GC pause per cycle — the field that matters is sumOfPauses
jfr print --events jdk.GarbageCollection recording.jfr

# jdk.GarbageCollection {
#   gcId = 42
#   name = "G1 Evacuation Pause"
#   sumOfPauses = 45.2 ms      <- all STW phases of this cycle, already summed
#   longestPause = 45.2 ms
# }

# Time-to-safepoint: the wait for every thread to reach a safe point
jfr print --events jdk.SafepointStateSynchronization,jdk.SafepointBegin,jdk.SafepointEnd,jdk.SafepointCleanup recording.jfr
```

Different collectors report several pause phases inside one cycle; `sumOfPauses` already
aggregates them, so summing `longestPause` across events understates the impact.

`jdk.GCPauseL3` and `jdk.SafepointWait` are not real JFR events — they appear in circulated
material but exist in no HotSpot version. A procedure that names them has never been run.

## Correlating a spike with an event

Attribution needs both series on the same clock. Emit the latency distribution as a custom
JFR event on a fixed window so the timestamps line up with the JVM's own events:

```java
@Name("app.LatencyDistribution")
@Label("Latency Distribution (1-minute window)")
@StackTrace(false)
class LatencyDistributionEvent extends Event {
    @Label("P50 (ms)")    double p50;
    @Label("P99 (ms)")    double p99;
    @Label("P99.9 (ms)")  double p999;
    @Label("P99.99 (ms)") double p9999;
    @Label("Max (ms)")    double max;
    @Label("Sample Count") long count;
}
```

Commit one per window from the recording histogram, then reset it. Overlaying
`app.LatencyDistribution` on `jdk.GarbageCollection` and the safepoint events is what turns
"p99 spiked at 14:32" into a named cause.

## Mitigation and validation metric per cause

| Identified cause        | Primary mitigation                                               | Metric that validates it                                               |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GC pause                | ZGC or Shenandoah; reduce `-Xmx`                                 | `jdk.GarbageCollection` `sumOfPauses`, plus p99                        |
| High TTSP               | Remove safepoint bias; avoid long loops without a safepoint poll | `jdk.SafepointStateSynchronization` (with Begin/End/Cleanup), plus p99 |
| CPU throttling (K8s)    | Raise `cpu.limits`                                               | `container_cpu_cfs_throttled_seconds_total`                            |
| Lock contention         | Sharding; striped locks; lock-free structures                    | async-profiler lock mode                                               |
| JIT warmup / cold start | CDS/AppCDS; readiness probe gated on a synthetic warmup          | p99 over the first minutes after deploy                                |
| Noisy neighbour         | CPU pinning; dedicated nodes                                     | `perf stat -e sched:sched_switch`                                      |

## Cold start, precisely

Bytecode starts in the interpreter, which is substantially slower than compiled code — the
ratio depends on the method, the JDK and the hardware, and no single figure is worth
quoting. Measure it for your own hot path with `-XX:TieredStopAtLevel=0` against the
default, rather than carrying a number from a blog post. Methods crossing an invocation
threshold are compiled by C1 (fast, moderate optimisation); those that stay hot are
recompiled in the background by C2 (slower, aggressive). The fraction of interpreted code is
high in the first seconds and falls over the following minutes.

So the post-deploy tail is missing compiled code for this process's hot paths — a
transient, self-resolving state — and not "the JIT is off". The distinction matters because
the two diagnoses lead to different actions: one waits or warms up, the other sends you
hunting for a flag that was never set.

## Before-you-investigate checklist

- The SLO is stated at two percentiles at least, not at a mean or p50.
- With fan-out, the per-service SLO was derived from the user-facing SLO, not the reverse.
- Percentile instrumentation runs in production, not only in the load test.
- No outlier was silently discarded upstream of the analysis.
- The load generator that produced the number is free of coordinated omission.
- Cold start has been confirmed or excluded before any more exotic hypothesis.
