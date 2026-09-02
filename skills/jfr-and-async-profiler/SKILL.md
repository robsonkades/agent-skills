---
name: jfr-and-async-profiler
description: >
  Choosing and running the right JVM profiler: JFR as a continuous event bus versus
  async-profiler for targeted sampling, CPU clock versus wall clock, allocation and lock
  profiles, sampling adequacy, and the container permissions each engine needs. Use when
  deciding which profile to take, when a CPU profile "shows nothing" for a latency problem,
  when JFR is not enabled in production, when a blocking event returns zero results, when
  async-profiler fails under seccomp, when a profile was taken before warm-up, or when
  jstack is being run in a loop. Does not cover reading the resulting flame graph
  (flame-graph-analysis), microbenchmarking (jmh-microbenchmarks), or the investigation
  process around it (performance-methodology). Event configuration is jfr-advanced, engine
  selection is async-profiler-advanced, and always-on collection is continuous-profiling.
---

# JFR and async-profiler

## Purpose

Get a profile that answers the question that was actually asked. The failures this
prevents are the CPU profile taken for an I/O problem — which reports "no bottleneck", the
worst possible outcome — and the empty blocking event that gets read as "no contention"
when it is really a threshold.

## Workflow

1. **Choose the clock before the tool.** CPU time answers "where am I burning cycles";
   wall clock answers "where does response time go". Applying CPU profiling to an
   I/O-bound service produces a confident false negative.
2. **Confirm the application is warm** by an observable criterion — stable throughput
   across two consecutive windows with new compilations on a plateau — not by `sleep`.
   `Compiler.queue` is a snapshot and asserts nothing about convergence.
3. **Take the profile long enough** for the frame of interest to accumulate ~100 samples.
4. **Take the allocation profile too, always.** The cost of allocating does not appear
   where it happens; it reappears later as a pause, attributed to GC threads. A CPU profile
   is structurally blind to it.
5. **Match the event to the kind of wait** before concluding anything about contention —
   see the event table in `references/choosing-a-profile.md`.
6. **Check the sample count** before believing a line. ~100 samples give ~10% relative
   error; 6 samples give 41%, however crisp the bar looks.
7. **Re-profile after the fix** under identical conditions, and compare throughput and
   percentiles — not the shape of the graph.

## Rules

- Keep JFR running continuously in production:
  `-XX:StartFlightRecording:name=continuous,maxsize=512m,maxage=4h,settings=default,disk=true`.
  The stock files state their own budget — `default.jfc` "typically less than 1 %",
  `profile.jfc` "typically around 2 %" — and `maxage` must exceed human response time,
  including overnight. Turning it on during the incident captures a system that has
  already recovered.
- "JFR is not enabled" is never a blocker on JDK 11+: no startup flag is required, and
  `jcmd <pid> JFR.start` attaches to any running JVM. Only `-XX:FlightRecorderOptions`
  (`stackdepth`, `repository`, `memorysize`) is fixed at startup.
- `disk=true` keeps the retained window as chunk files in a repository under the temp
  directory, not as a `.jfr`; it becomes a file on `JFR.dump`, and the repository is
  deleted when the JVM exits. Put `-XX:FlightRecorderOptions:repository=` on a volume;
  the capture order is `incident-evidence-capture`.
- `settings=default` is **not** suitable for method profiling — a 20 ms sampler barely
  sustains claims about a 10% frame in a minute. Use `settings=profile`.
- **Zero events is not zero contention** until the threshold is checked: 20 ms in
  `default.jfc`, 10 ms in `profile.jfc`. A thousand 3 ms waits per second are invisible.
- Never use instrumenting agents under production load. Their cost is proportional to
  **call count**, and they suppress inlining of exactly the small methods the JIT normally
  removes from the profile — the system being measured stops being the system in
  production. Sampling costs are proportional to sample rate instead.
- `jstack` in a loop is not a profiler: each invocation drives a global safepoint and stops
  every thread, and it **does not list virtual threads**. For a point-in-time dump use
  `jcmd <pid> Thread.dump_to_file -format=json`.
- There is **one** profiling session per JVM. Two parallel `asprof` invocations against the
  same PID do not collect two profiles — the second fails. Combine events in one session
  (`-e cpu --wall`) and separate them at conversion time.
- Prefer `-e ctimer` in containers over `--privileged`. The primary blocker is Docker's
  seccomp profile barring `perf_event_open`, and `ctimer` needs no privilege at all; the
  only loss is kernel stacks.
- `-javaagent:` loads a Java agent (bytecode instrumentation); `-agentpath:` loads a native
  JVMTI agent. async-profiler uses `-agentpath:`.
- `--cstack` controls native stack walking, not Java inlining. Inlined Java frames already
  appear in the profile; inlining decisions are investigated with `PrintInlining`.
- On the JDK 25 baseline, "JFR has safepoint bias" needs a qualifier: JEP 518 made sampling
  cooperative with bias correction, and JEP 509 added `jdk.CPUTimeSample` (experimental,
  Linux), which samples by CPU consumed and attributes native time to the Java caller. It
  is off in both stock files — `jdk.ExecutionSample` counts threads _running Java code_
  whether or not the OS scheduled them, so it is a CPU profile only when runnable threads
  are fewer than cores. Enable the CPU-time sampler with `jdk.CPUTimeSample#enabled=true`
  and convert with `jfrconv --cpu-time`; the settings are in `jfr-advanced`.
- When two tools disagree, the disagreement is the finding — not a reason to pick the
  convenient one.

## References

- [Choosing a profile](references/choosing-a-profile.md) — the symptom-to-profile table,
  the JFR blocking-event map, and sampling adequacy. Read at the start, before running
  anything.
- [Commands and container permissions](references/commands.md) — JFR start/dump/analyse,
  async-profiler invocations, streaming, custom events, and the container permission
  ladder. Read once you know which profile you need.
