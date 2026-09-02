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

There is no flag that reduces JFR overhead below `profile.jfc`. Derive a file from a stock
one with `jfr configure` (JDK 17+); hand-edit XML only for an option the tool does not
expose.

```bash
# named options are listed by `jfr help configure`; event settings use <event>#<setting>
jfr configure --input profile.jfc locking-threshold=1ms method-profiling=max \
    jdk.VirtualThreadPinned#threshold=0ms --output custom-profile.jfc

# the same settings inline, without a file — later settings and later files win
jcmd <pid> JFR.start settings=profile jdk.JavaMonitorEnter#threshold=1ms

# a partial file layered on a stock one: only what it names changes
java -XX:StartFlightRecording:settings=profile,settings=partial.jfc,filename=app.jfr App
```

A file passed alone is the whole configuration: the partial file below, used as the only
`settings=`, records nothing but its four events.

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
java -XX:FlightRecorderOptions:stackdepth=128 \
     -XX:StartFlightRecording=filename=app.jfr,settings=custom-profile.jfc App

jcmd <pid> JFR.start settings=custom-profile.jfc duration=60s filename=app.jfr
jcmd <pid> JFR.check                # confirm the recording actually started
jcmd <pid> JFR.view active-settings # confirm the thresholds that are actually in force
```

`jcmd <pid> JFR.configure stackdepth=128` only works before the first recording starts —
the help text says the value "cannot be changed once JFR has been initialized" — so on a
JVM with a continuous recording it is a startup flag or nothing.

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
  emitting `jdk.MethodTrace` (per invocation, with stack trace) and `jdk.MethodTiming`
  (aggregated `invocations`, `minimum`, `average`, `maximum`, emitted at chunk end). Cost
  scales with call frequency: this is short-duration triage, not a permanent broad
  setting.

Configuration keys, verified on JDK 25.0.3 (`jfr help configure`, `jfr metadata`):

| Purpose              | Key                                                              | Notes                                                                               |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CPU-time sampling on | `jdk.CPUTimeSample#enabled=true`                                 | off in `default.jfc` and `profile.jfc`; no `UnlockExperimentalVMOptions` needed     |
| Sampling budget      | `jdk.CPUTimeSample#throttle=10ms` or `=500/s`                    | period of CPU time per thread, or an overall rate spread over threads (JEP 509)     |
| Lost samples         | `jdk.CPUTimeSamplesLost` (`lostSamples`)                         | on whenever the sampler is; a non-zero count means the profile under-reports        |
| Per-sample quality   | fields `failed`, `biased` on `jdk.CPUTimeSample`                 | discard `failed`; count `biased` before claiming the profile is bias-free           |
| Trace named methods  | `method-trace=<filter>` or `jdk.MethodTrace#filter=`             | filter such as `com.example.Foo::bar`; `#threshold` defaults to `0 ms` — every call |
| Time named methods   | `method-timing=<filter>` or `jdk.MethodTiming#filter=`           | aggregate only; the cheap choice for a hot method                                   |
| Read the results     | `jfr view method-timing`, `method-calls`, `cpu-time-hot-methods` | live via `jcmd <pid> JFR.view <view>` (JDK 21+)                                     |

On a platform without the sampler the JVM prints `CPU time method sampling not supported
in JFR on your platform` at startup and the recording proceeds without the event.
