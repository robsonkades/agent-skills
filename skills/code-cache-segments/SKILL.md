---
name: code-cache-segments
description: >
  The segmented code cache as three independent CodeHeaps: non-nmethods, profiled and
  non-profiled nmethods, their separate exhaustion, sweeper and flushing behaviour,
  fragmentation that no aggregate metric shows, sizing each segment consistently, and
  reading jcmd Compiler.codecache. Use when CPU rises with no load change while an aggregate
  "Code Cache usage" dashboard looks healthy, when doubling ReservedCodeCacheSize fixed one
  incident and not the next, when setting ProfiledCodeHeapSize or NonProfiledCodeHeapSize
  makes the JVM refuse to start, when a long-running service degrades with the cache
  reportedly not full, or when only one unnamed CodeHeap appears in the output. Does not
  cover the introductory code-cache exhaustion signature (jit-compilation), the code cache's
  share of the container memory budget (jvm-memory-regions), or Metaspace internals
  (metaspace-internals).
---

# Code Cache Segments

## Purpose

Treat the code cache as three independent allocators with three separate ceilings, because
that is what it is since JEP 197. One `CodeHeap` can sit at 99.8% while the consolidated
number reads 72%, and every tool that stops at the consolidated line reports a healthy
system. The symptom is CPU climbing with no load change, as new methods stop being promoted
and stay in the interpreter.

The second failure this prevents is the reflexive "double `ReservedCodeCacheSize`". It works
when the pressured segment happens to be one of the two that split the remainder 50/50, and
wastes half the increase when it is not.

## Workflow

1. **Read all three `CodeHeap` lines** from `jcmd <pid> Compiler.codecache`, never the
   consolidated `CodeCache:` line alone. Also read `Compilation: enabled` or `disabled` —
   the most direct line in the output.
2. **Confirm segmentation is actually on.** Three named heaps means yes; one unnamed heap
   means `SegmentedCodeCache` switched off ergonomically because the reserved size was small.
3. **Sample at three points, 30-60 seconds apart**, to tell stable exhaustion from oscillating
   thrashing. Record `jstat -compiler` — `Compiled`, `Bailout`, `Invalid` — as part of the
   incident baseline.
4. **Predict the pressured segment from the tier mix** before measuring: tiers 2 and 3 go to
   `profiled`, tiers 1 and 4 go to `non-profiled`. Cross-reference `PrintCompilation` or
   `jdk.Compilation`, and cross-reference deoptimisation events when `non-profiled` is under
   pressure.
5. **Choose between raising the total and rebalancing** from the measured asymmetry, not from
   the symptom. Both segments high means total capacity; one high and one low means the split.
   See `references/segments-and-sizing.md`.
6. **Check the sum before applying any manual segment sizes.** The three heap sizes must fit
   inside `ReservedCodeCacheSize` or the process does not start — before any application
   bytecode runs.
7. **Validate under the same load that caused the incident**: the pressured segment stable
   below roughly 80%, and `Compilation:` still `enabled` across a sustained window rather than
   at one instant.

## Rules

- Monitor per `CodeHeap`, not as a sum. Micrometer and JMX already break the series out by
  `id` (`CodeHeap 'profiled nmethods'` and the rest); the fault is a dashboard adding them
  back together.
- `profiled nmethods` holds tiers **2 and 3** only. Tier 1 — C1 without profiling — goes to
  `non-profiled` alongside tier 4. A trivial method can go straight to `non-profiled` without
  ever passing through `profiled`.
- The split between `profiled` and `non-profiled` is an exact **50/50** of what remains after
  `non-nmethods`, not one third to two thirds.
- `NonNMethodCodeHeapSize`, `ProfiledCodeHeapSize` and `NonProfiledCodeHeapSize` are ordinary
  product flags introduced by JEP 197. Material that wraps them in
  `-XX:+UnlockDiagnosticVMOptions` is out of date.
- `-XX:CodeCacheMinimumFreeSpace` does not exist. The real name is
  `-XX:CodeCacheMinimumUseSpace`, and it is `develop`-only — unavailable in production builds.
- `jstat -compiler` reports **`Bailout`**, not `Failed`. `Bailout` (never compiled) and
  `Invalid` (compiled, then discarded by deoptimisation) are different diagnoses. A rising
  `Bailout` with a constant `FailedMethod` consumes interpreter CPU, not code cache — a
  bailout never produces an nmethod.
- Declare `-XX:+SegmentedCodeCache` explicitly whenever per-segment visibility matters. It
  switches off ergonomically below a certain `ReservedCodeCacheSize`, so a small container or
  a lab silently loses the granularity.
- The CodeHeap never compacts, and never will. An nmethod embeds absolute addresses — call
  targets, inline caches, stub references — and threads may be executing it with the program
  counter inside. Fragmentation is the accepted cost of that design, not a pending fix.
- `jcmd Compiler.codecache` reports aggregate `free` and **never the largest contiguous free
  block**. An allocation can fail with plenty of free space reported. External fragmentation
  is invisible to this command.
- Fragmentation grows with allocate/free/reallocate cycles, not with raw volume. Frequent
  deoptimisation and ClassLoader churn are the factories; a heap that only ever fills does
  not fragment.
- Keep `-XX:+UseCodeCacheFlushing` (the default) in production. It is the difference between
  measurable gradual degradation and permanently disabling the compiler until restart.
- A restart clears fragmentation and discards all accumulated warm-up. It is a legitimate
  named mitigation for ClassLoader-churn fragmentation, never a reflex for any code cache
  symptom.
- `ReservedCodeCacheSize` reserves address space; committed RAM follows each `CodeHeap`'s
  `used`. Confirm with `jcmd <pid> VM.native_memory summary` on the `Code` category rather
  than assuming a large reservation means large committed memory.

## References

- [Segments, sizing and rebalancing](references/segments-and-sizing.md) — what each segment
  holds, the tier-to-CodeHeap mapping, the arithmetic a manual configuration must satisfy,
  and the decision matrix for raising the total versus changing the split. Read before
  changing any code cache flag.
- [Diagnosing per-segment exhaustion](references/diagnosing-exhaustion.md) — the
  `Compiler.codecache` output read line by line, `jstat -compiler` columns, the logging and
  JFR events, the per-CodeHeap metric series, and how internal and external fragmentation
  differ. Read when triaging a live code cache symptom.
