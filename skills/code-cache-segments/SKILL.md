---
name: code-cache-segments
description: >
  The segmented code cache as three independent CodeHeaps: non-nmethods, profiled and
  non-profiled nmethods, the GC-driven unloading that replaced the sweeper in JDK 20,
  fragmentation that no aggregate metric shows, sizing each segment consistently, and
  reading jcmd Compiler.codecache and CodeHeap_Analytics. Use when CPU rises with no load
  change while an aggregate "Code Cache usage" dashboard looks healthy, when doubling
  ReservedCodeCacheSize fixed one incident and not the next, when setting
  ProfiledCodeHeapSize or NonProfiledCodeHeapSize makes the JVM refuse to start, when GC
  logs show a CodeCache GC Threshold cause, when an OutOfMemoryError says "Out of space in
  CodeCache", when a long-running service degrades with the cache reportedly not full, or
  when only one unnamed CodeHeap appears in the output. Does not cover the introductory
  code-cache exhaustion signature (jit-compilation), the code cache's share of the container
  memory budget (jvm-memory-regions), or Metaspace internals (metaspace-internals).
---

# Code Cache Segments

## Purpose

Treat the code cache as three independent allocators with three separate ceilings, because
that is what it is since JEP 197. One `CodeHeap` can sit at 99.8% while the consolidated
number reads 72%, and every tool that stops at the consolidated line reports a healthy
system. Since JDK 20 the consequence of one full heap is not "the compiler stops": the
allocator falls back to the other nmethod heap, so short-lived tier-3 code starts landing
in the heap that was reserved for long-lived C2 code, and the GC-driven unloading that
replaced the sweeper keys off the **aggregate** free ratio and does not notice. Compilation
stops only when the fallback heap is full as well.

The second failure this prevents is the reflexive "double `ReservedCodeCacheSize`". It works
when the pressured segment happens to be one of the two that split the remainder 50/50, and
wastes half the increase when it is not — or when the real cost was the GC pauses the code
cache was triggering, which a bigger cache also fixes, for a different reason.

## Workflow

1. **Read all three `CodeHeap` lines** from `jcmd <pid> Compiler.codecache`, never the
   consolidated `CodeCache:` line alone. Also read the last line: `Compilation: enabled` or
   `disabled (not enough contiguous free space left)`, with `stopped_count` and
   `restarted_count`.
2. **Confirm segmentation is actually on.** Three named heaps means yes; one unnamed heap
   means `SegmentedCodeCache` was never enabled — it switches on ergonomically only at
   `ReservedCodeCacheSize` **≥ 240 MB**, so any smaller explicit value de-segments unless
   `-XX:+SegmentedCodeCache` is also given.
3. **Read the GC log for the code cache's own causes** — `CodeCache GC Threshold` and
   `CodeCache GC Aggressive`. On JDK 20+ the code cache is a GC trigger, and under Serial or
   Parallel each trigger is a **Full GC**. See `references/unloading-and-gc.md`.
4. **Sample at three points, 30-60 seconds apart**, to tell stable exhaustion from oscillating
   thrashing. Record `jstat -compiler` — `Compiled`, `Failed`, `Invalid` — as part of the
   incident baseline.
5. **Predict the pressured segment from the tier mix** before measuring: tiers 2 and 3 go to
   `profiled`, tiers 1 and 4 and native wrappers go to `non-profiled`. Cross-reference
   `PrintCompilation` or `jdk.Compilation`, and cross-reference deoptimisation events when
   `non-profiled` is under pressure.
6. **Choose between raising the total and rebalancing** from the measured asymmetry, not from
   the symptom. Both segments high means total capacity; one pinned at 100% while the other
   climbs means the split. See `references/segments-and-sizing.md`.
7. **Check the arithmetic before applying manual segment sizes.** With `ReservedCodeCacheSize`
   also on the command line the three heaps must sum to it exactly — greater _or_ smaller is
   a refused start. Without it, the JVM grows the total to fit and the "check" never fires.
8. **Validate under the same load that caused the incident**: the pressured segment stable
   below roughly 80%, no `CodeCache GC` causes in the GC log, and `Compilation:` still
   `enabled` across a sustained window rather than at one instant.

## Rules

- Monitor per `CodeHeap`, not as a sum. Micrometer and JMX already break the series out by
  `id` (`CodeHeap 'profiled nmethods'` and the rest); the fault is a dashboard adding them
  back together.
- `profiled nmethods` holds tiers **2 and 3** only. Tier 1 — C1 without profiling — goes to
  `non-profiled` alongside tier 4 and native wrappers. A trivial method can go straight to
  `non-profiled` without ever passing through `profiled`.
- The split between `profiled` and `non-profiled` is an exact **50/50** of what remains after
  `non-nmethods`, not one third to two thirds. `non-nmethods` itself is 5 MB plus one
  compiler buffer per compiler thread, so it shrinks on a small CPU quota.
- A full heap spills into the next one — `non-nmethods → non-profiled → profiled → non-profiled`
  (`CodeCache::allocate`, `codeCache.cpp`). `CodeHeap '<name>' is full` and the JFR
  `jdk.CodeCacheFull` event fire only when the fallback failed too.
- `NonNMethodCodeHeapSize`, `ProfiledCodeHeapSize` and `NonProfiledCodeHeapSize` are ordinary
  product flags introduced by JEP 197. Material that wraps them in
  `-XX:+UnlockDiagnosticVMOptions` is out of date.
- `-XX:CodeCacheMinimumFreeSpace` does not exist. The real name is
  `-XX:CodeCacheMinimumUseSpace`, and it is `develop`-only — unavailable in production builds.
- `jstat -compiler` reports **`Failed`**, fed by the `sun.ci.totalBailouts` counter — a
  bailout, not a code cache failure. `Failed` (never compiled) and `Invalid` (compiled, then
  discarded) are different diagnoses. A rising `Failed` with a constant `FailedMethod`
  consumes interpreter CPU, not code cache — a bailout never produces an nmethod.
- Declare `-XX:+SegmentedCodeCache` explicitly whenever per-segment visibility matters. Any
  `ReservedCodeCacheSize` below 240 MB — the common container setting — silently loses it.
- There is no sweeper thread and no `zombie` state since JDK 20 (JDK-8290025). A
  `not_entrant` nmethod is unloaded by the **GC** once no frame references it, so reclaiming
  code cache costs a GC cycle, and code cache pressure schedules one.
- `-XX:+UseCodeCacheFlushing` (the default) now gates the cold-code heuristic and the
  compiler _restart_ after a full heap; with it off a full heap disables the compiler until
  restart. Keep it on in production.
- The CodeHeap never compacts, and never will. An nmethod embeds absolute addresses — call
  targets, inline caches, stub references — and threads may be executing it with the program
  counter inside. Fragmentation is the accepted cost of that design, not a pending fix.
- `jcmd Compiler.codecache` reports aggregate `free` and never the largest contiguous free
  block. `jcmd Compiler.CodeHeap_Analytics` does — run `aggregate`, then `FreeSpace`.
- Fragmentation grows with allocate/free/reallocate cycles, not with raw volume. Frequent
  deoptimisation and ClassLoader churn are the factories; a heap that only ever fills does
  not fragment.
- The `non-nmethods` heap fails differently: `java.lang.OutOfMemoryError: Out of space in
CodeCache for adapters` (or `for method handle intrinsic`) thrown in an application thread
  at class link time, not a compiler warning.
- A restart clears fragmentation and discards all accumulated warm-up. It is a legitimate
  named mitigation for ClassLoader-churn fragmentation, never a reflex for any code cache
  symptom.
- `ReservedCodeCacheSize` reserves address space (hard cap 2048 MB); committed RAM follows
  each `CodeHeap`'s `used` in `CodeCacheExpansionSize` (64 KB) steps. Confirm with
  `jcmd <pid> VM.native_memory summary` on the `Code` category rather than assuming a large
  reservation means large committed memory.

## References

- [Segments, sizing and rebalancing](references/segments-and-sizing.md) — what each segment
  holds, the ergonomic defaults and where they come from, the tier-to-CodeHeap mapping, the
  allocation fallback, the arithmetic a manual configuration must satisfy (and when the JVM
  fixes it for you), and the decision matrix for raising the total versus changing the split.
  Read before changing any code cache flag.
- [Unloading and the GC](references/unloading-and-gc.md) — what JDK-8290025 removed and
  what replaced it: the two GC triggers, the cold-code heuristic, the per-collector cost of a
  `CodeCache GC Threshold` pause, the compiler stop/restart path, and what every surviving
  `Sweep*` flag means now. Read when the GC log names the code cache, or before touching
  `UseCodeCacheFlushing` or `NmethodSweepActivity`.
- [Diagnosing per-segment exhaustion](references/diagnosing-exhaustion.md) — the
  `Compiler.codecache` output read line by line, the symptom-to-cause table,
  `Compiler.CodeHeap_Analytics`, `jstat -compiler` columns, the logging and JFR events, the
  per-CodeHeap metric series, the adapter `OutOfMemoryError`, and how internal and external
  fragmentation differ. Read when triaging a live code cache symptom.
