# Pinning and carrier diagnostics

## Evidence plan

Collect over the same incident interval:

- useful completion/latency and offered load;
- CPU quota/throttling;
- virtual-thread scheduler MXBean estimates;
- JFR pin, submit-failure, file/socket/park and relevant execution events with recorded settings;
- all-thread dump plus platform dump;
- dependency/resource in-flight and wait.

A completion counter neither confirms nor excludes pinning. A pin event confirms a threshold-crossing
pin, while causality requires scheduler/latency impact.

## RecordingStream example

```java
try (var stream = new RecordingStream()) {
    stream.enable("jdk.VirtualThreadPinned")
            .withThreshold(Duration.ofMillis(configuredThresholdMillis));
    stream.onEvent("jdk.VirtualThreadPinned", event -> {
        pinCount.increment();
        pinDuration.record(event.getDuration());
        sampledPinLogger.log(event.getThread(), event.getStackTrace());
    });
    stream.startAsync();
    // Keep stream ownership tied to the component/application lifecycle.
}
```

Choose threshold and stack-trace volume from the question and overhead budget. A 1 ms threshold is an
experiment, not a universal production floor. High-frequency full-stack logging can become the new
bottleneck and disclose sensitive code/context; aggregate duration/rate and sample stacks.

Inspect actual event metadata/configuration because defaults differ by JDK and recording template.
Start/end events can be too costly at extreme virtual-thread creation rates.

## Scheduler MXBean

```java
var scheduler = ManagementFactory.getPlatformMXBean(
        jdk.management.VirtualThreadSchedulerMXBean.class);

int target = scheduler.getParallelism();
int pool = scheduler.getPoolSize();
int mounted = scheduler.getMountedVirtualThreadCount();
long queued = scheduler.getQueuedVirtualThreadCount();
```

Values are estimates and can be `-1`. Export at moderate cadence with JDK/build and configuration.
`pool > target` shows extra scheduler platform threads, not why they exist. `queued > 0` can be a
transient healthy state; correlate its duration with completion/latency and CPU.

## Stack classification

| Stack/evidence                                        | Classification candidate        | Next check                                           |
| ----------------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| pin event with JNI/foreign frame                      | native/foreign pin              | duration/frequency, operation owner, scheduler queue |
| file read/write stacks, pool expands, no matching pin | captured carrier/compensation   | file latency/concurrency and native thread budget    |
| application CPU frames, queued grows, CPU high        | CPU-ready starvation            | quota/throttling and CPU phase ownership             |
| lock/connection/queue park, scheduler queue low       | normal unmounted wait           | resource queue age/occupancy and deadline            |
| submit-failed event                                   | start/unpark scheduling failure | accompanying exception, native/resource exhaustion   |

Do not use absence of `LockSupport.park` in a sampled wall stack as proof of pinning; sampling can land
inside any frame and native unwinding can be incomplete.

## Remediation choices

### Native/foreign pin is causal

Prefer a newer/non-blocking integration. If unavailable, isolate the exact call on a bounded platform
executor whose queue, rejection, native memory, timeout and shutdown are owned. Crossing to that pool
does not cancel native work automatically.

### Carrier capture is causal

Evaluate asynchronous provider support, reduce/batch file operations, isolate with a measured platform
pool, or tune scheduler maximum only when extra native threads are affordable and the underlying I/O
has capacity. Validate pool size, native memory, context switching and tail latency.

### CPU-ready starvation

Move long CPU phases behind a bounded CPU executor/gate, reduce work or supply CPU capacity. Raising
scheduler target above usable CPU can worsen contention/throttling.

### Suspended memory dominates

Bound admission near the wait, reduce stack/context state, eliminate per-thread expensive caches, and
ensure timed-out work actually ends. Validate retained heap after equivalent load/recovery.

## Scheduler property review

Before changing `jdk.virtualThreadScheduler.parallelism` or `maxPoolSize`, record current values,
defaults on this build, CPU/native-memory budget, predicted signal and rollback threshold. The maximum
is not a virtual-thread concurrency cap. Do not compute its cost as exactly `max × 1 MB`; platform
stack reservation/commit and kernel cost vary by environment.

## Checklists

### Before production

- [ ] JNI/foreign and heavy file paths inventoried under representative load.
- [ ] Resource-local concurrency/deadlines remain explicit after migration.
- [ ] ThreadLocal/inherited context memory reviewed at projected cardinality.
- [ ] Scheduler/JFR/application telemetry has bounded overhead and secure retention.
- [ ] Cancellation and shutdown tests prove resource return, not only caller completion.

### During incident

- [ ] Exact JDK/build/config and CPU limits captured.
- [ ] Pin, capture, CPU-ready and normal-wait hypotheses compared.
- [ ] MXBean estimates, JFR stacks and useful progress aligned in time.
- [ ] No scheduler/lock rewrite occurred before baseline capture.
- [ ] Intervention validated against throughput, tail, scheduler queue and resource health.

## References

- [Java 25 virtual-thread JFR guidance](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
- [JEP 444 pinning and scheduler compensation boundaries](https://openjdk.org/jeps/444)
- [JEP 491](https://openjdk.org/jeps/491)
