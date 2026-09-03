---
name: zgc-generational-internals
description: >
  Generational ZGC internals: coloured pointers without multi-mapping, the load and store
  barriers, the young and old cycles and their three STW phases, the remembered-set bitmap
  and its double buffering, relocation and page management, allocation stalls, and the
  generational log and JFR event names. Use when a deploy script still carries
  -XX:+ZGenerational, when jdk.ZAllocationStall events appear or allocation stalls cluster
  in traffic peaks, when a pause script greps only "Pause Mark" and reports a suspiciously
  good p99, when heap sizing was carried over unchanged from G1, when ZGC thread CPU is
  being read out of a thread dump, or when barrier overhead needs to be attributed to reads
  versus writes. Does not cover choosing between or operating the concurrent collectors
  (zgc-and-shenandoah), the introductory collector model (gc-fundamentals), or attributing
  an observed production pause across layers (pause-attribution).
---

# ZGC Generational Internals

## Purpose

Decide what a generational ZGC symptom is actually caused by — barrier cost, heap headroom,
promotion rate, or a measurement that never looked at the right phase — using the mechanism
rather than a remembered flag list. On JDK 25 there is no non-generational mode to compare
against, so the generational behaviour _is_ ZGC behaviour, and the tuning surface is small
enough that every wrong move is a wrong model of the collector.

The failure this prevents is the confident no-op: reasserting a flag that was removed or is
already the default, copying a heap multiplier from another service, or reporting a pause
percentile computed from a log grep that misses one of the three STW phases. Each of these
leaves the real problem undiagnosed while looking like a fix.

## Workflow

1. **Establish the baseline before anything else.** `-XX:+UseZGC` alone is generational on
   JDK 25. Confirm ZGC is actually selected with `jcmd <pid> VM.flags -all | grep -i UseZGC`
   — not that a mode flag is present.
2. **Read the flags off the running JVM, not from memory.** Check `ZCollectionInterval`,
   `ZAllocationSpikeTolerance` and `ZProactive` with `-XX:+PrintFlagsFinal` or
   `jcmd <pid> VM.flags -all` against the build in use; these defaults move between releases.
3. **Capture every STW phase emitted by the target build.** Log with
   `-Xlog:gc*,gc+phases=debug`; validate the parser against real young and old cycles and do
   not assume one textual phase list survives releases.
4. **Separate young and old-cycle evidence.** Frequency is workload/ergonomic, not “continuous
   versus rare.” Correlate promotion/aging, live bytes, allocation and old-cycle triggers;
   temporal overlap alone does not prove promotion pressure.
5. **Classify allocation stalls from capacity signals.** Join each stall to free/used/soft-max
   heap, live set, page/large allocation, concurrent-cycle progress, allocation rate,
   `ConcGCThreads`, CPU throttling and safepoints. Time-of-day clustering is context, not cause.
6. **Attribute barrier cost from generated code/profile evidence.** Fast paths are commonly
   inlined and may not appear as named frames. Stores execute a barrier path broadly; only
   some require remembered-set work. See `references/barriers-and-remembered-set.md`.
7. **Choose remediation by the proven bottleneck:** reduce allocation/live set, restore CPU,
   add justified hard/soft heap headroom, control bursts/backpressure, or run a scoped
   heuristic experiment. There is no safe global order of flags.

## Rules

- Never prescribe `-XX:+ZGenerational`. Removed by JEP 490 (JDK 24), and **not** silently
  ignored. On JDK 25 the JVM starts and warns; from JDK 26 it refuses to start with
  `Unrecognized VM option 'ZGenerational'`. Both executed, Temurin 25.0.4+7 and 26.0.2+7.
  An inherited occurrence is therefore an upgrade blocker, not dead configuration.
  Timeline: JEP 439 (JDK 21, opt-in) → JEP 474 (JDK 23, default) → JEP 490 (JDK 24, only mode).
- Never prescribe `-XX:+ZProactive` for allocation stalls. It is already `true` by default,
  and it addresses idleness and low allocation, not sustained allocation peaks.
- Heap sizing is conditional on measured live set, allocation distribution, relocation
  progress, large pages/objects, concurrent CPU and burst duration. No collector-independent
  live-set multiplier (1.5×, 2.5× or 4×) predicts safety; derive and validate headroom under
  steady, peak and throttled conditions.
- A pause script that greps `"Pause Mark"` reports an optimistically wrong percentile —
  `Pause Relocate Start` is a real STW pause and is commonly omitted from diagrams. Every
  such script needs a sanity assertion that aborts when the sample count is zero.
- The load-barrier fast path tests **the pointer value** with a bitmask, before any access to
  the pointed-to object. Any explanation shaped like `if (obj.color != expected)` inverts the
  dependency order that makes the mechanism safe.
- An object's generation is represented in `ZPage` metadata on the inspected JDK 25 source,
  not inferred from a simple generation color in each oop. Pointer metadata and barrier masks
  evolve; quote exact bits only from the target source/build.
- The remembered set is a **bitmap** (`ZBitMap`, `zRememberedSet.hpp`) with one bit per
  potential object-field address — not G1's byte-per-card array. Do not describe it as a
  card table.
- Legacy ZGC multi-mapping and JEP 490's removal of non-generational mode are distinct
  changes. Never infer cgroup charge from old `ps` folklore; measure RSS/PSS, heap and
  `memory.current` on the target build.
- Confirm ZGC JFR events with `jfr metadata`. JDK 25 includes the young/old/stall/page events
  plus relocation-set, statistics, thread-phase and uncommit events. There is no
  `jdk.ZGCGarbageCollection` on that build, but do not turn this list into a cross-release
  allowlist.
- `jcmd <pid> Thread.dump` is not a subcommand. Use `Thread.print` or
  `Thread.dump_to_file -format=json` — and neither measures CPU. For per-thread CPU use
  `top -H -p <pid>` or `pidstat -t -p <pid> 1`.
- Label every overhead and sizing number as an expected order of magnitude to be measured
  locally, never as a measurement already taken on this build and workload.

## Production acceptance

- Parse counts must reconcile with actual cycle IDs/generations; fail closed on unknown phase
  names, truncated/rotated logs and recording loss rather than reporting a perfect percentile.
- Exercise allocation spikes, old live-set growth, large objects, CPU quota/throttling and
  `SoftMaxHeapSize` pressure. Verify stalls, achieved throughput and cgroup headroom together.
- For any barrier/flag change, preserve correctness tests and compare CPU, allocation,
  throughput and tail latency across repeated runs on the exact JDK build.

## References

- [Cycles, logs and events](references/cycles-logs-and-events.md) — the phase sequence with
  all three STW pauses, the per-generation log format, the JFR event table and the recording
  and reading commands. Read when configuring ZGC logging, writing a pause-measurement
  script, or interpreting a generational ZGC log.
- [Barriers and the remembered set](references/barriers-and-remembered-set.md) — the load and
  store barrier fast paths, the remembered-set bitmap, its double buffering, and how to
  attribute barrier cost in a profile. Read when barrier overhead is suspected, when
  promotion rate is in question, or when documenting the mechanism internally.

Authoritative sources: [JEP 439](https://openjdk.org/jeps/439),
[JEP 474](https://openjdk.org/jeps/474), [JEP 490](https://openjdk.org/jeps/490), and the
[OpenJDK ZGC sources](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/gc/z).
