# Measuring and reducing contention

## Confirm the mechanism first

```bash
java -XX:+PrintFlagsFinal -version | grep LockingMode
# JDK 25:  int LockingMode = 2  {product} {default}   -- 2 = LM_LIGHTWEIGHT
# JDK 21 and JDK 26+: no output at all -- the flag does not exist
```

A value of `1` means `-XX:LockingMode=1` was set somewhere in the configuration. Flag it for
removal before comparing measurements against current material.

**Empty output is not a failed command.** Measured on Temurin 21.0.12, 25.0.4 and 26.0.2:
the flag is absent on 21, present on 25, and absent again from 26. On those releases there is
one locking implementation and nothing to confirm, so read the empty result as "not
applicable", never as "the grep broke" or "the default is 0".

## Thread state to JFR event

| Observed thread state                                                                  | Correct event          | Not this           |
| -------------------------------------------------------------------------------------- | ---------------------- | ------------------ |
| `BLOCKED` entering `synchronized`                                                      | `jdk.JavaMonitorEnter` | `ThreadPark`       |
| `WAITING` / `TIMED_WAITING` in `Object.wait()`                                         | `jdk.JavaMonitorWait`  | —                  |
| `WAITING` / `TIMED_WAITING` in `LockSupport.park()`, `ReentrantLock`, connection pools | `jdk.ThreadPark`       | `JavaMonitorEnter` |

`jdk.JavaMonitorEnter` is labelled _Java Monitor Blocked_ and carries `monitorClass`,
`previousOwner` and `address`. Connection-pool waiting does **not** enter an intrinsic
monitor and will never appear as `JavaMonitorEnter`.

All three events have a **10 ms threshold in `profile.jfc`** and 20 ms in `default.jfc`.
Finer contention is invisible until you build a custom settings file with `jfr configure`.

## Collection

```bash
jcmd <pid> JFR.start settings=profile duration=60s filename=locks.jfr
```

```bash
# async-profiler, sampling lock-contention events
./profiler.sh -e lock -d 30 -o flamegraph -f locks.html <pid>

# wall-clock: threads parked or waiting rise to the top even with no CPU burnt
./profiler.sh -e wall -d 30 -o flamegraph -f wall.html <pid>
```

```bash
jstack <pid> | grep -A 5 "BLOCKED\|waiting on"
jcmd <pid> Thread.print | grep "java.lang.Thread.State:" | sort | uniq -c

# with virtual threads, the two above show nothing — this is the supported path
jcmd <pid> Thread.dump_to_file -format=json dump.json
```

Aggregating a recording by monitor class:

```java
Map<String, LongSummaryStatistics> waitByClass = new HashMap<>();
for (RecordedEvent event : RecordingFile.readAllEvents(Path.of("locks.jfr"))) {
    if (!event.getEventType().getName().equals("jdk.JavaMonitorEnter")) continue;
    waitByClass.computeIfAbsent(event.getClass("monitorClass").getName(),
                                k -> new LongSummaryStatistics())
               .accept(event.getDuration().toMillis());
}
```

`RecordingFile.readAllEvents` is **static**; calling it on an instance does not compile.

## Programmatic detection

```java
ThreadMXBean threadBean = ManagementFactory.getThreadMXBean();
long[] deadlocked = threadBean.findDeadlockedThreads();

threadBean.setThreadContentionMonitoringEnabled(true);
for (ThreadInfo ti : threadBean.getThreadInfo(threadBean.getAllThreadIds(), true, true)) {
    if (ti.getBlockedTime() > 100) { /* report ti.getLockName() */ }
}
```

## Overhead

```
overhead = total_lock_wait_ns / (recording_duration_ns * monitored_thread_count) * 100
```

The denominator is aggregate **wall time**, not CPU time — the two answer different
questions. Triage bands:

| Overhead | Reading                             |
| -------- | ----------------------------------- |
| < 5%     | acceptable in most load profiles    |
| 5–20%    | investigate; already visible in p99 |
| > 20%    | likely the dominant bottleneck      |

## Reducing contention, in order of preference

**Narrow the section.** Only the shared mutation needs the lock; validation, transformation
and logging do not.

```java
public void processRequest(Request req) {
    validateInput(req);
    transformData(req);
    synchronized (sharedState) { sharedState.update(req.getKey(), req.getValue()); }
    logProcessing(req);
}
```

**Partition by key.** One lock per hash shard turns one queue into N.

```java
private static final int SHARDS = 64;
int shard = Math.abs(key.hashCode()) % SHARDS;
synchronized (locks[shard]) { shards[shard].get(key).increment(); }
```

**Confine to the thread.** A `ThreadLocal` accumulator merged into the global one at a much
lower frequency removes the lock from the hot path entirely.

**Change primitive last**, on the read/write profile:

| Scenario                                    | Primitive                       |
| ------------------------------------------- | ------------------------------- |
| Simple critical section, low contention     | `synchronized`                  |
| Needs `tryLock()` or an acquisition timeout | `ReentrantLock`                 |
| Reads ≫ writes, high concurrency            | `StampedLock`                   |
| High-frequency concurrent counter           | `LongAdder`                     |
| Concurrent map                              | `ConcurrentHashMap`             |
| Work queue between threads                  | `LinkedBlockingQueue`           |
| Publishing one immutable value              | `volatile` field                |
| Atomic operation on a single field          | `AtomicReference` / `VarHandle` |

Rule of thumb, to be calibrated against the real workload: reads > 10× writes suggests
`StampedLock`; reads > 2× writes suggests `ReentrantReadWriteLock`; reads ≈ writes means
`synchronized` or `ReentrantLock` already suffices.

`AtomicLong` avoids the lock but still contends one cache line; `LongAdder` stripes the sum
instead.

## Validating the fix

- Aggregate `jdk.JavaMonitorEnter` time or `BLOCKED` count must fall — not merely
  throughput, which can rise for unrelated reasons.
- Rerun under the same load, same environment and same warm-up, before and after.
- Check which resource became the next limit. Relieving lock contention usually reveals it.
