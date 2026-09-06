# Safepoint instrumentation and log fields

## `-Xlog:safepoint`

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime:filecount=5,filesize=20M -jar app.jar
```

Both `time` and `uptime` decorators, plus rotation, are required for correlation with an
incident window. Real lines from 25.0.3 (executed; one line each, wrapped here):

```
[1.363s][info][safepoint] Safepoint "G1CollectFull", Time since last: 155500 ns,
  Reaching safepoint: 10700 ns, At safepoint: 2808000 ns, Leaving safepoint: 4500 ns,
  Total: 2823200 ns, Threads: 1 runnable, 12 total
[0.711s][info][safepoint] Safepoint "ThreadDump", Time since last: 9513200 ns,
  Reaching safepoint: 22800 ns, At safepoint: 34500 ns, Leaving safepoint: 3500 ns,
  Total: 60800 ns, Threads: 1 runnable, 12 total
```

| Field                | Meaning                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `Safepoint "<name>"` | The VM operation. Not every one is a GC — `ThreadDump` above is not                              |
| `Time since last`    | Interval since the previous safepoint; shows periodic patterns                                   |
| `Reaching safepoint` | Elapsed synchronization, potentially dominated by a late required thread; includes coordination  |
| `At safepoint`       | VM work after synchronization; GC/VM-operation event timer boundaries may differ                 |
| `Leaving safepoint`  | Disarm and wake-up; the third term that a hand-summed `Reaching + At` omits                      |
| `Total`              | Safepoint cycle: `Reaching + At + Leaving`; correlate to request/thread impact                   |
| `Threads`            | Build-specific synchronization/runnable counts versus total; not every thread was executing Java |

Older JDKs printed no `Leaving safepoint` field; a parser written for them still matches
on 25 but attributes the third term to nothing. Capture `Total` from the line.

More detail when the `info` level is not enough:

```bash
java -Xlog:safepoint=debug:file=sp.log:time,uptime -jar app.jar     # per-thread reason
java -Xlog:safepoint*=trace:file=sp_trace.log:time,uptime -jar app.jar
```

`-Xlog:safepoint` is JDK 9 unified logging (JEP 158). `-XX:+PrintSafepointStatistics` was deprecated in JDK 11 and then **removed**. Both halves were
executed: on Temurin 11 it starts and warns `Option PrintSafepointStatistics was deprecated in
version 11.0`; on 17, 21, 24 and 25 it is `Unrecognized VM option` and the JVM refuses to start.
A runbook still carrying it therefore fails at launch rather than degrading. Its information
moved into `-Xlog:safepoint+stats=debug`, which emits the same per-operation table.

## Naming the slow thread

```bash
java -XX:+SafepointTimeout -XX:SafepointTimeoutDelay=500 -jar app.jar
```

For any thread that takes longer than 500 ms (default `SafepointTimeoutDelay` is 10000) to
reach the safepoint, the VM thread logs at `-Xlog:safepoint` **warning** level — visible on
stdout with no `-Xlog` configuration at all (executed, 25.0.3):

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
or in a test environment `-XX:+UnlockDiagnosticVMOptions -XX:+AbortVMOnSafepointTimeout`,
which aborts the JVM on timeout and attempts an `hs_err`; stack reporting can be incomplete. The
aligned stack/profile may show a long poll-free compiled region, runtime transition, page
fault or descheduled runnable thread. Ordinary native-state JNI/FFM execution is already
safepoint-safe; do not infer a native cause from the method name alone.

## JFR

Prepare `safepoints.jfc` from the target JDK's profile configuration, explicitly enabling
`jdk.SafepointBegin`, `jdk.SafepointStateSynchronization`, `jdk.SafepointEnd` and
`jdk.ExecuteVMOperation` at suitable thresholds. JDK 25's stock profile disables Sync and End;
event metadata proves availability, not recording enablement. Enable `SafepointLatency`
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
joins are incomplete evidence; JFR boundaries can differ slightly from unified-log timers.

`SafepointLatency` describes cooperative sampler request-to-processing delay; it is neither
global TTSP nor a numerical measure of profile bias. JEP 518 reconstructs the sampled location
later and retains limitations (for example intrinsic frames). Its lack of `safepointId` matters.

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
java -XX:+UseG1GC -XX:+UnlockDiagnosticVMOptions -XX:+PrintFlagsFinal -version | grep -iE \
  "GuaranteedSafepointInterval|UseCountedLoopSafepoints|LoopStripMiningIter|SafepointTimeout"
```

This is the step that catches "the flag I am about to recommend is already on" before the
recommendation reaches anyone. Replace the example collector with the deployed one and include
its relevant options; bare `-version` can select a different ergonomic configuration.

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

| Operation on JDK 25                                                   | Mechanism                         | Evidence                                                                              |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| `Thread.getStackTrace()` on one thread; JVMTI single-thread stack ops | Handshake                         | `Handshake "GetStackTraceClosure"` (executed)                                         |
| JFR method sampler (JEP 518) and CPU-time sampler (JEP 509)           | Async handshake to the sample     | `jdk.SafepointLatency` per sample                                                     |
| Deoptimising one thread's frames; nmethod invalidation                | Handshake                         | `-Xlog:deoptimization=debug`, `jdk.Deoptimization`                                    |
| ZGC/Shenandoah thread-root scanning; stack watermarks (JEP 376)       | Handshake                         | Concurrent phases in the GC log, no safepoint                                         |
| `ThreadMXBean.dumpAllThreads`, `jstack`, `jcmd Thread.print`          | Global safepoint                  | `Safepoint "ThreadDump"` / `"PrintThreads"`                                           |
| `jcmd Thread.dump_to_file` (JEP 444)                                  | Avoids a global application pause | Different contents/consistency; do not substitute silently for traditional dump       |
| Heap dump, `GC.class_histogram`, JVMTI `RedefineClasses`              | Global safepoint                  | `"HeapDumper"`, `"GC_HeapInspection"`, `"RedefineClasses"`                            |
| JVMTI operations across threads (agents, some APMs)                   | Operation-dependent               | Inspect exact API/path and log; not every multi-thread operation requires global stop |
| Every GC pause                                                        | Global safepoint                  | `"G1*"`, `"ZMark*"`/`"ZRelocate*"`, `"Shenandoah*"`                                   |

Operation names are the strings HotSpot compiles in (`vmOperation.hpp`; the set above was
read out of the 25.0.3 `jvm.dll`). A name in the safepoint log that is not a collector's is
the entry point for the non-GC investigation in pause-attribution.

## Profiling without safepoint bias

```bash
asprof -e cpu -d 30 -f cpu_profile.html <pid>
```

async-profiler samples through Linux `perf_events`, which interrupts the thread at any
instruction rather than at a poll. JDK 25 adds JFR CPU-Time Profiling (JEP 509) in the same
family, but it is experimental and Linux-only — verify the event and field names with
`jfr metadata` on your own build before depending on them.

Primary implementation references: [JDK 25 safepoint timing/events](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/safepoint.cpp),
[JDK 25 profile JFC](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/profile.jfc),
[JEP 444 dump format](https://openjdk.org/jeps/444), and [JEP 518 sampling](https://openjdk.org/jeps/518).
