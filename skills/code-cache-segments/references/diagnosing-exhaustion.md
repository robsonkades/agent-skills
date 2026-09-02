# Diagnosing per-segment exhaustion

Output shapes below are from Temurin 25.0.3 (`jcmd`, `jstat`, `jfr metadata`). The numbers in
the first block are illustrative; the line format is exact.

## Read all three CodeHeap lines

```
jcmd <pid> Compiler.codecache

CodeHeap 'non-profiled nmethods': size=119168Kb used=54732Kb  max_used=54732Kb  free=64436Kb
 bounds [0x00007f1a10000000, 0x00007f1a10358000, 0x00007f1a17420000]
CodeHeap 'profiled nmethods':     size=119168Kb used=118940Kb max_used=118940Kb free=228Kb
 bounds [0x00007f1a17420000, 0x00007f1a17690000, 0x00007f1a1e880000]
CodeHeap 'non-nmethods':          size=7488Kb  used=3102Kb   max_used=3102Kb   free=4386Kb
 bounds [0x00007f1a1e880000, 0x00007f1a1eb90000, 0x00007f1a1f2d0000]
CodeCache: size=245824Kb, used=176774Kb, max_used=176774Kb, free=69050Kb
 total_blobs=8214, nmethods=6890, adapters=411, full_count=0
Compilation: enabled, stopped_count=0, restarted_count=0
```

The consolidated line is 176774/245824, about 71.9% — unremarkable. `profiled nmethods` is
118940/119168, about 99.8% — exhausted — while `non-profiled` sits at under half. What
happens next on JDK 25 is not "tier-3 compilation stops": the allocator falls back and every
new tier-2/3 nmethod lands in `non-profiled` (`segments-and-sizing.md`, "The allocation
fallback"). Watch `non-profiled` `used` on the next two samples — climbing faster than the
tier-4 rate explains is the spill. Compilation stops, with a warning, only when
`non-profiled` is full too, and CPU then rises because interpreting costs an order of
magnitude more than running C1 code.

The last line is the single most direct one in the output. `Compilation: enabled` versus
`disabled (not enough contiguous free space left)`, and `stopped_count` / `restarted_count`
say whether the compiler has ever been stopped and whether it came back. `full_count` on the
`CodeCache:` line is the number of times any heap reported full.

`bounds` are `[low, high (committed), high_boundary (reserved)]` — the middle address moves as
the heap commits; the difference between the first and last is the reservation.

Three separate diagnoses hide behind "the code cache": one segment exhausted and spilling
while the aggregate looks fine, the cache genuinely full (a binary event with a log message),
and sustained pressure on the total (gradual degradation, a stream of `CodeCache GC` causes in
the GC log, and no warning at all).

## Symptom to cause

| Symptom                                                                                                                           | Most likely cause                                                                                          | Confirm with                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CodeHeap 'profiled nmethods' is full. Compiler has been disabled.` in stdout or the JVM log                                      | Both nmethod heaps full for a tier-2/3 request; total capacity, or a profiled/non-profiled split too small | `Compiler.codecache` right after — both nmethod heaps at `free≈0`; `jdk.CodeCacheFull.codeBlobType`                       |
| `CodeCache is full. Compiler has been disabled.` (no heap name)                                                                   | Unsegmented cache — `ReservedCodeCacheSize` under 240 MB without `+SegmentedCodeCache`                     | One unnamed heap in `Compiler.codecache`; `jdk.CodeCacheConfiguration.profiledSize = 0`                                   |
| GC log: `Pause Full (CodeCache GC Threshold)` on Parallel/Serial, `Pause Young (Concurrent Start) (CodeCache GC Threshold)` on G1 | Allocation crossed `SweeperThreshold`; the code cache requested the GC                                     | `-Xlog:codecache=info` `Triggering threshold … GC` lines; rate of `jdk.Compilation`; `unloading-and-gc.md`                |
| GC log: `(CodeCache GC Aggressive)`                                                                                               | Under 10% free in aggregate                                                                                | `Compiler.codecache` totals; expect `stopped_count` to follow if it persists                                              |
| CPU up, no load change, dashboard "Code Cache" at ~70%                                                                            | One heap pinned at 100%, other absorbing the spill; or compiler stopped and restarted repeatedly           | Per-heap series; `stopped_count`/`restarted_count` delta between two samples                                              |
| Per-heap `used` oscillating by tens of MB with the compiler never disabled                                                        | Cold-code flushing and recompilation (thrashing): total too small for the working set of code              | `Allocation rate … cold gc count` log lines; `jdk.JITRestart` events; `jstat -compiler` `Compiled` slope                  |
| `java.lang.OutOfMemoryError: Out of space in CodeCache for adapters` in an application thread                                     | `non-nmethods` full and `non-profiled` unable to absorb the spill                                          | `Compiler.codecache` `non-nmethods` line; `adapters=` count; `CICompilerCount` versus `NonNMethodCodeHeapSize`            |
| `… Out of space in CodeCache for method handle intrinsic`                                                                         | Same heap, minted by `MethodHandle` / `invokedynamic` traffic (`systemDictionary.cpp`)                     | Same; count of `LambdaForm` / `Invokers` blobs in `Compiler.CodeHeap_Analytics MethodNames`                               |
| `Compilation: disabled` for minutes, `restarted_count=0`                                                                          | `-XX:-UseCodeCacheFlushing`, or nothing freeable (all code live or pinned by frames)                       | `jcmd <pid> VM.flags`; `CodeHeap_Analytics` `not entrant` versus `Alive` space                                            |
| Long-running service degrades, cache "not full", `free` in the tens of MB                                                         | External fragmentation: no free block large enough for a big C2 method                                     | `CodeHeap_Analytics FreeSpace` — largest free block versus the size of the methods now failing (`jdk.CompilationFailure`) |
| Allocation failing only for one large method                                                                                      | Same, or the method exceeds what any block can hold                                                        | `PrintCompilation` size column; `jdk.CompilationFailure.failureMessage`                                                   |
| Heap fine, `ReservedCodeCacheSize` large, `used` high, no warnings, latency creeping                                              | Not a code cache problem. Look at `deoptimization` churn and tier residency before touching the cache      | `jdk.Deoptimization`; `Invalid` in `jstat -compiler`                                                                      |

## jstat -compiler

```bash
jstat -compiler <pid>
```

```
Compiled Failed Invalid   Time   FailedType FailedMethod
    6431      7       2    18.42          1  java.util.regex.Pattern compile
```

| Column                        | Counter (`jstat_options`)                  | Meaning                                                                                                                                         |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Compiled`                    | `sun.ci.totalCompiles`                     | Compilation tasks completed successfully since process start                                                                                    |
| `Failed`                      | `sun.ci.totalBailouts`                     | Compilations the compiler abandoned without producing code — method too large, an unsupported construct for that tier, or an internal heuristic |
| `Invalid`                     | `sun.ci.totalInvalidates`                  | Compilations invalidated after the fact — the second-order effect of deoptimisation                                                             |
| `Time`                        | `java.ci.totalTime / sun.os.hrt.frequency` | Cumulative seconds spent compiling                                                                                                              |
| `FailedType` / `FailedMethod` | `sun.ci.lastFailedType` / `…Method`        | Tier and identity of the last bailout                                                                                                           |

The column is labelled `Failed`, and material calling it `Bailout` is quoting the counter
name, not the tool. A steadily rising `Failed` with a constant `FailedMethod` means that method
is repeatedly submitted and abandoned before producing code. It is not deoptimisation (that
would be `Invalid`) and it is not code cache pressure — a bailout allocates nothing in the
CodeHeap. The method stays interpreted for that tier, burning interpreter CPU, which is the
lead to follow. The same counters are in JFR as `jdk.CompilerStatistics` (`compileCount`,
`bailoutCount`, `invalidatedCount`, `nmethodsSize`, `nmethodCodeSize`).

## Compiler.CodeHeap_Analytics

`Compiler.codecache` reports totals. `Compiler.CodeHeap_Analytics` reports what is _in_ each
heap, and is the only tool that answers "is there a free block large enough". It holds
`CodeCache_lock` during the aggregate step — sub-second normally, but it is a real pause for
compiler threads, so sample it, do not poll it.

```bash
jcmd <pid> help Compiler.CodeHeap_Analytics
# Syntax : Compiler.CodeHeap_Analytics  [<function>] [<granularity>]
# function : aggregate, UsedSpace, FreeSpace, MethodCount, MethodSpace, MethodAge,
#            MethodNames, discard  (STRING, default "all")
# granularity : smaller value -> more detail (INT, default 4096)

jcmd <pid> Compiler.CodeHeap_Analytics aggregate     # take the snapshot (holds the lock)
jcmd <pid> Compiler.CodeHeap_Analytics FreeSpace     # print from the snapshot
jcmd <pid> Compiler.CodeHeap_Analytics discard       # release the C-heap the snapshot uses
```

Every print function except `all` needs a prior `aggregate` in the same JVM, otherwise it
answers `No aggregated data available for heap … Run function aggregate first.` `all` does
both and prints everything — 1,500+ lines for an idle JVM, far more for a loaded one; redirect
it to a file.

What each section gives, per heap:

- **Global CodeHeap statistics** — `freeSpace`, `usedSpace`, `Tier1 Space`/`Tier2 Space` (the
  tool's names for C1 and C2 code), `Alive Space`, `not entrant`, `stubSpace`, each with a
  block count and a percentage of capacity. `not entrant` space that is large and stable is
  code waiting for a GC that has not come.
- **Free blocks** — `Free space in CodeHeap '…' is distributed over N free blocks`, the
  **List of all Free Blocks** with each size, and the **Top Ten Free Blocks**. The first entry
  of the top ten _is_ the largest contiguous free block. **Top Ten Free-Occupied-Free
  Triples** shows which occupied gaps, if freed, would coalesce into a large block — the
  tool's own estimate of what unloading could recover.
- **Largest Used Blocks** — the biggest nmethods by name, which is where to look when one
  huge C2 method (a generated dispatcher, a giant `switch`) is what keeps failing to fit.
- **Space usage & fragmentation** — a granule map of the heap, where a scattered pattern of
  `not entrant` and free granules is fragmentation made visible.
- **Method age by CompileID** — relative age from compilation id (no timestamps exist);
  a heap full of young code is churn, a heap full of old code is a large working set.
- **Method names** — every nmethod with its tier and state, for counting `LambdaForm`,
  proxy, or generated-class methods when class generation is the suspected factory.

The same report prints automatically at exit, and on the first full condition per heap, with
`-XX:+UnlockDiagnosticVMOptions -XX:+PrintCodeHeapAnalytics`.

## Logging

```bash
java -Xlog:codecache=info,gc:file=cc.log:time,uptime -jar app.jar

# The source of truth for tags on your build
java -Xlog:help 2>&1 | grep -o codecache
```

Lines worth knowing by sight on 25 (all reproduced):

| Line                                                                                     | Meaning                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ReservedCodeCache size 245760K changed to total segments size NonNMethod 7488K …`       | Startup ergonomics adjusted the total to fit the heaps (info) |
| `Triggering threshold (T%) GC due to allocating A% since last unloading (…)`             | Code cache requested a GC                                     |
| `Triggering aggressive GC due to having only N% free memory`                             | Under `StartAggressiveSweepingAt`                             |
| `Allocation rate: … cold gc count: N …`                                                  | Cold heuristic recalculated at an unloading                   |
| `Unknown code cache pressure; don't age code` / `No code cache pressure; don't age code` | First unloading, or nothing allocated since the last one      |
| `Code cache critically low; use aggressive aging`                                        | `cold_gc_count` forced to 2                                   |
| `Code cache is full - disabling compilation`                                             | `handle_full_code_cache` stopped the compiler                 |
| `CodeHeap '…' is full. Compiler has been disabled.` (warning level)                      | Printed once per heap; the next line names the flag to raise  |
| `Restarting compiler`                                                                    | A GC freed memory; `jdk.JITRestart` committed                 |

`-Xlog:codecache=debug` adds a three-line per-heap dump after **every** compilation under the
`compilation,codecache` tags — unusable in production, useful for a ten-second capture.

## JFR events

Confirmed against `jfr metadata` on 25.0.3:

| Event                        | Default period (`default.jfc`) | Use                                                                                                                                                                                   |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jdk.CodeCacheStatistics`    | `everyChunk`                   | One sample per heap (`codeBlobType`, `unallocatedCapacity`, `entryCount`, `methodCount`, `adaptorCount`, `fullCount`) per chunk — a coarse series unless the period is set explicitly |
| `jdk.CodeCacheFull`          | on full                        | Fires when a heap is full **after** the fallback failed; `codeBlobType` names the heap originally requested, `fullCount` how many times                                               |
| `jdk.CodeCacheConfiguration` | `beginChunk`                   | The sizes the JVM settled on: `reservedSize`, `nonNMethodSize`, `profiledSize`, `nonProfiledSize`, `expansionSize`, `minBlockLength` — `profiledSize = 0` means unsegmented           |
| `jdk.JITRestart`             | on restart                     | `freedMemory`, `codeCacheMaxCapacity` — the compiler came back after a full condition                                                                                                 |
| `jdk.CompilerStatistics`     | periodic                       | `bailoutCount`, `invalidatedCount`, `nmethodsSize`, `nmethodCodeSize` — the `jstat -compiler` columns as a series                                                                     |
| `jdk.CompilationFailure`     | per failure                    | `failureMessage`, `compileId` — what the compiler said when a method did not fit or bailed out                                                                                        |
| `jdk.Compilation`            | per compilation                | Tier and size per method; correlates CPU peaks with the tier being compiled and predicts the heap                                                                                     |

```bash
jcmd <pid> JFR.start settings=profile duration=300s filename=codecache.jfr
jfr print --events jdk.CodeCacheStatistics,jdk.CodeCacheFull,jdk.CodeCacheConfiguration,jdk.JITRestart codecache.jfr
```

For a real time series, set `jdk.CodeCacheStatistics#period=10 s` in a custom `.jfc` — the
default `everyChunk` is one sample per chunk rotation.

## Continuous metrics

```
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'profiled nmethods'"}
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'non-profiled nmethods'"}
jvm_memory_used_bytes{area="nonheap", id="CodeHeap 'non-nmethods'"}
jvm_memory_max_bytes{area="nonheap",  id="CodeHeap 'profiled nmethods'"}
```

Micrometer and standard JMX already split these by `CodeHeap`. The granularity arrives free in
any Spring Boot Actuator stack; the failure is a dashboard summing the three series into one
"Code Cache total" line and discarding it. Alert on `used / max` per heap, and separately on
the GC cause counter for `CodeCache GC Threshold` if the collector exposes causes.

## The adapter OutOfMemoryError

The `non-nmethods` heap does not fail like the other two. Adapters are created when a method
is linked (`Method::make_adapters`); when the heap is full and the spill into `non-profiled`
fails, the linking thread throws `java.lang.OutOfMemoryError: Out of space in CodeCache for
adapters` — during initialisation it is `vm_exit_during_initialization` with the same text.
`MethodHandle` intrinsics fail the same way with `… for method handle intrinsic`
(`systemDictionary.cpp`). The stack trace points at whatever class was being loaded, which is
rarely the culprit. Because the exception is thrown into application code it can be caught,
logged as a generic failure and retried — the process limps on with a compiler that has also
been disabled. Treat any `Out of space in CodeCache` text as a code cache incident regardless
of the exception class or where it surfaced.

## Internal versus external fragmentation

Every allocation occupies a whole number of allocation segments. On 25.0.3 the segment is
128 bytes (`CodeCacheSegmentSize`, a `pd experimental` flag: it appears only under
`-XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal`, and `CodeHeap_Analytics` prints it as
`CodeHeap allocation segment size is 128 bytes`). A block is at least
`CodeCacheMinBlockLength` (6, `diagnostic`) segments, so no nmethod occupies fewer than 768
bytes.

|                                 | Internal                                                                     | External                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Where the waste lives           | Inside an allocated block, between the code and the rounded segment boundary | Between allocated blocks, in non-contiguous free gaps                                                                                 |
| Cause                           | Allocation always rounds up                                                  | Variable-sized blocks freed in an order unrelated to size                                                                             |
| Visible in `Compiler.codecache` | No — it adds to `used`                                                       | No — it adds to `free`, and the command never reports the largest contiguous block                                                    |
| Visible in `CodeHeap_Analytics` | Indirectly, via block counts per size range                                  | Yes — `Top Ten Free Blocks` and the fragmentation granule map                                                                         |
| Grows with                      | Number of small allocations (many trivial methods)                           | Repeated compile / deoptimise / unload cycles over time                                                                               |
| Mitigation                      | Little; it is the fixed cost of block allocation                             | Generous `ReservedCodeCacheSize`; keep short-lived code out of `non-profiled` (no spill); in the worst churn cases, scheduled restart |

```
CodeHeap 'non-profiled nmethods'

[ nmethod A ][ FREE 12 ][ nmethod B ][ FREE 3 ][ nmethod C ][ FREE 40 ]
   40 seg                  55 seg                 20 seg

aggregate free       = 12 + 3 + 40 = 55 segments
largest contiguous   = 40 segments

An allocation of 45 segments FAILS: not for lack of aggregate space, but
because no single block reaches 45. Compiler.codecache reports free=55 and
cannot distinguish this from one contiguous 55-segment block.
CodeHeap_Analytics FreeSpace lists three blocks and names the 40 as Pos 1.
```

The allocator coalesces adjacent free blocks when it can, which mitigates but does not
eliminate this, since the order of freeing rarely puts free neighbours side by side. A heap
that receives 10,000 allocations and frees none does not fragment; it simply fills. The
profiled/non-profiled split exists because tier-3 code lives seconds and tier-4 code lives
hours — mixing them is what fragments, which is why the allocation fallback, once it starts,
is the beginning of the problem rather than a graceful degradation.

## Triage checklist

- [ ] All three `CodeHeap` lines read, plus the `Compilation:` line with `stopped_count` and
      `restarted_count`
- [ ] Segmentation confirmed on (three named heaps), or the 240 MB ergonomic cut-off
      recognised
- [ ] GC log searched for `CodeCache GC Threshold` / `CodeCache GC Aggressive`, and the
      collector's cost of each noted (Full GC on Serial/Parallel)
- [ ] `jstat -compiler` recorded as part of the incident baseline (`Failed`, `Invalid`)
- [ ] Sampled at three points 30-60s apart, to separate stable exhaustion from thrashing and
      to see one heap spilling into the other
- [ ] Tier mix cross-referenced from `PrintCompilation` or `jdk.Compilation`
- [ ] Deoptimisation events cross-referenced when `non-profiled` is the pressured segment
- [ ] `Compiler.CodeHeap_Analytics aggregate` + `FreeSpace` taken once when fragmentation is
      suspected — the largest free block versus the failing method's size
- [ ] Any `Out of space in CodeCache` exception text found in application logs treated as the
      same incident
- [ ] Any manual segment sizing checked to sum exactly to an explicit `ReservedCodeCacheSize`
      before deploy — or the total left implicit on purpose, and the ergonomic result read from
      `jdk.CodeCacheConfiguration`
- [ ] After the fix: pressured segment stable under ~80% at the same load, no `CodeCache GC`
      causes, and `Compilation:` still `enabled` across a sustained window
- [ ] If the fix was a restart, recorded explicitly as fragmentation mitigation, not a cure
