# Thread incident triage

## Collect a dump that includes virtual threads

```bash
jcmd <pid> Thread.dump_to_file -format=json /tmp/threads.json
```

`jstack` omits virtual threads entirely. In a Loom application its output is misleadingly
empty: the handful of carrier platform threads appear, and the thousands of virtual threads
where the work actually is do not.

Group the blocked threads by top frame:

```bash
jq '[.threadDump.threadContainers[].threads[].stack[0]] | group_by(.)
    | map({f: .[0], n: length}) | sort_by(-.n) | .[:10]' /tmp/threads.json
```

Take three dumps 15 seconds apart. One dump shows a state; three show whether it is stuck.

## Choose the right JFR event

| Waiting on                    | Event                     |
| ----------------------------- | ------------------------- |
| `synchronized` contention     | `jdk.JavaMonitorEnter`    |
| `Object.wait()`               | `jdk.JavaMonitorWait`     |
| `java.util.concurrent`, pools | `jdk.ThreadPark`          |
| `Thread.sleep`                | `jdk.ThreadSleep`         |
| network                       | `jdk.SocketRead`          |
| virtual thread pinned         | `jdk.VirtualThreadPinned` |

Connection-pool waiting is `LockSupport.park`, so it is `jdk.ThreadPark` — **not** a
monitor event. Looking in the wrong event produces the false negative "there is no
contention".

**Zero events is not zero contention** until the threshold has been checked: 20 ms in
`default.jfc`, 10 ms in `profile.jfc`. A thousand 3 ms waits per second are invisible at
those defaults.

```bash
jfr configure --input default.jfc --output fine.jfc \
    jdk.ThreadPark#threshold=1ms jdk.VirtualThreadPinned#threshold=1ms
```

## Confirming pinning

Do not presume `synchronized` — on JDK 24+ it does not pin. Confirm the actual cause from
the event stack: a native frame (JNI or a blocking FFM downcall) or a class initialiser.

`-Djdk.tracePinnedThreads` was removed. It is still accepted on the command line and does
nothing, so its silence is not evidence.

## Wall-clock profiling

```bash
asprof -e wall -t -d 60 -f wall.html <pid>
```

A CPU profile is structurally blind to blocked threads. If latency is high and CPU is low,
a CPU profile reports "no bottleneck", which is the worst possible outcome.

## Order of questions during the incident

- [ ] Dump collected with `Thread.dump_to_file -format=json`?
- [ ] State distribution obtained, and blocked threads grouped by top frame?
- [ ] JFR collected, with thresholds lowered if fine-grained contention is suspected?
- [ ] Pinning, if present, confirmed as native frame or class initialiser — not presumed?
- [ ] async-profiler run in **wall** mode, not CPU?
- [ ] Verified whether the real bottleneck is the downstream resource, **before** touching
      the pool?
- [ ] Utilisation and queue size compared against baseline, not only latency?
