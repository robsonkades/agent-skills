---
name: safepoints
description: >
  The HotSpot safepoint mechanism on JDK 25: polling pages and where the JIT emits polls,
  loop strip mining, global safepoints versus thread-local handshakes, the VM operations
  other than GC that stop the world, time-to-safepoint versus operation time, and reading
  `-Xlog:safepoint`. Use when measured p99 or p99.9 is far worse than the GC log explains,
  when GC logs look clean but latency does not match, when a stop-the-world pause has no GC
  event behind it, when JNI or FFM code processes a batch without returning to Java, when a
  profiler's hot path never responds to optimisation, or when someone proposes
  `-XX:+UseCountedLoopSafepoints`, `UseThreadLocalHandshakes` or blames `RevokeBias` on a
  modern JDK. Does not cover the introductory TTSP treatment or collector mechanics
  (gc-fundamentals), attributing an observed production pause across GC phase, safepoint and
  OS (pause-attribution), or host-side causes such as CPU throttling and page faults
  (linux-for-jvm).
---

# Safepoints

## Purpose

Explain the stop-the-world time that the GC log does not account for. Total STW is
`sync time + operation time + cleanup`, and the GC log publishes only the middle term —
so a service can show clean GC logs, maximum pauses of 8 ms, and a real p99.9 of 45 ms,
with the missing 37 ms spent waiting for one thread to reach a safe point.

The second thing this prevents is a fix that changes nothing. The flags most often
prescribed for high time-to-safepoint are either already the default (accepted silently,
no behaviour change, root cause still undiagnosed) or removed from the JVM entirely.
Confirm the default in the target runtime before proposing a flag.

## Workflow

1. **Establish the gap.** Sum what `-Xlog:gc` reports for the incident window against the
   latency actually measured. A gap the GC log cannot explain is the entry condition for
   this skill.
2. **Enable `-Xlog:safepoint=info` with `time` and `uptime`, and sum every safepoint** in
   the window — not just the GC ones. `Deoptimize`, thread dump, heap dump and class
   redefinition are safepoints that no GC log mentions.
3. **Split the pause.** `Reaching safepoint` is sync time (TTSP of the slowest thread);
   `At safepoint` is the operation. High operation time is not a safepoint problem — it
   is the operation, and belongs to the collector or the deoptimisation investigation.
4. **Name the slow thread** when sync time dominates:
   `-XX:+SafepointTimeout -XX:SafepointTimeoutDelay=<low ms>` prints the stack of the
   thread that took too long to arrive.
5. **Classify the cause from that stack** — native code that has not returned, a loop C2
   did not recognise as counted, or a counted loop with an expensive body per strip.
   Each has a different fix and a different trade-off.
6. **Verify the proposed flag is not already the default** in the target binary with
   `-XX:+PrintFlagsFinal -version` before writing it into a recommendation.
7. **Change one cause, then repeat the same measurement** with the same procedure.

## Rules

- A poll is a read from the polling page. When a safepoint is requested the JVM protects
  that page, the read faults, and the signal handler diverts the thread. Cost when no
  safepoint is pending is one L1-resident read; the cost only appears when a safepoint is
  actually active.
- C2 emits polls at loop back-edges and at method returns. A thread that is blocked
  (sleep, wait, park, I/O) is already in a safe state and costs approximately zero.
- **Counted loops do have polls.** Loop strip mining splits a counted loop into an outer
  loop advancing in strips of `-XX:LoopStripMiningIter` (default 1000) and an inner loop
  that runs a whole strip without a poll; the poll sits on the outer back-edge. TTSP is
  bounded by one strip, not by the whole loop.
- `-XX:+UseCountedLoopSafepoints` has been default `true` since JDK 10. Prescribing it
  changes nothing and is accepted silently — the worst kind of non-fix.
  `-XX:LoopStripMiningIterShortLoop` (default 10) is the threshold below which C2 skips
  the transformation entirely.
- `-XX:+UseThreadLocalHandshakes` was removed in JDK 15. Passing it produces
  `Unrecognized VM option` and the JVM does not start.
- `RevokeBias` does not exist on a JDK 18+ runtime. Biased locking was disabled by
  default in JDK 15 (JEP 374) and the code removed in JDK 18 (JDK-8256425) — two
  different dates, routinely conflated. `RevokeBias` in a log means the log came from an
  older JVM.
- `-XX:GuaranteedSafepointInterval` changed from a 1000 ms default to `0` in JDK 23.
  A service migrated from an older JDK will show a different periodic safepoint pattern;
  that alone is not a regression.
- Global safepoint versus handshake: GC, mass deoptimisation, heap dump, thread dump
  (`jstack`, `jcmd Thread.print`) and JVMTI class redefinition stop every thread.
  Single-frame deoptimisation and single-thread stack sampling use a handshake and leave
  the other threads running.
- A thread in JNI or FFM cannot be polled and is only counted when it **returns** to
  Java. A single long native batch sets the worst-case TTSP for the whole process,
  regardless of any Java-side safepoint flag. Mini-batching trades transition overhead
  for worst-case TTSP; total native throughput is unchanged.
- Never profile production with a tool that samples at safepoints — periodic `jstack`
  included. It suffers safepoint bias (tight counted loops are under-sampled because
  their polls are grouped per strip) and each sample is itself a new safepoint. Use
  async-profiler over `perf_events`. JFR CPU-Time Profiling (JEP 509) is experimental and
  Linux-only in JDK 25.
- `-Xlog:safepoint` is JDK 9 unified logging (JEP 158), not a JDK 17 feature.
  `-XX:+PrintSafepointStatistics` was deprecated in JDK 11 — where it starts and warns — and is an
  `Unrecognized VM option` from 17 onward, so a runbook still carrying it fails at launch rather
  than degrading. Its output lives on as `-Xlog:safepoint+stats=debug`.
- `Thread.yield()` guarantees a safepoint check. `Thread.sleep(0)` is unspecified in this
  respect — do not rely on it. `Thread.onSpinWait()` is a CPU hint and is not a safepoint.

## References

- [Instrumentation and log fields](references/instrumentation.md) — the exact
  `-Xlog:safepoint` line format and what each field means, `SafepointTimeout` usage, and
  the JFR safepoint events with their real field names. Read before enabling logging or
  writing an analysis over a JFR recording.
- [TTSP triage](references/ttsp-triage.md) — the triage tree from "latency exceeds the
  GC log" to a named cause, the TTSP-by-thread-state table, and the cause-to-strategy
  table with each trade-off. Read once sync time is confirmed to dominate and the cause
  is still unidentified.
