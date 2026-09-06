# Attributing time to safepoint

## Common causes to distinguish

For a confirmed C2 counted loop with strip mining active, the first rows are useful models.
They are not a complete TTSP taxonomy: OS descheduling/throttling, page faults, runtime stubs,
native transitions and other no-poll regions can delay acknowledgement too.

| Cause                                                                                         | Evidence that discriminates it                                                                                        | Fix                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Loop body expensive enough that one strip takes real time                                     | TTSP ≈ `LoopStripMiningIter` × per-iteration cost. Test arithmetic against compiled polls and aligned thread evidence | Consider per-strip work or a measured strip-size experiment      |
| Loop not recognised as counted by C2 (complex control flow, bound depending on mutable state) | Compiled loop evidence lacks strip mining; a mismatched estimate alone is insufficient                                | Preserve semantics; inspect compiled code before restructuring   |
| Native/runtime path outside the loop-poll model                                               | timeout identifies a non-arrived thread; aligned wall profile/dump shows the native/runtime stack                     | Shorten/batch work or fix host scheduling after proving the path |

Arithmetic is a falsifiable hypothesis, not sufficient attribution. If compiled-code evidence
shows 1000 iterations between polls and each iteration takes 2.9 ms without intervening polls,
the strip can take about 2.9 s. A 20-iteration strip predicts about 58 ms under the same
assumptions. These are illustrative calculations, not measured endpoint improvements or
unconditional TTSP bounds: OS stalls and other paths can exceed them.

```java
for (long i = 0; i < reportData.size(); i++) {
    aggregator.process(reportData.get(i));
}
```

This partial source snippet proves neither a C2 counted loop nor active strip mining.
`process` may mutate the collection, call non-inlined code, block or poll; a `long` induction
variable and virtual `size()` call do not establish the optimized loop shape. Inspect the
compiled code/loop transformations on the target build and the delayed thread's actual path.
Do not hoist a mutable bound or restructure concurrent iteration without preserving semantics.

## The flag, both ways round

```bash
java <same target flags> -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version | grep -E "UseCountedLoopSafepoints|LoopStripMiningIter|GuaranteedSafepointInterval"
```

Run this against the target runtime before prescribing **or** removing anything. Two symmetric
failures:

- **Prescribing `-XX:+UseCountedLoopSafepoints`** as a TTSP fix without reading ergonomics.
  On the verified JDK 25.0.3 build it is true for G1/ZGC/Shenandoah and false for
  Parallel/Serial; collector and build matter.
- **A forgotten `-XX:-UseCountedLoopSafepoints`** in a production config, added months earlier
  after an isolated benchmark suggested a small throughput gain. It disables strip mining
  for eligible compiled counted loops; remaining polls depend on calls, returns and surrounding
  control flow. A verified poll-free pass lasting ~800 ms could delay synchronization on
  that scale. Do not convert that
  into “40% in safepoints” from a `jstack` cadence; trigger timing and overlap must be measured.

The second case is only visible by reading the effective value out of the running process. The
throughput gain that justified the flag was never revalidated against its production cost;
the trade-off had been decided by measuring one side of it.

## The `LoopStripMiningIter` trade-off

Reducing the strip can lower the loop's TTSP ceiling and raises the poll rate. It may affect
optimisation/vectorisation and throughput; the magnitude is workload/build-specific. Prefer a
local code/work partition fix where possible, and compare both latency and throughput if a
global compiler flag is evaluated.

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

Here a sampling-safe poll/handshake is not necessarily a global stop-the-world safepoint.
Do not interpret a profiling request as an entry in the global safepoint log.

Two consequences for attribution:

- Sample-request-to-poll delay is a separate diagnostic, which
  `jdk.SafepointLatency` exposes, per sampled thread. Delay is not itself a quantitative
  attribution-bias score. A consistently high delay on one thread
  suggests delayed sample processing, possibly due to sparse polls, native/intrinsic paths or
  descheduling. It does not prove one compiler flag caused it. Correlate by thread and time window,
  never by `safepointId`.
- Comparing a flamegraph across JEP 518 changes sampling/reconstruction mechanics as well as
  potentially the compiled workload. Residual attribution bias (for example intrinsic frames),
  dropped samples and delay need separate checks; improved safety does not establish equal
  sample populations or identical locations.

### JEP 509 is a different axis

JEP 509 uses Linux CPU-time triggering. The ordinary JFR execution sampler uses a real-time
cadence but selects running threads; it is not an all-thread wall-clock wait profile. The
JEP 509 mechanism improves CPU-time weighting, including native execution. Compare the
actual event populations and weights, not just the trigger clock's name.

"I enabled JEP 518 to reduce safepoint bias" is not a coherent statement: it is the default
method-sampler behaviour on JDK 25, with nothing to enable. JEP 509 is the one that requires
explicit, experimental opt-in.

## What cannot be the answer on this baseline

`RevokeBias` will not appear in any log, and `-XX:-UseBiasedLocking` has nothing to disable:
biased locking was disabled by default in JDK 15 (JEP 374) and its code removed in JDK 18
(JDK-8256425). Attributing a pause to biased-locking revocation is attributing it to a
mechanism that no longer exists.

Virtual-thread pinning has version-specific causes (including monitor behavior before JDK 24).
Treating it as biased
locking is a category error: the two are unrelated mechanisms, and no flag connects them.
