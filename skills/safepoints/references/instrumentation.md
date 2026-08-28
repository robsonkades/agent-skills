# Safepoint instrumentation and log fields

## `-Xlog:safepoint`

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime -jar app.jar
```

Both `time` and `uptime` decorators, plus rotation, are required for correlation with an
incident window. A representative line:

```
[2.341s][info][safepoint] Safepoint "G1CollectForAllocation", Time since last: 1234560 ns,
  Reaching safepoint: 234 ns, At safepoint: 15678901 ns, Total: 15913461 ns
[5.892s][info][safepoint] Safepoint "Deoptimize", Time since last: 3551000 ns,
  Reaching safepoint: 8934000 ns, At safepoint: 456000 ns, Total: 9390000 ns
```

| Field                | Meaning                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `Safepoint "<name>"` | The VM operation. Not every one is a GC — `Deoptimize` above is not |
| `Time since last`    | Interval since the previous safepoint; shows periodic patterns      |
| `Reaching safepoint` | **Sync time** — TTSP of the slowest thread. Absent from the GC log  |
| `At safepoint`       | Operation time. This is the number the GC log also reports          |
| `Total`              | What the application actually felt                                  |

In the second line the operation cost 0.46 ms and the wait cost 8.9 ms. A GC log for the
same window would show neither.

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

Logs the stack trace of any thread that takes longer than 500 ms to reach the safepoint.
Use it once `-Xlog:safepoint` has already shown that sync time is high but not which thread
is responsible. The stack usually shows JNI, a native monitor, or a loop C2 failed to
recognise as counted.

## JFR

```bash
jcmd <pid> JFR.start duration=60s filename=safepoints.jfr settings=profile
```

The events the JVM actually emits — and where each field really lives:

| Event                               | Carries                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `jdk.SafepointBegin`                | Start of the safepoint                                                                                                      |
| `jdk.SafepointStateSynchronization` | `safepointId`, `initialThreadCount`, `runningThreadCount`, `iterations` — emitted per wait iteration during synchronisation |
| `jdk.SafepointCleanup`              | The cleanup phase                                                                                                           |
| `jdk.SafepointEnd`                  | End of the safepoint                                                                                                        |
| `jdk.ExecuteVMOperation`            | **`operation`** — the operation name lives here, not in `SafepointStateSynchronization`                                     |

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

## Profiling without safepoint bias

```bash
./profiler.sh -e cpu -d 30 -f cpu_profile.html <pid>
```

async-profiler samples through Linux `perf_events`, which interrupts the thread at any
instruction rather than at a poll. JDK 25 adds JFR CPU-Time Profiling (JEP 509) in the same
family, but it is experimental and Linux-only — verify the event and field names with
`jfr metadata` on your own build before depending on them.
