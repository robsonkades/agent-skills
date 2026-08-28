# Attributing time to safepoint

## The three real causes

High `Reaching safepoint` on a counted loop has three causes on this baseline. "The poll was
removed" is not among them — loop strip mining moved the poll to the back edge of the outer
loop, once per strip.

| Cause                                                                                         | Evidence that discriminates it                                                                                       | Fix                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Loop body expensive enough that one strip takes real time                                     | TTSP ≈ `LoopStripMiningIter` × per-iteration cost. Do the arithmetic; if it lands on the observed number, this is it | Reduce `-XX:LoopStripMiningIter`               |
| Loop not recognised as counted by C2 (complex control flow, bound depending on mutable state) | The arithmetic does **not** land on the observed TTSP, and the loop's bound is not invariant in the body             | Restructure the loop so the bound is invariant |
| Not a Java loop at all — a JNI or FFM call, outside strip mining's reach                      | `-XX:+SafepointTimeout` prints a stack in native code                                                                | Batch the native work into shorter calls       |

The discriminator is arithmetic, not intuition. A body costing ~2.9 ms per call with the
default `LoopStripMiningIter=1000` gives a worst case of 1000 × 2.9 ms ≈ 2.9 s — and a log
showing `Reaching safepoint: 2912000000 ns` on a `G1CollectForAllocation` is that calculation
coming back. Reducing the strip to 20 iterations gives 20 × 2.9 ms ≈ 58 ms, the same order as
the observed improvement from a ~3 s p99 to ~60 ms.

```java
for (long i = 0; i < reportData.size(); i++) {
    aggregator.process(reportData.get(i));   // ~2.9 ms: parsing plus contention on a
                                             // synchronised aggregation map
}
```

This loop **is** counted — `reportData.size()` is invariant in the body — and strip mining
**is** active. Nothing about it is misconfigured. The strip is simply too long for a body this
expensive.

## The flag, both ways round

```bash
java -XX:+PrintFlagsFinal -version | grep -E "UseCountedLoopSafepoints|LoopStripMiningIter|GuaranteedSafepointInterval"
```

Run this against the target runtime before prescribing **or** removing anything. Two symmetric
failures:

- **Prescribing `-XX:+UseCountedLoopSafepoints`** as a TTSP fix. Default `true` since JDK 10;
  it changes nothing, is accepted silently, feels like a fix, and leaves the real cause
  undiagnosed.
- **A forgotten `-XX:-UseCountedLoopSafepoints`** in a production config, added months earlier
  after an isolated benchmark suggested a small throughput gain. It disables strip mining
  entirely, reverting counted loops to a poll only on the outer `while` back edge. A processing
  loop whose full pass takes ~800 ms then produces ~800 ms of TTSP — and with a `jstack` loop
  every 2 s on top, the application spends roughly 800/2000 = 40% of its time in safepoints.

The second case is only visible by reading the effective value out of the running process. The
throughput gain that justified the flag was never revalidated against its production cost;
the trade-off had been decided by measuring one side of it.

## The `LoopStripMiningIter` trade-off

Reducing the strip lowers the TTSP ceiling and raises the poll rate. It also gives C2 fewer
iterations per strip to vectorise. That is a real throughput cost and it is measurable — run
the workload at both values rather than assuming the cost is negligible or that it is
prohibitive.

## When the profiler itself is the suspect

Two profilers that both claim to be free of safepoint bias can still disagree about hot paths
in tight counted loops. Before treating the disagreement as a finding, establish which
mechanism each is using.

|                                            | async-profiler (`perf_events`)             | JFR with JEP 518 (JDK 25 default)                                                                                       | JFR with JEP 509 (experimental, Linux)                            |
| ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Depends on a safepoint-like stopping point | No — walks the stack in the signal handler | Yes, deliberately: PC/SP are captured immediately, but the stack is reconstructed at the target thread's next safepoint | Yes — same capture mechanics as JEP 518; only the trigger differs |
| Sample trigger                             | `SIGPROF` or `perf_event_open`             | Wall-clock timer                                                                                                        | The thread's CPU time                                             |
| Platforms                                  | Linux, limited macOS                       | Everywhere JFR runs                                                                                                     | Linux only                                                        |
| Maturity on this baseline                  | External, mature                           | Default, stable                                                                                                         | Experimental                                                      |

### What JEP 518 actually changed

Before it, the JFR method sampler suspended the target thread and walked its stack
**immediately**, at whatever code point the suspension landed on — a point that, in the JEP's
own words, is not necessarily a safepoint. The problem with that was not statistical bias: it
was safety. Walking a stack where the JVM has no guarantee of consistent frame metadata could,
and occasionally did, crash the JVM.

JEP 518 inverts the order in two phases: the asynchronous interrupt records only PC and SP,
walking nothing; the thread then runs on to its **next safepoint**, where the stack is
reconstructed from that recorded state. So JEP 518 does not remove a safepoint dependency that
already existed — it _introduces_ one, deliberately, as the price of safety.

Two consequences for attribution:

- The residual bias it leaves is the interrupt-to-poll delay, and that is exactly what
  `jdk.SafepointLatency` measures, per sampled thread. A consistently high delay on one thread
  means that thread rarely reaches a safepoint — a high `LoopStripMiningIter` with an expensive
  body, the same condition as the first cause above. Correlate it by thread and time window,
  never by `safepointId`.
- Comparing a flamegraph from a pre-JEP-518 JDK is not a comparison of sampling-location bias.
  It is a comparison of collection stability: the older mechanism carried a crash risk under
  aggressive profiling that this baseline does not.

### JEP 509 is a different axis

JEP 509 changes _when_ a sample fires — by CPU time consumed by the thread, via
`perf_event_open` — rather than _how_ the JFR reaches a safe point to sample. Wall-clock
triggering over-represents threads that are blocked; CPU-time triggering does not.

"I enabled JEP 518 to reduce safepoint bias" is not a coherent statement: it is the default
method-sampler behaviour on JDK 25, with nothing to enable. JEP 509 is the one that requires
explicit, experimental opt-in.

## What cannot be the answer on this baseline

`RevokeBias` will not appear in any log, and `-XX:-UseBiasedLocking` has nothing to disable:
biased locking was disabled by default in JDK 15 (JEP 374) and its code removed in JDK 18
(JDK-8256425). Attributing a pause to biased-locking revocation is attributing it to a
mechanism that no longer exists.

Virtual-thread pinning is a scheduling problem, not a locking one. Treating it as biased
locking is a category error: the two are unrelated mechanisms, and no flag connects them.
