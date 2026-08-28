# Pinning diagnostics

## The event

`-Djdk.tracePinnedThreads` was removed in JDK 24 alongside JEP 491. It is still accepted on
the command line and does nothing at all. The only source of truth is the JFR event
`jdk.VirtualThreadPinned`.

| Field                    | Meaning                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `startTime` / `duration` | When the pin began and how long the virtual thread stayed pinned                          |
| `eventThread`            | The virtual thread that pinned, by name if it was named                                   |
| `stackTrace`             | The stack at the moment of the pin — where the native frame or `<clinit>` becomes visible |

## Real-time instrumentation

```java
import jdk.jfr.consumer.RecordingStream;
import java.time.Duration;
import java.util.concurrent.atomic.LongAdder;

LongAdder pinnedEvents = new LongAdder();

try (RecordingStream rs = new RecordingStream()) {
    // Explicit threshold — profile.jfc defaults to 20 ms and hides
    // short, frequent pinning.
    rs.enable("jdk.VirtualThreadPinned").withThreshold(Duration.ofMillis(1));

    rs.onEvent("jdk.VirtualThreadPinned", event -> {
        pinnedEvents.increment();
        System.out.println(event.getThread() + " pinned for "
                + event.getDuration().toMillis() + " ms at:\n"
                + event.getStackTrace());
    });

    rs.startAsync();
    // ... workload runs here ...
    rs.stop();
}
```

The difference between this and counting completed tasks is categorical, not subtle. A
pinned task also completes successfully — it merely took longer and held a whole carrier
while doing so. Counting successes measures whether the code works; counting
`jdk.VirtualThreadPinned` events measures whether it pins. Different questions.

## Watching compensation

There is no dedicated JFR event for "the scheduler compensated N carriers". The indirect
signal is the count of system threads named `ForkJoinPool-<n>-worker-<m>` growing past the
configured `parallelism`, towards `maxPoolSize`:

```bash
jcmd <pid> Thread.dump_to_file -format=json /tmp/threads.json

jq -r '.threadDump.threadContainers[].threads[]?.name' /tmp/threads.json \
  | grep -c 'ForkJoinPool-1-worker'
# Track this over time against jdk.virtualThreadScheduler.parallelism.
# Sustained growth towards maxPoolSize is compensation happening NOW.
```

Never `jstack` — it does not list virtual threads.

## The wall-clock flame-graph signature

Run `asprof -e wall -t`. When the pin is caused by a native downcall, the flame graph shows
the native frame (JNI or FFM) directly beneath the Java frame that invoked it, **with no**
`LockSupport.park` or `Object.wait` frame above it — because no unmount happened. That
absence of a parking frame, combined with a wide native frame, is what separates pinning
from legitimate waiting in a flame graph.

## Sizing `maxPoolSize` as a memory budget

Every compensation carrier is a real platform thread with the full cost of one. Sizing
`maxPoolSize` without that arithmetic repeats, through another door, the mistake of a fixed
thread pool with an unbounded queue: a ceiling that exists on paper but was never thought
of as a memory budget.

```
Worst-case memory budget for full compensation:
maxPoolSize × ThreadStackSize + per-thread kernel overhead

Example: maxPoolSize = 256, default -Xss (1 MB reserved)
256 × 1 MB ≈ 256 MB of reserved address space
            (real RSS depends on the stack depth actually used)
```

| Scenario                                             | Guidance                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No known blocking JNI/FFM dependency on the hot path | Keep the default; still monitor `jdk.VirtualThreadPinned` — transitive dependencies change                                                                               |
| Native dependency identified, occasional use         | Lower `maxPoolSize` to a number you can afford in memory, and treat its saturation as an alarm, not an infinite safety net                                               |
| Native dependency on the hot path, constant use      | Do not manage this through `maxPoolSize`: isolate the native call in a dedicated, Little's-Law-sized platform `ExecutorService`, out of the virtual-thread path entirely |

## Pre-production checklist

- [ ] `jdk.virtualThreadScheduler.parallelism` and `maxPoolSize` set deliberately, not left
      at the default by omission, and `maxPoolSize` translated into a memory budget.
- [ ] All JNI/FFM dependencies on the hot path mapped and, where blocking, isolated in a
      dedicated platform pool.
- [ ] The HTTP framework explicitly configured for virtual threads, not assumed.
- [ ] `jdk.VirtualThreadPinned` instrumented via `RecordingStream` or continuous JFR **in
      production**, with an adjusted threshold — not only in the lab.
- [ ] Every `synchronized` / `ReentrantLock` choice decided on semantics, with no migration
      done "as a precaution against pinning".
- [ ] Any `StructuredTaskScope` code compiled against the preview matching the production
      JDK, not copied from pre-2025 material using `ShutdownOnFailure`/`ShutdownOnSuccess`.
- [ ] `ScopedValue` used only as immutable context; caching an expensive resource remains
      the job of an explicit pool.

## Incident checklist

- [ ] `jcmd <pid> Thread.dump_to_file -format=json` collected and `ForkJoinPool-*-worker-*`
      threads counted — is it above the configured `parallelism`?
- [ ] JFR collected with `jdk.VirtualThreadPinned#threshold` lowered to 1 ms before
      concluding there is no pinning.
- [ ] The event's `stackTrace` points at a native frame or a `<clinit>` — not at an
      unverified assumption.
- [ ] Pinning (carriers held, events present), starvation (virtual threads `RUNNABLE`
      waiting for a free carrier, no pinning events) and legitimate downstream waiting told
      apart before acting.
- [ ] If the cause is saturated compensation: the fix applied was isolating the blocking
      call, not merely raising `maxPoolSize` to "give it room", which only postpones the
      same ceiling.
