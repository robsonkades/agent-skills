---
name: safepoints
description: >
  The HotSpot safepoint mechanism on JDK 25: thread-local polling words and where the JIT emits polls,
  loop strip mining, global safepoints versus thread-local handshakes, the VM operations
  other than GC that stop the world, time-to-safepoint versus operation time, and reading
  `-Xlog:safepoint`. Use when measured p99 or p99.9 is far worse than the GC log explains,
  when GC logs look clean but latency does not match, when a stop-the-world pause has no GC
  event behind it, when JNI critical regions or runtime/native transitions are suspected, when a
  profiler's hot path never responds to optimisation, or when someone proposes
  `-XX:+UseCountedLoopSafepoints`, `UseThreadLocalHandshakes` or blames `RevokeBias` on a
  modern JDK. Does not cover the introductory TTSP treatment or collector mechanics
  (gc-fundamentals), attributing an observed production pause across GC phase, safepoint and
  OS (pause-attribution), or host-side causes such as CPU throttling and page faults
  (linux-for-jvm).
---

# Safepoints

## Purpose

Explain a JVM safepoint interval that the GC operation line does not fully account for. Safepoint `Total` is
`sync time + operation time + cleanup`, and the GC log publishes only the middle term —
but endpoint p99 also includes queueing, blocking and dependencies. Correlation must prove
that a request gap overlaps process-wide loss of progress before calling the residual TTSP.

The second thing this prevents is a fix that changes nothing. The flags most often
prescribed for high time-to-safepoint are either already the default (accepted silently,
no behaviour change, root cause still undiagnosed) or removed from the JVM entirely.
Confirm the default in the target runtime before proposing a flag.

## Workflow

1. **Establish a candidate interval.** Align request/thread progress, GC/safepoint events and
   OS scheduling. A latency value minus summed GC durations is not a valid decomposition when
   requests overlap, queue or wait on dependencies.
2. **Enable `-Xlog:safepoint=info` with `time` and `uptime`, and inspect every safepoint** in
   the window — not just the GC ones. `Deoptimize`, thread dump, heap dump and class
   redefinition are safepoints that no GC log mentions.
3. **Split the pause.** `Reaching safepoint` is sync time (TTSP of the slowest thread);
   `At safepoint` is the operation. High operation time is not a safepoint problem — it
   is the operation, and belongs to the collector or the deoptimisation investigation.
4. **Name the slow thread** when sync time dominates:
   `-XX:+SafepointTimeout -XX:SafepointTimeoutDelay=<ms>` (default 10000) logs
   `Threads which did not reach the safepoint:` with each late thread's name and state,
   at `-Xlog:safepoint` warning level — **no stack** (executed, 25.0.3). Get the stack
   from an async-profiler wall-clock profile over the same window, or, in a test
   environment only, `-XX:+UnlockDiagnosticVMOptions -XX:+AbortVMOnSafepointTimeout`,
   whose `hs_err` carries every thread's stack.
5. **Classify the cause from aligned evidence** — delayed poll in compiled/interpreted/runtime
   code, transition/critical region, page fault, or a runnable thread not scheduled because of
   host contention/throttling. A stack sample alone is not causal proof.
6. **Verify the proposed flag is not already the default** in the target binary with
   `-XX:+PrintFlagsFinal -version` before writing it into a recommendation.
7. **Change one cause, then repeat the same measurement** with the same procedure.

## Rules

- On the tested HotSpot ports, a poll is a load of the thread's own polling word (`JavaThread::_poll_data`) followed
  by a bit test — or, at method return, a compare against the stack pointer — and a
  conditional branch to a stub. Arming a safepoint or handshake sets that word; nothing
  is page-protected and no signal is involved on x86-64 or AArch64 since JDK 16
  (JDK-8253180, JEP 376; `MacroAssembler::safepoint_poll` in `macroAssembler_x86.cpp`
  `[source-only]`). The "protected polling page plus SIGSEGV" description is the JDK ≤ 15
  mechanism. Do not assume the load is always L1-resident or assign a universal cycle cost.
- HotSpot emits polls at selected returns/back-edges and other transition points; optimization
  can move/elide candidates. Threads in JVM-recognized blocked/native-safe states need not run
  Java code to acknowledge, but state transitions and OS scheduling still affect timing.
- **Counted loops have polls only where strip mining is on.** Loop strip mining splits a
  counted loop into an outer loop advancing in strips of `-XX:LoopStripMiningIter` and an
  inner loop that runs a whole strip without a poll; the poll sits on the outer back-edge.
  This bounds that loop's algorithmic poll interval by one strip; descheduling, faults and
  other runtime regions can still make observed TTSP larger.
- `-XX:+UseCountedLoopSafepoints` is **collector-dependent, not a JDK-wide default**
  (executed, 25.0.3, `-XX:+PrintFlagsFinal` per collector): G1, ZGC and Shenandoah set it
  `true` with `LoopStripMiningIter=1000`; **Parallel and Serial leave it `false` with
  `LoopStripMiningIter=0`**. That removes counted-loop strip-mining polls; other checks around
  the compiled path may remain. Enabling it is a hypothesis with compiler/throughput
  trade-offs, not an automatic fix. Under the other three it changes no effective default.
  `-XX:LoopStripMiningIterShortLoop` (default 100, i.e. `LoopStripMiningIter/10`) is the
  trip count below which C2 skips the transformation.
- `-XX:+UseThreadLocalHandshakes` was removed in JDK 15. Passing it produces
  `Unrecognized VM option` and the JVM does not start (executed, 25.0.3).
- `RevokeBias` does not exist on a JDK 18+ runtime. Biased locking was disabled by
  default in JDK 15 (JEP 374) and the code removed in JDK 18 (JDK-8256425) — two
  different dates, routinely conflated. `RevokeBias` in a log means the log came from an
  older JVM.
- `-XX:GuaranteedSafepointInterval` changed from a 1000 ms default to `0` in JDK 23 and
  is a **diagnostic** flag on 25 — setting it without `-XX:+UnlockDiagnosticVMOptions`
  refuses to start (executed). A service migrated from an older JDK will show a
  different periodic safepoint pattern; that alone is not a regression.
- Global safepoint versus handshake: observed JDK 25 GC pauses, heap inspection and thread-dump
  (`jstack`, `jcmd Thread.print`, `ThreadMXBean.dumpAllThreads`) and JVMTI class
  operations can stop every thread. Single-thread stack sampling (`Thread.getStackTrace()`,
  the JFR sampler), per-thread deoptimisation, concurrent-collector thread-root scanning
  use handshakes in the listed implementation paths and leave unrelated threads running.
  `-Xlog:handshake=info` names each one; the table is in `references/instrumentation.md`.
- A thread executing ordinary JNI/FFM native code is normally in a safepoint-safe native
  state; it does **not** have to return before a global safepoint can proceed. The transition
  back to Java checks synchronization. JNI critical regions, VM/native transitions and
  runtime stubs have different constraints and must be identified explicitly; do not “fix”
  ordinary native batches for TTSP.
- Repeated global thread dumps can perturb production and form a biased statistical sampler.
  Use a wall/CPU sampler appropriate to the question and quantify its loss/overhead. Current
  async-profiler uses `asprof`; JFR CPU-Time Profiling (JEP 509) is experimental and
  Linux-only on the JDK 25 baseline.
- `-Xlog:safepoint` is JDK 9 unified logging (JEP 158), not a JDK 17 feature.
  `-XX:+PrintSafepointStatistics` was deprecated in JDK 11 — where it starts and warns — and is an
  `Unrecognized VM option` from 17 onward, so a runbook still carrying it fails at launch rather
  than degrading. Its output lives on as `-Xlog:safepoint+stats=debug`.
- On the tested HotSpot build, `Thread.yield()` reaches a runtime path with a safepoint check;
  this is not a Java API guarantee. `Thread.sleep(0)` and `Thread.onSpinWait()` must not be
  used as correctness mechanisms for safepoint responsiveness.

## Validation and operational constraints

- Derive timeout thresholds from the service SLO and normal TTSP distribution; overly low
  `SafepointTimeoutDelay` can flood diagnostics, while abort-on-timeout is test/canary only.
- Test long compiled loops, CPU throttling/descheduling and relevant JNI critical paths
  separately. Validate both TTSP and throughput after any code/compiler change.
- Record build, collector, compiler tier/effective flags and logging/JFR loss. None of these
  mechanics is a Java-language portability guarantee.

## References

- [Instrumentation and log fields](references/instrumentation.md) — the exact JDK 25
  `-Xlog:safepoint` line format and what each field means, what `SafepointTimeout` does
  and does not print, the JFR safepoint events with their real field names, and the
  handshake-versus-safepoint table with `-Xlog:handshake`. Read before enabling logging,
  writing an analysis over a JFR recording, or deciding whether an operation stops the
  world.
- [TTSP triage](references/ttsp-triage.md) — the triage tree from "latency exceeds the
  GC log" to a named cause, the TTSP-by-thread-state table, and the cause-to-strategy
  table with each trade-off. Read once sync time is confirmed to dominate and the cause
  is still unidentified.

Authoritative sources: [JEP 312: Thread-Local Handshakes](https://openjdk.org/jeps/312),
[JEP 376: ZGC Concurrent Thread-Stack Processing](https://openjdk.org/jeps/376),
[JEP 518: JFR Cooperative Sampling](https://openjdk.org/jeps/518), and
[JEP 158: Unified JVM Logging](https://openjdk.org/jeps/158).
