# The tiered compilation model

The retained lab observations below were recorded with `-XX:+PrintFlagsFinal` and
`-XX:+PrintCompilation` on Temurin 25.0.3. Their timings/counts are fixture-specific historical
observations, not current application measurements. Fresh-process defaults do not describe an
already-running service. Confirm the
numbers, event settings, compiler selection, and transitions on the target runtime; both policy
details and values are HotSpot implementation behavior and can change across updates/vendors.

The policy lives in `src/hotspot/share/compiler/compilationPolicy.cpp`; the thread pool in
`compileBroker.cpp`; the flags and their one-line descriptions in `compiler_globals.hpp`.

## Five levels, four real transitions

| Level | Code                  | Profile collected             | Role                                                                      |
| ----- | --------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| 0     | Template interpreter  | counters, then types/branches | Normal interpreted entry; native/intrinsic/compiled-entry cases differ    |
| 1     | C1, no profiling      | none                          | Low-overhead terminal code for trivial/C2-ineligible cases in this policy |
| 2     | C1, limited profiling | counters/limited data         | Intermediate route commonly selected under C2 queue pressure              |
| 3     | C1, full profiling    | counters, branches, types     | Stepping stone; pays additional profiling instrumentation                 |
| 4     | C2                    | none                          | Peak code                                                                 |

The transitions that actually occur (`CompilationPolicy::common`):

- **0 → 3 → 4** — the common path. Verified: `JitLab::hot` compiled at tier 3 at 33 ms, at
  tier 4 at 39 ms, then the tier-3 code `made not entrant: not used`.
- **0 → 1** — a method the policy classifies as trivial (`is_trivial`: accessors, constant
  getters, empty methods) or that C2 refuses (`not compilable at level 4`). Tier 1 itself adds
  no profiling instrumentation; interpreter/prior-tier data may exist. A terminal tier 1 can
  be correct rather than a defect.
- **0 → 2 → 3 → 4** — observed when the C2 queue is congested. Tier 2 is C1 with limited profiling, cheap
  to compile and cheap to run; when the queue drains the method is recompiled at tier 3 to
  collect the profile C2 needs. Do not turn “no tier 2 in this idle lab” into an invariant.
- **3 → 1** — when the tier-3 method turns out trivial or C2 bails out; the profiling overhead
  is dropped.

The interpreter does not consult the policy on every call. It notifies every
2^`Tier0InvokeNotifyFreqLog` = 128 invocations and every 2^`Tier0BackedgeNotifyFreqLog` = 1024
back-edges; tier-3 code notifies at its own intervals. Notification makes observed threshold
crossings quantized; exact timing also depends on current level, counters, back edges, scaling,
and policy. In this lab, a loop-free method first triggered the relevant check at 256 calls rather
than exactly the configured 200.

## The thresholds and the predicate

```
-XX:Tier3InvocationThreshold=200      -XX:Tier4InvocationThreshold=5000
-XX:Tier3MinInvocationThreshold=100   -XX:Tier4MinInvocationThreshold=600
-XX:Tier3CompileThreshold=2000        -XX:Tier4CompileThreshold=15000
-XX:Tier3BackEdgeThreshold=60000      -XX:Tier4BackEdgeThreshold=40000   # OSR
-XX:CompileThresholdScaling=1.0       -XX:TieredStopAtLevel=4
```

With `i` invocations and `b` back-edges, promotion from the current level happens when
(`call_predicate_helper`):

```
i >= InvocationThreshold * s
  or (i >= MinInvocationThreshold * s and i + b >= CompileThreshold * s)
```

and OSR when `b >= BackEdgeThreshold * s` (`loop_predicate_helper`). `s` is a scale factor,
1.0 on an idle JVM. Two things move it:

- **`CompileThresholdScaling`** scales policy thresholds — `0.5` lowers them and `2.0` raises
  them. Per method, `-XX:CompileCommand=CompileThresholdScaling,Class::method,0.1` scopes the
  factor. It is a causal experiment or exceptional workaround, not the default remedy for CPU
  starvation, queueing, unstable profiles, or a short process lifetime.
- **Load feedback.** `threshold_scale` multiplies by `1 + queue_length / (TierNLoadFeedback ×
compiler_threads_for_that_tier)`, with `Tier3LoadFeedback=5` and `Tier4LoadFeedback=3`. A
  congested queue raises the bar instead of growing without bound, which is why a method's
  counters can be "over the threshold" during a start-up burst and still not compile.

In default full C1/C2 tiering, `-XX:CompileThreshold` (`10000`) does not control eligibility.
JDK 25's `CompilerConfig::set_legacy_emulation_flags` also honors it in single-compiler modes,
including `TieredStopAtLevel=1` even while `TieredCompilation=true`, and non-tiered mode.
The setting can change effective tier thresholds without proving a workload improvement;
inspect the selected mode and actual policy values before diagnosing an ineffective flag.

### Tier 2 and `Tier3DelayOn`

When the C2 queue holds more than `Tier3DelayOn=5` tasks per C2 thread, new tier-3 candidates
are compiled at tier 2 instead (`is_method_profiled` / `CompilationPolicy::common`), and the
normal path resumes below `Tier3DelayOff=2`. Reproduced two ways on Temurin 25.0.3:

- `-XX:Tier3DelayOn=0 -XX:CICompilerCount=2` on a three-method program: `JitLab::hot` compiled
  at tier 2.
- A 4000-method class under `-XX:ActiveProcessorCount=1` (one C2 thread): **4258 tier-2
  lines**; the same class on 24 CPUs: **zero**.

The second reproduces one production-relevant mechanism: a small pod can have one C2 thread while
a framework startup queues many methods, routing more work through tier 2 and competing with
application threads for quota. Confirm queue, throttling, and compile counts on the service; other
startup costs can produce the same symptom.

`TieredCompileTaskTimeout=50` participates in stale-task pruning. On this source baseline,
eligible tasks can be removed when invocation/back-edge progress has stopped and the elapsed
checks, including time since the last safepoint, permit it. Eligibility and old-method guards
also apply; this is not a universal 50 ms queue deadline or a check of invocations alone.

## Modes: `TieredStopAtLevel`, `CompilationMode`, `-Xcomp`, `-Xint`

| Setting                          | Tiers seen in the log          | Side effects verified on 25.0.3                                                                          |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| default                          | 1, 2, 3, 4                     | `ReservedCodeCacheSize` 240 MB, segmented                                                                |
| `-XX:TieredStopAtLevel=1`        | 1 only                         | `ReservedCodeCacheSize` **48 MB**, not segmented; no profiling or C2; assess startup and sustained costs |
| `-XX:CompilationMode=quick-only` | 1 only                         | Same as above, the JDK 25 spelling                                                                       |
| `-XX:CompilationMode=high-only`  | 4 only                         | C2 straight from the interpreter, tier column kept                                                       |
| `-XX:-TieredCompilation`         | column absent                  | C2 only, `CompileThreshold=10000` honoured, `ReservedCodeCacheSize` **48 MB**, not segmented             |
| `-Xcomp`                         | 3 then 4, flag `b` in this lab | blocking policy for reached compilable methods; effective flags shown on this build                      |
| `-Xint`                          | nothing                        | `UseCompiler=false`; an interpreter-only control                                                         |

Two of those rows change decisions:

- **Turning tiered compilation off, or stopping at level 1, can change the ergonomic cache to 48 MB.**
  A service that adds `-XX:-TieredCompilation` "to get C2 faster" and later reports
  `CodeCache is full` may have hit changed ergonomics; investigate growth too. Set `ReservedCodeCacheSize`
  explicitly only when headroom, reproducibility or the memory contract requires it; retain
  adequate ergonomic sizing otherwise.
- **`-Xcomp` is not simply “C2 without profile”—it requests blocking compilation.** Reached,
  compilable methods in this lab were compiled at tier 3 and then tier 4. The requesting
  application thread waits for the compiler task; the compiler thread performs compilation
  (`b` in the flags column denotes blocking). Start-up can be dominated by compile elapsed time,
  and the tier-4 code is built from a profile that saw a handful of calls. It is a testing
  mode for compiler bugs, not a warm-up strategy.

`TieredStopAtLevel=1` can fit a short-lived or
CPU-starved process (a CLI, a build step, a batch job on a fraction of a core) that may
finish before benefiting from tier 4. It is also a controlled way to isolate C1 from C2.
Compare the startup, complete-run cost and sustained performance that the actual lifecycle
requires; do not assume either faster startup or a fixed peak penalty from the mode alone.

## Compiler threads

On the examined build, `CICompilerCount` is ergonomic (`CICompilerCountPerCPU=true`) using a
logarithmic function of active processors, then split between C1 and C2 with at least one of each.
Treat the exact source formula as policy, not a sizing contract. Verified values:

| Active processors | `CICompilerCount` | C1 threads | C2 threads |
| ----------------- | ----------------- | ---------- | ---------- |
| 1, 2, 3           | 2                 | 1          | 1          |
| 4                 | 3                 | 1          | 2          |
| 8                 | 4                 | 1          | 3          |
| 24                | 12                | 4          | 8          |

`-XX:CICompilerCount=1` in the default full C1/C2 mode refuses to start. Single-compiler
modes differ: both `-XX:-TieredCompilation` and `-XX:TieredStopAtLevel=1` accept one thread
on the examined JDK 25 runtime.

The count is a **cap**, not a head-count. Since JDK 11 (`UseDynamicNumberOfCompilerThreads`,
JDK-8198756) the JVM starts one C1 and one C2 thread and adds more while a queue is long
enough to justify it, then retires them after a short idle period. Verified with
`-Xlog:jit+thread=debug` during a 4000-method burst on 24 CPUs:

```
[0.024s][debug][jit,thread] Added initial compiler thread C2 CompilerThread0
[0.024s][debug][jit,thread] Added initial compiler thread C1 CompilerThread0
[1.571s][debug][jit,thread] Added compiler thread C2 CompilerThread5 (free memory: 11176MB, available non-profiled code cache: 116MB)
[2.250s][debug][jit,thread] Removing compiler thread C2 CompilerThread7 after 285 ms idle time
[4.973s][debug][jit,thread] Removing compiler thread C2 CompilerThread1 after 719 ms idle time
```

The two values in the "Added" line are the gates: `possibly_add_compiler_threads` in
`compileBroker.cpp` adds a thread only if the queue is long enough, its free-memory heuristic allows it, and
the target code heap has room. A memory-tight container therefore runs fewer compiler threads
than `CICompilerCount` promises, and `jdk.CompilerConfiguration.threadCount` reports the cap,
not the live count; `jdk.CompilerQueueUtilization.compilerThreadCount` reports the live one.

`BackgroundCompilation=true` normally lets the requesting thread continue interpreted or at a
lower tier while compilation is queued. The application can still pay CPU, memory, code-cache,
and scheduling contention even without synchronously waiting for that compile.

### What compilation costs

`-XX:+CITime` (product) prints compilation timing at exit; on the recorded 4000-method class
under one processor: `Total compilation time: 0.833 s`, `C1 0.101 s`, `C2 0.721 s`. C2 is
the larger elapsed component in that fixture. These are elapsed compilation durations,
not thread CPU time: scheduling/throttling delays contribute, and concurrent tasks overlap.
`jdk.CompilerStatistics.totalTimeSpent` and `peakTimeSpent` use those compiler timers.
Measure compiler-thread/process CPU separately before converting them into quota cost.

Compiler working memory varies by concurrent task and method/graph complexity, so both task size
and live compiler-thread count matter. Measure with
`-XX:CompileCommand=MemStat,*.*,collect` and `jcmd <pid> Compiler.memory` (verified: a
per-compilation table with `total`, `ra`, `node`, `comp`, `type`, `reglive` and the peak in
bytes); the NMT categories are `Compiler` and `Arena Chunk`. This memory sits outside `-Xmx`
and inside the container limit.

## On-stack replacement

A method entered once and looping for minutes never crosses an invocation threshold. OSR
compiles the loop body and jumps into it mid-execution once back-edges pass
`Tier3BackEdgeThreshold=60000` (tier 3) or `Tier4BackEdgeThreshold=40000` (tier 4); the
`%` flag and the `@ bci` mark the OSR entry:

```
    56   20 %     3       JitLab::main @ 21 (124 bytes)
    68   22 %     4       JitLab::main @ 21 (124 bytes)
    74   20 %     3       JitLab::main @ 21 (124 bytes)   made not entrant: OSR invalidation of lower level
  3032   22 %     4       JitLab::main @ 21 (124 bytes)   made not entrant: uncommon trap
```

Three consequences:

- An OSR nmethod is a separate compilation for one loop entry. It does not make the **next
  invocation** of the method fast — that needs the normal compilation, which for `main` may
  never happen.
- In this lab, the `uncommon trap` on exit occurred because the compiled OSR path had not seen
  that exit. Do not generalize every OSR invalidation or loop exit to that cause; inspect reason,
  action, BCI, rate, and successor compilation.
- A warm-up loop in `main` can compile both its OSR body and invoked methods, including
  inlined code. That does not prove the real request entry/call-site profiles are warm;
  train through representative entry points and verify their compilations.

`-XX:-UseOnStackReplacement` is mainly a diagnostic/compiler experiment. Disabling OSR can leave
long-running loops interpreted and should not be routine tuning.

## Reading the basics in `-XX:+PrintCompilation`

```
    32   13       3       JitLab::small (4 bytes)
    32   15       4       JitLab::small (4 bytes)
    33   13       3       JitLab::small (4 bytes)   made not entrant: not used
    20    8     n 0       jdk.internal.misc.Unsafe::getReferenceVolatile (native)
```

Timestamp in ms since start, compile id, flags (`%` OSR, `b` blocking, `n` native wrapper,
`s` synchronized, `!` has exception handlers), **tier**, method with bytecode size, and an
optional status. In the shown sequence, `made not entrant: not used` retires lower-tier code
after its replacement. The reason is not unique to tier-up; inspect successor compile IDs,
tiers and method identity before inferring the transition or a performance problem. The same lines reach a file
through unified logging on 25.0.3 — `-Xlog:jit+compilation=info:file=jit.log` — with
timestamps and rotation. Column semantics, filtering and `PrintInlining` are
`compilation-and-inlining-logs`; recurring `uncommon trap` is `deoptimization`; why a method
stayed at tier 3 after reaching tier 4's counters is `c2-sea-of-nodes`.

## JFR: which event answers which question

| Event                          | `default.jfc`         | `profile.jfc` | What it is for                                                                                                           |
| ------------------------------ | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `jdk.CompilerStatistics`       | every 1 s             | every 1 s     | Cumulative compiler activity on this build; one component of the warm-up curve                                           |
| `jdk.CompilerQueueUtilization` | every 10 s            | every 5 s     | Per compiler (`c1`/`c2`): `queueSize`, `peakQueueSize`, `addedRate`, `compilerThreadCount` — congestion and live threads |
| `jdk.Compilation`              | **threshold 1000 ms** | 100 ms        | One event per compilation **slower than the threshold** — almost none in a normal run                                    |
| `jdk.CompilationFailure`       | off                   | on            | Bailouts, with the reason                                                                                                |
| `jdk.CompilerConfiguration`    | once                  | once          | `threadCount` (the cap), `tieredCompilation`, `dynamicCompilerThreadCount`                                               |
| `jdk.CodeCacheConfiguration`   | once                  | once          | Reserved size and the three heap sizes                                                                                   |
| `jdk.CodeCacheStatistics`      | every chunk           | every chunk   | Per heap: `unallocatedCapacity`, `fullCount` — cumulative, survives a missed `CodeCacheFull`                             |
| `jdk.CodeCacheFull`            | on                    | on            | Fires at the moment of exhaustion — only if the recording was already running                                            |
| `jdk.Deoptimization`           | on                    | on            | `deoptimization`'s subject                                                                                               |

The table reflects Temurin 25.0.3's shipped configurations; inspect the target `.jfc`. A common
trap is `jdk.Compilation`: a 20-second `profile` recording of a program that compiled
1542 methods held **zero** `jdk.Compilation` events, because none took 100 ms. Counting them
as "compilations" reports a JVM that never compiles anything. Read the rate from
`jdk.CompilerStatistics` deltas instead:

```bash
jfr print --events jdk.CompilerStatistics rec.jfr | grep -E 'startTime|compileCount'
jfr view compiler-statistics rec.jfr        # last cumulative snapshot, not interval totals
jfr view longest-compilations rec.jfr       # only what crossed the jdk.Compilation threshold
```

On this JDK 25 baseline, the `compiler-statistics` view uses `LAST(...)` over the cumulative
VM counters. A recording started after warm-up can therefore show compilations that happened
before recording began. For interval activity, subtract two `compileCount` samples from the
same JVM and divide by their timestamp difference. For example, 42000 at 12:00:10 and 42030 at
12:00:15 means 30 compilations over those 5 seconds (6/s), not 42030 during the recording.
This is illustrative arithmetic, not a service measurement.

Report the sample-covered interval; without samples at the recording boundaries, its edge
activity is unknown. Fewer than two timed samples cannot establish a rate or zero activity.
The same delta approach applies to cumulative `totalTimeSpent`, whose result is summed elapsed
compilation duration, not CPU time. `peakTimeSpent` is a lifetime maximum; subtracting maxima
does not recover the longest compilation in the interval. Use recorded `jdk.Compilation`
durations for that question, with their threshold/coverage limitation.

`jcmd <pid> Compiler.queue` prints `Current compiles`, `C1 compile queue` and `C2 compile
queue` with `Empty` or one line per task; `jstat -compiler <pid>` prints `Compiled Failed
Invalid Time FailedType FailedMethod` (the column is `Failed` on 25.0.3).

## Small containers and autoscaled fleets

The JVM sizes the compiler from active processors, subject to affinity/cpuset, quota and
explicit overrides. A CPU request alone no longer supplies the former CPU-shares count
on the examined modern HotSpot line; without a limit the process may see many host CPUs,
but not necessarily every CPU. Read the actual detection and effective compiler cap.
`container-awareness` owns the detection; what follows is what the JIT does with the result.

| Pod shape              | Compiler threads | What happens at start-up                                                                                               |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `limits: cpu: 1`       | 1 C1 + 1 C2      | Compilers and application share quota; congestion/tier2/throttling are workload-dependent; inspect actual quota period |
| `limits: cpu: 2`       | 1 C1 + 1 C2      | More aggregate CPU budget, not a dedicated second core for the application                                             |
| `limits: cpu: 4`       | 1 C1 + 2 C2      | Higher compiler cap may help; no guarantee it drains a framework startup queue                                         |
| request only, no limit | up to the cap    | Potentially more parallelism; shared-node contention can still dominate                                                |

Decisions that follow:

- **Raising `CICompilerCount` does not add CPU quota.** More compiler threads on a constrained core
  can increase contention without draining work faster. Compare startup CPU limits, throttling,
  queue depth, request latency, and node capacity; “remove the limit” is not universally safe.
  `-XX:ActiveProcessorCount=n` intentionally overrides ergonomics and needs a measured reason.
- **CPU autoscaling can mistake cold-JVM work for durable demand.** Whether this creates a
  cold-start cascade depends on HPA target/window, load-balancer slow start, rollout shape, request
  rate, readiness, and warm capacity. Evaluate request/concurrency/custom signals and stabilization
  policy rather than replacing CPU with another signal dogmatically.
- **Per-instance invocation rate is the warm-up clock.** `warmup-and-cold-start.md` has the
  arithmetic; the fleet-level corollary is that a rollout replacing many pods at once divides
  the traffic that would have warmed each of them, and a load balancer without slow-start
  can send a cold pod the same share as a warm one from its first second; verify the routing policy.
- **The AOT cache preserves profiles, not application machine code on JDK 25.** JEP 515 profiles let C2
  start on hot methods without waiting for tier-3 statistics; the compilations themselves
  still consume the available compiler resources under the same quota. Verify cache use and
  compare the actual service curve; replay alone does not prove a shorter one —
  `startup-cds-crac-leyden` owns the mechanism.

## Symptom to cause

| Symptom                                                                                  | First hypothesis                                  | Confirm with                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| p99 bad for minutes after deploy, then converges                                         | Warm-up                                           | `jdk.CompilerStatistics.compileCount` slope flattens as latency converges                             |
| Low-traffic service never converges                                                      | Invocation rate below the ladder                  | Hot path still at tier 3 in `PrintCompilation`; compute invocations / rate                            |
| Tier 2 lines in the log, or many methods sitting at 2/3 during start-up                  | C2 queue/policy pressure is a candidate           | queue utilization, live compiler threads, throttling, failures/directives, code cache                 |
| Same image warms up far slower in a 1-2 CPU pod than on a workstation                    | Compiler resources plus CPU throttling            | Actual process mode, compiler cap/live threads and cgroup throttling; fresh defaults are insufficient |
| Warm-up got worse after adding replicas or after an HPA scale-out                        | Per-instance rate diluted; cold-start cascade     | Request rate per pod against the warm baseline; HPA events during the deploy                          |
| `CodeCache is full` after switching to `-XX:-TieredCompilation` or `TieredStopAtLevel=1` | Ergonomic 48 MB code cache                        | `jcmd Compiler.codecache`: `size=49152Kb`                                                             |
| Periodic young GCs tagged `CodeCache GC Threshold`, CPU up, no load change               | Code cache thrashing under `UseCodeCacheFlushing` | `-Xlog:gc` cause; `-Xlog:codecache=info` "Triggering threshold GC"; `code-cache.md`                   |
| Degraded until restart                                                                   | Code-cache/compiler state is one candidate        | compilation stop/restart and full counts; compare GC, host, load and dependencies                     |
| A threshold flag "changed nothing"                                                       | Legacy threshold ignored in default full tiering  | Actual mode and effective thresholds; C1-only/non-tiered legacy behavior differs                      |
| Start-up several times slower after a flag change                                        | `-Xcomp` (blocking compilation)                   | `b` in the flags column of every line                                                                 |
| JFR shows no `jdk.Compilation` events                                                    | Threshold 1000 ms (default) or 100 ms (profile)   | `jdk.CompilerStatistics` has the counts                                                               |
| Cache full but `jdk.CodeCacheFull` absent from the recording                             | Exhaustion preceded the recording                 | `jdk.CodeCacheStatistics.fullCount`, `Compiler.codecache full_count`                                  |
| Same method `made not entrant: uncommon trap` again and again                            | Unstable speculation                              | `deoptimization` — not a threshold problem                                                            |
| AOT cache adopted, warm-up still long                                                    | Remaining compilation or application startup work | cache replay evidence, elapsed compilation, measured compiler CPU and application initialization      |

## Primary references

- [HotSpot 25.0.3 compilation policy](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compilationPolicy.cpp)
- [HotSpot 25.0.3 mode and threshold initialization](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compilerDefinitions.cpp)
- [HotSpot 25 compile broker: waiting and elapsed timers](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compileBroker.cpp)
- [JDK 25.0.3 JFR compiler-statistics view definition](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini)
- [HotSpot 25.0.3 periodic compiler counters](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/jfr/periodic/jfrPeriodic.cpp)
- [JDK 25 `java` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JDK 25 `jcmd` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
