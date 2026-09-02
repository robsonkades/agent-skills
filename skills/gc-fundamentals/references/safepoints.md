# Safepoints and Time-To-SafePoint

The introductory treatment. The polling mechanism, handshakes and the full catalogue of
VM operations are the safepoints skill; attributing a production pause across layers by
timestamp is pause-attribution.

## What the log does not tell you

A stop-the-world pause has two parts:

```
[ Time-To-SafePoint ][ safepoint operation ]
  ^ NOT in the GC log   ^ this is what "Pause Young 16ms" reports
```

TTSP is the time between the VM requesting a safepoint and the **last** thread reaching
one. Every thread must arrive; one slow thread stalls all the others, and none of that
time appears in the GC log.

So: if the GC log says 12 ms and the client felt 200 ms, the collector is not the problem.

```bash
-Xlog:safepoint:file=safepoint.log:time,uptime
```

Enable it alongside `-Xlog:gc*`. It costs almost nothing and separates two investigations
that otherwise look identical. On 25.0.3 each line reads

```
Safepoint "G1CollectForAllocation", Time since last: 48521900 ns, Reaching safepoint: 4700 ns, At safepoint: 496200 ns, Leaving safepoint: 2100 ns, Total: 503000 ns, Threads: 0 runnable, 11 total
```

`Reaching safepoint` is TTSP; `At safepoint` is the operation the GC log reports;
`Total` is what the application saw. Read the maximum of `Reaching safepoint` over the
window, never its mean. The JFR equivalents are `jdk.SafepointBegin`,
`jdk.SafepointStateSynchronization` (the TTSP part) and `jdk.SafepointEnd`.

## Causes of high TTSP, ranked by measurement

The classic answer — a counted loop with no safepoint poll — is obsolete on a current
baseline. Loop strip mining (JDK-8186027, JDK 10) made `UseCountedLoopSafepoints` the
default with a poll every `LoopStripMiningIter` (1000) iterations, and long-counted loops
have been counted loops with the same treatment since JDK-8223051 (JDK 16). Executed on
25.0.3 with a thread requesting a safepoint every 150 ms while another thread ran each
shape for three seconds, maximum `Reaching safepoint` per shape:

| Thread was executing                            | Max TTSP  | Why                                                    |
| ----------------------------------------------- | --------- | ------------------------------------------------------ |
| `for (int i …)` compute loop, 400 M iterations  | 0.28 ms   | strip-mined: a poll every 1000 iterations              |
| `for (long i …)` compute loop, 400 M iterations | 0.15 ms   | same since JDK 16                                      |
| `System.arraycopy` of a 256 MB `int[]`          | 58–67 ms  | one intrinsic call, no poll until it returns           |
| `new int[64_000_000]` (256 MB zeroed)           | 18–108 ms | the allocation zeroes the whole array before returning |

The causes that remain on 25 are therefore:

- **Bulk operations without a poll.** `System.arraycopy`, `Arrays.fill`, `Object.clone`
  of a large array, large-array allocation, and any intrinsic that processes a whole
  buffer. The pause scales with the buffer: a 256 KB copy is invisible, a 256 MB one is
  the whole p99.9. Bound the buffer or split the operation.
- **VM runtime code, not native code.** A thread _in native_ (JNI, an FFM downcall) is
  already safe — it blocks on the way back into Java and never delays a safepoint. A thread
  _in the VM_ — inside a runtime call such as a large allocation, class loading or a
  `jcmd` handler — must finish that call first. What native code delays is the
  **collection**, not the safepoint: a `GetPrimitiveArrayCritical` region or an FFM
  `Linker.Option.critical()` downcall that touches the heap holds the GC-locker, threads
  that need memory stall until it exits, and the log shows `GCLocker Initiated GC`. With
  G1 since JEP 423 (JDK 22) the region is pinned instead and nothing waits. The boundary
  and its measurement are jni-and-ffm.
- **CPU starvation in a container.** A throttled thread cannot reach a safepoint. Check
  `nr_throttled / nr_periods` on the cgroup — linux-for-jvm, and container-awareness for
  what the JVM believes its CPU count is.
- **Page faults.** A thread waiting on major faults is not running, and cannot arrive.
- **Thread count.** TTSP is the maximum over every thread; the more platform threads, the
  more likely one of them is in one of the states above. Virtual threads do not count —
  only their carriers do.

To find the thread, `-XX:+SafepointTimeout` with `-XX:SafepointTimeoutDelay=<ms>`
(default 10000 ms; both product flags on 25) prints the threads that had not reached the
safepoint after the delay, and `-XX:+AbortVMOnSafepointTimeout` (diagnostic) turns that
into a crash with a full `hs_err`.

## Safepoint operations other than GC

A safepoint is not only for garbage collection. Thread dumps (`jcmd Thread.print`),
deoptimisation, class redefinition, some `jcmd` operations and several JVMTI calls all
request one; single-thread operations have moved to handshakes (JDK-8185640, JDK 10) and
stop only the target. Periodic guaranteed safepoints are gone as a default on 25
(`GuaranteedSafepointInterval` is a diagnostic flag defaulting to 0), so an idle JVM no
longer pauses on a timer.

This is why `jstack` in a loop is a latency generator: each invocation stops **every**
thread while the dump is produced. For profiling, use a sampling profiler that does not
require a safepoint; for a point-in-time dump on an application with virtual threads, use
`jcmd <pid> Thread.dump_to_file -format=json` (present on 25; it still safepoints, once).

## Reconciling the numbers

| Log pause | Client-observed pause  | Reading                                      |
| --------- | ---------------------- | -------------------------------------------- |
| 16 ms     | ~16 ms                 | the collector is the cost                    |
| 16 ms     | 200 ms                 | TTSP or something outside the JVM            |
| 16 ms     | 16 ms but too frequent | allocation rate, not collector configuration |

Do this reconciliation before touching a collector flag. It is a two-minute check that
routinely redirects the entire investigation.
