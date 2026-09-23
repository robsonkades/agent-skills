# Attributing time to safepoint

## Common causes to distinguish

For a confirmed C2 counted loop with strip mining active, the first rows are useful models.
They are not a complete TTSP taxonomy: OS descheduling/throttling, page faults, runtime stubs,
native transitions and other no-poll regions can delay acknowledgement too.

| Cause                                                                                         | Evidence that discriminates it                                                                                        | Fix                                                                                                |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Loop body expensive enough that one strip takes real time                                     | TTSP ≈ `LoopStripMiningIter` × per-iteration cost. Test arithmetic against compiled polls and aligned thread evidence | Consider per-strip work or a measured strip-size experiment                                        |
| Loop not recognised as counted by C2 (complex control flow, bound depending on mutable state) | Compiled loop evidence lacks strip mining; a mismatched estimate alone is insufficient                                | Preserve semantics; inspect compiled code before restructuring                                     |
| Native/runtime work while the thread is not safepoint-safe                                    | Non-arrived thread identity/state and aligned stack establish an unsafe path; a native frame alone is insufficient    | Correct the proven no-poll/transition or host cause; native-call changes belong to **jni-and-ffm** |

Native execution is not automatically a synchronization blocker. In the
[checked HotSpot 25 implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/safepoint.cpp),
`safepoint_safe_with` accepts a stable `_thread_in_native` state when there is no last Java
frame or that frame is walkable. The thread need not return from that native function before
the VM can synchronize. A native frame in a profile does not establish the HotSpot thread
state: correlate the timeout's non-arrived identity/state with the stack and time window,
then distinguish unsafe VM/transition/no-poll work from OS descheduling. If the thread was
already safepoint-safe, investigate its native duration as a per-thread delay or find another
synchronization blocker; do not shorten native calls or change loop flags solely because a
native function ran for a long time.

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
# Bash fragment: run in a new diagnostic directory; files retain the complete output.
# Call with the matched java executable followed by the target JVM options, not app arguments.
capture_pause_flags() {
    if "$@" -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version \
            > flags.stdout 2> flags.stderr; then
        grep -E 'UseCountedLoopSafepoints|LoopStripMiningIter|GuaranteedSafepointInterval' flags.stdout
    else
        pause_flag_status=$?
        cat flags.stderr >&2
        return "$pause_flag_status"
    fi
}
```

Prefer existing `jcmd <pid> VM.flags -all` output from the correct running process. A successful
isolated launch establishes values for that invocation only: match the build, collector, JVM
options, relevant environment and ergonomics before transferring the conclusion. Capture the
producer's exit status before filtering; a failed JVM or no matching fields is missing evidence,
not a zero/default result. The fragment assumes Bash and an already chosen diagnostic directory;
use equivalent explicit producer-status checks on other shells. Two symmetric failures:

- **Prescribing `-XX:+UseCountedLoopSafepoints`** as a TTSP fix without reading ergonomics.
  On the verified JDK 25.0.3 build it is true for G1/ZGC/Shenandoah and false for
  Parallel/Serial; collector and build matter.
- **A forgotten `-XX:-UseCountedLoopSafepoints`** in a production config, added months earlier
  after an isolated benchmark suggested a small throughput gain. It disables strip mining
  for eligible compiled counted loops; remaining polls depend on calls, returns and surrounding
  control flow. A verified poll-free pass lasting ~800 ms could delay synchronization on
  that scale. Do not convert that
  into “40% in safepoints” from a `jstack` cadence; trigger timing and overlap must be measured.

Running-process evidence can confirm the second case; a genuinely matched launch is conditional
support, not proof about a differently configured target. The old throughput result alone does
not establish acceptable production TTSP. Retain an intentional, adequately validated setting
instead of changing a flag solely because the example describes a failure.

## The `LoopStripMiningIter` trade-off

Reducing an active strip size can lower the loop-work component between polls; it does not
bound scheduling stalls or total TTSP. It may affect optimisation/vectorisation and throughput;
the magnitude is workload/build-specific. Compare a semantics-preserving local code/work
partition change with a controlled compiler-flag experiment when either is justified, and
measure both latency and throughput for a claimed improvement.

## When the profiler itself is the suspect

Two profilers that both claim to be free of safepoint bias can still disagree about hot paths
in tight counted loops. Before treating the disagreement as a finding, establish which
mechanism each is using.

|                            | async-profiler, Linux `perf_events` CPU mode      | JFR execution sampling with JEP 518 (JDK 25)                  | JFR with JEP 509 (JDK 25)                                        |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Stack capture              | Asynchronous stack walk in signal handler         | Cooperative reconstruction for Java code; native path differs | Uses cooperative machinery; native CPU attributed to Java caller |
| Sample trigger             | Selected Linux perf event, delivered by signal    | Real-time sampling cadence selecting running threads          | Per-thread CPU-time trigger                                      |
| Platforms                  | Linux for this backend; other modes support macOS | Target JFR platform support                                   | Linux only                                                       |
| Availability/configuration | Verify tool version, backend and permissions      | Default Java sampling mechanism; enable the needed events     | Experimental event, explicit opt-in                              |

### What JEP 518 actually changed

Before it, the JFR method sampler suspended the target thread and walked its stack
**immediately**, at whatever code point the suspension landed on — not necessarily a safepoint.
JEP 518 addresses the safety of that asynchronous stack walk while limiting bias.
Walking a stack where the JVM has no guarantee of consistent frame metadata could,
and occasionally did, crash the JVM.

For sampled Java execution, JEP 518 changes the order in two phases: the sample request records PC and SP,
walking nothing; the thread then runs on to its **next safepoint**, where the stack is
reconstructed from that recorded state. That cooperative Java-stack path deliberately uses
a sampling-safe point. The JEP retains the prior sampling approach when the target is running
native code; do not describe every execution sample as a deferred Java-stack reconstruction.

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

The table's external-profiler column is scoped to the
[async-profiler 4.3 profiling modes](https://github.com/async-profiler/async-profiler/blob/v4.3/docs/ProfilingModes.md)
and [Linux perf backend](https://github.com/async-profiler/async-profiler/blob/v4.3/src/perfEvents_linux.cpp).
A signal is a delivery mechanism, not a substitute name for every sampling trigger; confirm
the actual backend before comparing populations or platforms.

## What cannot be the answer on this baseline

`RevokeBias` will not appear in any log, and `-XX:-UseBiasedLocking` has nothing to disable:
biased locking was disabled by default in JDK 15 (JEP 374) and its code removed in JDK 18
(JDK-8256425). Attributing a pause to biased-locking revocation is attributing it to a
mechanism that no longer exists.

Virtual-thread pinning has version-specific causes (including monitor behavior before JDK 24).
Treating it as biased
locking is a category error: the two are unrelated mechanisms, and no flag connects them.
