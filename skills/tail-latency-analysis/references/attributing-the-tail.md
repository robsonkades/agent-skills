# Attributing the tail to a cause

## Taxonomy by duration

The duration of the excursion narrows the candidate set before any tool is opened. Bands
overlap; the table is a first filter, and the catalogue below is the test.

| Band            | Candidate causes                                                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| µs to ~1 ms     | Run-queue latency; SMT sibling and NUMA remote access; cache-line contention; uncontended safepoint sync; a single minor page fault                                                                                                |
| ~1 to ~100 ms   | Young GC pause; TTSP on one slow thread; non-GC safepoint (thread dump, deoptimisation, class redefinition); lock convoy; cgroup CPU throttle slice (up to one 100 ms period); Nagle + delayed ACK (~40 ms); disk flush; pool wait |
| 100 ms and over | Full GC and allocation stalls; TCP retransmit (Linux RTO floor 200 ms); repeated throttling across periods; swap-in and THP compaction; downstream queueing; cold start                                                            |

A stop-the-world pause is a special case for tail purposes: it blocks every thread, so one
event delays every in-flight request by the same interval simultaneously. That is why a
modest pause count can dominate p99.9 while leaving p50 untouched — and why the same tail
appears in every stage histogram of the same request at once.

## Cause catalogue: signature, discriminator, measurement, owner

Each entry is a hand-off. This skill names the signature and the measurement that confirms
it; the named skill owns the mechanism and the fix. Event thresholds quoted are the stock
`default.jfc` / `profile.jfc` values on Temurin 25.0.3 (read from the files).

- **STW GC pause.** Signature: every thread stalls for the same interval; all stage
  histograms of one request move together; the safepoint log names `G1CollectForAllocation`
  or a collector operation. Distinguish from TTSP by the split: `At safepoint` large,
  `Reaching safepoint` small. Measure: `jdk.GarbageCollection.sumOfPauses` (all STW phases
  of the cycle, already summed — `longestPause` understates), `jfr view gc-pauses`,
  `-Xlog:gc*`. Owner: `gc-log-analysis` for reading it, `jvm-gc-tuning` for the collector
  decision, `zgc-and-shenandoah` when the stall is a concurrent collector's
  `jdk.ZAllocationStall` rather than a pause.
- **Time-to-safepoint and non-GC safepoints.** Signature: p99.9 exceeds what the GC log
  accounts for; pauses with no GC event behind them; `Reaching safepoint` dominates
  `Total`. Measure: `-Xlog:safepoint` `Total` (JDK 25 prints `Reaching`, `At`, `Leaving`;
  `Total` is their exact sum), `jdk.SafepointBegin`/`SafepointEnd` joined on `safepointId`,
  `jdk.ExecuteVMOperation.operation` for the name, `jfr view safepoints` and
  `vm-operations`. `jdk.SafepointBegin` carries a 10 ms threshold in `default.jfc` (0 ms in
  `profile`); `jdk.SafepointStateSynchronization` is **disabled in both** stock profiles
  and must be enabled explicitly. There is no `jdk.SafepointCleanup` event on 25. Owner:
  `safepoints` for the mechanism, `pause-attribution` for assigning the milliseconds.
- **Deoptimisation and recompilation storms.** Signature: latency spikes correlate with
  class loading, a traffic-mix shift or a deploy; the same methods reappear as "made not
  entrant"; compiler threads busy long after warm-up. Distinguish from cold start: cold
  start decays monotonically, a deopt storm recurs. Measure: `jdk.Deoptimization`
  (enabled in both stock profiles; stack trace only in `profile`), `jfr view
deoptimizations-by-reason` and `deoptimizations-by-site`, `jfr view longest-compilations`
  (`jdk.Compilation` threshold 1000 ms default / 100 ms profile — lower it to see the
  storm). Owner: `deoptimization`; the tiered pipeline and warm-up are `jit-compilation`.
- **Cold start.** Signature: the tail is worst in the first minutes after every process
  start and decays without intervention. See the section below. Owner: `jit-compilation`
  for the warm-up criterion, `startup-cds-crac-leyden` for CDS, the JDK 24/25 AOT cache
  (JEP 483/514/515) and CRaC.
- **Lock convoy.** Signature: threads `BLOCKED` on one monitor or parked on one lock; the
  tail scales with concurrency, not with request size; CPU idle while latency climbs.
  Measure: `jdk.JavaMonitorEnter` and `jdk.ThreadPark` (threshold **20 ms** in `default`,
  10 ms in `profile` — contention below that is invisible until the threshold is lowered),
  `jfr view contention-by-site`, async-profiler `-e lock`. Owner: `lock-inflation` for the
  monitor lifecycle, `concurrency-diagnostics` for the evidence and each tool's blind spot.
- **Page faults, THP and swap.** Signature: a pause the JVM did not log; system time rises
  during the spike; RSS grew or the host is under memory pressure. Distinguish minor from
  major faults: `/proc/<pid>/stat` `minflt`/`majflt` deltas over the window, PSI
  `/proc/pressure/memory`. First-touch minor faults after a heap grows are removed by
  `-XX:+AlwaysPreTouch`; major faults are swap and are not. Owner: `linux-for-jvm`.
- **CPU throttling under a cgroup quota.** Signature: spikes with no JVM event, quantised
  at the CFS period (100 ms default); worse when GC or JIT threads run, because they
  consume the same quota; `nr_throttled` rising in `cpu.stat`. Measure:
  `jdk.ContainerCPUThrottling` (`cpuThrottledSlices`, `cpuThrottledTime`; sampled every
  30 s in both stock profiles — a burst shorter than that is averaged away), `jfr view
container-cpu-throttling`, `throttled_usec` from `cpu.stat`, the
  `container_cpu_cfs_throttled_periods_total / container_cpu_cfs_periods_total` ratio from
  cAdvisor. Owner: `container-awareness` for what the JVM derived from the quota (GC and
  compiler thread counts), `linux-for-jvm` for the cgroup side.
- **Run-queue latency and noisy neighbours.** Signature: threads `RUNNABLE` in every dump
  yet not progressing; JFR and the CPU profile show a healthy runtime; PSI
  `/proc/pressure/cpu` `some` climbs. Measure: run-queue latency histogram (`runqlat`,
  bpftrace on `sched:sched_wakeup`/`sched_switch`), `perf sched latency`. Counting
  `sched_switch` events alone measures frequency, not wait. Owner: `ebpf-for-jvm`;
  placement and pinning are `numa-and-cpu-affinity`.
- **SMT, NUMA and frequency.** Signature: one instance or one node class is consistently
  slower; the tail follows the hardware, not the traffic; a regression after a hardware or
  topology change. Measure: `numastat -p`, per-node latency split, `perf stat` for remote
  accesses, frequency from `/proc/cpuinfo` or `turbostat`. Owner: `numa-and-cpu-affinity`
  for placement, `cpu-cache-and-numa` for the data-layout side.
- **TCP retransmits and Nagle.** Signature: a bimodal tail with a mode at a fixed offset —
  ~40 ms is delayed ACK against Nagle on small writes; ≥ 200 ms is a retransmit, because
  Linux's minimum RTO is 200 ms; nothing in the JVM correlates. Measure: `ss -ti`
  `retrans:` per socket, `nstat -az TcpRetransSegs`, `jdk.SocketRead` (1 ms threshold,
  throttled to 100/s default). Owner: `tcp-tuning`.
- **Downstream and pool queueing.** Signature: the slow stage is a call, its wait time
  grows with offered load, and the callee's own p99 is fine — the queue is in front of it
  (pool acquisition, connection limit, executor hand-off). Measure: pool wait histogram,
  `jdk.ThreadPark` on the pool's lock, callee request rate versus utilisation. Owner:
  `queueing-models` for the arithmetic, `connection-pool-sizing` for the pool.

The cause that survives must explain the **duration band, the correlation across stages,
and the temporal pattern** together. A cause that explains only one of the three is a
coincidence until the other two are shown.

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

# Per-phase pause detail, when one cycle's pause needs to be split
jfr print --events jdk.GCPhasePause,jdk.GCPhasePauseLevel1 recording.jfr

# Safepoints: sync, operation and end, joined on safepointId
jfr print --events jdk.SafepointBegin,jdk.SafepointStateSynchronization,jdk.SafepointEnd,jdk.ExecuteVMOperation recording.jfr
jfr view safepoints recording.jfr
jfr view vm-operations recording.jfr
```

Different collectors report several pause phases inside one cycle; `sumOfPauses` already
aggregates them, so summing `longestPause` across events understates the impact.

Event names to check, not guess: the phase events are `jdk.GCPhasePause` and
`jdk.GCPhasePauseLevel1` to `Level4`; `jdk.GCPauseL3` does not exist. The safepoint events
on 25 are `SafepointBegin`, `SafepointStateSynchronization`, `SafepointEnd` and
`SafepointLatency` (the last is a sampler-bias measurement, not a TTSP one);
`jdk.SafepointCleanup` and `jdk.SafepointWait` do not exist. `jfr metadata --events <name>`
on the target build settles any of these in one command; a runbook that names an absent
event was never executed. `jfr-advanced` owns the event catalogue and custom `.jfc`
authoring.

## Correlating a spike with an event

Attribution needs both series on the same clock. Two custom events, for two questions:

**The shape, per window.** Commit one summary per fixed window from the recording
histogram, then reset it, so the distribution lines up with the JVM's own events:

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

**The slow requests themselves.** A per-request event with a `@Threshold` costs nothing
below the threshold and records every request above it with its thread and timestamps —
the join key against `jdk.GarbageCollection`, the safepoint events and
`jdk.JavaMonitorEnter` for the same thread:

```java
@Name("app.Request")
@Threshold("100 ms")       // only requests above the tail target are ever written
@StackTrace(false)
class RequestEvent extends Event {
    @Label("Operation") String operation;
    @Label("Stage") String stage;
}
// begin() at entry, end()/commit() at exit; below the threshold commit() discards it
```

Overlaying `app.Request` on `jdk.GarbageCollection` and the safepoint events is what turns
"p99 spiked at 14:32" into a named cause; the window summary says how much of the
distribution that cause owns. Guard the event with `isEnabled()` on a hot path.

## Mitigation and validation metric per cause

The owner of each lever is the skill named in the catalogue entry above.

| Identified cause           | Primary lever                                                                                                                                                                                            | Metric that validates it                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| STW GC pause               | Collector matched to the pause target; young-generation and pause-target derivation, not `-Xmx` — pause time scales with live data evacuated, and a smaller heap makes pauses more frequent, not shorter | `jdk.GarbageCollection.sumOfPauses` distribution, plus p99.9             |
| High TTSP                  | Mini-batch native calls; `LoopStripMiningIter` under G1/ZGC/Shenandoah; `+UseCountedLoopSafepoints` under Parallel/Serial                                                                                | `-Xlog:safepoint` `Reaching safepoint` distribution, plus p99.9          |
| Deopt / compile storm      | Stabilise the profile: remove the polymorphic site, the flag flip or the agent that retransforms                                                                                                         | `jdk.Deoptimization` rate per method, `jfr view longest-compilations`    |
| CPU throttling             | Whole-CPU requests, `limits.cpu` sized for GC + JIT threads or removed; `ActiveProcessorCount` checked                                                                                                   | `throttled_usec` delta, `jdk.ContainerCPUThrottling.cpuThrottledSlices`  |
| Lock convoy                | Shorten or partition the critical section; striped or lock-free structure                                                                                                                                | `jdk.JavaMonitorEnter` total time as a fraction of wall time             |
| Cold start                 | AOT cache / CDS; readiness gated on a warm-up criterion; balancer slow-start weighting                                                                                                                   | p99 over the first minutes after deploy, compared against steady state   |
| Run-queue latency          | Fewer runnable threads than cores; CPU pinning or dedicated nodes                                                                                                                                        | `runqlat` histogram, PSI `cpu` `some avg10`                              |
| Retransmit / Nagle         | `TCP_NODELAY` on small-write protocols; fix the loss, not the timeout                                                                                                                                    | `TcpRetransSegs` delta, the 40 ms or 200 ms mode gone from the histogram |
| Queue in front of a callee | Cap concurrency and size the pool from the arithmetic; shed or hedge only after the queue is understood                                                                                                  | Pool wait histogram, callee utilisation                                  |

Two levers are wrong often enough to name: "reduce `-Xmx`" for pause length (it changes
frequency), and "remove safepoint bias" for TTSP (safepoint bias is a profiler artefact,
not a cause of anything the application feels).

## Cold start, precisely

Bytecode starts in the interpreter, which is substantially slower than compiled code — the
ratio depends on the method, the JDK and the hardware, and no single figure is worth
quoting. Measure it for your own hot path with `-XX:TieredStopAtLevel=0` against the
default, rather than carrying a number from a blog post. Methods crossing an invocation
threshold are compiled by C1 (fast, moderate optimisation); those that stay hot are
recompiled in the background by C2 (slower, aggressive). The fraction of interpreted code is
high in the first seconds and falls over the following minutes — as a function of
invocation count, not of clock time, so a low-traffic replica warms slower than a busy one.

So the post-deploy tail is missing compiled code for this process's hot paths — a
transient, self-resolving state — and not "the JIT is off". The distinction matters because
the two diagnoses lead to different actions: one waits or warms up, the other sends you
hunting for a flag that was never set.

Three consequences for a fleet:

- A rolling deploy puts a cold replica behind the balancer at every step; with N replicas
  the fleet-level tail is degraded for N warm-up windows, not one. Gate readiness on a
  warm-up criterion, or weight new replicas in gradually (balancer slow-start), rather than
  on the port being open. `kubernetes-service-lifecycle` owns the probe arithmetic.
- Scaling out a low-traffic service makes its tail worse: each new replica takes a share
  of already-scarce invocations and warms slower.
- JDK 25's AOT cache with method profiles (JEP 515) shortens the window by starting the
  tiered pipeline from stored profiles; verify the cache is in use on the running process
  before crediting it. Owner: `startup-cds-crac-leyden`.

## Before-you-investigate checklist

- The SLO is stated at two percentiles at least, not at a mean or p50.
- With fan-out, the per-service SLO was derived from the user-facing SLO, not the reverse.
- Percentile instrumentation runs in production, not only in the load test.
- No outlier was silently discarded upstream of the analysis.
- The load generator that produced the number is free of coordinated omission.
- Cold start has been confirmed or excluded before any more exotic hypothesis.
- The event names in the runbook exist on the target JDK (`jfr metadata --events`).
