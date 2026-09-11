# Safepoint instrumentation and log fields

## `-Xlog:safepoint`

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime:filecount=5,filesize=20M -jar app.jar
```

This is an example for a new capture, not a requirement to replace adequate existing logs.
Use timestamps with a demonstrated mapping to the incident clock. Both decorators are useful;
an existing mapping can suffice. Bound retained output with rotation or another appropriate
capture/retention limit. Historical real lines from 25.0.3 (one line each, wrapped here):

```
[1.363s][info][safepoint] Safepoint "G1CollectFull", Time since last: 155500 ns,
  Reaching safepoint: 10700 ns, At safepoint: 2808000 ns, Leaving safepoint: 4500 ns,
  Total: 2823200 ns, Threads: 1 runnable, 12 total
[0.711s][info][safepoint] Safepoint "ThreadDump", Time since last: 9513200 ns,
  Reaching safepoint: 22800 ns, At safepoint: 34500 ns, Leaving safepoint: 3500 ns,
  Total: 60800 ns, Threads: 1 runnable, 12 total
```

| Field                | Meaning                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `Safepoint "<name>"` | The VM operation. Not every one is a GC — `ThreadDump` above is not                                 |
| `Time since last`    | Previous cycle end to current cycle begin; the first uses tracing initialization, not a prior cycle |
| `Reaching safepoint` | Elapsed synchronization, potentially dominated by a late required thread; includes coordination     |
| `At safepoint`       | VM work after synchronization; GC/VM-operation event timer boundaries may differ                    |
| `Leaving safepoint`  | Disarm and wake-up; the third term that a hand-summed `Reaching + At` omits                         |
| `Total`              | Safepoint cycle: `Reaching + At + Leaving`; correlate to request/thread impact                      |
| `Threads`            | Build-specific synchronization/runnable counts versus total; not every thread was executing Java    |

Capture `Total` from the line and match the actual layout. In JDK 24 GA, `At` includes
release (`end - sync`); JDK 25 separates `At = leave - sync` and `Leaving = end - leave`.
Older `Total` already includes the cycle; do not add release to it again. On 25, summing
only `Reaching + At` omits release. `Time since last` is neither TTSP nor total cycle duration.

More detail when the `info` level is not enough:

```bash
java -Xlog:safepoint=debug:file=sp.log:time,uptime -jar app.jar     # synchronization summary
java -Xlog:safepoint*=trace:file=sp_trace.log:time,uptime -jar app.jar
```

`-Xlog:safepoint` is JDK 9 unified logging (JEP 158). `-XX:+PrintSafepointStatistics` was deprecated in JDK 11 and then **removed**. Both halves were
executed: on Temurin 11 it starts and warns `Option PrintSafepointStatistics was deprecated in
version 11.0`; on 17, 21, 24 and 25 it is `Unrecognized VM option` and the JVM refuses to start.
A runbook still carrying it therefore fails at launch rather than degrading. Its information
moved into `-Xlog:safepoint+stats=debug`; inspect that build's per-operation table and timer
boundaries rather than assuming an identical legacy layout.

## Naming the slow thread

```bash
java -XX:+SafepointTimeout -XX:SafepointTimeoutDelay=500 -jar app.jar
```

On the checked source, the VM thread compares a deadline derived from the safepoint start
plus `SafepointTimeoutDelay` while waiting for synchronization. Crossing it can report the
threads still not safe; it is not an individual timer for each thread or a hard completion
bound. The default delay is 10000 ms. It logs at `-Xlog:safepoint` **warning** level —
visible on stdout without extra logging configuration in this historical 25.0.3 capture:

```
[0.080s][warning][safepoint] # SafepointSynchronize::begin: Timeout detected:
[0.080s][warning][safepoint] # SafepointSynchronize::begin: Timed out while spinning to reach a safepoint.
[0.080s][warning][safepoint] # SafepointSynchronize::begin: Threads which did not reach the safepoint:
[0.080s][warning][safepoint] # "worker" #35 [42160] daemon prio=5 os_prio=0 cpu=46.88ms elapsed=0.06s tid=0x... nid=42160 runnable  [0x...]
[0.080s][warning][safepoint]    java.lang.Thread.State: RUNNABLE
[0.080s][warning][safepoint] # SafepointSynchronize::begin: (End of list)
```

That is the thread's **name and state, not its stack**. It answers "which thread" once
`-Xlog:safepoint` has shown that sync time is high; "what was it doing" needs a second
source over the same window — an async-profiler wall-clock profile filtered to that thread,
or in an isolated disposable test `-XX:+UnlockDiagnosticVMOptions -XX:+AbortVMOnSafepointTimeout`,
which aborts the JVM on timeout and attempts an `hs_err`; stack reporting can be incomplete. The
aligned stack/profile may show a long poll-free compiled region, runtime transition, page
fault or descheduled runnable thread. Ordinary native-state JNI/FFM execution is already
safepoint-safe; do not infer a native cause from the method name alone.

## JFR

For a new capture that needs complete cycle reconstruction, prepare `safepoints.jfc` from
the target JDK's profile configuration, explicitly enabling
`jdk.SafepointBegin`, `jdk.SafepointStateSynchronization`, `jdk.SafepointEnd` and
`jdk.ExecuteVMOperation` at suitable thresholds. JDK 25's stock profile disables Sync and End;
event metadata proves availability, not recording enablement. Reuse an adequate existing
recording and enable only events needed for the claim. Enable `SafepointLatency`
separately only for sampler diagnostics.

```bash
jcmd <pid> JFR.start name=safepoints duration=60s filename=safepoints.jfr settings=safepoints.jfc
```

`JFR.start` returns asynchronously. Wait boundedly for recording completion (or use a supported
dump), verify the resulting file is complete/readable and inspect event counts before parsing.

The events the JVM actually emits on 25.0.3 (`jfr metadata`, executed) — and where each
field really lives:

| Event                               | Fields beyond `startTime`/`duration`/`eventThread`                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `jdk.SafepointBegin`                | `safepointId`, `totalThreadCount`, `jniCriticalThreadCount`                                                                       |
| `jdk.SafepointStateSynchronization` | `safepointId`, `initialThreadCount`, `runningThreadCount`, `iterations` — aggregated synchronization pass, not a per-thread delay |
| `jdk.SafepointEnd`                  | `safepointId`                                                                                                                     |
| `jdk.ExecuteVMOperation`            | **`operation`**, `safepoint`, `blocking`, `caller`, `safepointId` — the operation name lives here                                 |
| `jdk.SafepointLatency`              | `stackTrace`, `threadState` — one **sampler** interrupt-to-poll delay (JEP 518); no `safepointId`                                 |

There is **no `jdk.SafepointCleanup` event** on 25. VM cleanup is not synonymous with release.
`SafepointEnd.duration` covers leaving/disarming work. Join by `safepointId` and compute a
cycle from `SafepointEnd.endTime - SafepointBegin.startTime`, not End.startTime. Sync is an
aggregate pass, not the identity or individual delay of the slowest thread. Partial/missing
joins cannot establish those complete cycles; independently recorded operations/sync events
can still support narrower summaries. JFR boundaries can differ slightly from unified-log timers.

`SafepointLatency` describes cooperative sampler request-to-processing delay; it is neither
global TTSP nor a numerical measure of profile bias. JEP 518 reconstructs the sampled location
later for Java execution and retains limitations (for example intrinsic frames). Native
execution uses the previous sampling approach in this JEP; do not infer the same processing
path for every sample. Its lack of `safepointId` matters.

Reading the recording programmatically (Java 17+ snippet; imports from `jdk.jfr.consumer`,
`java.nio.file` and `java.util`; use a target recording with the events above):

```java
try (RecordingFile rf = new RecordingFile(Path.of("safepoints.jfr"))) {
    Map<String, LongSummaryStatistics> perOperation = new HashMap<>();
    Long worstSyncNanos = null;
    while (rf.hasMoreEvents()) {
        RecordedEvent e = rf.readEvent();
        switch (e.getEventType().getName()) {
            case "jdk.ExecuteVMOperation" -> {
                if (e.getBoolean("safepoint")) {
                    perOperation.computeIfAbsent(e.getString("operation"),
                        k -> new LongSummaryStatistics())
                        .accept(e.getDuration().toNanos());
                }
            }
            case "jdk.SafepointStateSynchronization" -> {
                long nanos = e.getDuration().toNanos();
                worstSyncNanos = worstSyncNanos == null ? nanos : Math.max(worstSyncNanos, nanos);
            }
        }
    }
    System.out.println("Global VM operations (ns): " + perOperation);
    System.out.println("Worst recorded sync (ns; null = missing): " + worstSyncNanos);
}
```

This summary does not reconstruct complete safepoint cycles or identify a late thread.

In JMC the same data is under **JVM Internals** → VM Operations / Safepoints.

## Confirming defaults in the runtime you are actually diagnosing

Never quote a flag default from memory in an incident report:

```bash
JAVA_BIN=/path/to/deployed/java
probe_flags() (
  capture=$(mktemp -d) || exit
  printf 'Raw flag probe: %s\n' "$capture" >&2
  if "$JAVA_BIN" "$@" -XX:+PrintFlagsFinal -version >"$capture/stdout" 2>"$capture/stderr"; then
    grep -iE 'GuaranteedSafepointInterval|UseCountedLoopSafepoints|LoopStripMiningIter|SafepointTimeout' "$capture/stdout"
    selected=$?
    if [ "$selected" -eq 1 ]; then
      printf 'Successful JVM invocation, but no selected flag matched; inspect raw output.\n' >&2
    fi
    exit "$selected"
  else
    status=$?
    cat "$capture/stderr" >&2
    exit "$status"
  fi
)
probe_flags -XX:+UseG1GC -XX:+UnlockDiagnosticVMOptions
```

This is the step that catches "the flag I am about to recommend is already on" before the
recommendation reaches anyone. Replace the example collector with the deployed one and include
its relevant options/environment; bare `-version` can select a different ergonomic
configuration. This verifies that successful invocation, not the already-running process.
Keep producer failure distinct from successful no-match; neither establishes false, zero
or a default. Retain the raw files long enough to review the probe.

## Handshake or global safepoint

A handshake (JEP 312, JDK 10; asynchronous variants since JDK 16) runs a closure on one
thread or a set of threads without requiring a global safepoint. Depending on the operation,
the target processes it at a safe point or a requester performs it while the target is safely
blocked. Multi-target handshakes can still cause broad work/delay; "not global" does not mean
free or strictly serial. `-Xlog:handshake=info` identifies operations (executed, 25.0.3, for
`Thread.getStackTrace()` on another thread):

```
[0.702s][info][handshake] Handshake "GetStackTraceClosure", Targeted threads: 1, Executed by requesting thread: 0, Total completion time: 23700 ns
```

| Operation on JDK 25                                                         | Mechanism                                              | Evidence                                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Thread.getStackTrace()` on another platform thread (illustrated path)      | Handshake                                              | `Handshake "GetStackTraceClosure"` (historical capture); inspect other thread/API paths                                             |
| JFR Java sampling (JEP 518; JEP 509 CPU-time path on Linux)                 | Thread-local cooperative poll processing               | Sample-request processing is distinct from HotSpot handshake-state processing; native sampling has a different path                 |
| Deoptimisation and nmethod invalidation                                     | Path-dependent: existing global safepoint or handshake | `deoptimize_all_marked` uses either; `-Xlog:deoptimization=debug`/`jdk.Deoptimization` alone do not classify global synchronization |
| Concurrent collector thread-root processing; ZGC stack watermarks (JEP 376) | Selected concurrent/handshake paths                    | Inspect collector and phase; related root work can also occur at safepoints                                                         |
| `ThreadMXBean.dumpAllThreads`, `jstack`, `jcmd Thread.print`                | Global safepoint                                       | `Safepoint "ThreadDump"` / `"PrintThreads"`                                                                                         |
| `jcmd Thread.dump_to_file` (JEP 444)                                        | Avoids a global application pause                      | Different contents/consistency; do not substitute silently for traditional dump                                                     |
| Heap dump, `GC.class_histogram`, JVMTI `RedefineClasses`                    | Global safepoint                                       | `"HeapDumper"`, `"GC_HeapInspection"`, `"RedefineClasses"`                                                                          |
| JVMTI operations across threads (agents, some APMs)                         | Operation-dependent                                    | Inspect exact API/path and log; not every multi-thread operation requires global stop                                               |
| Stop-the-world GC phases                                                    | Global safepoint                                       | Match collector operation and safepoint interval; concurrent GC events are different                                                |

Operation names are the strings HotSpot compiles in (`vmOperation.hpp`; the set above was
read out of the 25.0.3 `jvm.dll`). A name in the safepoint log that is not a collector's is
the entry point for the non-GC investigation in pause-attribution.

## Choosing an asynchronous profiler

```bash
asprof -e cpu -d 30 -f cpu_profile.html <pid>
```

Choose a supported profiler version/platform/backend and CPU versus wall mode for the
question. Linux `perf_events` is one async-profiler backend; `-e cpu` is not a promise that
every platform/configuration uses it. Sampling trigger, delivery and stack reconstruction
have separate loss/permission/overhead limits; an asynchronous trigger does not prove a
complete unbiased profile. JDK 25 JFR CPU-Time Profiling (JEP 509) is experimental and
Linux-only. Inspect the target's metadata, enablement and actual recorded events before
depending on them; source-only interpretation does not require a new capture.

Primary implementation references: [JDK 25 safepoint timing/events](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/safepoint.cpp),
[JDK 25 profile JFC](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/profile.jfc),
[JDK 25 deoptimisation paths](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/deoptimization.cpp),
[JDK 25 VM-operation wait](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/vmThread.cpp),
[JEP 444 dump format](https://openjdk.org/jeps/444), [JEP 518 sampling](https://openjdk.org/jeps/518), and
[async-profiler 4.3 profiling modes](https://github.com/async-profiler/async-profiler/blob/v4.3/docs/ProfilingModes.md).
