# Missing measurements

Read at step 6, and whenever the request is for flags rather than for a review. This is the
catalogue the gate refuses with: for each complaint, **one** artefact, the exact command,
what it discriminates between, and — the part that makes the refusal constructive — what its
absence means for the audit.

"Profile it" is not an entry in this catalogue. Every recommendation here is a named command
producing a named artefact.

## Before anything else: what the audit needs

1. `jcmd <pid> VM.flags` — or `-XX:+PrintFlagsFinal` at startup — the **effective**
   configuration.
2. `jcmd <pid> VM.command_line` — what was actually passed, so ignored flags become visible
   next to what took effect.
3. `java -version` — the exact build; every lifecycle and default answer changes by release.
4. The SLO the change is meant to serve, as a percentile and a threshold at a stated load.

**Missing any of 1–4, the audit output is the missing item, not a flag.**

## Baseline recording

```text
-XX:StartFlightRecording=settings=default,maxsize=256m,filename=/tmp/app.jfr,dumponexit=true
```

`default.jfc` selects `gc=normal`, `allocation-profiling=low`, `method-profiling=normal`,
`memory-leaks=types`; `profile.jfc` raises these to `detailed` / `medium` / `high` /
`stack-traces`. Every view below is available under `default` **except** where noted.

`jfr view` names verified against JDK 25. Views present in 25 but **not** in 21:
`cpu-time-hot-methods`, `cpu-time-statistics`, `blocked-by-system-gc`, `gc-parallel-phases`,
`method-calls`, `method-timing`, `native-library-failures`, `deprecated-methods-for-removal`,
`jdk-agents`. On JDK 21, query the underlying event directly instead.

## "p99 spiked"

```bash
jfr view gc-pauses  app.jfr      # jdk.GCPhasePause: SUM/COUNT/MIN/MEDIAN/AVG/P90/P95/P99/P999/MAX
jfr view safepoints app.jfr      # jdk.SafepointBegin + jdk.SafepointEnd
```

Without JFR: `-Xlog:gc,safepoint`.

**Discriminates.** p99 of `GCPhasePause` comparable to the regression → GC pause. Safepoint
_duration_ small but time-to-safepoint large → a thread that will not reach a safepoint: a
counted loop, JNI, or a page-fault stall — not GC. Both small → the latency is **not in the
JVM's pause machinery at all**, and no flag addresses it.

**Absence means.** With no pause distribution you cannot separate "GC pauses" from "the pool
is exhausted" from "the downstream got slower". A GC flag recommended here is a guess; the
correct output is the refusal plus these two commands.

## "high CPU"

```bash
jfr view gc-cpu-time app.jfr     # jdk.GCCPUTime: SUM(user), SUM(system), SUM(real), COUNT
jfr view hot-methods  app.jfr    # jdk.ExecutionSample
```

Escalate to CPU-time sampling only if GC CPU is small and the profile is uninformative
(native- or JNI-heavy). That is JEP 509, new in JDK 25, Linux only, experimental, and
**disabled in both `default.jfc` and `profile.jfc`**:

```bash
java -XX:StartFlightRecording=jdk.CPUTimeSample#enabled=true,jdk.CPUTimeSample#throttle=20ms,filename=cpu.jfr …
jfr view cpu-time-hot-methods cpu.jfr
```

It exists because `ExecutionSample` samples only threads currently executing Java code —
not native code called from Java — can fail silently, and samples only a subset of threads
per interval. `jdk.CPUTimeSamplesLost` reports drops. That blind spot is the reason a flat
`hot-methods` view is not evidence that no code is hot.

**Discriminates.** GC CPU ≫ application CPU → allocation rate or heap sizing, and the "GC is
the problem" entry applies. GC CPU small with one dominant frame → application hot path. GC
CPU small and the profile flat → lock contention (`jfr view contention-by-site` over
`jdk.JavaMonitorEnter`, on by default) or **CFS throttling**
(`jfr view container-cpu-throttling`).

**Absence means.** "High CPU" with no GC-CPU-versus-app-CPU split cannot be attributed. In
particular it cannot separate CPU _saturation_ from CPU _throttling_, and those have
opposite fixes.

## "OOMKilled"

```bash
# at startup:
-XX:NativeMemoryTracking=summary
# at steady state, before the kill:
jcmd <pid> VM.native_memory summary scale=MB
jcmd <pid> VM.native_memory baseline      # then, later:
jcmd <pid> VM.native_memory summary.diff scale=MB
```

NMT cannot be enabled at runtime. With no restart available, use
`jfr view native-memory-committed app.jfr` (`jdk.NativeMemoryUsage`, on in `default.jfc`) for
committed-by-category over time. Linux extras: `jcmd <pid> System.map`,
`jcmd <pid> System.dump_map`, `jcmd <pid> System.native_heap_info`.

**Discriminates.** Heap committed ≈ container limit → `-Xmx` too large.
`Thread`/`Thread Stack` large with a modest heap → thread explosion or a raised `-Xss`.
`Class`/`Metaspace` growing → classloader leak. `Internal`/`Other` growing → direct byte
buffers or a native library. Nothing in NMT growing while RSS grows → glibc malloc arena
fragmentation.

**Absence means.** An OOMKill with no NMT summary and no memory map is un-attributable, and
lowering `-Xmx` is a coin flip: if the growth is in metaspace or native memory, a smaller
heap makes the crash arrive **sooner** while masking the real leak.

## "slow startup"

```bash
jfr view longest-class-loading    app.jfr   # jdk.ClassLoad
jfr view compiler-statistics      app.jfr
jfr view container-cpu-throttling app.jfr   # jdk.ContainerCPUThrottling
-Xlog:class+load:file=cl.log -Xlog:startuptime
```

**The measurement people skip is the third one.** `jdk.ContainerCPUThrottling` — reporting
`cpuElapsedSlices`, `cpuThrottledSlices`, `cpuThrottledTime` — is enabled unconditionally in
JDK 25's `default.jfc`. A pod with a low CPU _limit_ is throttled hardest exactly during
startup, when compiler threads and classloading want CPU. (Whether the event is on by
default in JDK 21 is unverified; the view name exists there.)

**Discriminates.** Throttled slices high → the CPU limit, fixed by the limit or
`-XX:ActiveProcessorCount`, **not** by `TieredStopAtLevel=1`. Class-load time dominant →
CDS / AOT cache territory (JEP 483). Compiler statistics dominant with no throttling →
genuine warm-up. Application frames dominant → it is a `@PostConstruct`, not the JVM.

**Absence means.** Without the throttling counters you cannot distinguish "the JVM is slow"
from "the JVM was given 200 millicores", and every JVM-side flag recommendation is unfounded.

## "memory leak suspected"

```bash
-Xlog:gc:file=gc.log:time,uptime,level,tags   # read "Pause Full ... 4000M->3900M(8000M)"
jfr view memory-leaks-by-site app.jfr          # jdk.OldObjectSample
```

The cheapest evidence is heap occupancy **after full GC** over time — one number per
collection, not a heap dump. `jdk.OldObjectSample` is on in `default.jfc` but with
`memory-leaks=types`, i.e. **without stack traces**; `memory-leaks-by-site` selects
`stackTrace.topApplicationFrame` and therefore needs `settings=profile` or
`jdk.OldObjectSample#stackTrace=true`.

**Under ZGC this view is empty and reports no error.** The event is disabled under ZGC from
25.0.4, 26.0.2 and 27 (JDK-8382740; 26.0.0 and 26.0.1 unaffected). An empty
`memory-leaks-by-site` under ZGC therefore means "not measured", not "no leak" — read the
collector off `-Xlog:gc+init` before drawing any conclusion from it, and fall back to a heap
dump. Do not record the absence as evidence. Escalate only afterwards to
`jcmd <pid> GC.class_histogram` or `jcmd <pid> GC.heap_dump -gz=1 -parallel=N file` — both
documented as high impact, and the dump forces a full GC unless `-all` is passed.

**Discriminates.** Monotonically rising post-full-GC occupancy → a real leak. Flat
post-full-GC occupancy with a rising _peak_ → allocation rate or heap sizing, not a leak.
Rising RSS with a flat heap → native, so go to the OOMKilled entry.

**Absence means.** A leak claim with no post-full-GC occupancy series is unfalsifiable. A
heap dump alone shows what is _in_ the heap, not whether it is _growing_ — it cannot
distinguish a leak from a large-but-stable cache.

## "GC is the problem"

```bash
jcmd <pid> VM.flags                      # what the JVM actually chose, not what you passed
jfr view gc-configuration   app.jfr      # jdk.GCConfiguration
jfr view heap-configuration app.jfr      # initialSize, minSize, maxSize, usesCompressedOops,
                                         #   compressedOopsMode
jfr view gc-cpu-time        app.jfr
jfr view gc-pauses          app.jfr
jfr view allocation-by-site app.jfr      # jdk.ObjectAllocationSample
```

In that order. **Step 1 alone resolves a large fraction of cases**: it reveals SerialGC
selected by ergonomics, compressed oops disabled by `MaxRAMPercentage`, an obsolete flag
being ignored, or thread counts derived from the wrong CPU count. Only once the collector
and heap are confirmed to be what was intended does the pause / CPU / allocation triage
begin — and at that point the investigation belongs to `gc-log-analysis` and
`jvm-gc-tuning`, not here.

**Absence means.** "GC is the problem" with no `VM.flags` output is not a diagnosis, because
which collector is running is still unknown. **This is the strongest premise-refusal
available: no `VM.flags`, no GC recommendation.**
