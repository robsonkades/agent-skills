---
name: continuous-profiling
description: >
  Always-on profiling in production: collection architecture and its permanent overhead
  budget, profile storage and retention, differential and time-windowed queries, business
  labels, and correlating profiles with deploys and incidents. Use when an incident is
  already over and nobody profiled it, when a regression must be attributed to a deploy,
  when "which tenant is burning the CPU" cannot be answered from an aggregate, when
  allocation profiling is enabled unconditionally in production, when two flame graphs from
  incomparable load windows are being diffed, or when someone says continuous profiling
  needs a third-party agent. Does not cover choosing and running a single profile
  (jfr-and-async-profiler), JFR event configuration (jfr-advanced), profiler engines and
  conversions (async-profiler-advanced), or reading the resulting graph
  (flame-graph-analysis).
---

# Continuous Profiling

## Purpose

Move the profiling decision from collection time to question time. A one-off profile can
only answer questions you thought to ask while the process was still misbehaving;
continuous profiling makes the incident that ended twenty minutes ago, and the deploy from
last Tuesday, still answerable. Business labels are what separate it from "one-off
profiling, left switched on": an aggregate flame graph shows what the JVM was doing, a
labelled one shows what one tenant on one endpoint was doing.

Two failure modes follow. First, treating a permanent overhead as if it were the temporary
overhead of a 60-second profile — allocation sampling at a low byte threshold, multiplied
by every instance, every day. Second, reading a difference that is an artefact of load
rather than of code, because the two compared windows were not comparable.

## Workflow

1. **Name the retroactive question.** "Which tenant caused the CPU spike at 03:10 last
   Thursday" is the class of question this exists for. If the question can be answered by
   profiling now, profile now instead.
2. **Choose the architecture deliberately.** Agent in the JVM, eBPF on the host, native
   JFR, or a commercial SaaS — the four trade footprint, kernel privilege, multi-language
   coverage and who operates the backend. See `references/architecture-choice.md`.
3. **Budget the overhead as a permanent cost** and get it approved as such. Measure it on
   your own workload; quoted percentages are lab estimates.
4. **Plan the labels before the first profiled deploy.** At minimum tenant, endpoint,
   version, region, env. Labels added later do not apply retroactively to stored profiles.
5. **Configure retention explicitly** — backend retention for Pyroscope or Parca,
   `maxsize`/`maxage` for a native JFR recording. Without it the history either grows
   unbounded or disappears before you need it.
6. **Query with comparable windows.** Same weekday and hour, or explicitly the interval
   immediately before and after a deploy under equivalent load; filter by label before
   comparing; read the sample count of every frame you quantify.
7. **Confirm against a business metric** before declaring root cause. The flame graph says
   where time went, not why latency moved.

## Rules

- Keep CPU profiling on permanently; put allocation and lock profiling behind a feature
  flag or a conservative threshold. `setProfilingAlloc("1k")` in production is the
  anti-pattern; `"512k"` is the conservative form.
- Allocation overhead scales with the inverse of the byte threshold — it is not a fixed
  cost of "being enabled". A low threshold captures a stack trace every few objects, and
  the stack capture is the expensive part.
- Budget overhead as `samples per second × cost per sample`, never as a quoted percentage.
  `cpu`/`ctimer` samples are bounded by cores × rate; `wall` samples **every thread** at
  the interval, so 2,000 threads at 10 ms is 200,000 stack walks a second — `wall` is the
  channel that breaks a budget, and `--wall 100ms` or `--filter` is how it stays inside
  one. The arithmetic per channel is in `references/architecture-choice.md`.
- A continuous JFR recording uses `settings=default`: the JDK documents `default.jfc` as
  the low-overhead configuration "for recordings that run continuously" and `profile.jfc`
  as "for short periods of time", and `jcmd help JFR.start` warns that modified defaults
  "may exceed 1%". Override single events on top of `default` instead of switching to
  `profile`.
- `jdk.ExecutionSample` samples at most **5 Java threads and 1 native thread per period**
  (`MAX_NR_OF_JAVA_SAMPLES` / `MAX_NR_OF_NATIVE_SAMPLES`, `jfrThreadSampler.cpp`,
  JDK 25). Halving the period from 20 ms to 10 ms doubles that cap; it does not make the
  sampler cover every thread. On a 200-thread service a thread is visited about every
  0.8 s at 20 ms, so a rare hot path needs a long window, not a short period.
- `jdk.CPUTimeSample` (JEP 509, JDK 25, experimental, Linux) samples per thread by
  consumed CPU time and is the JFR channel with an explicit budget: `throttle=500/s` is
  a rate cap, `throttle=10ms` a CPU-time period, and `jdk.CPUTimeSamplesLost` says when
  the cap was hit. It is disabled in both shipped `.jfc` files; enable it deliberately.
- Never state a per-frame conclusion without its sample count, and never diff two windows
  whose load differs structurally — peak weekday traffic against Sunday at 03:00 changes
  the composition of the flame graph on volume alone.
- Ship the minimum label set (tenant, endpoint, version, region, env). A method at 30% of
  total CPU may be 80% for one abusive tenant and 5% for everyone else; without labels
  that distinction does not exist in the data.
- "No budget for a third-party agent" is not a reason to have no continuous profiling.
  `jdk.jfr.consumer.RecordingStream` (JEP 349, since JDK 14) and `JFR.start` without
  `duration=` are both in the JDK.
- There is no JFR settings profile called `continuous` — only `default.jfc` and
  `profile.jfc`. What makes a recording continuous is the **absence of `duration=`**, with
  `maxsize`/`maxage` supplying retention instead.
- Call `rs.startAsync()` on a `RecordingStream`. `rs.start()` blocks the calling thread
  indefinitely.
- The Pyroscope Java SDK takes **one** CPU engine via `setProfilingEvent(EventType)`
  (default `ITIMER`). Allocation and lock are separate channels configured by a `String`
  threshold — `setProfilingAlloc("512k")`, `setProfilingLock("10ms")`. There is no
  `Config.Builder.addProfilingType(...)`; code written against it does not compile.
- `setSamplingEventOrder(List<EventType>)` has no effect unless `setSamplingDuration` is
  configured — the SDK's internal `resolve()` discards it and logs "not implemented". It
  is a silent no-op, and the feature is experimental.
- The SDK's default upload interval is `Duration.ofSeconds(10)`, not 15.
- Do not pin the `io.pyroscope:agent` version from memory; check Maven Central. Third-party
  SDK APIs move between minor releases far more often than the JVM does.
- Base container images on `eclipse-temurin:25-jdk`. The Docker Hub `openjdk` repository is
  discontinued and no longer receives updates.
- Allocation sampling comes from a HotSpot TLAB callback, not a generic JVMTI callback;
  lock profiling covers `synchronized` **and** `java.util.concurrent.locks` through
  async-profiler's own bytecode instrumentation, not `JVMTI MonitorContendedEnter` alone,
  which sees only `synchronized`.
- OpenTelemetry's profiling proposal is an **OTEP**, not a JEP. JEP numbers belong to
  OpenJDK only.

## References

- [Architecture choice](references/architecture-choice.md) — the four-architecture
  comparison, the decision tree, the per-channel overhead arithmetic with a worked
  budget, the `EventType`-to-engine mapping, and the JDK 25 sampling-machine changes
  (`jdk.ExecutionSample`'s per-period cap, `jdk.CPUTimeSample`'s throttle) that matter
  for a recording that never stops. Read before committing to a collection architecture
  or an overhead budget.
- [Setup and queries](references/setup-and-queries.md) — working Pyroscope SDK
  configuration against the real API, per-request labels in Spring Boot, a
  `RecordingStream` exporter skeleton, continuous `jcmd` recording with retention, and a
  regression alert rule. Read when implementing collection or writing a comparison query.
