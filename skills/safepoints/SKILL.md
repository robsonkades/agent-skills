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
`Reaching + At + Leaving` on the illustrated JDK 25 build. GC pause timers have their own
boundaries and need not equal `At` exactly —
but endpoint p99 also includes queueing, blocking and dependencies. Correlation must prove
that a request gap overlaps process-wide loss of progress before calling the residual TTSP.

The second thing this prevents is a fix that changes nothing. The flags most often
prescribed for high time-to-safepoint are either already the default (accepted silently,
no behaviour change, root cause still undiagnosed) or removed from the JVM entirely.
Confirm the default in the target runtime before proposing a flag.

## Workflow

Use the steps needed for the question. A mechanism explanation or adequate existing capture
can support a narrow keep/change conclusion without new diagnostics. The executed 25.0.3
observations below are historical build-specific evidence; inspect the actual target build,
collector and options before applying them. JDK 25 GA source is identified separately.

1. **Establish a candidate interval when attributing a pause.** Align request/thread progress, GC/safepoint events and
   OS scheduling. A latency value minus summed GC durations is not a valid decomposition when
   requests overlap, queue or wait on dependencies.
2. **Inspect adequate existing safepoint evidence; collect missing coverage if needed.**
   `-Xlog:safepoint=info` with a usable clock mapping is one option. Inspect all operations in
   the relevant window, including non-GC work; exact dump, deoptimisation and class-operation
   paths determine whether a global safepoint occurs.
3. **Split the pause.** `Reaching safepoint` is elapsed synchronization time; a late required
   thread can dominate it, but coordination and scheduling also contribute.
   `At safepoint` covers VM work after synchronization; `Leaving` covers release work.
   A high `At` points to the VM operation/cleanup rather than TTSP. Correlate matching GC or
   VM-operation intervals instead of equating their timers or subtracting percentiles.
4. **Seek late-thread evidence when diagnosing dominant sync time:**
   `-XX:+SafepointTimeout -XX:SafepointTimeoutDelay=<ms>` (default 10000) logs
   `Threads which did not reach the safepoint:` with each late thread's name and state,
   at `-Xlog:safepoint` warning level — **no stack** (executed, 25.0.3). Get the stack
   from a suitable existing/aligned profile or an async-profiler wall-clock capture, or, in an isolated disposable test
   environment only, `-XX:+UnlockDiagnosticVMOptions -XX:+AbortVMOnSafepointTimeout`,
   which attempts to write an `hs_err`; fatal-error stacks can be partial or unavailable.
5. **Classify the cause from aligned evidence** — delayed poll in compiled/interpreted/runtime
   code, transition/critical region, page fault, or a runnable thread not scheduled because of
   host contention/throttling. A stack sample alone is not causal proof.
6. **Verify effective flag values before recommending a flag change.** Use target process
   evidence or a successful matching `-XX:+PrintFlagsFinal -version` invocation, preserving
   producer exit/stdout/stderr. A failed probe or missing match is not a default value.
7. **For a justified change, isolate the cause and repeat relevant measurements.** Retain an
   adequate setting/design or report the remaining evidence gap when no change is supported.

## Rules

- Poll encoding depends on compiler and site. In JDK 25 x86 sources, runtime/interpreter
  paths test the thread-local polling word; return polls compare it with a stack pointer.
  C2 loop polls also use a thread-local polling address and a memory test: the armed address
  points at a protected page and the fault transfers control to HotSpot. Thread-local polling
  did not universally remove fault-based polls. Inspect emitted code and port sources; do not
  assume L1 residency or assign a universal cycle cost (`reading-jit-assembly`).
- HotSpot emits polls at selected returns/back-edges and other transition points; optimization
  can move/elide candidates. Threads in JVM-recognized blocked/native-safe states need not run
  Java code to acknowledge, but state transitions and OS scheduling still affect timing.
- **C2 strip mining is one counted-loop polling strategy.** It splits a
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
  `LoopStripMiningIterShortLoop` was 100 for those three and 0 for Serial/Parallel on this
  build. It is a C2 short-loop heuristic; inspect effective values and generated code, not
  a portable guarantee that every counted loop has that exact poll interval.
- `-XX:+UseThreadLocalHandshakes` produces `Unrecognized VM option` on the historical
  25.0.3 run; that rejection does not establish a removal date for this spelling.
  The original flag was **`ThreadLocalHandshakes`**, without `Use` (JEP 312): it was
  deprecated in 13, ignored with a warning in 14, and expired in 15. It is not a switch
  to enable handshakes on JDK 25.
- `RevokeBias` does not exist on a JDK 18+ runtime. Biased locking was disabled by
  default in JDK 15 (JEP 374) and the code removed in JDK 18 (JDK-8256425) — two
  different dates, routinely conflated. `RevokeBias` in a log means the log came from an
  older JVM.
- `-XX:GuaranteedSafepointInterval` changed from a 1000 ms default to `0` in JDK 23 and
  is a **diagnostic** flag on 25 — setting it without `-XX:+UnlockDiagnosticVMOptions`
  refuses to start (historical 25.0.3 observation). In the checked 25.0.3 and JDK 25 GA
  VMThread implementation it controls a monitor wait; a nonzero value alone does not
  unconditionally produce periodic safepoints. Inspect actual operation producers and
  recorded coverage before attributing a cadence change or calling a migration a regression.
- Global safepoint versus handshake: observed JDK 25 stop-the-world GC phases, heap inspection and thread-dump
  (`jstack`, `jcmd Thread.print`, `ThreadMXBean.dumpAllThreads`) and JVMTI class
  operations can stop Java execution globally. Selected single-thread stack operations use
  handshakes; JFR Java sampling uses a thread-local cooperative poll path. Native sampling, deoptimisation/nmethod invalidation and
  collector root processing require their exact paths. A concurrent phase does not establish
  that every related operation avoids a global stop.
  `-Xlog:handshake=info` identifies logged HotSpot handshake operations, not every path
  above; the table is in `references/instrumentation.md`.
- `jcmd Thread.dump_to_file` is a different dump introduced with JEP 444: it avoids a global
  application pause and has different contents/consistency from `Thread.print`. Do not group
  all thread-dump commands under the same safepoint cost.
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
- The historical `Thread.yield()` responsiveness result concerns its complete runtime path,
  not a Java API guarantee or an explicit poll in `JVM_Yield`: that JDK 25 GA leaf routine
  calls `os::naked_yield()`. Inspect surrounding native-wrapper/transition checks as well.
  `Thread.yield()`, `Thread.sleep(0)` and `Thread.onSpinWait()` must not be
  used as correctness mechanisms for safepoint responsiveness.

## Validation and operational constraints

- Derive timeout thresholds from the service SLO and normal TTSP distribution; overly low
  `SafepointTimeoutDelay` can flood diagnostics, while abort-on-timeout belongs only in an
  isolated disposable test where process termination is intended.
- Test the suspected loop, scheduling or JNI mechanism when needed to establish a cause or
  change. Validate TTSP and throughput for a code/compiler performance change; a narrow
  explanation need not exercise every mechanism.
- Record build, collector, compiler tier/effective flags and logging/JFR loss. None of these
  mechanics is a Java-language portability guarantee.
- Return the supported conclusion, material evidence and limits. For interval attribution,
  include observed timing and alignment; add late-thread/cause evidence when available.
  Missing stacks limit thread/cause attribution, not independently complete timing. Missing
  events limit the corresponding claim; do not infer absent pauses from disabled/lost capture.

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
The legacy handshake flag lifecycle is in [JDK 14 argument handling](https://github.com/openjdk/jdk/blob/jdk-14-ga/src/hotspot/share/runtime/arguments.cpp).
For poll encodings, see [JDK 25 x86 C2 safepoint node](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/x86_64.ad),
[poll-word/return helpers](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/macroAssembler_x86.cpp), and
[polling page setup](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/safepointMechanism.cpp).
