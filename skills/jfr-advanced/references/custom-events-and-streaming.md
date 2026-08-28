# Custom events, settings files and streaming

## When a custom event is justified

| Situation                                                                             | Decision                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Need to correlate a business identity (`requestId`, `tenantId`) with JVM events       | Custom event, with `@Relational` on the correlation field           |
| Only need "how long" and "how many times" for a named method, without touching source | JEP 520 method timing and tracing — no manual instrumentation       |
| The data already exists as a built-in event (GC, allocation, lock)                    | Do not write one. Read the built-in; confirm it with `jfr metadata` |
| The event will fire more than 10³/s                                                   | `@StackTrace(false)` is mandatory; consider a `threshold` as well   |

## The event class

```java
import jdk.jfr.*;

@Name("com.example.HttpRequest")     // qualified event name
@Label("HTTP Request")
@Description("HTTP request tracking")
@Category({"Application", "HTTP"})
@StackTrace(false)                   // stack traces are the dominant cost
public class HttpRequestEvent extends jdk.jfr.Event {

    @Label("HTTP Method")
    String method;

    @Label("URL Path")
    @Relational                      // marks the field as a correlation key
    String path;

    @Label("Status Code")
    int statusCode;

    @Label("Request Size")
    @DataAmount(DataAmount.BYTES)
    long requestBytes;
}
```

The JVM instruments the `Event` subclass at class load: declared fields become the event
schema visible to `jfr metadata`, and `begin()`/`end()`/`commit()` are intercepted for
timestamping and the enablement check. This happens once — there is no per-call
reflection.

```java
if (HttpRequestEvent.isEnabled()) {          // avoids even the allocation
    HttpRequestEvent event = new HttpRequestEvent();
    event.begin();
    try {
        result = processRequest(request);
        event.method = request.method();
        event.path = request.path();
        event.statusCode = result.status();
        event.requestBytes = request.bodySize();
    } finally {
        event.end();
        event.commit();
    }
}
```

## What each step costs

| Operation                                    | Approximate cost                  |
| -------------------------------------------- | --------------------------------- |
| `Event.isEnabled()`                          | ~1 cycle (cached volatile read)   |
| `new CustomEvent()`                          | ordinary allocation, ~16–64 bytes |
| `commit()` with the event disabled           | ~1–2 ns — one predictable branch  |
| `commit()` enabled, no stack trace           | ~50–100 ns                        |
| `commit()` enabled, stack trace of 20 frames | ~200–500 ns and up                |

Order-of-magnitude figures published by the JFR authors, consistent with the buffer
architecture: writes go to a lock-free thread-local buffer and flush to a global buffer
amortised over roughly 5–30 ms chunks. Measure the real number on the target hardware by
running with and without the event enabled.

## A custom `.jfc`

There is no flag that reduces JFR overhead below `profile.jfc`. Copy the file, edit it,
and pass it as `settings=`.

```xml
<!-- custom-profile.jfc — copied from $JAVA_HOME/lib/jfr/profile.jfc -->
<configuration version="2.0" label="Custom Profile">
    <event name="jdk.GCPhasePauseLevel3">
        <setting name="enabled">true</setting>
        <setting name="threshold">10 ms</setting>
    </event>

    <event name="jdk.JavaMonitorWait">
        <setting name="enabled">true</setting>
        <setting name="threshold">10 ms</setting>
    </event>

    <event name="jdk.ThreadPark">
        <setting name="enabled">true</setting>
        <setting name="threshold">10 ms</setting>
    </event>

    <event name="com.example.HttpRequest">
        <setting name="enabled">true</setting>
        <setting name="stackTrace">false</setting>
    </event>
</configuration>
```

```bash
java -XX:StartFlightRecording=filename=app.jfr,settings=custom-profile.jfc App

jcmd <pid> JFR.configure stackdepth=128
jcmd <pid> JFR.start settings=custom-profile.jfc duration=60s filename=app.jfr
jcmd <pid> JFR.check                # confirm the recording actually started
```

Rejected startup line, tested against OpenJDK 25.0.3:

```
-XX:StartFlightRecording=settings=continuous,duration=0,maxsize=512m,filename=continuous.jfr
  -> Error occurred during initialization of VM
  -> Could not find settings file continuous
```

## Consumers

`RecordingStream` reacts to events live and writes no file. `RecordingFile` reads a
finished `.jfr` offline. They serve different moments of an investigation.

```java
try (RecordingStream rs = new RecordingStream()) {
    rs.enable("jdk.CPULoad").withPeriod(Duration.ofSeconds(10));
    rs.enable("jdk.GCHeapSummary").withPeriod(Duration.ofSeconds(10));
    rs.enable("jdk.JavaMonitorWait").withThreshold(Duration.ofMillis(10));
    rs.enable("jdk.ThreadPark").withThreshold(Duration.ofMillis(10));

    rs.onEvent("jdk.CPULoad", e ->
        registry.gauge("jvm_cpu_user").set(e.getFloat("jvmUser")));
    rs.onEvent("jdk.ThreadPark", e ->
        registry.histogram("jvm_thread_park_ms").observe(e.getDuration().toMillis()));

    rs.startAsync();     // rs.start() never returns until close()
}
```

`withPeriod` is for periodic sampled events; `withThreshold` is for duration events, and
without it `rs.enable("jdk.SocketRead")` records microsecond reads too.

```java
try (RecordingFile file = new RecordingFile(Path.of("recording.jfr"))) {
    while (file.hasMoreEvents()) {
        RecordedEvent event = file.readEvent();
        if (event.getEventType().getName().equals("jdk.GarbageCollection")) {
            long longest = event.getDuration("longestPause").toMillis();
            long sum     = event.getDuration("sumOfPauses").toMillis();
        }
    }
}
```

## Circular in-memory recording, dumped on alert

For incidents that cannot be predicted: keep the last N minutes in memory and write them
out only when something fires.

```java
Recording recording = new Recording();
recording.setMaxSize(512 * 1024 * 1024);   // 512 MB circular buffer
recording.setToDisk(false);
recording.start();

// on an external alert — p99 over SLO for N minutes:
recording.dump(Path.of("incident-" + Instant.now() + ".jfr"));
```

## What JDK 25 changed

| JEP | Feature                   | Status in JDK 25            | Platform   |
| --- | ------------------------- | --------------------------- | ---------- |
| 509 | JFR CPU-Time Profiling    | Experimental                | Linux only |
| 518 | JFR Cooperative Sampling  | Delivered, non-experimental | All        |
| 520 | JFR Method Timing/Tracing | Delivered, non-experimental | All        |

- **509** samples by CPU time actually consumed per thread (a POSIX timer bound to
  `CLOCK_THREAD_CPUTIME_ID`) instead of wall-clock. A parked or blocked thread does not
  consume that budget and is not sampled by it. Being experimental and Linux-only, do not
  make it the sole source of truth for a critical decision — cross-check against
  async-profiler in `cpu` mode.
- **518** replaces asynchronous signal-based stack unwinding with the target thread
  walking its own stack at a point it controls. No new event; the effect is fewer
  rejected or corrupted samples and a lower crash risk when profiling continuously.
- **520** inserts bytecode entry/exit probes on methods selected by class/method pattern,
  driven from a `.jfc` or `jcmd JFR.configure`, emitting `jdk.MethodTrace` (per
  invocation) and `jdk.MethodTiming` (aggregated). Cost scales with call frequency: this
  is short-duration triage, not a permanent broad setting.

Confirm the exact event names and configuration keys of 509 and 520 against
`jfr metadata` on the target build before relying on them.
