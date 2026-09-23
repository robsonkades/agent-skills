# What unmounts and what does not

## The classification table

These are waiting-path expectations for the stock HotSpot JDK 21–25 implementations,
not guarantees for arbitrary providers. Immediately completed operations need not park.
An enclosing native frame or, on JDK 21–23, held monitor can prevent an otherwise
unmountable operation from releasing its carrier. `HttpClient` callbacks and custom body
handlers must be classified separately from its supported network waits.

| Operation                                                    | On a virtual thread             | Carrier                                      |
| ------------------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| Socket read/write/connect/accept (`java.net`, NIO blocking)  | unmounts                        | free                                         |
| `HttpClient` send / body reads                               | unmounts                        | free                                         |
| `BlockingQueue` put/take, `CountDownLatch`, `Semaphore`      | unmounts                        | free                                         |
| `Thread.sleep`, `LockSupport.park`                           | unmounts                        | free                                         |
| `ReentrantLock`, `Condition.await`                           | unmounts                        | free                                         |
| `synchronized` entry and `Object.wait` — **JDK 24+**         | unmounts                        | free                                         |
| Java park while holding `synchronized` — JDK 21–23           | **pins**                        | held; pinning alone requests no compensation |
| Contended monitor entry — JDK 21–23                          | retains carrier                 | no compensation                              |
| `Object.wait` — JDK 21–23                                    | **captures**                    | compensation may apply                       |
| Recognized synchronous file-I/O blocking regions             | **captures**                    | compensation may apply                       |
| Java park inside an enclosing JNI or FFM frame               | **pins**                        | held; pinning alone requests no compensation |
| Direct native blocking without a JDK compensation hook       | retains carrier                 | held, no compensation                        |
| Java park inside a class initialiser (`<clinit>`), JDK 21–25 | **pins**                        | held; pinning alone requests no compensation |
| CPU-bound computation                                        | neither — nothing to unmount at | held until it finishes                       |

The useful distinction is the outcome of the actual wait:

```text
unmount                  the carrier can run another task; downstream limits still apply.
retain + compensate      spare capacity may be provided within scheduler/resource limits.
retain, no compensation  carrier unavailable until progress; enough such waits can starve queued work.
```

Do not infer compensation solely from the presence of a native frame. For example, OpenJDK
25's `Blocker.begin()` asks `CarrierThread.beginBlocking()` to compensate before a recognized
blocking region; this can wrap native I/O. A failed unmount due to pinning does not itself
invoke that mechanism. These implementation hooks are evidence to inspect, not application
APIs to call.

## Telling them apart with evidence

On Java 24+, prefer `VirtualThreadSchedulerMXBean` estimates of pool size, mounted and queued
work to carrier-name counting. Inspect the current target and tuning history: `maxPoolSize`
is a startup input, not an immutable ceiling after runtime parallelism changes. See
`virtual-threads-internals` for unavailable estimates and compensation limits.

```bash
# Capture logical request stacks and platform-thread context for the same workload window.
jcmd <pid> Thread.dump_to_file -format=json /tmp/d.json
jcmd <pid> Thread.print > /tmp/platform-threads.txt

# Pinning events: check recording settings; the default 20 ms threshold hides short cases.
jfr print --events jdk.VirtualThreadPinned recording.jfr
```

On JDK 21–23, identify candidate carriers from scheduler containers/stacks and correlate
their counts across captures; names are implementation details. Do not count
`VirtualThread-unparker` timer helpers or pollers as carriers. These shell commands assume
a POSIX shell, compatible JDK tools, attach access and an existing recording.

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

For a concrete OpenJDK 25 example, `FileChannelImpl` read paths use
`Blocker.begin(direct)` and write paths use `Blocker.begin(sync || direct)`. Ordinary
buffered reads therefore do not request compensation through that hook. Here `direct`
means the file's direct-I/O mode, not a direct `ByteBuffer`. Inspect the operation and
open mode before predicting carrier growth; do not change storage semantics to induce it.

Three responses, in order of preference:

1. **Reduce the concurrency of the file work.** Put a semaphore before acquisition and find
   its size experimentally from throughput, p99, device queueing, CPU and memory. Bound
   waiting admission too; a semaphore alone does not bound the number of retained requests.
   HDDs, local NVMe, network filesystems and page-cache hits have different optima.
2. **Isolate it.** Run file I/O on a dedicated, sized platform executor, keeping the
   virtual-thread scheduler for network work. Blocking a thread you provisioned is fine;
   retaining a shared carrier may justify isolation when measurements show interference.
3. **Consider `maxPoolSize` only for waits that request compensation**, with measured native
   memory headroom and an alarm on saturation. It does not remove carrier retention or
   help an uncompensated file wait.

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

| Finding             | Action                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Unmounts            | nothing; size the downstream resource and move on                                                   |
| Captures (file I/O) | bound the concurrency, or isolate on a sized platform pool                                          |
| Pins (native frame) | isolate the blocking native invocation when duration/frequency justify it                           |
| Pins (`<clinit>`)   | move blocking initialization to explicit startup when feasible; inspect initialization dependencies |
| CPU-bound           | bound CPU parallelism from effective CPU capacity; isolate long phases when they impair other work  |

Use isolation when retained-carrier duration and frequency justify it, rather than for
every native call. Bound queued work as well as workers, propagate failures, and retain
resource ownership until the operation actually finishes. Cancellation or a timed-out
Future does not prove a native call stopped; configure operation deadlines and account for
work that continues after the caller leaves.

Place the offload boundary outside the frame that prevents unmounting. A JNI callback that
submits inner work and waits for its Future still has the native frame on its stack; it
can retain its carrier while the worker runs. The same concern applies to waits inside
class initialization. Initializers that await tasks requiring that same class can also
deadlock; warming them at startup does not repair the dependency cycle.

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
- [OpenJDK 25 Blocker](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/jdk/internal/misc/Blocker.java)
  and [CarrierThread](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/jdk/internal/misc/CarrierThread.java):
  explicit compensation regions, independent of the native operation's inability to unmount.
- [OpenJDK 25 VirtualThread](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/lang/VirtualThread.java):
  scheduler carriers versus timer/unblocker helpers.
- [OpenJDK 25 FileChannelImpl](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/sun/nio/ch/FileChannelImpl.java):
  compensation conditions depend on the operation and file mode.
- [JLS 25 initialization procedure](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4.2):
  another thread needing the initializing class waits for initialization to finish; use this
  dependency rule to identify cycles before moving initialization work.
