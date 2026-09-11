# What unmounts and what does not

## The classification table

These are waiting-path expectations for the stock HotSpot JDK 21–25 implementations,
not guarantees for arbitrary providers. Immediately completed operations need not park.
An enclosing native frame or, on JDK 21–23, held monitor can prevent an otherwise
unmountable operation from releasing its carrier. `HttpClient` callbacks and custom body
handlers must be classified separately from its supported network waits.

| Operation                                                   | On a virtual thread             | Carrier                |
| ----------------------------------------------------------- | ------------------------------- | ---------------------- |
| Socket read/write/connect/accept (`java.net`, NIO blocking) | unmounts                        | free                   |
| `HttpClient` send / body reads                              | unmounts                        | free                   |
| `BlockingQueue` put/take, `CountDownLatch`, `Semaphore`     | unmounts                        | free                   |
| `Thread.sleep`, `LockSupport.park`                          | unmounts                        | free                   |
| `ReentrantLock`, `Condition.await`                          | unmounts                        | free                   |
| `synchronized` entry and `Object.wait` — **JDK 24+**        | unmounts                        | free                   |
| Blocking while holding `synchronized` — JDK 21–23           | **pins**                        | held, no compensation  |
| Contended monitor entry — JDK 21–23                         | retains carrier                 | no compensation        |
| `Object.wait` — JDK 21–23                                   | **captures**                    | compensation may apply |
| Recognized synchronous file-I/O blocking regions            | **captures**                    | compensation may apply |
| A blocking call inside a JNI or FFM frame                   | **pins**                        | held, no compensation  |
| Blocking inside a class initialiser (`<clinit>`), JDK ≤ 25  | **pins**                        | held, no compensation  |
| CPU-bound computation                                       | neither — nothing to unmount at | held until it finishes |

The three outcomes are genuinely different problems:

```text
unmount      the carrier runs someone else's work.            Nothing to fix.
capture      the scheduler adds a carrier to cover for it.    Costs threads + memory; has a ceiling.
pin          the carrier is gone until the call returns.      Costs a carrier outright; no ceiling protects you.
```

## Telling them apart with evidence

On Java 24+, prefer `VirtualThreadSchedulerMXBean` estimates of pool size, mounted and queued
work to carrier-name counting. Inspect the current target and tuning history: `maxPoolSize`
is a startup input, not an immutable ceiling after runtime parallelism changes. See
`virtual-threads-internals` for unavailable estimates and compensation limits.

```bash
# Candidate carriers over time. Names are implementation details; correlate with workload.
jcmd <pid> Thread.dump_to_file -format=json /tmp/d.json
grep -c 'VirtualThread-unparker\|ForkJoinPool-1-worker' /tmp/d.json

# Pinning events: check recording settings; the default 20 ms threshold hides short cases.
jfr print --events jdk.VirtualThreadPinned recording.jfr
```

Rules of reading:

- **Pinning events present** → inspect the event and stack against the deployed JDK.
  Held monitors also matter on JDK 21–23; do not presume that cause on JDK 24+.
- **No pinning events, carriers growing towards `maxPoolSize`** → compensation is a strong
  hypothesis. Correlate file/socket/JFR events and stacks; thread names or counts alone do
  not identify the operation.
- **No events and a flat carrier count** → inconclusive. A native syscall can retain the
  carrier without attempting a Java park and therefore without emitting this event.
  Correlate wall/native stacks and per-thread CPU; RUNNABLE alone does not prove CPU work.
- **No anomaly in the recording** → verify event enablement, thresholds and workload
  coverage. Use dependency spans and pool-wait measurements before blaming downstream
  latency. Missing observations are not a diagnosis.

## File-heavy workloads

This is the category where "just use virtual threads" needs qualification. Many synchronous
filesystem operations cannot unmount and may trigger scheduler compensation up to the
implementation's maximum-pool-size policy. Platform-stack reservation, commit, guard pages
and native overhead vary by OS, JVM and `-Xss`; measure native memory and process thread
count rather than multiplying by a presumed 1 MB constant.

Three responses, in order of preference:

1. **Reduce the concurrency of the file work.** Put a semaphore before acquisition and find
   its size experimentally from throughput, p99, device queueing, CPU and memory. HDDs,
   local NVMe, network filesystems and page-cache hits have radically different optima.
2. **Isolate it.** Run file I/O on a dedicated, sized platform executor, keeping the
   virtual-thread scheduler for network work. Blocking a thread you provisioned is fine;
   retaining a shared carrier may justify isolation when measurements show interference.
3. **Raise `maxPoolSize` deliberately**, as a memory budget with an alarm on saturation —
   not as a reflex. It buys headroom; it does not remove the capture.

Memory-mapped I/O (`MappedByteBuffer`) can stall on page faults while retaining the carrier,
without a Java park or scheduler compensation. JFR file-read and pinning events alone do
not expose this; correlate OS major-fault counters and native/wall profiles. Mapping is
not evidence that storage waits disappeared.

## Completion and resource ownership

A blocking socket read can return a short count; a non-blocking channel can return zero.
Handle partial progress, EOF and errors under the protocol's framing contract; readiness
does not promise a complete message. Do not spin on zero progress or treat it as EOF.

For example, Java 25 `HttpClient.send(..., BodyHandlers.ofInputStream())` can return after
headers while the body is still arriving. The caller owns reading and closing that stream;
offloading only `send` leaves later reads on whichever thread consumes it. An asynchronous
response stage can likewise finish before a streaming body. Keep stream/connection ownership
and limits through the actual consumption/close boundary, and classify consumer callbacks too.
Neither local completion nor cancellation establishes that a remote operation stopped.

## Verifying a third-party client

Never conclude from the name. A "reactive" driver may hold a bounded internal pool; a
"blocking" driver may be pure `java.net` and unmount perfectly.

```text
Screening pseudocode (Java 21+ APIs; client, timeouts and result collection are omitted):
// The direct test: run N concurrent calls on virtual threads with a scheduler
// parallelism of 1, and see whether they interleave.
// -Djdk.virtualThreadScheduler.parallelism=1 -Djdk.virtualThreadScheduler.maxPoolSize=1
try (var exec = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 50; i++) exec.submit(() -> client.call());
}
// Near one-call latency suggests overlap; near N × latency suggests serialization.
```

With `maxPoolSize=1` there is no compensation headroom, so capture and pinning can both look
serial. This is only a controlled screening test: connection-pool limits, server
serialization, rate limits and CPU can produce the same timing. Repeat, retain exceptions,
inspect JFR pinning and I/O events, and compare with a platform-executor control.

Common hypotheses worth testing: a pure supported JDK socket path can unmount; a native
client call pins for its duration; CPU-heavy compression/cryptography consumes a carrier
without being "blocked" at all. DNS, TLS, filesystem access, pool admission and driver
internals mean a JDBC product name is not enough to classify the complete call path.

## What to do with each finding

| Finding             | Action                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Unmounts            | nothing; size the downstream resource and move on                         |
| Captures (file I/O) | bound the concurrency, or isolate on a sized platform pool                |
| Pins (native frame) | isolate on a sized platform executor; the carrier pool must not absorb it |
| Pins (`<clinit>`)   | force class initialisation at startup, before the load arrives            |
| CPU-bound           | a fixed pool sized to cores; virtual threads add nothing                  |

Use isolation when retained-carrier duration and frequency justify it, rather than for
every native call. Bound queued work as well as workers, propagate failures, and retain
resource ownership until the operation actually finishes. Cancellation or a timed-out
Future does not prove a native call stopped; configure operation deadlines and account for
work that continues after the caller leaves.

## Sources

- [Java 25 InputStream](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/InputStream.html),
  [SocketChannel](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/SocketChannel.html)
  and [streaming HTTP body handlers](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpResponse.BodyHandlers.html):
  partial progress, EOF and the distinction between response return and body consumption/close.
- [Oracle JDK 21 virtual threads](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html)
  and [JDK 24 virtual threads](https://docs.oracle.com/en/java/javase/24/core/virtual-threads.html):
  release-specific pinning and JFR diagnostics.
- [JDK 21 Object.wait implementation](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/lang/Object.java):
  explicit `Blocker.begin`/`end` around `wait0`, unlike contended monitor entry in
  [HotSpot's monitor implementation](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/runtime/objectMonitor.cpp).
  These are implementation details, not API contracts.
- [JDK 21 VirtualThread implementation](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/lang/VirtualThread.java):
  pinned parking and event emission; direct native blocking need not take this path.
