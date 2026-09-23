# Unloading and the GC

JDK 20 removed the code cache sweeper (JDK-8290025, "Remove the Sweeper", integrated
2022-08-25). This reference describes JDK 25 behaviour. Epoch arithmetic and compiler
restart conditions are checked against `jdk-25.0.3+9`; historical capture examples use
Temurin 25.0.3. Revalidate collector-specific behavior and failure paths on the target runtime.

## What changed

| Before JDK 20                                                              | JDK 20 and later                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NMethodSweeper` thread scans stacks periodically                          | No sweeper thread; entry barriers support tracking nmethod activity in GC epochs                |
| `not_entrant → zombie → freed`, one sweeper pass per transition            | `not_entrant → unlinked → freed`, performed by the GC's code-cache unloading phase              |
| "Code cache flushing" marks cold code not-entrant ahead of need            | `is_cold()` uses an epoch-age comparison; two epoch increments represent one full marking cycle |
| Sweeper triggered by its own threshold                                     | `CodeCache::gc_on_allocation()` **requests a GC** when allocation crosses a threshold           |
| `UseCodeAging`, `SweeperLogEntries`, sweeper JFR events                    | Removed. `jfr metadata` on 25 lists no `CodeSweeper*` or `SweepCodeCache` event                 |
| `UseCodeCacheFlushing`, `MethodFlushing`, `NmethodSweepActivity`, `Sweep*` | Retained with new semantics — see the flag table below                                          |

The consequence that matters in production: **reclaiming installed nmethods normally depends
on GC unloading**, and code-cache pressure can schedule it. Temporary compiler `BufferBlob`s
have explicit freeing paths; not every decrease in code-cache usage implies a GC. A JVM whose
Java heap is healthy can still show collections whose cause names the code cache.

## The nmethod lifecycle on 25

```
not_installed          allocated, code being installed
   → in_use            entered normally; entry-barrier processing records GC-epoch activity
   → not_entrant       retirement after replacement or invalidation; existing frames may remain
in_use or not_entrant
   → (unlinked)        GC identifies an unloading-eligible nmethod, including cold code
   → freed             block returned to the CodeHeap free list; compiler may restart
```

`PrintCompilation` prints the reason after `made not entrant:` on 25. `not used` can accompany
replacement, including tier-3 → tier-4 promotion; the message alone does not identify the
transition or its cause. Correlate method, compilation IDs, tiers and deoptimization evidence.
Cold-code unloading need not first emit a `made not entrant` line. There is no `made zombie`
line any more. Retired code can survive several unloading cycles when frames still reference it.

## The two GC triggers (`CodeCache::gc_on_allocation`)

Called on every `CodeBlob` and nmethod allocation (`ciEnv.cpp`, `codeBlob.cpp`,
`sharedRuntime.cpp`). Both tests use the **aggregate** across all allocable heaps
(`CodeCache::unallocated_capacity()` / `max_capacity()` sum over `FOR_ALL_ALLOCABLE_HEAPS`),
which is why a single exhausted segment does not trigger anything on its own.

| Trigger    | Condition                                                                                                                                                                                                   | GC cause                  | Log line (`-Xlog:codecache=info`)                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| Aggressive | free ≤ `StartAggressiveSweepingAt` (10%) of the total                                                                                                                                                       | `CodeCache GC Aggressive` | `Triggering aggressive GC due to having only N% free memory`                                    |
| Threshold  | bytes allocated since the last unloading > `SweeperThreshold` (15%) of the total; once `used` exceeds 15%, the threshold is multiplied by the free ratio, so it shrinks as the cache fills (5% at 66% used) | `CodeCache GC Threshold`  | `Triggering threshold (T%) GC due to allocating A% since last unloading (U1% used -> U2% used)` |

Only one request is outstanding at a time (`_unloading_threshold_gc_requested`). With normal
flushing/aging enabled, the GC's unloading step clears it in `update_cold_gc_count`; that
function returns before clearing it when `MethodFlushing` or `UseCodeCacheFlushing` is off,
or `NmethodSweepActivity=0`. On this JDK 25 path those settings also prevent re-arming the
code-cache GC request after its first trigger; other GC causes can still run. A lab run with
`-Xcomp` and a 4 MB cache produced a trigger every ~100 ms — `Pause Young (Concurrent Start) (CodeCache GC Threshold)`
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
capacity or unnecessary compilation/class-generation churn, rather than assuming heap tuning:
the triggers depend on total code-cache capacity, allocation rate and free ratio, so test a
larger cache against the observed workload instead of promising a fixed frequency reduction.
`gc-log-analysis` covers reading the cause
column; this reference covers why it says what it says.

## The cold-code heuristic (`update_cold_gc_count`, `nmethod::is_cold`)

Run at each unloading. It estimates the allocation rate since the last unloading, computes
how long until the aggressive threshold would be hit at that rate, and divides by
`NmethodSweepActivity` (4) to get a "cold timeout"; that timeout in GC intervals is
`cold_gc_count` (never below 2). On 25.0.3+9, the age test is
`previous_completed_gc_marking_cycle() > nmethod_gc_epoch + 2 * cold_gc_count`.
The code-cache epoch increments at both marking start and finish: the factor two converts
intervals to epoch units, not twice that many complete GC cycles. The strict comparison,
current phase and nmethod activity matter; this is not a fixed wall-clock expiration.
Eligible cold code can be unloaded while still semantically valid and later recompiled
when hot again. Correlate recompilation and unloading before attributing usage oscillation
to this heuristic.

The log line to read, `-Xlog:codecache=info`:

```
Allocation rate: 813.125 KB/s, time to aggressive unloading: 21.494 s, cold timeout: 5.373 s,
cold gc count: 4, used: 4.533 MB (18.886%), last used: 3.601 MB (15.004%), gc interval: 1.173 s
```

`No code cache pressure; don't age code` means no allocation since the last unloading —
nothing is cold-flushed. `Code cache critically low; use aggressive aging` means free space is
under `StartAggressiveSweepingAt` and `cold_gc_count` was forced to 2. Temporal aging needs
supported nmethod entry barriers. Independently, with `MethodFlushing` enabled, the predicate
can accept a not-entrant, off-stack nmethod before its barrier-support check; absence of
barriers does not establish that all retired code must remain allocated.

## Flags that survived, and what they mean now

All `product`, all present in `-XX:+PrintFlagsFinal` on 25.0.3:

| Flag                        | Default | Meaning on JDK 20+                                                                                                                                                                                                                                                                |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UseCodeCacheFlushing`      | `true`  | Enables the cold heuristic and, on a full heap, _stopping_ compilation instead of _disabling it forever_. Off: `update_cold_gc_count` returns early, at most one threshold GC ever fires (the request flag is never cleared), and a full heap disables the compiler until restart |
| `MethodFlushing`            | `true`  | Controls compiled-method reclamation in this HotSpot path. Disabling it prevents normal recovery of code-cache space and is a diagnostic experiment, not a production remedy                                                                                                      |
| `NmethodSweepActivity`      | `4`     | Divisor on the time-to-aggressive estimate. Higher = shorter cold timeout and potential recompilation churn; `0` disables cold aging and prevents re-arming the code-cache GC request on the JDK 25 path above                                                                    |
| `SweeperThreshold`          | `15.0`  | Percentage of the total allocated since the last unloading that requests a threshold GC. "Threshold when a code cache unloading GC is invoked" is the flag's own description                                                                                                      |
| `StartAggressiveSweepingAt` | `10`    | Percentage free (aggregate) below which the request is an aggressive GC and `cold_gc_count` drops to 2                                                                                                                                                                            |

None of these is a routine tuning target. Evaluate capacity and avoidable compilation churn
first. `NmethodSweepActivity=0` changes both aging and the repeated code-cache GC trigger on
this baseline. It is not an isolated switch for recompilation cost. An experiment must compare
retained code, collections from every cause, exhaustion risk and compiler recovery; fewer
code-cache GC messages alone do not establish improvement.

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
- After nmethod purging reports freed memory, `CodeCache::maybe_restart_compiler` attempts
  to resume compilation. A successful stopped-to-running transition increments
  `restarted_count`. In 25.0.3+9 the function emits `Restarting compiler` and `jdk.JITRestart`
  (`freedMemory`, `codeCacheMaxCapacity`) without checking whether that transition succeeded.
  `Compilation: enabled` establishes current eligibility; an increase in `restarted_count`
  across the observed window establishes a restart transition. Productive recovery requires
  successful work started after that transition;
  completion of older in-flight tasks is insufficient. Check `UseCompiler` and shutdown errors
  rather than treating the log/event as proof of recovery from permanent shutdown.

With normal flushing, exhaustion can cause a recoverable stop; the next GC is not guaranteed
to reclaim eligible nmethods or restore useful capacity. Repeated stopped/restarted counter
increments demonstrate repeated transitions, not their cause. If compilation stays disabled,
check flushing and unloading settings, pinned/live code, permanent compiler shutdown and the
surrounding error log before choosing a remedy.

`C1 initialization failed. Shutting down all compilers` is not sufficient to diagnose a
harmless follow-on from cache pressure. `shutdown_compiler_runtime` also handles compiler
initialization failure; inspect preceding errors and `UseCompiler`. A permanently disabled
compiler cannot be repaired merely by waiting for another unloading GC, and its shutdown
need not increment `stopped_count`.

## Decisions

| Situation                                                                   | Decision                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code-cache-triggered collections consume material CPU or pause budget       | Confirm expected compilation/class-generation demand and reclaimed bytes; then compare more capacity with reducing the source of churn                                                                  |
| Same, on Serial or Parallel                                                 | Attribute the observed Full GC cost before changing heap or code-cache capacity; validate the selected change under representative load                                                                 |
| Per-heap `used` oscillating, `stopped_count` and `restarted_count` climbing | Possible thrashing: correlate recompilation, unloading and capacity demand before choosing a remedy. Do not disable flushing to mask churn; a subsequent full cache can permanently disable compilation |
| Proposal to set `NmethodSweepActivity=0`                                    | Treat as a bounded diagnostic experiment; compare recompilation cost, GC cost, exhaustion risk and recovery behavior                                                                                    |
| `Compilation: disabled` for minutes, `restarted_count=0`                    | Check `UseCompiler`, shutdown errors and flushing/unloading settings; then inspect code that remains live or pinned                                                                                     |

## Authoritative sources

- [JDK-8290025: Remove the Sweeper](https://bugs.openjdk.org/browse/JDK-8290025)
- [JDK 25.0.3+9 HotSpot `codeCache.cpp`: epochs and restart attempt](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/code/codeCache.cpp)
- [JDK 25.0.3+9 HotSpot `nmethod.cpp`: cold-code predicate](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/code/nmethod.cpp)
- [JDK 25 HotSpot `ciEnv.cpp`: replacement retirement](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/ci/ciEnv.cpp)
- [JDK 25 HotSpot `codeBlob.cpp`: explicit runtime-blob freeing](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/code/codeBlob.cpp)
- [JDK 25.0.3+9 HotSpot `compileBroker.cpp`: initialization failure and shutdown](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compileBroker.cpp)
- [JDK 25.0.3+9 HotSpot `compileBroker.hpp`: compiler state transitions](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compileBroker.hpp)
