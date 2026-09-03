# Unloading and the GC

JDK 20 removed the code cache sweeper (JDK-8290025, "Remove the Sweeper", integrated
2022-08-25). Everything below describes JDK 25 behaviour; the source references are
`codeCache.cpp`, `nmethod.cpp` and `compileBroker.cpp` at the `jdk-25-ga` tag, and every
log line and GC cause was reproduced on Temurin 25.0.3.

## What changed

| Before JDK 20                                                              | JDK 20 and later                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NMethodSweeper` thread scans stacks periodically                          | No thread. nmethod entry barriers stamp each nmethod with the GC epoch of its last entry     |
| `not_entrant → zombie → freed`, one sweeper pass per transition            | `not_entrant → unlinked → freed`, performed by the GC's code-cache unloading phase           |
| "Code cache flushing" marks cold code not-entrant ahead of need            | `is_cold()` lets the GC unload an nmethod not entered for `2 × cold_gc_count` marking cycles |
| Sweeper triggered by its own threshold                                     | `CodeCache::gc_on_allocation()` **requests a GC** when allocation crosses a threshold        |
| `UseCodeAging`, `SweeperLogEntries`, sweeper JFR events                    | Removed. `jfr metadata` on 25 lists no `CodeSweeper*` or `SweepCodeCache` event              |
| `UseCodeCacheFlushing`, `MethodFlushing`, `NmethodSweepActivity`, `Sweep*` | Retained with new semantics — see the flag table below                                       |

The consequence that matters in production: **freeing code cache now costs a GC**, and code
cache pressure schedules one. A JVM whose heap is healthy can still show a steady stream of
collections whose cause names the code cache.

## The nmethod lifecycle on 25

```
not_installed          allocated, code being installed
   → in_use            entered normally; entry barrier records the GC epoch on each entry
   → not_entrant       deoptimisation, tier promotion ("made not entrant: not used"),
                       dependency invalidation, or the cold heuristic
   → (unlinked)        a GC found no frame inside it and no reason to keep it
   → freed             block returned to the CodeHeap free list; compiler may restart
```

`PrintCompilation` prints the reason after `made not entrant:` on 25 — `not used` is the
normal tier-3 → tier-4 retirement, `uncommon trap` is a deoptimisation. There is no
`made zombie` line any more. The gap between `not_entrant` and `freed` is at least one GC
cycle that performs class/code unloading, and can be many if a thread is parked inside the
old code.

## The two GC triggers (`CodeCache::gc_on_allocation`)

Called on every `CodeBlob` and nmethod allocation (`ciEnv.cpp`, `codeBlob.cpp`,
`sharedRuntime.cpp`). Both tests use the **aggregate** across all allocable heaps
(`CodeCache::unallocated_capacity()` / `max_capacity()` sum over `FOR_ALL_ALLOCABLE_HEAPS`),
which is why a single exhausted segment does not trigger anything on its own.

| Trigger    | Condition                                                                                                                                                                                                   | GC cause                  | Log line (`-Xlog:codecache=info`)                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| Aggressive | free ≤ `StartAggressiveSweepingAt` (10%) of the total                                                                                                                                                       | `CodeCache GC Aggressive` | `Triggering aggressive GC due to having only N% free memory`                                    |
| Threshold  | bytes allocated since the last unloading > `SweeperThreshold` (15%) of the total; once `used` exceeds 15%, the threshold is multiplied by the free ratio, so it shrinks as the cache fills (5% at 66% used) | `CodeCache GC Threshold`  | `Triggering threshold (T%) GC due to allocating A% since last unloading (U1% used -> U2% used)` |

Only one request is outstanding at a time (`_unloading_threshold_gc_requested`), cleared when
the GC's unloading step runs `update_cold_gc_count`. A lab run with `-Xcomp` and a 4 MB cache
produced a trigger every ~100 ms — `Pause Young (Concurrent Start) (CodeCache GC Threshold)`
followed by a full concurrent cycle each time, on an application allocating almost nothing.

The `StartAggressiveSweepingAt` description in `globals.hpp` still says "Segmented code
cache: X% of the non-profiled heap"; the code sums every heap. Trust the code.

## What each collector does with the request

`Universe::heap()->collect(cause)` means whatever "a collection that unloads code" is for that
collector. Verified on 25.0.3 with `-Xlog:gc`:

| Collector | What a `CodeCache GC Threshold` request becomes                                     | Cost                                                                                        |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| G1        | `Pause Young (Concurrent Start) (CodeCache GC Threshold)` + a concurrent mark cycle | One young pause plus Remark/Cleanup pauses; unloading happens at Remark                     |
| Parallel  | `Pause Full (CodeCache GC Threshold)`                                               | **A stop-the-world Full GC**, whole heap                                                    |
| Serial    | `Pause Full (CodeCache GC Threshold)`                                               | Same                                                                                        |
| ZGC       | `Major Collection (CodeCache GC Threshold)`                                         | A concurrent major cycle; measure pauses, concurrent CPU and headroom on the deployed build |

This is the decision this reference exists for. A service on Parallel GC with a small code
cache and a high compilation rate — warm-up, runtime class generation, a `MethodHandle`-heavy
framework — will show periodic Full GCs that no heap metric explains. The fix is code cache
capacity, not heap tuning: the triggers are percentages of `ReservedCodeCacheSize`, so
raising it lowers the trigger frequency directly. `gc-log-analysis` covers reading the cause
column; this reference covers why it says what it says.

## The cold-code heuristic (`update_cold_gc_count`, `nmethod::is_cold`)

Run at each unloading. It estimates the allocation rate since the last unloading, computes
how long until the aggressive threshold would be hit at that rate, and divides by
`NmethodSweepActivity` (4) to get a "cold timeout"; that timeout in GC intervals is
`cold_gc_count` (never below 2). An nmethod not entered for more than `2 × cold_gc_count`
marking cycles is unloaded even though it is still valid — and recompiled if it becomes hot
again, which is the thrashing pattern where per-heap usage oscillates without settling.

The log line to read, `-Xlog:codecache=info`:

```
Allocation rate: 813.125 KB/s, time to aggressive unloading: 21.494 s, cold timeout: 5.373 s,
cold gc count: 4, used: 4.533 MB (18.886%), last used: 3.601 MB (15.004%), gc interval: 1.173 s
```

`No code cache pressure; don't age code` means no allocation since the last unloading —
nothing is cold-flushed. `Code cache critically low; use aggressive aging` means free space is
under `StartAggressiveSweepingAt` and `cold_gc_count` was forced to 2. Platforms without
nmethod entry barriers get no cold heuristic at all (`is_cold` returns `false`).

## Flags that survived, and what they mean now

All `product`, all present in `-XX:+PrintFlagsFinal` on 25.0.3:

| Flag                        | Default | Meaning on JDK 20+                                                                                                                                                                                                                                                                |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UseCodeCacheFlushing`      | `true`  | Enables the cold heuristic and, on a full heap, _stopping_ compilation instead of _disabling it forever_. Off: `update_cold_gc_count` returns early, at most one threshold GC ever fires (the request flag is never cleared), and a full heap disables the compiler until restart |
| `MethodFlushing`            | `true`  | Controls compiled-method reclamation in this HotSpot path. Disabling it prevents normal recovery of code-cache space and is a diagnostic experiment, not a production remedy                                                                                                      |
| `NmethodSweepActivity`      | `4`     | Divisor on the time-to-aggressive estimate. Higher = shorter cold timeout = more recompilation churn; `0` disables cold unloading while keeping threshold GCs                                                                                                                     |
| `SweeperThreshold`          | `15.0`  | Percentage of the total allocated since the last unloading that requests a threshold GC. "Threshold when a code cache unloading GC is invoked" is the flag's own description                                                                                                      |
| `StartAggressiveSweepingAt` | `10`    | Percentage free (aggregate) below which the request is an aggressive GC and `cold_gc_count` drops to 2                                                                                                                                                                            |

None of these is a routine tuning target. The one that earns a change is `ReservedCodeCacheSize`,
because it moves both thresholds at once; `NmethodSweepActivity=0` is defensible only when the
recompilation churn of cold flushing has been measured to exceed the cost of the extra GCs
it prevents, which is rare.

## Compiler stop and restart

`CompileBroker::handle_full_code_cache` runs when allocation and fallback both failed:

- `UseCodeCacheFlushing` on: `set_should_compile_new_jobs(stop_compilation)`,
  `-Xlog:codecache=info` prints `Code cache is full - disabling compilation`, and
  `stopped_count` in `Compiler.codecache` increments.
- `UseCodeCacheFlushing` off: `disable_compilation_forever()`. Nothing restarts it.
- Either way `report_codemem_full` prints the warning **once per heap** (`full_count == 1`) —
  `CodeHeap 'profiled nmethods' is full. Compiler has been disabled.` and `Try increasing the
code heap size using -XX:ProfiledCodeHeapSize=` — dumps the `Compiler.codecache` summary to
  stdout, and commits `jdk.CodeCacheFull`. With `-XX:+UnlockDiagnosticVMOptions
-XX:+PrintCodeHeapAnalytics` it also prints the full analytics at that moment.
- After a GC frees memory, `CodeCache::maybe_restart_compiler` re-enables compilation, logs
  `Restarting compiler`, commits `jdk.JITRestart` (`freedMemory`, `codeCacheMaxCapacity`) and
  increments `restarted_count`.

So on 25 with defaults, "Compiler has been disabled" is a transient state that flips back
after the next unloading GC, and `stopped_count`/`restarted_count` climbing together is the
oscillation signature. A `stopped_count` of 1 with `restarted_count` 0 and `Compilation:
disabled` for minutes means either flushing is off or nothing is freeable — read
`Compiler.CodeHeap_Analytics` for what occupies the heap.

An accompanying `C1 initialization failed. Shutting down all compilers` after the warning is
`UseDynamicNumberOfCompilerThreads` starting a thread while compilation is stopped; it is a
follow-on, not a second fault.

## Decisions

| Situation                                                                   | Decision                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Code-cache-triggered collections consume material CPU or pause budget       | Confirm expected compilation/class-generation demand and reclaimed bytes; then compare more capacity with reducing the source of churn     |
| Same, on Serial or Parallel                                                 | Attribute the observed Full GC cost before changing heap or code-cache capacity; validate the selected change under representative load    |
| Per-heap `used` oscillating, `stopped_count` and `restarted_count` climbing | Thrashing: capacity, not flags. Do not set `-XX:-UseCodeCacheFlushing` to "stop the churn" — it converts oscillation into a permanent stop |
| Proposal to set `NmethodSweepActivity=0`                                    | Treat as a bounded diagnostic experiment; compare recompilation cost, GC cost, exhaustion risk and recovery behavior                       |
| `Compilation: disabled` for minutes, `restarted_count=0`                    | Check `UseCodeCacheFlushing`, then `CodeHeap_Analytics` for what cannot be freed — pinned by frames, or live and simply too much code      |

## Authoritative sources

- [JDK-8290025: Remove the Sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
- [JDK 25 HotSpot `codeCache.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/code/codeCache.cpp)
- [JDK 25 HotSpot `nmethod.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/code/nmethod.cpp)
- [JDK 25 HotSpot `compileBroker.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compileBroker.cpp)
