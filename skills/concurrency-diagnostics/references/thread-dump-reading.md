# Reading a thread dump

## The two formats, and what each one holds

```bash
# Classic: platform threads only, WITH lock ownership and deadlock detection
jcmd <pid> Thread.print > /tmp/classic.txt          # jstack <pid> is the same output

# JSON: platform AND virtual threads, WITH the scope hierarchy, WITHOUT lock information
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json
```

| Contains                                | `Thread.print` | JSON dump |
| --------------------------------------- | -------------- | --------- |
| Platform threads                        | yes            | yes       |
| **Virtual threads**                     | **no**         | yes       |
| Monitor ownership, `- locked <0x…>`     | yes            | **no**    |
| "Found one Java-level deadlock"         | yes            | **no**    |
| `StructuredTaskScope` parent/child tree | no             | yes       |
| Safepoint required to collect           | yes            | no        |

Collect both, every time, in the same minute. The habit costs two seconds and removes the
most common evidence gap in a virtual-thread incident.

## The deadlock signature

```text
Found one Java-level deadlock:
=============================
"worker-3":
  waiting to lock monitor 0x00007f... (object 0x000000076ab..., a java.lang.Object),
  which is held by "worker-7"
"worker-7":
  waiting to lock monitor 0x00007f... (object 0x000000076ab..., a java.lang.Object),
  which is held by "worker-3"
```

The JVM prints this itself when the cycle is among **platform** threads and involves monitors
or `java.util.concurrent` locks. Programmatically, the same detection is
`ThreadMXBean.findDeadlockedThreads()`.

For **virtual** threads there is no detector. The signature has to be read manually from the
JSON dump: a set of virtual threads all parked in `await`/`acquire`/`get` on objects that each
other hold, with carriers idle and CPU near zero. Search for the frames rather than the
cycle:

```bash
jq -r '.threadDump.threadContainers[].threads[]
       | select(.stack != null)
       | .stack[0]' /tmp/dump.json | sort | uniq -c | sort -rn | head -20
```

If the top entries are `LockSupport.park`, `AbstractQueuedSynchronizer$ConditionNode.block`
or `Semaphore.acquire`, and two dumps ten seconds apart are identical, the system is stuck
rather than slow — and then the question becomes which resource each group is waiting for.

## Aggregating a dump with 100 000 threads

Reading it is not an option; counting it is.

```bash
# Top stack frames by thread count — the shape of the whole system in ten lines
jq -r '[.threadDump.threadContainers[].threads[]] | .[] | .stack[0] // "no-stack"' /tmp/dump.json \
  | sort | uniq -c | sort -rn | head

# How many threads are in each container (each executor / scope)
jq -r '.threadDump.threadContainers[] | "\(.container): \(.threads | length)"' /tmp/dump.json

# Carriers: growth beyond availableProcessors() means compensation is running
grep -c 'ForkJoinPool-1-worker' /tmp/dump.json
```

Two numbers decide the next step: how many threads are parked in the _same_ frame (a shared
resource everything waits for), and whether the carrier count is stable or climbing.

## Starvation versus deadlock versus slow

| Observation                                             | Reading                                             |
| ------------------------------------------------------- | --------------------------------------------------- |
| Same stacks in two dumps, CPU ~0                        | stuck: deadlock, or waiting on something dead       |
| Different stacks, CPU ~0, deep queue                    | slow: a downstream or a bounded resource            |
| Different stacks, CPU high, little progress             | contention or livelock                              |
| Virtual threads RUNNABLE, carriers all busy             | starvation: not enough carriers, or CPU-bound work  |
| Carriers climbing towards `maxPoolSize`                 | capture (file I/O) or pinning — check the JFR event |
| Few virtual threads, many idle carriers, low throughput | the bottleneck is upstream: nothing is arriving     |

"Virtual threads RUNNABLE but not running" is the one that has no equivalent in the
platform-thread world, and the one most often misread as a stall. It means the scheduler has
more runnable work than carriers — the fix is either less CPU-bound work on virtual threads
or an acceptance that the core count is the ceiling.

## Reading a `StructuredTaskScope` hierarchy

The JSON dump nests each scope's forked threads under it, with a reference to the parent
scope, so the tree can be reconstructed:

```text
scope "checkout" (owner: VirtualThread[#41,checkout-1])
   ├── VirtualThread[#42]  at PaymentClient.charge      ← the slow one
   ├── VirtualThread[#43]  at InventoryClient.reserve
   └── scope "pricing" (owner: VirtualThread[#43])
          └── VirtualThread[#44] at PricingClient.quote
```

The owner is normally parked in `join`; the interesting frames are its children. A scope whose
owner sits in `close` rather than `join` is waiting for subtasks that were cancelled and have
not stopped — that is the uninterruptible-subtask signature, and the culprit is whichever
child is not in an interruptible frame.

Name every scope (`cf -> cf.withName("checkout")`) or this view is unusable at scale.

## The JFR events that matter here

| Event                            | Default        | Answers                                              |
| -------------------------------- | -------------- | ---------------------------------------------------- |
| `jdk.VirtualThreadPinned`        | on, 20 ms      | is a carrier being held, and by what stack           |
| `jdk.VirtualThreadSubmitFailed`  | on             | did the scheduler refuse a thread (resource problem) |
| `jdk.VirtualThreadStart` / `End` | **off**        | thread churn and lifetime distribution               |
| `jdk.JavaMonitorEnter`           | on (threshold) | contended monitor entry, with the blocking stack     |
| `jdk.JavaMonitorWait`            | on (threshold) | `Object.wait` durations                              |
| `jdk.ThreadPark`                 | on (threshold) | `LockSupport.park` — locks, queues, futures          |
| `jdk.SocketRead` / `SocketWrite` | on (threshold) | which peer is slow, per thread                       |
| `jdk.FileRead` / `FileWrite`     | on (threshold) | file I/O that is capturing carriers                  |

```bash
# Lower the thresholds: the 20 ms default hides the frequent short cases
jfr configure --input default.jfc --output fine.jfc \
    jdk.VirtualThreadPinned#threshold=1ms jdk.ThreadPark#threshold=1ms

jfr summary recording.jfr                       # what is even in this file
jfr print --events jdk.VirtualThreadPinned recording.jfr | head -50
```

Thresholds are the recurring trap across all of these: an event that did not fire is not
evidence of absence until you know the threshold it was filtered by.

## Programmatic collection

```java
// The JSON dump, from inside the process — same output as jcmd
var bean = ManagementFactory.getPlatformMXBean(
        com.sun.management.HotSpotDiagnosticMXBean.class);
bean.dumpThreads("/tmp/dump.json",
        com.sun.management.HotSpotDiagnosticMXBean.ThreadDumpFormat.JSON);

// Deadlock detection — PLATFORM THREADS ONLY. Useful, and not sufficient.
long[] deadlocked = ManagementFactory.getThreadMXBean().findDeadlockedThreads();
```

Wiring the second one to an alert is worthwhile and must be documented for what it is: a
detector with a blind spot covering most of the application's threads.
