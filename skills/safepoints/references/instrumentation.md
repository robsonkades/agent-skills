# Safepoint instrumentation and log fields

## `-Xlog:safepoint`

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime -jar app.jar
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

| Field                | Meaning                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `Safepoint "<name>"` | The VM operation. Not every one is a GC — `ThreadDump` above is not            |
| `Time since last`    | Interval since the previous safepoint; shows periodic patterns                 |
| `Reaching safepoint` | **Sync time** — TTSP of the slowest thread. Absent from the GC log             |
| `At safepoint`       | Operation time. This is the number the GC log also reports                     |
| `Leaving safepoint`  | Disarm and wake-up; the third term that a hand-summed `Reaching + At` omits    |
| `Total`              | Safepoint cycle: `Reaching + At + Leaving`; correlate to request/thread impact |
| `Threads`            | Threads that had to be brought to the safepoint versus all Java threads        |

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
which aborts the JVM on the first timeout and writes an `hs_err` with every stack. The
aligned stack/profile may show a long poll-free compiled region, runtime transition, page
fault or descheduled runnable thread. Ordinary native-state JNI/FFM execution is already
safepoint-safe; do not infer a native cause from the method name alone.

## JFR

```bash
jcmd <pid> JFR.start duration=60s filename=safepoints.jfr settings=profile
```

The events the JVM actually emits on 25.0.3 (`jfr metadata`, executed) — and where each
field really lives:

| Event                               | Fields beyond `startTime`/`duration`/`eventThread`                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `jdk.SafepointBegin`                | `safepointId`, `totalThreadCount`, `jniCriticalThreadCount`                                       |
| `jdk.SafepointStateSynchronization` | `safepointId`, `initialThreadCount`, `runningThreadCount`, `iterations` — the sync phase          |
| `jdk.SafepointEnd`                  | `safepointId`                                                                                     |
| `jdk.ExecuteVMOperation`            | **`operation`**, `safepoint`, `blocking`, `caller`, `safepointId` — the operation name lives here |
| `jdk.SafepointLatency`              | `stackTrace`, `threadState` — one **sampler** interrupt-to-poll delay (JEP 518); no `safepointId` |

There is **no `jdk.SafepointCleanup` event** on 25; the cleanup phase is the `Leaving
safepoint` term of the log line and the gap between `ExecuteVMOperation` and
`SafepointEnd` in JFR. A parser that requests it gets nothing, silently.

Reading the recording programmatically:

```java
try (RecordingFile rf = new RecordingFile(Path.of("safepoints.jfr"))) {
    Map<String, LongSummaryStatistics> perOperation = new HashMap<>();
    long worstSync = 0;
    for (RecordedEvent e : rf.readAllEvents()) {
        switch (e.getEventType().getName()) {
            case "jdk.ExecuteVMOperation" ->
                perOperation.computeIfAbsent(e.getString("operation"),
                        k -> new LongSummaryStatistics())
                    .accept(e.getDuration().toMillis());
            case "jdk.SafepointStateSynchronization" ->
                worstSync = Math.max(worstSync, e.getDuration().toMillis());
        }
    }
}
```

In JMC the same data is under **JVM Internals** → VM Operations / Safepoints.

## Confirming defaults in the runtime you are actually diagnosing

Never quote a flag default from memory in an incident report:

```bash
java -XX:+PrintFlagsFinal -version | grep -iE \
  "GuaranteedSafepointInterval|UseCountedLoopSafepoints|LoopStripMiningIter|SafepointTimeout"
```

This is the step that catches "the flag I am about to recommend is already on" before the
recommendation reaches anyone.

## Handshake or global safepoint

A handshake (JEP 312, JDK 10; asynchronous variants since JDK 16) runs a closure on one
thread, or on each thread in turn, at that thread's next poll — the same poll a safepoint
uses — while every other thread keeps running. It costs the _target_ its TTSP, not the
process. `-Xlog:handshake=info` prints one line per operation (executed, 25.0.3, for
`Thread.getStackTrace()` on another thread):

```
[0.702s][info][handshake] Handshake "GetStackTraceClosure", Targeted threads: 1, Executed by requesting thread: 0, Total completion time: 23700 ns
```

| Operation on JDK 25                                                   | Mechanism                     | Evidence                                                   |
| --------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `Thread.getStackTrace()` on one thread; JVMTI single-thread stack ops | Handshake                     | `Handshake "GetStackTraceClosure"` (executed)              |
| JFR method sampler (JEP 518) and CPU-time sampler (JEP 509)           | Async handshake to the sample | `jdk.SafepointLatency` per sample                          |
| Deoptimising one thread's frames; nmethod invalidation                | Handshake                     | `-Xlog:deoptimization=debug`, `jdk.Deoptimization`         |
| ZGC/Shenandoah thread-root scanning; stack watermarks (JEP 376)       | Handshake                     | Concurrent phases in the GC log, no safepoint              |
| `ThreadMXBean.dumpAllThreads`, `jstack`, `jcmd Thread.print`          | Global safepoint              | `Safepoint "ThreadDump"` / `"PrintThreads"`                |
| Heap dump, `GC.class_histogram`, JVMTI `RedefineClasses`              | Global safepoint              | `"HeapDumper"`, `"GC_HeapInspection"`, `"RedefineClasses"` |
| JVMTI operations on all threads (agents, some APMs)                   | Global safepoint              | `Safepoint "HandshakeAllThreads"`                          |
| Every GC pause                                                        | Global safepoint              | `"G1*"`, `"ZMark*"`/`"ZRelocate*"`, `"Shenandoah*"`        |

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
