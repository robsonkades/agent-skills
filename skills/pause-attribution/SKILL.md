---
name: pause-attribution
description: >
  Attributing an observed production pause to a layer: decomposing it across
  time-to-safepoint, safepoint operation, cleanup and host effects, correlating the GC log,
  the safepoint log, JFR and OS signals by timestamp, and proving which layer owns the
  missing milliseconds. Use when application p99 far exceeds what the GC log accounts for,
  when "Reaching safepoint" is large while "At safepoint" is small, when two profilers
  disagree about hot paths, when a safepoint-log analyser reports zero events, when someone
  sums "Reaching + At" by hand, or when a fix copied from an old war story does not
  reproduce. Does not cover the safepoint mechanism itself (safepoints), configuring and
  parsing the GC log (gc-log-analysis), or host-side causes such as CPU throttling, swap and
  page faults (linux-for-jvm).
---

# Pause Attribution

## Purpose

Decide which layer owns an observed pause before anything is tuned. The application feels a
single number; the GC log publishes only one term of it. Between the two sit the time threads
took to reach the safepoint, the cleanup after the operation, and whatever the host did to the
process — and each of those is a different fix with a different owner.

The failure this prevents is attributing the whole pause to the layer that happens to be
instrumented. `Pause Young (Normal) 45ms` against a 200 ms p99 is not a GC tuning problem
until the other 155 ms have been assigned to something. Every fix applied before that
assignment is a guess, and the two most common guesses — reasserting a flag that is already
the default, and tuning the pause that was logged — leave the real cause untouched.

## Workflow

1. **Write down the decomposition before collecting anything.** Application-visible STW =
   time to reach the safepoint + operation time + cleanup. The GC log publishes only the
   operation. Anything left over after those three is a host effect, not a JVM one.
2. **Enable the safepoint log with decorators the analyser expects.**
   `-Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags`, and validate any parser
   against a small sample of the real log before trusting an aggregate report.
3. **Read `Total`, never `Reaching + At`.** The manual sum omits cleanup and understates the
   real STW event after event.
4. **Split the pause at the sync/operation boundary.** Large `Reaching safepoint` with small
   `At safepoint` is a time-to-safepoint problem — a specific thread, not the collector. The
   reverse is a collector problem and belongs to the GC skills.
5. **Cross-check `Total` against JFR** by correlating `jdk.SafepointBegin` and
   `jdk.SafepointEnd` on `safepointId`. Two independent instrumentations converging is the
   criterion for trusting the number; a large systematic divergence means one capture is
   wrong. See `references/correlating-the-evidence.md`.
6. **Name the thread and the operation together.** `-XX:+SafepointTimeout` prints the stack of
   the slow thread; `jdk.ExecuteVMOperation` says what was waiting on it. One without the
   other does not close the attribution.
7. **Classify the cause before proposing a flag**, using
   `references/attributing-time-to-safepoint.md`, and confirm every flag's effective value
   with `-XX:+PrintFlagsFinal -version` on the target runtime before prescribing or removing
   it.

## Rules

- Never present a GC-log pause duration as the pause the application experienced. It is the
  operation term only.
- Capture the `Total` field directly. Any analyser that recomputes it by summing
  `Reaching + At` is systematically optimistic, and the error compounds with safepoint
  frequency — negligible at a few safepoints per second, not negligible at thousands.
- A safepoint-log parser written for one decorator set silently matches nothing against
  another. A report of "0 events found" is a parser bug until proven otherwise; so is a
  partial one. Validate the regex against a sample first.
- High TTSP in a counted loop never means "the poll was removed". The poll moved to the back
  edge of the strip-mining outer loop. The three real causes are an expensive loop body per
  strip, a loop C2 does not recognise as counted, or JNI/FFM code outside strip mining's reach.
- Never prescribe `-XX:+UseCountedLoopSafepoints` as a fix — default `true` since JDK 10. The
  real tuning parameter is `-XX:LoopStripMiningIter` (default 1000), and reducing it trades
  vectorisation and throughput for a lower TTSP ceiling; measure the trade-off rather than
  assuming it.
- The opposite error is equally real: a `-XX:-UseCountedLoopSafepoints` left in a config from
  an old throughput benchmark disables strip mining entirely. Check the effective value in the
  running process before concluding anything about TTSP.
- `RevokeBias` cannot appear in any log on this baseline and `-XX:-UseBiasedLocking` has
  nothing left to disable — biased locking was off by default in JDK 15 (JEP 374) and removed
  in JDK 18 (JDK-8256425). Virtual-thread pinning is a scheduling problem and is unrelated.
- `jdk.SafepointLatency` is not a TTSP measurement. It carries only `threadState`, has no
  `safepointId`, and measures the interrupt-to-poll delay of one profiling sample — JEP 518's
  own instrumentation of its residual sampling bias. Never correlate it by `safepointId`.
- JEP 518 (Cooperative Sampling) is not something to activate: it is the JFR method sampler's
  default behaviour on JDK 25. JEP 509 (CPU-Time Profiling) is the experimental, Linux-only,
  opt-in one. They address different problems — where a sample may be taken versus what
  triggers it.
- `-XX:GuaranteedSafepointInterval=0` has been the default since JDK 23. Its effect on the
  safepoint log is cadence, not correctness: gaps are the real absence of safepoints. Setting
  it back to `1000` is a diagnostic-window tool, never permanent configuration.
- Confirm every event's field names on the build in use — `jfr metadata --events
jdk.SafepointBegin,jdk.SafepointEnd,jdk.SafepointLatency` — before depending on one. Field
  names have changed between JDK versions.

## References

- [Correlating the evidence](references/correlating-the-evidence.md) — the safepoint log
  format and its fields, the real JFR safepoint events with their scopes, the `safepointId`
  cross-check that reconstructs `Total` from JFR, and the parser pitfalls. Read when setting up
  the instrumentation or when two sources disagree about the same pause.
- [Attributing time to safepoint](references/attributing-time-to-safepoint.md) — the three real
  causes of high TTSP with the arithmetic that discriminates between them, the
  `LoopStripMiningIter` trade-off, and the sampling-mechanism comparison for when the profiler
  itself is suspect. Read when `Reaching safepoint` dominates `Total`, or when a profiler's
  hot path is in doubt.
