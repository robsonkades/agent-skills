# Code cache

The retained lab behaviour and messages below were recorded on Temurin 25.0.3 with an undersized
`-XX:ReservedCodeCacheSize`. Reclamation changed in JDK 20 when JDK-8290025 removed the
sweeper. On this JDK 25 reproduction, pressure appeared in two useful shapes; treat them as
diagnostic patterns, not an exhaustive state machine.

## The two failure signatures

**Shape 1 — thrashing under `UseCodeCacheFlushing` (the default).** Once allocations since
the last unloading exceed a threshold — initially `SweeperThreshold=15`% of capacity,
then scaled by free-capacity ratio once used capacity exceeds that threshold —
the JVM requests GC that can reclaim eligible code (`CodeCache::gc_on_allocation`; the log line
below prints both percentages). If the cache is simply too small for the working set, the
cache can enter a sustained reclaim/recompile loop. Confirm repeated compilations and reclaim
activity; a GC request does not prove particular cold nmethods were removed. The signature is in GC and
code-cache logs. At or below `StartAggressiveSweepingAt=10`% free, a separate aggressive-GC
branch applies; the allocation threshold does not simply shrink to zero:

```
[0.086s][info][gc] GC(2) Pause Young (Concurrent Start) (CodeCache GC Threshold) 3M->1M(28M) 0.385ms
[0.146s][info][gc] GC(4) Pause Young (Concurrent Start) (CodeCache GC Threshold) 3M->1M(28M) 0.349ms
```

and, with `-Xlog:codecache=info`, `Triggering threshold (4.3%) GC due to allocating 4.6%
since last unloading`. Nothing is disabled, no warning is printed, `Compiler.codecache`
reads `Compilation: enabled` — and CPU climbs with no load change, because the same methods
are compiled over and over and run interpreted in between. Reproduced with a 3 MB cache: the
JVM spent its whole run in this loop.

**Shape 2 — compiler disabled.** When even flushing cannot free a contiguous block for the
allocation, compilation stops:

```
[0.645s][warning][codecache] CodeCache is full. Compiler has been disabled.
[0.645s][warning][codecache] Try increasing the code cache size using -XX:ReservedCodeCacheSize=
```

plus the same text as `OpenJDK 64-Bit Server VM warning:` on stderr. Stopping new compilations
does not itself invalidate all existing compiled code: a method may keep using valid C1 or C2
code, while a method with no usable compiled entry executes interpreted. Higher-tier promotion
can be blocked even when lower-tier code exists. Deoptimization and reclamation can still
change which code remains usable; do not promise that already-compiled paths stay fast.

The warning alone establishes neither service health nor failure. Measure request latency,
timeouts and probe outcomes. With `UseCodeCacheFlushing` enabled, the JVM can attempt to restart
compilation when space permits; on this source baseline, disabling flushing takes the
`disable_compilation_forever()` path when the cache fills. Observe `stopped_count`,
`restarted_count`, effective flags, and method/code-cache state before choosing recovery.

Both shapes can look like “it degraded after a while and a restart fixed it”. Check them early,
but also compare load, generated/loaded classes, deoptimization, GC, host throttling,
dependencies, and downstream latency. Recurring GC cause and compiler/code-cache counters
distinguish these code-cache patterns.

## Confirming it

```bash
jcmd <pid> Compiler.codecache
```

```
CodeHeap 'non-profiled nmethods': size=119168Kb used=513Kb max_used=513Kb free=118654Kb
CodeHeap 'profiled nmethods': size=119168Kb used=2263Kb max_used=2263Kb free=116904Kb
CodeHeap 'non-nmethods': size=7488Kb used=2475Kb max_used=3179Kb free=5012Kb
CodeCache: size=245824Kb, used=5251Kb, max_used=5955Kb, free=240570Kb
 total_blobs=2112, nmethods=1637, adapters=376, full_count=0
Compilation: enabled, stopped_count=0, restarted_count=0
```

Three fields close the diagnosis: `full_count` (how many times any heap hit full), the
`Compilation:` line (`disabled (not enough contiguous free space left)` in shape 2), and
`max_used` against `size` per heap. "Full" is about contiguous space: the JFR event below
fired with `unallocatedCapacity = 2.1 MB` of a 4 MB cache.

```bash
jfr print --events jdk.CodeCacheFull recording.jfr        # the moment of exhaustion
jfr print --events jdk.CodeCacheStatistics recording.jfr  # fullCount, cumulative, every chunk
```

`jdk.CodeCacheFull` fires when the allocation fails — **only if the recording is already
running**. Under `-Xcomp` a 3 MB cache filled at 0.47 s and the recording started at 0.76 s:
zero events, `fullCount = 1` in `jdk.CodeCacheStatistics`. The absence of the event proves
nothing; `fullCount` and `Compiler.codecache full_count` are cumulative and do. With
flushing enabled the event can fire more than once.

## Segments

Segmented code cache splits the space by lifetime: non-nmethods (VM internal), profiled
(tier 2 and 3 output, medium lifetime) and non-profiled (tier 1 and 4 output, long lifetime).
Total occupancy can look comfortable while one segment is full — monitor **per segment**,
not only the total. `code-cache-segments` owns the per-heap diagnosis, fragmentation and
rebalancing.

## Configuration

- `-XX:ReservedCodeCacheSize` — 240 MB in the examined default full-tiered configuration;
  retain adequate sizing or derive a change from measured per-heap demand and the memory budget.
- **`-XX:-TieredCompilation` and `-XX:TieredStopAtLevel=1` drop the default to 48 MB** and
  switch segmentation off. A service that changed the mode and then saw `CodeCache is full`
  may have hit changed ergonomics; verify effective settings and working-set growth independently.
  Explicit sizing is warranted by headroom or a reproducibility/memory contract, not every mode change.
- Segmentation is ergonomic: verified off at `-XX:ReservedCodeCacheSize=200m`, on at
  `240m`. Below that, `Compiler.codecache` shows one unnamed heap and per-segment
  monitoring shows nothing.
- `-XX:+UseCodeCacheFlushing` is **already the default**. Disabling it converts shape 1 into
  a potential permanent compiler stop when the cache fills; it is a diagnostic experiment,
  not a fix.
- Derive alerts from per-heap headroom, growth/churn rate, fragmentation/allocation failures,
  `full_count`, and time to exhaustion. A universal 80% threshold can be too early for a stable
  cache or too late for a fragmented/growing segment. Alert on recurring steady-state GC cause
  `CodeCache GC Threshold` and compiler stop/restart transitions.

The code cache is part of the container memory budget and lives outside `-Xmx`. See
`jvm-memory-regions`.

## Deoptimisation

```bash
jfr print --events jdk.Deoptimization recording.jfr
```

Occasional deoptimisation is normal — it is how speculative optimisation stays correct. It
is a signal when it **recurs on the same method**: the profile is unstable, usually
because a call site that used to be monomorphic now sees several types, or because an
uncommon trap keeps being hit. `made not entrant: not used` in `PrintCompilation` is not a
proof of deoptimisation; in a tier-up sequence it can be lower-tier code replaced by its successor.

Recurring deoptimisation can lead to new compiler tasks, but some actions keep the compiled
method usable. Verify successor compile IDs and queue activity rather than assuming each event
implies recompilation. Repeated recompilation is
one way an application appears never to finish warming up, and each recompilation
consumes code cache the flushed version gave back. The reason codes and mitigations are
`deoptimization`.

## Flags that are already default

Check the actual target before adding any of these. The command below inspects a newly launched
JVM; it cannot establish the deployed process's flags, collector or compilation mode. Reuse
target launch records or supported `jcmd <pid> VM.flags -all` / `VM.command_line` evidence.

```bash
java -XX:+PrintFlagsFinal -version | grep -E 'TieredCompilation|UseCodeCacheFlushing|UseCountedLoopSafepoints|SegmentedCodeCache|UseDynamicNumberOfCompilerThreads'
```

All five were `true` in the recorded default G1/full-tiered Temurin 25.0.3 configuration.
`UseCountedLoopSafepoints` defaults also depend on the collector (false with Serial/Parallel
in the checked 25.0.3 controls). `UseDynamicNumberOfCompilerThreads` dates to JDK 11;
segmentation additionally depends on mode, reserved size and explicit overrides.

## Primary references

- [JDK-8290025: remove the HotSpot sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
- [HotSpot 25.0.3 code cache source](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/code/codeCache.cpp)
- [HotSpot 25.0.3 compiler stop policy](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compileBroker.cpp)
- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
