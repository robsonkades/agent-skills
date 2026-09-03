---
name: code-cache-segments
description: >
  The JDK 17-25 segmented code cache, GC-driven unloading, fragmentation, segment sizing,
  and jcmd Compiler.codecache/CodeHeap_Analytics. Use when aggregate usage looks healthy but
  one CodeHeap is exhausted, compilation stops or restarts, GC logs show a CodeCache cause,
  startup rejects manual heap sizes, an OutOfMemoryError reports "Out of space in CodeCache",
  or a long-running service degrades while aggregate free space remains. Covers runtime-shape
  discovery so tools do not assume exactly three heaps on every mode or release. Excludes the
  introductory exhaustion signature (jit-compilation), container memory budgeting
  (jvm-memory-regions), and Metaspace internals (metaspace-internals).
---

# Code Cache Segments

## Purpose

On JDK 17-25, treat the normally segmented code cache as three independent allocators with
separate ceilings. One `CodeHeap` can sit at 99.8% while the consolidated
number reads 72%, and every tool that stops at the consolidated line reports a healthy
system. Since JDK 20 the consequence of one full heap is not "the compiler stops": the
allocator falls back to the other nmethod heap, so short-lived tier-3 code starts landing
in the heap that was reserved for long-lived C2 code, and the GC-driven unloading that
replaced the sweeper keys off the **aggregate** free ratio and does not notice. Compilation
stops only when the allocation cannot be satisfied after the applicable fallback. Do not
hard-code a count of three into tooling: unsegmented and interpreter-only modes have fewer
heaps, and later HotSpot builds can add heap kinds. Discover the runtime shape from
`Compiler.codecache` and `jdk.CodeCacheConfiguration`.

The second failure this prevents is the reflexive "double `ReservedCodeCacheSize`". It works
when the pressured segment happens to be one of the two that split the remainder 50/50, and
wastes half the increase when it is not — or when the real cost was the GC pauses the code
cache was triggering, which a bigger cache also fixes, for a different reason.

## Workflow

1. **Read all three `CodeHeap` lines** from `jcmd <pid> Compiler.codecache`, never the
   consolidated `CodeCache:` line alone. Also read the last line: `Compilation: enabled` or
   `disabled (not enough contiguous free space left)`, with `stopped_count` and
   `restarted_count`.
2. **Confirm the runtime shape.** On JDK 17-25, three named heaps is the normal tiered shape;
   one unnamed heap means segmentation is off. HotSpot enables it ergonomically only with
   tiered compilation and `ReservedCodeCacheSize` **≥ 240 MB**, so a smaller explicit value
   de-segments unless `-XX:+SegmentedCodeCache` is also given. Interpreter-only and
   non-tiered modes legitimately expose fewer heaps.
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
7. **Check the arithmetic before applying manual segment sizes.** On JDK 25, with all segment
   sizes and `ReservedCodeCacheSize` explicitly set, the enabled heaps must sum to the
   reserved total after alignment. With only a partial configuration HotSpot computes the
   unset remainder; without an explicit reserved total it can adjust the total. Recheck this
   version-sensitive startup logic on the exact runtime.
8. **Validate under the same load that caused the incident**: adequate headroom for the
   observed growth and deployment/warm-up envelope, an acceptable rate and cost of
   code-cache-triggered collections, and `Compilation:` enabled across a sustained window.
   Derive thresholds from the service SLO and restart horizon; 80% is not a universal limit.

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
- JDK 25 CodeHeaps reclaim and coalesce free blocks but do not relocate live nmethods to
  compact a heap. Relocation would have to preserve active frames, call sites, metadata and
  runtime references; do not extrapolate this implementation fact into a claim that a future
  JVM can never compact code.
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
- On JDK 25, `ReservedCodeCacheSize` reserves virtual address space (hard cap 2048 MB), while
  pages are committed as heaps expand in `CodeCacheExpansionSize` increments (64 KB on the
  tested build). Committed can exceed live `used`, and resident memory is a separate OS
  measure. Compare NMT `Code`, `Compiler.codecache`, and process/container RSS instead of
  treating reservation, commitment and residency as interchangeable.

## References

The detailed references use JDK 25 as their executable baseline. Revalidate flags, heap kinds,
event fields and startup arithmetic on another feature release or JVM implementation.

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
