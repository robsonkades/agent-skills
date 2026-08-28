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
3. **Capture all three STW phases.** Log with `-Xlog:gc*,gc+phases=debug` and make every
   pause measurement include `Pause Mark Start`, `Pause Mark End` **and** `Pause Relocate
Start`. See `references/cycles-logs-and-events.md`.
4. **Separate the young cycle from the old cycle.** Young cycles run continuously; old cycles
   are rare. A symptom that tracks old-cycle frequency is a promotion problem, not an
   allocation-rate problem.
5. **Classify an allocation stall by its temporal pattern.** Stalls spread evenly across the
   day mean the heap is undersized for the steady state; stalls clustered in peak windows
   mean bursty allocation, and the sizing factor — not the trigger heuristic — is wrong.
6. **Attribute barrier overhead to reads or writes before quoting a number.** Load-barrier
   frames appear in every sample that reads a reference; store-barrier frames only in samples
   writing old→young references. See `references/barriers-and-remembered-set.md`.
7. **Escalate an allocation stall in cost order:** raise `ZAllocationSpikeTolerance`, then
   `-Xmx` headroom, then reduce the application's allocation rate.

## Rules

- Never prescribe `-XX:+ZGenerational`. Removed by JEP 490 (JDK 24), and **not** silently
  ignored. On JDK 25 the JVM starts and warns; from JDK 26 it refuses to start with
  `Unrecognized VM option 'ZGenerational'`. Both executed, Temurin 25.0.4+7 and 26.0.2+7.
  An inherited occurrence is therefore an upgrade blocker, not dead configuration.
  Timeline: JEP 439 (JDK 21, opt-in) → JEP 474 (JDK 23, default) → JEP 490 (JDK 24, only mode).
- Never prescribe `-XX:+ZProactive` for allocation stalls. It is already `true` by default,
  and it addresses idleness and low allocation, not sustained allocation peaks.
- Heap sizing is conditional on a **measured** allocation profile, not a memorised constant:
  roughly live set × 2.5 for a steady profile, live set × 3.5–4 for documented sustained
  bursts. Measure the peak-to-mean allocation ratio before choosing. Carrying G1's
  1.5–2× rule into ZGC produces allocation stalls.
- A pause script that greps `"Pause Mark"` reports an optimistically wrong percentile —
  `Pause Relocate Start` is a real STW pause and is commonly omitted from diagrams. Every
  such script needs a sanity assertion that aborts when the sample count is zero.
- The load-barrier fast path tests **the pointer value** with a bitmask, before any access to
  the pointed-to object. Any explanation shaped like `if (obj.color != expected)` inverts the
  dependency order that makes the mechanism safe.
- An object's generation is metadata on the `ZPage`, not a bit in the pointer. Only
  mark/remap state lives in the pointer bits, because only that is tested on every read.
- The remembered set is a **bitmap** (`ZBitMap`, `zRememberedSet.hpp`) with one bit per
  potential object-field address — not G1's byte-per-card array. Do not describe it as a
  card table.
- Multi-mapping was removed with JEP 490. Inflated RSS for ZGC processes is a pre-JDK-24
  artefact; container limits sized from that observation were reacting to a mapping artefact,
  not to resident memory.
- The only valid JFR events are `jdk.ZYoungGarbageCollection`, `jdk.ZOldGarbageCollection`,
  `jdk.ZAllocationStall` and `jdk.ZPageAllocation`. There is no combined
  `jdk.ZGCGarbageCollection`.
- `jcmd <pid> Thread.dump` is not a subcommand. Use `Thread.print` or
  `Thread.dump_to_file -format=json` — and neither measures CPU. For per-thread CPU use
  `top -H -p <pid>` or `pidstat -t -p <pid> 1`.
- Label every overhead and sizing number as an expected order of magnitude to be measured
  locally, never as a measurement already taken on this build and workload.

## References

- [Cycles, logs and events](references/cycles-logs-and-events.md) — the phase sequence with
  all three STW pauses, the per-generation log format, the JFR event table and the recording
  and reading commands. Read when configuring ZGC logging, writing a pause-measurement
  script, or interpreting a generational ZGC log.
- [Barriers and the remembered set](references/barriers-and-remembered-set.md) — the load and
  store barrier fast paths, the remembered-set bitmap, its double buffering, and how to
  attribute barrier cost in a profile. Read when barrier overhead is suspected, when
  promotion rate is in question, or when documenting the mechanism internally.
