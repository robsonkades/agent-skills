# Allocation tools and events

Use this reference when selecting or interpreting allocation measurements. The source
baseline below is OpenJDK 25 GA and async-profiler 4.1; it is not a claim that these commands
were executed on a service. Check the deployed build and local help before use.

## Match the measurement to the question

| Question                                      | Evidence                                                                  | Limit                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Which stacks produce heap bytes?              | async-profiler alloc or JFR allocation samples                            | Weighted estimates, not object counts or retained bytes                            |
| How fast does the process allocate?           | Supported process-total counter deltas, or matched platform-thread deltas | Missing thread lifetimes and unsupported counters can invalidate the total         |
| How many bytes per isolated operation?        | JMH `-prof gc`, `gc.alloc.rate.norm`                                      | Harness/fork measurement; warm-up, background work and operation definition matter |
| Which sampled allocations remain uncollected? | async-profiler `--live`                                                   | Only allocations sampled during this session; no generation or root proof          |
| Which objects may be retained?                | JFR `jdk.OldObjectSample`                                                 | A selected population of aged objects, not a heap census                           |
| Is TLAB waste/refill relevant?                | `gc+tlab` logging and legacy JFR events                                   | Buffer accounting, not every in-TLAB allocation                                    |
| What occupies heap now?                       | Histogram or heap dump                                                    | Snapshot, not allocation rate; collection and inspection can perturb the process   |

Do not add values from different populations or sampling engines. A recording produced by
async-profiler can use legacy JFR event names for its sampled data; identify the producer
before treating those events as exhaustive HotSpot events.

## Bounded capture examples

These shell examples require an accessible HotSpot process, compatible tools, permission to
attach/load the native library, and a writable output path. Replace `<pid>` and use a unique
artifact path. async-profiler requires a supported OS/build; use JFR where it is unavailable.
Validate capture overhead against the service's budget, even in alloc-only mode.

```bash
# Average sampling interval in bytes, not exactly every Nth object
asprof -e alloc --alloc 512k --total -d 30 -f alloc.html <pid>

# Sampled objects not collected by session end; requires the JVMTI allocation engine
asprof -e alloc --live --total -d 60 -f live.html <pid>

# Multiple event types require JFR output (CPU mode has additional access requirements)
asprof -e cpu,alloc -d 30 -f combined.jfr <pid>
```

On JDK 11+, async-profiler 3.0+ normally selects the JVMTI heap sampler
(`SetHeapSamplingInterval` / `SampledObjectAlloc`, JEP 331). Older/fallback engines use
HotSpot TLAB hooks, where the effective interval cannot go below TLAB granularity. Check
engine selection and local help for the deployed version; do not assume an option such
as `--tlab` exists in every release (it is absent from the
[4.1 argument parser](https://github.com/async-profiler/async-profiler/blob/v4.1/src/arguments.cpp)).
See the [4.1 engine selection](https://github.com/async-profiler/async-profiler/blob/v4.1/src/profiler.cpp)
and [JEP 331](https://openjdk.org/jeps/331).

Alloc-only profiling does not need Linux perf events. This does **not** remove attach,
PID/mount namespace, library-path, dynamic-agent policy or container security constraints.
A readable socket alone is not sufficient. General access diagnosis belongs to
`jfr-and-async-profiler`.

For HTML byte attribution, explicitly use `--total`: without it, the graph can show sample
counts. Neither sample counts nor byte weights are exact object counts. When converting JFR,
select allocation events and byte weighting explicitly in the converter/viewer.
The class frame labels the sampled allocation; follow its stack to the producing code.
An array class alone does not identify strings versus I/O/codec buffers. Sampling observes
actual heap allocation without disabling escape analysis, but absence of a sample is not
proof of elimination. See [profiling modes](https://github.com/async-profiler/async-profiler/blob/v4.1/docs/ProfilingModes.md)
and [live/interval options](https://github.com/async-profiler/async-profiler/blob/v4.1/docs/ProfilerOptions.md).

## JFR: capability and recording checks

Offline `jfr view` is available from JDK 21. Live `jcmd JFR.view` is a separate capability:
it is documented for JDK 25 but absent from the JDK 21 command list. Query the target's help.
A view summarizes available recording data; it does not establish that the desired event
was collected over the affected window. See the [JDK 21 jfr manual](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jfr.html),
[JDK 21 jcmd manual](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html)
and [JDK 25 jcmd manual](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html).

```bash
jcmd <pid> help JFR.start
jcmd <pid> JFR.check
# If a new recording is needed; filename is resolved by the target JVM
jcmd <pid> JFR.start name=alloc-hunt settings=profile duration=60s filename=alloc.jfr
# After completion, inspect the resulting recording
jfr summary alloc.jfr
jfr metadata --events jdk.ObjectAllocationSample alloc.jfr
jfr view allocation-by-site alloc.jfr
jfr view allocation-by-class alloc.jfr
# Only if the target supports this command:
jcmd <pid> help JFR.view
jcmd <pid> JFR.view allocation-by-site
```

If events are absent, check settings, capture times, target identity, supported schema,
workload activity and stack-trace settings. Do not interpret an empty legacy-event view as
zero allocation. Use `jfr print --events jdk.ObjectAllocationSample alloc.jfr` or JMC if a
view is unavailable. Restrict raw printing to a small capture rather than flooding output.

### Event meaning

| HotSpot event                     | Measurement                  | Interpretation                                                                                       |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `jdk.ObjectAllocationSample`      | `weight`                     | Estimated allocation pressure attributed to the sampled class/stack; never the sampled object's size |
| `jdk.ObjectAllocationInNewTLAB`   | `allocationSize`, `tlabSize` | Size of the object triggering refill, versus size of the entire new TLAB                             |
| `jdk.ObjectAllocationOutsideTLAB` | `allocationSize`             | Size of that outside-TLAB allocation                                                                 |
| `jdk.ThreadAllocationStatistics`  | `allocated`                  | Cumulative counter; difference observations for the same thread, never sum snapshots                 |

In OpenJDK 25's shipped configurations, the sampled event is enabled (150/s in default,
300/s in profile); the two legacy events are disabled. Custom configurations can differ.
Legacy events, when explicitly enabled in HotSpot, observe refill and outside-TLAB
allocations, not all objects. Summing their `allocationSize` fields misses allocations
inside existing TLABs. For TLAB-space pressure, sum `tlabSize` on refill plus outside
`allocationSize`, while stating buffer waste and window-boundary limitations.

JFR's sampled event uses the TLAB allocation hooks with throttling, not the JVMTI sampler.
In the JDK 25 implementation, emitted weight is the allocation-counter delta since the
previous emitted sample. Aggregated weights can approximate total pressure; recording
boundaries, unreported tails and thread churn prevent an exact ledger. Short or sparse
captures can mis-rank sites. Never combine this weight with legacy sizes into one total.

Sources: [event schema](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml),
[default configuration](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/default.jfc),
[profile configuration](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/profile.jfc),
[allocation tracer](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/support/jfrAllocationTracer.cpp)
and [sample weighting](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/support/jfrObjectAllocationSample.cpp).

When writing an event consumer, branch on the event type and inspect its schema. Read
`weight` only from `ObjectAllocationSample`; reading a nonexistent `allocationSize`
field fails instead of returning zero. Keep outputs labelled by their distinct units and
populations.

### Increasing detail

If a repeat capture cannot resolve an important site, extend the representative window or
increase the sample rate within the overhead budget. There is no universal sample count
that guarantees visibility of a given percentage site.

```bash
# JDK 17+ configuration tooling; shell example, JAVA_HOME must name the intended JDK
jfr configure --input "$JAVA_HOME/lib/jfr/profile.jfc" --output alloc-hunt.jfc \
    jdk.ObjectAllocationSample#throttle=2000/s
java -XX:StartFlightRecording=settings=alloc-hunt.jfc,filename=alloc.jfr,duration=30s -jar app.jar
```

Enable legacy events only when their refill/individual outside-TLAB data is needed, using
a derived JFC with each event's `enabled=true`. Verify event counts afterwards. Higher
rates and legacy events have workload-dependent cost; do not describe them as inherently safe.

## Counters and virtual threads

Check `isThreadAllocatedMemorySupported()` and `isThreadAllocatedMemoryEnabled()` before
using `com.sun.management.ThreadMXBean`. Its allocation methods promise approximations.
A `-1` can mean disabled measurement, a virtual thread, or a nonexistent/terminated thread;
unsupported functionality may throw. Do not subtract invalid values.

For synchronous work wholly on one platform thread, bracketing with
`getCurrentThreadAllocatedBytes()` (JDK 14+) estimates that thread's allocation; on older
supported JDKs use `getThreadAllocatedBytes(Thread.currentThread().getId())` for that
platform thread. Subtract harness work and measure query overhead. Both exclude delegated
asynchronous work. On supported JDK 21+ implementations, process-total
`getTotalThreadAllocatedBytes()` deltas can avoid
summing only surviving threads, but include unrelated work.
See the [ThreadMXBean contract](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/com/sun/management/ThreadMXBean.html).

In JDK 25, `ThreadAllocationStatistics` iterates JVM JavaThreads (platform/carrier
threads); it is not per-virtual-thread accounting. A sample's `eventThread` may identify
the mounted virtual thread, whereas its weight comes from allocation accounting on the
carrier. Check the actual recording before using thread grouping: do not infer exact
task bytes from either event. Summing periodic statistics also misses threads that start
and finish between observations.
See [periodic statistics](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/periodic/jfrPeriodic.cpp)
and the sample-weighting source above.

Neither the submitting platform thread's counter nor an individual carrier delta measures
an asynchronous virtual-thread request. Prefer sampled producing stacks plus a controlled,
isolated workload and process-total bytes/op; report shared-workload attribution limits.
`StackChunk` allocation can arise from virtual-thread stack freezing; verify the stack and
rate before changing blocking structure. An empty pinned-thread view does not prove this cause.

## TLAB trace interpretation

Use `-Xlog:gc+tlab=debug` for a bounded summary; use `trace` only when per-thread refill
detail is needed and its volume fits the budget. The correct combined tag is `gc+tlab`;
legacy `TraceTLAB` / `PrintTLAB` options are not substitutes on modern HotSpot.

In JDK 25 trace rows, `refill waste` is the current allowed refill-waste **limit**, not
accumulated waste. `gc` and `slow` report accumulated GC-retirement and refill waste;
`waste %` combines those relative to allocated TLAB space. `slow allocs` counts slow
allocations, not their latency. Verify fields against
[ThreadLocalAllocBuffer::print_stats](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/threadLocalAllocBuffer.cpp).
