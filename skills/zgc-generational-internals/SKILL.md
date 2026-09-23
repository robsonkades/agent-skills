---
name: zgc-generational-internals
description: >
  Generational ZGC internals: coloured pointers without multi-mapping, the load and store
  barriers, the young and old cycles and their STW phases, the remembered-set bitmap
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
against, so the generational behaviour _is_ ZGC behaviour. Establish the actual implementation
and evidence before selecting a change; a collector regression remains a candidate when supported.

The failure this prevents is the confident no-op: reasserting a flag that was removed or is
already the default, copying a heap multiplier from another service, or reporting a pause
percentile computed from a log grep that misses one of the three STW phases. Each of these
leaves the real problem undiagnosed while looking like a fix.

## Workflow

Use the steps needed for the requested mechanism, parser or operational claim. Reuse adequate
source, captures and configuration; a narrow explanation or supported no-change conclusion does
not require a new logging, profiling or load campaign. Inspect the target vendor/build, OS/architecture
and effective collector support; JDK 25 HotSpot is the source baseline, not authorization to upgrade.

1. **Establish the baseline before anything else.** `-XX:+UseZGC` alone is generational on
   JDK 25. Confirm ZGC is actually selected in successful `jcmd <pid> VM.flags -all` output
   or adequate startup evidence — not merely that a mode flag is present. Preserve producer failures
   before filtering; unavailable flags are not evidence that an option is false or absent.
2. **Read the flags off the running JVM, not from memory.** Check `ZCollectionInterval`,
   `ZAllocationSpikeTolerance` and `ZProactive` with `-XX:+PrintFlagsFinal` or
   `jcmd <pid> VM.flags -all` against the build in use; these defaults move between releases.
3. **For a complete pause-population claim, capture every relevant STW phase.** Log with
   `-Xlog:gc*,gc+phases=debug`; validate the parser against real young and old cycles and do
   not assume one textual phase list survives releases.
4. **Separate young and old-cycle evidence.** Frequency is workload/ergonomic, not “continuous
   versus rare.” Correlate promotion/aging, live bytes, allocation and old-cycle triggers;
   temporal overlap alone does not prove promotion pressure.
5. **Classify allocation stalls from relevant capacity signals.** Correlate available stall intervals with free/used/soft-max
   heap, live set, page/large allocation, concurrent-cycle progress, allocation rate,
   `ConcGCThreads`, CPU throttling and safepoints. Time-of-day clustering is context, not cause.
6. **Attribute barrier cost from generated code/profile evidence.** Fast paths are commonly
   inlined and may not appear as named frames. Stores execute a barrier path broadly; only
   some require remembered-set work. See `references/barriers-and-remembered-set.md`.
7. **Choose remediation from supported constraints and hypotheses:** reduce allocation/live set, restore CPU,
   add justified hard/soft heap headroom, control bursts/backpressure, or run a scoped
   heuristic experiment. There is no safe global order of flags. An authorized bounded mitigation
   can precede complete causal attribution; state the uncertainty and verify its relevant outcomes.

## Rules

- Do not add `ZGenerational` to JDK 24+: JEP 490 made it obsolete, with a warning while
  ignoring the value. Reproduced on Temurin 25.0.3+9. Expiration subsequently makes it
  unrecognized; test the exact upgrade build rather than treating acceptance as application.
  Historical JDK 21/22 generational selection requires the version-specific flag.
  Timeline: JEP 439 (JDK 21, opt-in) → JEP 474 (JDK 23, default) → JEP 490 (JDK 24, only mode).
- Reasserting default-enabled `ZProactive` is not an allocation-stall fix. Inspect its
  effective value and cycle trigger before considering a change; proactive collection
  uses build-specific growth/time and estimated collection-cost conditions, not merely an idle-state
  test, and does not guarantee recovery from sustained peaks.
- Heap sizing is conditional on measured live set, allocation distribution, relocation
  progress, large pages/objects, concurrent CPU and burst duration. No collector-independent
  live-set multiplier (1.5×, 2.5× or 4×) predicts safety; derive and validate headroom under
  the steady, peak or throttled conditions relevant to the sizing claim.
- A pause script that greps `"Pause Mark"` reports an incomplete population —
  `Pause Relocate Start` is a real STW pause and is commonly omitted from diagrams. Every
  such script must distinguish failed/missing capture from a successful empty population. With
  adequate configuration/window evidence, report zero observed pauses and an undefined percentile;
  zero samples never establish p99=0.
  Omitting a phase can bias a percentile either way. Allocation stalls block allocating
  threads, not necessarily all application threads at a global safepoint; keep them separate.
- The load-barrier fast path checks collector metadata in **the pointer value** before any
  access to the pointed-to object. The emitted check depends on architecture/compiler/access
  kind; do not require a standalone mask instruction. Any explanation shaped like
  `if (obj.color != expected)` inverts the dependency order that makes the mechanism safe.
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
- Distinguish measured overhead/sizing evidence from estimates. Report an actual measurement
  with its build, workload and method; label unmeasured predictions as conditional.

## Validation for the intended claim

- For complete-population results, reconcile counts with actual cycle IDs/generations and verify
  phase names, complete rotated inputs and recording loss. An independently verified subset may
  still support an explicitly limited result; do not label it the whole window or a perfect percentile.
- For a sizing or stall-remediation decision, exercise relevant allocation/live-set, large-object,
  CPU quota or soft-target conditions that the evidence does not already cover. Keep tests within
  authorized operational bounds and verify stalls, achieved throughput and memory headroom together.
- For a performance claim about a barrier/flag change, preserve relevant correctness tests
  and compare the affected CPU, allocation, throughput or tail-latency outcomes across
  representative repeated runs on the exact JDK build. Flag acceptance alone proves no gain.

## References

- [Cycles, logs and events](references/cycles-logs-and-events.md) — the phase sequence with
  STW phase families, the per-generation log format, the JFR event table and the recording
  and reading commands. Read when configuring ZGC logging, writing a pause-measurement
  script, or interpreting a generational ZGC log.
- [Barriers and the remembered set](references/barriers-and-remembered-set.md) — the load and
  store barrier fast paths, the remembered-set bitmap, its double buffering, and how to
  attribute barrier cost in a profile. Read when barrier overhead is suspected, when
  promotion rate is in question, or when documenting the mechanism internally.

Authoritative sources: [JEP 439](https://openjdk.org/jeps/439),
[JEP 474](https://openjdk.org/jeps/474), [JEP 490](https://openjdk.org/jeps/490), and the
[OpenJDK 25 ZGC sources](https://github.com/openjdk/jdk/tree/jdk-25-ga/src/hotspot/share/gc/z).
