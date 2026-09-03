# The tiered compilation model

Every default below was read off `java -XX:+PrintFlagsFinal -version` on Temurin 25.0.3, and
every transition shown was reproduced with `-XX:+PrintCompilation` on the same build. Confirm the
numbers, event settings, compiler selection, and transitions on the target runtime; both policy
details and values are HotSpot implementation behavior and can change across updates/vendors.

The policy lives in `src/hotspot/share/compiler/compilationPolicy.cpp`; the thread pool in
`compileBroker.cpp`; the flags and their one-line descriptions in `compiler_globals.hpp`.

## Five levels, four real transitions

| Level | Code                  | Profile collected             | Role                                                                      |
| ----- | --------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| 0     | Template interpreter  | counters, then types/branches | Entry point for every method                                              |
| 1     | C1, no profiling      | none                          | Low-overhead terminal code for trivial/C2-ineligible cases in this policy |
| 2     | C1, limited profiling | counters/limited data         | Intermediate route commonly selected under C2 queue pressure              |
| 3     | C1, full profiling    | counters, branches, types     | Stepping stone; pays additional profiling instrumentation                 |
| 4     | C2                    | none                          | Peak code                                                                 |

The transitions that actually occur (`CompilationPolicy::common`):

- **0 → 3 → 4** — the common path. Verified: `JitLab::hot` compiled at tier 3 at 33 ms, at
  tier 4 at 39 ms, then the tier-3 code `made not entrant: not used`.
- **0 → 1** — a method the policy classifies as trivial (`is_trivial`: accessors, constant
  getters, empty methods) or that C2 refuses (`not compilable at level 4`). No profile is ever
  collected, and the method never appears at tier 4. Correct, not a defect.
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

`-XX:CompileThreshold` (`10000`) is honoured only under `-XX:-TieredCompilation`. Under the
default it is accepted and has no effect — verified: the value is present in `PrintFlagsFinal`
and nothing changes. A runbook that raises it under tiered compilation has done nothing.

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

`TieredCompileTaskTimeout=50` prunes the queue: a task whose method was not invoked in the
last 50 ms is dropped rather than compiled, so a burst of once-hot methods does not hold the
compiler threads after the burst ends.

## Modes: `TieredStopAtLevel`, `CompilationMode`, `-Xcomp`, `-Xint`

| Setting                          | Tiers seen in the log          | Side effects verified on 25.0.3                                                                  |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| default                          | 1, 2, 3, 4                     | `ReservedCodeCacheSize` 240 MB, segmented                                                        |
| `-XX:TieredStopAtLevel=1`        | 1 only                         | `ReservedCodeCacheSize` **48 MB**, not segmented; no profiling, no C2 — fast warm-up, lower peak |
| `-XX:CompilationMode=quick-only` | 1 only                         | Same as above, the JDK 25 spelling                                                               |
| `-XX:CompilationMode=high-only`  | 4 only                         | C2 straight from the interpreter, tier column kept                                               |
| `-XX:-TieredCompilation`         | column absent                  | C2 only, `CompileThreshold=10000` honoured, `ReservedCodeCacheSize` **48 MB**, not segmented     |
| `-Xcomp`                         | 3 then 4, flag `b` in this lab | blocking policy for reached compilable methods; effective flags shown on this build              |
| `-Xint`                          | nothing                        | `UseCompiler=false`; the only way to measure the interpreter                                     |

Two of those rows change decisions:

- **Turning tiered compilation off, or stopping at level 1, shrinks the code cache to 48 MB.**
  A service that adds `-XX:-TieredCompilation` "to get C2 faster" and later reports
  `CodeCache is full` has hit the ergonomic default, not a leak. Set `ReservedCodeCacheSize`
  explicitly when changing the mode.
- **`-Xcomp` is not simply “C2 without profile”—it requests blocking compilation.** Reached,
  compilable methods in this lab were compiled at tier 3 and then tier 4, on the calling
  thread, before it runs (`b` in the flags column). Start-up is dominated by compile time,
  and the tier-4 code is built from a profile that saw a handful of calls. It is a testing
  mode for compiler bugs, not a warm-up strategy.

`TieredStopAtLevel=1` can fit a short-lived or
CPU-starved process (a CLI, a build step, a batch job on a fraction of a core) that would
never reach tier 4 anyway, and whose peak throughput does not matter. It is the trade JMH
users make with `-XX:TieredStopAtLevel=1` to isolate C1 from C2, and the trade Maven's daemon
makes for start-up. Measure the peak you give up before shipping it.

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

`-XX:CICompilerCount=1` under tiered compilation refuses to start: `CICompilerCount (1) must
be at least 2`. Under `-XX:-TieredCompilation` a single thread is accepted.

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

`-XX:+CITime` (product) prints at exit what the compilers consumed; on the 4000-method class
under one processor: `Total compilation time: 0.833 s`, `C1 0.101 s`, `C2 0.721 s`. C2 is
where the CPU goes, and where a one-CPU pod's start-up burst competes with the application
threads for the same quota. In production the same numbers are `jdk.CompilerStatistics`
(`totalTimeSpent`, `peakTimeSpent`, every second) — no restart, no flag.

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
- A hand-written "warm-up loop" in `main` warms OSR code for `main`, not the methods a request
  path will call. Warm-up traffic has to go through the real entry points.

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
optional status. The tier column is the one that matters here; `made not entrant: not used`
is the lower tier being retired by the higher one, not a problem. The same lines reach a file
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
jfr view compiler-statistics rec.jfr        # totals for the recording
jfr view longest-compilations rec.jfr       # only what crossed the jdk.Compilation threshold
```

`jcmd <pid> Compiler.queue` prints `Current compiles`, `C1 compile queue` and `C2 compile
queue` with `Empty` or one line per task; `jstat -compiler <pid>` prints `Compiled Failed
Invalid Time FailedType FailedMethod` (the column is `Failed` on 25.0.3).

## Small containers and autoscaled fleets

The JVM sizes the compiler from the CPUs it believes it has. Under a cgroup CPU **limit** the
count is the quota rounded up (JDK-8146115); a CPU **request** alone has not affected the
count since JDK 19 (JDK-8281181, `UseContainerCpuShares` off by default), so a pod with
`requests: cpu: 1` and no limit sees every CPU on the node and starts up to a dozen compiler
threads.
`container-awareness` owns the detection; what follows is what the JIT does with the result.

| Pod shape              | Compiler threads | What happens at start-up                                                                                                                                 |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limits: cpu: 1`       | 1 C1 + 1 C2      | The one C2 thread and the application threads share 100 ms of CPU per 100 ms period; the C2 queue congests, tier 2 appears, throttling stretches warm-up |
| `limits: cpu: 2`       | 1 C1 + 1 C2      | Same thread count; the application gets the second core, but the C2 queue is still single-threaded                                                       |
| `limits: cpu: 4`       | 1 C1 + 2 C2      | The first shape where C2 keeps up with a framework start-up burst                                                                                        |
| request only, no limit | up to the cap    | Fast warm-up, at a start-up CPU spike the scheduler sees as real load                                                                                    |

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
  sends a cold pod the same share as a warm one from its first second.
- **The AOT cache moves the profiling phase, not the compile CPU.** JEP 515 profiles let C2
  start on hot methods without waiting for tier-3 statistics; the compilations themselves
  still run on the same one or two threads under the same quota. Expect a shorter curve, not
  a flat one — `startup-cds-crac-leyden` owns the mechanism.

## Symptom to cause

| Symptom                                                                                  | First hypothesis                                  | Confirm with                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| p99 bad for minutes after deploy, then converges                                         | Warm-up                                           | `jdk.CompilerStatistics.compileCount` slope flattens as latency converges                   |
| Low-traffic service never converges                                                      | Invocation rate below the ladder                  | Hot path still at tier 3 in `PrintCompilation`; compute invocations / rate                  |
| Tier 2 lines in the log, or many methods sitting at 2/3 during start-up                  | C2 queue/policy pressure is a candidate           | queue utilization, live compiler threads, throttling, failures/directives, code cache       |
| Same image warms up far slower in a 1-2 CPU pod than on a workstation                    | 2 compiler threads plus CPU throttling            | `PrintFlagsFinal` inside the pod: `CICompilerCount=2`; cgroup `nr_throttled` climbing       |
| Warm-up got worse after adding replicas or after an HPA scale-out                        | Per-instance rate diluted; cold-start cascade     | Request rate per pod against the warm baseline; HPA events during the deploy                |
| `CodeCache is full` after switching to `-XX:-TieredCompilation` or `TieredStopAtLevel=1` | Ergonomic 48 MB code cache                        | `jcmd Compiler.codecache`: `size=49152Kb`                                                   |
| Periodic young GCs tagged `CodeCache GC Threshold`, CPU up, no load change               | Code cache thrashing under `UseCodeCacheFlushing` | `-Xlog:gc` cause; `-Xlog:codecache=info` "Triggering threshold GC"; `code-cache.md`         |
| Degraded until restart                                                                   | Code-cache/compiler state is one candidate        | compilation stop/restart and full counts; compare GC, host, load and dependencies           |
| A threshold flag "changed nothing"                                                       | `-XX:CompileThreshold` under tiered compilation   | `PrintFlagsFinal`: `TieredCompilation=true`; use `CompileThresholdScaling`                  |
| Start-up several times slower after a flag change                                        | `-Xcomp` (blocking compilation)                   | `b` in the flags column of every line                                                       |
| JFR shows no `jdk.Compilation` events                                                    | Threshold 1000 ms (default) or 100 ms (profile)   | `jdk.CompilerStatistics` has the counts                                                     |
| Cache full but `jdk.CodeCacheFull` absent from the recording                             | Exhaustion preceded the recording                 | `jdk.CodeCacheStatistics.fullCount`, `Compiler.codecache full_count`                        |
| Same method `made not entrant: uncommon trap` again and again                            | Unstable speculation                              | `deoptimization` — not a threshold problem                                                  |
| AOT cache adopted, warm-up still long                                                    | Profiles cached, compile CPU unchanged            | `jdk.CompilerStatistics.totalTimeSpent` before and after; `AOTReplayTraining=true` in flags |

## Primary references

- [HotSpot compilation policy](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/compilationPolicy.cpp)
- [HotSpot compile broker](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/compileBroker.cpp)
- [JDK 25 `java` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JDK 25 `jcmd` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
