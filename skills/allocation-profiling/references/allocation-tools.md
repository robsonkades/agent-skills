# Allocation tools and events

Every command and number here was executed on Temurin 25.0.3 unless a sentence says
otherwise; the HotSpot file names are from the JDK 25 GA sources.

## Pick the tool from the question

| Question                                                               | Tool                                                                                        | Granularity                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Where do the allocated bytes come from, by source line?                | `asprof -e alloc`                                                                           | Full stack, aggregated by bytes                                |
| Same question, no agent deployable                                     | `jcmd <pid> JFR.view allocation-by-site` (JDK 21+)                                          | Top frame per sample, from the running recording               |
| What is the sustained allocation rate in continuous production?        | JFR `jdk.ObjectAllocationSample`                                                            | Sampled, fixed throttle, always on                             |
| How many cumulative bytes did this supported platform thread allocate? | `com.sun.management.ThreadMXBean.getThreadAllocatedBytes`, `jdk.ThreadAllocationStatistics` | Counter, no stack; query/recording overhead is low but nonzero |
| Which of the allocated objects are still alive?                        | `asprof -e alloc --live`, `jdk.OldObjectSample`                                             | Survivors at session end / at recording end                    |
| How much did _this thread_ waste on TLAB refills?                      | `-Xlog:gc+tlab=trace`, `jfr view tlabs` (legacy events)                                     | Per thread, per refill; short window                           |
| What is retained in the heap right now?                                | `jcmd GC.class_histogram`                                                                   | Point-in-time snapshot, not a rate                             |
| How does Eden allocated relate to the interval between GCs?            | GC log                                                                                      | Aggregate, correlates to alloc rate                            |
| Bytes per operation of one method                                      | JMH `-prof gc`, `gc.alloc.rate.norm`                                                        | Exact B/op, isolated from the system                           |

## async-profiler alloc mode

```bash
# 30s allocation profile, HTML flame graph
asprof -e alloc -d 30 -f alloc.html <pid>

# One sample per 512 KB allocated (the JVMTI sampling interval on JDK 11+)
asprof -e alloc --alloc 512k -d 30 -f alloc.html <pid>

# Only objects still alive when the session ends: promotion and leak candidates
asprof -e alloc --live -d 60 -f live.html <pid>

# CPU and allocation in one session (one session per JVM)
asprof -e cpu,alloc -d 30 -f combined.html <pid>

# JFR output, for JMC or jfrconv
asprof -e alloc -d 30 -o jfr -f alloc.jfr <pid>
```

What samples the allocations depends on the async-profiler and JDK versions
(`profiler.cpp`, `Profiler::selectAllocEngine`; CHANGELOG 2.8 "JVM TI based allocation
profiling for JDK 11+", 3.0 "Prefer ObjectSampler to TLAB hooks"):

| async-profiler     | JDK | Sampler                                                                           | `--alloc N` means                                        |
| ------------------ | --- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 3.0+               | 11+ | `ObjectSampler`: JVMTI `SetHeapSamplingInterval` + `SampledObjectAlloc` (JEP 331) | The heap-sampling interval in bytes                      |
| 3.0+ `--tlab`      | any | `AllocTracer`: HotSpot's `send_allocation_in_new_tlab` / `_outside_tlab` hooks    | Ignored below the TLAB size — one sample per refill      |
| ≤ 2.7, or JDK ≤ 10 | any | `AllocTracer` TLAB hooks                                                          | Same limitation ("prior to JDK 11", `ProfilingModes.md`) |

Consequences: on a current stack the sample points are the JVMTI ones, so the interval is
honoured below the TLAB size and the profile is not biased towards threads with small TLABs;
`--live` needs the JVMTI path (the profiler refuses it otherwise). Neither path uses
`perf_events` — `perf_event_paranoid`, seccomp and `CAP_PERFMON` have no bearing on alloc
mode. The only access requirement is the attach socket `/tmp/.java_pid<PID>`, which the JVM
accepts from its own uid and gid. Alloc mode collects the Java stack only (`--cstack` does
not apply, per `ProfilerOptions.md`), and the sampler does not disable escape analysis: an
allocation C2 eliminated never reaches it, which is the property that makes the profile
trustworthy for "did scalar replacement happen".

Reading the flame graph: box width is sampled/weighted **bytes**, not object count; do not present
it as an exact allocator ledger without reconciling against independent counters. `byte[]` or `char[]` at the
top usually means `String` — compact strings (JEP 254) store content in those arrays. With
the TLAB hooks, aqua frames are in-TLAB samples and brown frames outside-TLAB.

## JFR allocation events

```bash
# At startup, with the throttle raised for this run — no custom .jfc needed (JDK 17+)
java -XX:StartFlightRecording:filename=alloc.jfr,jdk.ObjectAllocationSample#throttle=2000/s -jar app.jar

# On a running process
jcmd <pid> JFR.start settings=profile duration=60s filename=alloc.jfr

# Aggregate without JMC (JDK 21+; the same views work live through jcmd <pid> JFR.view)
jfr view allocation-by-site alloc.jfr
jfr view allocation-by-class alloc.jfr
jfr view allocation-by-thread alloc.jfr
jfr view thread-allocation alloc.jfr     # from jdk.ThreadAllocationStatistics, exact bytes

# Read the raw samples
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

```
                                   Allocation by Site
Method                                                               Allocation Pressure
-------------------------------------------------------------------- -------------------
AllocDemo.main(String[])                                                          99.92%
jdk.internal.classfile.impl.EntryMap.<init>(int, float)                            0.08%
```

| Event                             | Since                | Mechanism                                                                                           | Overhead                          | Default                                           |
| --------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `jdk.ObjectAllocationInNewTLAB`   | pre-JDK 11           | One event per TLAB refill (`allocTracer.cpp`)                                                       | Proportional to refill frequency  | **Off**                                           |
| `jdk.ObjectAllocationOutsideTLAB` | pre-JDK 11           | One event per outside-TLAB allocation                                                               | Proportional to large-object rate | **Off**                                           |
| `jdk.ObjectAllocationSample`      | JDK 16 (JDK-8257602) | The same two hooks, behind a throttle (`jfrAllocationTracer.cpp` → `jfrObjectAllocationSample.cpp`) | Bounded by the throttle           | **On** — 150/s `default.jfc`, 300/s `profile.jfc` |

How `jdk.ObjectAllocationSample` is built, from the JDK 25 source: every TLAB refill and every
outside-TLAB allocation constructs a `JfrAllocationTracer`, which calls
`JfrObjectAllocationSample::send_event`. The throttle decides whether to emit; when it does,
`weight = thread allocated bytes − bytes at the thread's last emitted sample`, and an
outside-TLAB allocation is first normalised into TLAB-sized chunks so a single huge array is
not undersampled. Two properties follow and both were confirmed in a 3 s run at 2000/s:

- The weights sum to the allocation total: 6,081 samples, Σ`weight` = 22.98 GB, against
  22.96 GB reported by `ThreadMXBean.getCurrentThreadAllocatedBytes` for the same window.
- A single sample can be enormous — the largest was 1.39 GB, the median 662 KB — because the
  throttle skipped the samples in between and the next one carries their bytes. Never read
  one sample's `weight` as an object size; aggregate.

JEP 331 (JDK 11) delivered the JVMTI extension — `SetHeapSamplingInterval()`,
`JVMTI_EVENT_SAMPLED_OBJECT_ALLOC`, `can_generate_sampled_object_alloc_events` — which is what
async-profiler 3.0+ consumes. JFR's event does **not** sit on it; the two samplers run
independently and can be on at the same time.

The legacy events are only worth enabling for `jfr view tlabs` or the per-event `tlabSize`
field, which `ObjectAllocationSample` does not carry — a TLAB-subsystem debugging case, not
application profiling. The cost is visible: in the same 2 s workload the pair produced 16,967
`InNewTLAB` plus 8,844 `OutsideTLAB` events against 330 throttled samples.

```bash
# Legacy events for one short window, then the TLAB summary
java -XX:StartFlightRecording:filename=tlab.jfr,jdk.ObjectAllocationInNewTLAB#enabled=true,jdk.ObjectAllocationOutsideTLAB#enabled=true -jar app.jar
jfr view tlabs tlab.jfr
```

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

Exact counts without stacks: `jdk.ThreadAllocationStatistics` (`allocated`, per live thread,
`everyChunk` in both shipped configurations) and, in process,
`com.sun.management.ThreadMXBean.getThreadAllocatedBytes(long[])`. Both read the thread's
allocated-bytes counter that the TLAB code maintains, so the number is exact to the TLAB, not
sampled. Bracket a request with `getCurrentThreadAllocatedBytes()` on a platform thread to get
bytes per request for free; the same call from a virtual thread is not supported — see below.

### Raising the throttle for one investigation

```bash
# Direct on the start command (JDK 17+), or through a derived configuration:
jfr configure --input "$JAVA_HOME/lib/jfr/profile.jfc" --output alloc-hunt.jfc \
    jdk.ObjectAllocationSample#throttle=2000/s
java -XX:StartFlightRecording=settings=alloc-hunt.jfc,filename=alloc.jfr,duration=30s -jar app.jar
```

2000/s produced 6,081 samples in 3 s; the shipped 150/s gives about 9,000 in a minute, which
is enough to rank sites but not to see a 1% site reliably. A higher throttle costs more
overhead. Use it during the investigation, never as permanent configuration.

## Virtual threads

- `ThreadMXBean.getThreadAllocatedBytes(vt.threadId())` returns `-1` (executed on 25.0.3):
  per-thread management statistics are not supported for virtual threads (JEP 444).
  `getCurrentThreadAllocatedBytes()` inside a virtual thread is likewise unsupported —
  measure at the carrier or at the boundary of the platform thread that submits the work.
- JFR attributes `jdk.ObjectAllocationSample` and `jdk.ThreadAllocationStatistics` to the
  virtual thread by name (`allocation-by-thread` listed `vt-parker` in the reproduction), so
  the recording is the tool for "which virtual-thread workload allocates".
- The TLAB belongs to the carrier. A virtual thread's allocations land in whichever carrier's
  TLAB it is mounted on, so `-Xlog:gc+tlab=trace` rows are carriers, not tasks.
- Bytes under `jdk.internal.vm.StackChunk` at `park`/`yield` sites are the frozen stacks of
  unmounting virtual threads (JEP 444). A deep stack parked often is a real allocation cost of
  the thread model; shallow the stack at the park point or park less often.

## TLAB trace logging

```bash
java -Xlog:gc+tlab=trace:file=tlab.log:time,uptime -jar app.jar
```

```
[0.014s][trace][gc,tlab] ThreadLocalAllocBuffer::compute_size(2) returns 125831
[0.014s][trace][gc,tlab] TLAB: fill thread: 0x000001ddbdc251f0 [id: 20504] desired_size: 983KB slow allocs: 0  refill waste: 15728B alloc: 1.00000     4096KB refills: 1 waste  0.0% gc: 0B slow: 0B
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
[warning][logging] No tag set matches selection: tlab. Did you mean any of the following? tlab* gc+tlab
```
