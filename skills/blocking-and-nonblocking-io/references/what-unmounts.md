# What unmounts and what does not

## The classification table

| Operation                                                            | On a virtual thread             | Carrier                |
| -------------------------------------------------------------------- | ------------------------------- | ---------------------- |
| Socket read/write/connect/accept (`java.net`, NIO blocking)          | unmounts                        | free                   |
| `HttpClient` send / body reads                                       | unmounts                        | free                   |
| `BlockingQueue` put/take, `CountDownLatch`, `Semaphore`              | unmounts                        | free                   |
| `Thread.sleep`, `LockSupport.park`                                   | unmounts                        | free                   |
| `ReentrantLock`, `Condition.await`                                   | unmounts                        | free                   |
| `synchronized` entry and `Object.wait` — **JDK 24+**                 | unmounts                        | free                   |
| `synchronized` entry and `Object.wait` — JDK 21–23                   | **pins**                        | held, no compensation  |
| File system reads/writes (`FileInputStream`, `FileChannel`, `Files`) | **captures**                    | held, **compensated**  |
| A blocking call inside a JNI or FFM frame                            | **pins**                        | held, no compensation  |
| Blocking inside a class initialiser (`<clinit>`), JDK ≤ 25           | **pins**                        | held, no compensation  |
| Waiting for another thread's `<clinit>`, JDK 26+ (JDK-8369238)       | **unmounts** in most cases      | released               |
| CPU-bound computation                                                | neither — nothing to unmount at | held until it finishes |

The three outcomes are genuinely different problems:

```text
unmount      the carrier runs someone else's work.            Nothing to fix.
capture      the scheduler adds a carrier to cover for it.    Costs threads + memory; has a ceiling.
pin          the carrier is gone until the call returns.      Costs a carrier outright; no ceiling protects you.
```

## Telling them apart with evidence

```bash
# Candidate carriers over time. Names are implementation details; correlate with workload.
jcmd <pid> Thread.dump_to_file -format=json /tmp/d.json
grep -c 'VirtualThread-unparker\|ForkJoinPool-1-worker' /tmp/d.json

# Pinning: the only source of truth. The 20 ms default threshold hides the frequent short case.
jfr print --events jdk.VirtualThreadPinned recording.jfr
```

Rules of reading:

- **Pinning events present** → a native frame or a `<clinit>`. The event's stack trace names
  it. Do not presume `synchronized` on JDK 24+; it does not pin any more.
- **No pinning events, carriers growing towards `maxPoolSize`** → compensation is a strong
  hypothesis. Correlate file/socket/JFR events and stacks; thread names or counts alone do
  not identify the operation.
- **No pinning, carrier count flat, virtual threads RUNNABLE and waiting** → neither: the
  work is CPU-bound and the ceiling is the core count.
- **Nothing anomalous anywhere** → the dependency is simply slow. That is a downstream
  problem, not a threading one, and no amount of scheduler tuning will move it.

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
   blocking one the JDK provisioned for everyone is not.
3. **Raise `maxPoolSize` deliberately**, as a memory budget with an alarm on saturation —
   not as a reflex. It buys headroom; it does not remove the capture.

Memory-mapped I/O (`MappedByteBuffer`) turns reads into page faults, which are not visible as
blocking at all — no unmount, no capture, no event, and a stall the profiler attributes to
the instruction that touched the page. That is not a fix; it is a different set of
diagnostics.

## Verifying a third-party client

Never conclude from the name. A "reactive" driver may hold a bounded internal pool; a
"blocking" driver may be pure `java.net` and unmount perfectly.

```java
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

Isolating is the general answer to both pinning and capture, and it is a design that ages
well: work that holds an OS thread should hold one **you** provisioned, in a pool with a
size, a queue and a rejection policy.
