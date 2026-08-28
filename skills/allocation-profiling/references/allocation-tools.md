# Allocation tools and events

## Pick the tool from the question

| Question                                                        | Tool                             | Granularity                          |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------ |
| Where do the allocated bytes come from, by source line?         | `asprof -e alloc`                | Full stack, aggregated by weight     |
| What is the sustained allocation rate in continuous production? | JFR `jdk.ObjectAllocationSample` | Sampled, fixed throttle, always on   |
| How much did _this thread_ waste on TLAB refills?               | `-Xlog:gc+tlab=trace`            | Per thread, per refill; short window |
| What is retained in the heap right now?                         | `jcmd GC.class_histogram`        | Point-in-time snapshot, not a rate   |
| How does Eden allocated relate to the interval between GCs?     | GC log                           | Aggregate, correlates to alloc rate  |

## async-profiler alloc mode

```bash
# 30s allocation profile, HTML flame graph
asprof -e alloc -d 30 -f alloc.html <pid>

# One sample per 512 KB allocated
asprof -e alloc --alloc 512k -d 30 -f alloc.html <pid>

# CPU and allocation in one session (one session per JVM)
asprof -e cpu,alloc -d 30 -f combined.html <pid>

# JFR output, for JMC or jfrconv
asprof -e alloc -d 30 -o jfr -f alloc.jfr <pid>
```

Per the async-profiler documentation, alloc mode relies on HotSpot callbacks for two kinds of
notification: an object allocated in a newly created TLAB, and an object allocated on the slow
path outside a TLAB. That is the **older** mechanism, not JEP 331 sampling — which is why its
overhead is low-to-moderate and dominated by TLAB refill rate, rather than the near-constant
cost of JFR's throttle. Both paths coexist in the baseline.

Reading the flame graph: box width is **bytes**, not object count. `byte[]` or `char[]` at the
top usually means `String` — compact strings (JEP 254) store content in those arrays.

In a container, check `perf_event_paranoid` before assuming the profiler will attach.

## JFR allocation events

```bash
# At startup
java -XX:StartFlightRecording=settings=profile,filename=alloc.jfr,duration=60s -jar app.jar

# On a running process
jcmd <pid> JFR.start settings=profile duration=60s filename=alloc.jfr

# Read the samples
jfr print --events jdk.ObjectAllocationSample alloc.jfr | head -40
```

```
jdk.ObjectAllocationSample {
  startTime   = 12:13:32.191
  objectClass = byte[] (classLoader = bootstrap)
  weight      = 17.2 MB
  eventThread = "main" (javaThreadId = 3)
  stackTrace  = [ TlabAllocDemo.main(String[]) line: 17 ]
}
```

| Event                             | Since                | Mechanism                                          | Overhead                          | Default                                           |
| --------------------------------- | -------------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `jdk.ObjectAllocationInNewTLAB`   | pre-JDK 11           | One event per TLAB refill                          | Proportional to refill frequency  | **Off**                                           |
| `jdk.ObjectAllocationOutsideTLAB` | pre-JDK 11           | One event per outside-TLAB alloc                   | Proportional to large-object rate | **Off**                                           |
| `jdk.ObjectAllocationSample`      | JDK 16 (JDK-8257602) | Adaptive sampling by moving the TLAB `end` pointer | Constant, bounded by throttle     | **On** — 150/s `default.jfc`, 300/s `profile.jfc` |

JEP 331 (JDK 11) delivered the JVMTI extension — `SetHeapSamplingInterval()`,
`JVMTI_EVENT_SAMPLED_OBJECT_ALLOC`, `can_generate_sampled_object_alloc_events` — not a JFR
event. JDK-8257602 (JDK 16) added event throttling and `jdk.ObjectAllocationSample` on top of
it. The legacy events are only worth enabling when you need the exact per-event `tlabSize`
field, which `ObjectAllocationSample` does not carry — a TLAB-subsystem debugging case, not
application profiling.

### Consuming events programmatically

The field name differs per event, and getting it wrong throws rather than returning zero:

```java
if (type.equals("jdk.ObjectAllocationSample")) {
    bytes = e.getLong("weight");
} else if (type.equals("jdk.ObjectAllocationInNewTLAB")
        || type.equals("jdk.ObjectAllocationOutsideTLAB")) {
    bytes = e.getLong("allocationSize");
}
String className = e.getClass("objectClass").getName();
```

### Raising the throttle for one investigation

```bash
jfr configure --input "$JAVA_HOME/lib/jfr/profile.jfc" --output alloc-hunt.jfc \
    jdk.ObjectAllocationSample#throttle=2000/s

java -XX:StartFlightRecording=settings=alloc-hunt.jfc,filename=alloc.jfr,duration=30s -jar app.jar
```

A higher throttle costs more overhead. Use it during the investigation, never as permanent
configuration.

## TLAB trace logging

```bash
java -Xlog:gc+tlab=trace:file=tlab.log:time,uptime -jar app.jar
```

```
[0.011s][trace][gc,tlab] TLAB: fill thread: 0x0000...  [id: 25496]
    desired_size: 983KB slow allocs: 0  refill waste: 15728B
    alloc: 1.00000  4096KB refills: 1 waste  0.0%  gc: 0B  slow: 0B
```

- `desired_size` — target TLAB size computed for this thread this cycle
- `slow allocs` — allocations by this thread that took the slow path
- `refill waste` — accumulated bytes wasted in previous refills
- `refills` — TLABs this thread has consumed
- `waste %` — fraction of total allocated that was refill waste

`trace` emits a line per refill and per `compute_size` call, per thread. `debug` is the
production-tolerable level; `trace` belongs to a short window during an active investigation.

The wrong tag set fails loudly, which is the easiest way to remember the right one:

```
$ java -Xlog:tlab=trace -version
[warning][logging] No tag set matches selection: tlab.
Did you mean any of the following? tlab* gc+tlab
```
