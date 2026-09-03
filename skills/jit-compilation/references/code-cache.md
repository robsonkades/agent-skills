# Code cache

Behaviour and messages below were reproduced on Temurin 25.0.3 with an undersized
`-XX:ReservedCodeCacheSize`. Reclamation changed in JDK 20 when JDK-8290025 removed the
sweeper. On this JDK 25 reproduction, pressure appeared in two useful shapes; treat them as
diagnostic patterns, not an exhaustive state machine.

## The two failure signatures

**Shape 1 — thrashing under `UseCodeCacheFlushing` (the default).** Once allocations since
the last unloading exceed a threshold — `SweeperThreshold=15`% of the cache when it is
empty, shrinking towards zero as free space approaches `StartAggressiveSweepingAt=10`% —
the JVM asks the GC to unload cold nmethods (`CodeCache::gc_on_allocation`; the log line
below prints both percentages). If the cache is simply too small for the working set, the
this can become a sustained unload/recompile loop. The strongest signature is in the GC and
code-cache logs:

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

plus the same text as `OpenJDK 64-Bit Server VM warning:` on stderr. No exception, no failed
health check. Already-compiled methods stay fast; every newly hot method runs interpreted
until compilation is restarted—which the JVM can attempt once space is freed. Observe
`stopped_count`, `restarted_count`, and method/code-cache state rather than assuming restart is the
only recovery.

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

- `-XX:ReservedCodeCacheSize` — 240 MB by default under tiered compilation, and usually
  enough; size it from measured `max_used` per heap, not from a rule of thumb.
- **`-XX:-TieredCompilation` and `-XX:TieredStopAtLevel=1` drop the default to 48 MB** and
  switch segmentation off. A service that changed the mode and then saw `CodeCache is full`
  has hit ergonomics, not a leak; set the size explicitly with the mode.
- Segmentation is ergonomic: verified off at `-XX:ReservedCodeCacheSize=200m`, on at
  `240m`. Below that, `Compiler.codecache` shows one unnamed heap and per-segment
  monitoring shows nothing.
- `-XX:+UseCodeCacheFlushing` is **already the default**. Disabling it converts shape 1 into
  shape 2 — a loud failure instead of a quiet one — and is a diagnostic experiment, not a
  fix.
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
deoptimisation at all; it is the tier-3 code being retired by the tier-4 version.

Recurring deoptimisation also means the method keeps re-entering the compile queue, which
is one way an application appears never to finish warming up, and each recompilation
consumes code cache the flushed version gave back. The reason codes and mitigations are
`deoptimization`.

## Flags that are already default

Check before adding any of these; re-enabling a default creates the feeling of having
acted while the real problem stays undiagnosed.

```bash
java -XX:+PrintFlagsFinal -version | grep -E 'TieredCompilation|UseCodeCacheFlushing|UseCountedLoopSafepoints|SegmentedCodeCache|UseDynamicNumberOfCompilerThreads'
```

All five are `true` on Temurin 25.0.3. `UseCountedLoopSafepoints` has been default since
JDK 10; `UseDynamicNumberOfCompilerThreads` since JDK 11; `SegmentedCodeCache` since JDK 9
whenever the reserved size allows it.

## Primary references

- [JDK-8290025: remove the HotSpot sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
- [HotSpot code cache source](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/code)
- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
