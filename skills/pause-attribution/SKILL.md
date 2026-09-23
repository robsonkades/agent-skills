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

Attribute the disputed delay to the extent the evidence supports before selecting a relevant
change. Endpoint latency mixes
execution, queueing and downstream time; a JVM safepoint is only one candidate interval.
A stop-the-world GC entry times a collector-specific interval within a safepoint cycle;
concurrent GC entries have different scopes. Between the sources sit
synchronization, VM work/cleanup and whatever the host did to the
process — and each of those is a different fix with a different owner.

The failure this prevents is attributing the whole pause to the layer that happens to be
instrumented. A 45 ms GC pause and a 200 ms endpoint p99 do not establish a 155 ms residual:
the percentile and pause may describe different requests/windows. Align individual intervals
before attributing any remainder. Two common guesses — reasserting a flag that is already
the default, and tuning the pause that was logged — leave the real cause untouched.

## Workflow

Inspect the deployed JVM/vendor/build, collector, actual flags and recording configuration;
the measurements below use HotSpot 25.0.3 and do not authorize a runtime upgrade or global
diagnostic changes. Historical executed figures are prior evidence, not a fresh run on the target.
Use the steps needed for the requested claim. Reuse adequate captures and effective settings;
a parser/arithmetic review, source explanation, per-thread handoff or supported no-change
conclusion does not require new instrumentation or a remediation experiment. Missing evidence
limits the claims that depend on it, not independently supported findings.

1. **For a safepoint-cycle claim, establish the build's decomposition.** Safepoint `Total` = time to
   reach + at-safepoint interval + leaving (disarm/wake-up) on the tested JDK 25 layout. Do not call an endpoint p99 “application-
   visible STW” until aligned thread/request evidence shows process-wide loss of progress.
   Residual latency can be queueing, a per-thread stall, a downstream wait or a host effect.
2. **If cycle evidence is missing, capture the safepoint log within the diagnostic budget.**
   `-Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags`, and validate any parser
   against a small sample of the real log before trusting an aggregate report.
3. **Read the logged `Total`.** On the JDK 25 layout, `Reaching + At` omits `Leaving safepoint`;
   the checked JDK 24 layout instead includes leaving in `At`. Do not add a guessed term to
   an older `Total`. Threads do not all stop at the start of TTSP.
4. **Split the pause at the sync/operation boundary.** Large `Reaching safepoint` with small
   `At safepoint` directs investigation to synchronization and delayed threads/VM or host
   scheduling. Large `At` requires operation/cleanup evidence; host stalls can inflate it too.
5. **When JFR correlation is needed and available, cross-check `Total`** using `jdk.SafepointBegin` and
   `jdk.SafepointEnd` on `safepointId`. Agreement detects parser/window mistakes, but both
   expose the same JVM mechanism and are not independent proof of user-visible impact.
6. **For unexplained high TTSP, connect delayed threads to the waiting operation.** If existing
   evidence is insufficient, scoped `-XX:+SafepointTimeout` diagnostics can identify non-arrived
   threads by name/state, not supply their Java stacks. Use aligned stack evidence to investigate
   their paths and VM-operation evidence to name the waiting work; report any remaining gap.
7. **Classify the supported cause before proposing a flag**, using
   `references/attributing-time-to-safepoint.md`, and confirm every flag's effective value
   with `jcmd <pid> VM.flags -all`, or a matched invocation including all target flags, before prescribing or removing
   it.

Return the supported layer/mechanism, evidence boundary, smallest justified correction or
no-change result, and unresolved attribution. A source or parser check is not proof that
a production change improved latency.

## Rules

- Do not present a GC-log pause duration as endpoint impact without timestamp-aligned request
  evidence. It normally represents the GC operation term, not TTSP or arbitrary queueing.
- Capture the `Total` field directly. On JDK 25 the line carries three terms —
  `Reaching safepoint`, `At safepoint`, `Leaving safepoint` — and `Total` is exactly their
  sum (historical 25.0.3 validation reported zero mismatches over 1,169 lines). An analyser
  that sums the first two drops the third. Assess the omitted duration distribution,
  frequency and aligned request/SLO impact; frequency alone does not establish negligible cost.
- A safepoint-log parser written for one decorator set can silently match nothing against
  another. A report of "0 events found" requires checking that events actually occurred,
  rotation/loss, level/tags and parser coverage before drawing a runtime conclusion.
- High TTSP can arise from long intervals between polls, compiler/runtime no-poll regions,
  unsafe thread transitions, page faults or OS descheduling. A long native call alone is not
  evidence: HotSpot can consider a stable native-state thread safepoint-safe. Counted-loop
  strip mining is one common model, not an exhaustive catalogue; prove the delayed thread's
  state and stack/time window using `references/attributing-time-to-safepoint.md`.
- `-XX:+UseCountedLoopSafepoints` is a candidate only when the effective value and compiled
  loop show missing backedge polls. Parallel/Serial defaults were `false` (executed, 25.0.3);
  calls and other points inside a loop may still poll. Under G1, ZGC and
  Shenandoah it is already `true` with `-XX:LoopStripMiningIter=1000` on the verified 25.0.3
  build, and prescribing it changes nothing. Prefer reducing per-strip work or restructuring
  the code; a global `LoopStripMiningIter` experiment can trade optimisation/throughput for
  TTSP and requires target-build workload validation.
- The opposite error is equally real: a `-XX:-UseCountedLoopSafepoints` left in a config from
  an old throughput benchmark disables strip mining entirely. Check the effective value in the
  running process before concluding anything about TTSP.
- `RevokeBias` cannot appear in any log on this baseline and `-XX:-UseBiasedLocking` has
  nothing left to disable — biased locking was off by default in JDK 15 (JEP 374) and removed
  in JDK 18 (JDK-8256425). Virtual-thread pinning is a scheduling problem and is unrelated.
- `jdk.SafepointLatency` is not a TTSP measurement. It carries `stackTrace` and
  `threadState`, has no `safepointId` (executed, `jfr metadata`, 25.0.3), and measures the
  sample-request-to-poll latency of a sampled thread. It is not a direct measure of the
  magnitude of attribution bias, and descheduling can contribute. Never correlate it by `safepointId`.
- JEP 518 (Cooperative Sampling) is not something to activate: it is the JFR method sampler's
  default behaviour on JDK 25. JEP 509 (CPU-Time Profiling) is the experimental, Linux-only,
  opt-in one. They address different problems — where a sample may be taken versus what
  triggers it.
- `-XX:GuaranteedSafepointInterval=0` has been the default since JDK 23, and the flag is
  **diagnostic** on 25 — it needs `-XX:+UnlockDiagnosticVMOptions` or the JVM refuses to
  start (executed). On the checked 25.0.3 implementation, a nonzero value controls the
  VM-operation monitor's timed wait; `1000` alone does not force a safepoint every second.
  Gaps may be real, but absence requires validating completed-event coverage and log loss.
  Retain a nondefault setting only for an explicit continuing purpose with verified effects/costs,
  rather than treating it as a general latency fix or removing an adequate setting by habit.
- Confirm every event's field names on the build in use — `jfr metadata --events
jdk.SafepointBegin,jdk.SafepointEnd,jdk.SafepointLatency` — before depending on one. Field
  names have changed between JDK versions.

## Acceptance criteria

- Preserve the raw evidence needed for the conclusion, with clock alignment and relevant
  recording loss/rotation metadata. A narrow source/parser conclusion may leave target impact
  unmeasured without requiring every evidence stream.
- When claiming a remediation improves a component, compare the triggering workload with
  one mechanism changed at a time and verify the target term plus throughput, CPU and
  correctness constraints. An adequate existing result can support no change.
- Treat `SafepointTimeout` as escalation instrumentation: its threshold and logging overhead
  must be scoped to a diagnostic window, and thread identity/state still needs time-aligned
  stacks from a sampler or dump.

## References

- [Correlating the evidence](references/correlating-the-evidence.md) — the safepoint log
  format and its fields, the real JFR safepoint events with their scopes, the `safepointId`
  cross-check that reconstructs `Total` from JFR, and the parser pitfalls. Read when setting up
  the instrumentation or when two sources disagree about the same pause.
- [Layer decision table](references/layer-decision-table.md) — symptom and evidence to
  layer: GC operation, non-GC VM operation (named from the 25.0.3 binary), TTSP, JIT
  deoptimisation, class loading, concurrent-collector stalls, monitors, virtual-thread
  pinning and host, each with the artefact that proves it and the skill that owns the fix.
  Read once `Total` is trusted and the pause must be handed to an owner, or when the
  safepoint log is clean and the latency is still there.
- [Attributing time to safepoint](references/attributing-time-to-safepoint.md) — common causes
  of high TTSP and arithmetic used as a falsifiable loop hypothesis, the
  `LoopStripMiningIter` trade-off, and the sampling-mechanism comparison for when the profiler
  itself is suspect. Read when `Reaching safepoint` dominates `Total`, or when a profiler's
  hot path is in doubt.

Authoritative sources for version-sensitive claims:

- [JEP 518: JFR Cooperative Sampling](https://openjdk.org/jeps/518)
- [JEP 509: JFR CPU-Time Profiling (Experimental)](https://openjdk.org/jeps/509)
- [JEP 374: Disable and Deprecate Biased Locking](https://openjdk.org/jeps/374)
- [JDK unified logging documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#enable-logging-with-the-jvm-unified-logging-framework)
