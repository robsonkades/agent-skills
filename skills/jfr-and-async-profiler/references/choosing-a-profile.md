# Choosing a profile

## Symptom to profile

| Symptom                       | Clock / event          | Command                                      |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| High CPU, throughput-limited  | CPU                    | `asprof -e cpu -d 60 -f cpu.html <pid>`      |
| High latency, **low** CPU     | wall clock             | `asprof -e wall -t -d 60 -f wall.html <pid>` |
| Frequent young collections    | allocation             | `asprof -e alloc --alloc 512k -d 60 ...`     |
| Threads blocked on each other | lock                   | `asprof -e lock --lock 1ms -d 60 ...`        |
| Intermittent, already over    | continuous JFR dump    | `jcmd <pid> JFR.dump name=continuous ...`    |
| Unknown — first look          | JFR `settings=profile` | `jcmd <pid> JFR.start settings=profile ...`  |

The single most consequential choice is the first column's second row. A CPU profile of an
I/O-bound service is _correct_ and answers a question nobody asked; the conclusion "there
is no bottleneck" then closes the investigation.

## Always take two

```bash
asprof -e cpu   -d 60 -f cpu.html   <pid>
asprof -e alloc --alloc 512k -d 60 -f alloc.html <pid>
```

A method can be cheap in CPU and devastating in GC pressure. A call site that is large in
the allocation profile and small in the CPU profile means the problem is GC, not CPU —
and allocation affects the **frequency** of young pauses, not the duration of each one.

## The JFR blocking-event map

| Waiting on                    | Event                     |
| ----------------------------- | ------------------------- |
| `synchronized` contention     | `jdk.JavaMonitorEnter`    |
| `Object.wait()`               | `jdk.JavaMonitorWait`     |
| `java.util.concurrent`, pools | `jdk.ThreadPark`          |
| `Thread.sleep`                | `jdk.ThreadSleep`         |
| network                       | `jdk.SocketRead`          |
| virtual thread pinned         | `jdk.VirtualThreadPinned` |

Two mistakes this table prevents: looking for `synchronized` contention in
`jdk.JavaMonitorWait` (that is `wait`/`notify`), and looking for connection-pool waiting in
a monitor event (HikariCP parks, it does not enter a monitor).

And the corollary: **zero events is not zero contention** until you have checked the
threshold.

```bash
jfr summary recording.jfr    # ALWAYS the first command
```

If the event you want has count zero, the problem is configuration — threshold, filter,
disabled event — and no amount of analysis will produce it.

## Sampling adequacy

The number that authorises a conclusion is the **sample count**, not the percentage. The
error is relative:

| Samples | Approximate relative error |
| ------- | -------------------------- |
| ~1000   | ~3%                        |
| ~100    | ~10%                       |
| ~25     | ~20%                       |
| ~6      | ~41%                       |

Run long enough for the frame you care about to reach ~100 samples. A crisp-looking bar
built from 6 samples is noise rendered confidently.

Also check the fraction of error frames (`[unknown_Java]` and similar). A high fraction is
not a frame to ignore — it means `AsyncGetCallTrace` is failing and the whole profile may
be untrustworthy.

## Before collecting

- [ ] Application warm by an observable criterion, not a `sleep`
- [ ] Load representative in volume, operation mix and concurrency
- [ ] Throughput and p50/p99/p99.9 baseline recorded
- [ ] Clock chosen — CPU for saturation, wall for latency
- [ ] Duration long enough for ~100 samples on the frame of interest
- [ ] Blocking thresholds allow the granularity being investigated
- [ ] Start and end timestamps noted, to correlate with metrics and logs
