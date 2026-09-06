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

TTSP is the time needed to bring the relevant Java threads into safepoint-safe states.
Threads already blocked or safely in native code need not execute a poll to become safe;
one running thread can delay the operation. Individual threads need not stop for all of TTSP.

So: if the GC log says 12 ms and the client felt 200 ms, that GC event alone does not
explain the observation. Check TTSP, request queueing, scheduling and timestamp alignment
before exonerating or blaming the collector.

```bash
-Xlog:safepoint:file=safepoint.log:time,uptime
```

Enable it alongside `-Xlog:gc*` after checking the logging volume and retention budget. It
is normally low overhead, but production policy still requires measuring the chosen tags,
decorators and sink. On 25.0.3 each line reads

```
Safepoint "G1CollectForAllocation", Time since last: 48521900 ns, Reaching safepoint: 4700 ns, At safepoint: 496200 ns, Leaving safepoint: 2100 ns, Total: 503000 ns, Threads: 0 runnable, 11 total
```

`Reaching safepoint` measures synchronization; `At safepoint` includes safepoint work and
need not equal one GC sub-operation. `Total` is the logged interval, not every thread's stop
time or a client's added latency. Read the tail and maximum of `Reaching safepoint`
over the window together with event count; a mean hides rare stalls, while a single
maximum may be an outlier or a different operating regime. The JFR equivalents are
`jdk.SafepointBegin`,
`jdk.SafepointStateSynchronization` (the TTSP part) and `jdk.SafepointEnd`.

## Distinguishing causes of high TTSP

Loop strip mining (JDK-8186027, JDK 10; long-loop support JDK-8223051, JDK 16) depends on
compiler and collector configuration. On Temurin 25.0.3, `PrintFlagsFinal` showed
`UseCountedLoopSafepoints=true`, `LoopStripMiningIter=1000` for G1/ZGC/Shenandoah, but
`false`/`0` for Serial/Parallel. Inspect effective flags and compiled code before assuming
that a particular optimized loop polls; the iteration setting is not a wall-clock deadline.

| Operation              | Evidence needed                                            | Potential issue                                |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Counted int/long loop  | collector/compiler flags and generated polls               | long work between absent or sparse polls       |
| Bulk copy/fill/clone   | implementation path, array size and aligned safepoint logs | sparse polls on some intrinsic paths           |
| Large-array allocation | allocation/zeroing path, faults and stall events           | zeroing or memory pressure, not necessarily GC |

Candidate causes on 25 include:

- **Bulk operations without a poll.** `System.arraycopy`, `Arrays.fill`, `Object.clone`
  of a large array, large-array allocation, and any intrinsic that processes a whole
  buffer. Actual polling and time depend on generated code, size and hardware. Measure before
  bounding or splitting; preserve overlap, atomicity and publication semantics when changing code.
- **Distinguish native state, VM runtime work and GC-critical access.** A thread that has
  completed the Java-to-native transition is normally safepoint-safe and checks on
  re-entry; do not generalize that to every transition or critical region. A thread _in
  the VM_ may have to reach a safe transition or explicit check; some VM calls can block
  safely rather than run to completion. Critical native access can constrain collection:
  a `GetPrimitiveArrayCritical` region or an FFM
  `Linker.Option.critical()` downcall that touches the heap can constrain collection or
  pin heap access. With G1 since JEP 423 (JDK 22), relevant regions are pinned instead of
  blocking the whole collector; pinned regions still affect evacuation choices and may
  contribute to allocation pressure. The boundary
  and its measurement are jni-and-ffm.
- **CPU starvation in a container.** A throttled thread cannot reach a safepoint. Check
  `nr_throttled / nr_periods` on the cgroup — linux-for-jvm, and container-awareness for
  what the JVM believes its CPU count is.
- **Page faults.** A thread waiting on major faults is not running, and cannot arrive.
- **Thread count.** TTSP is the maximum over every thread; the more platform threads, the
  more likely one of them is in one of the states above. Virtual threads do not count —
  their executing carriers participate instead. Suspended virtual-thread stack chunks remain
  relevant to heap/root work even though they do not each rendezvous as OS threads.

To find the thread, `-XX:+SafepointTimeout` with `-XX:SafepointTimeoutDelay=<ms>`
(default 10000 ms; both product flags on 25) reports delayed threads. The diagnostic
`-XX:+AbortVMOnSafepointTimeout` requires diagnostic unlocking and deliberately crashes
the JVM; use only in an authorized disposable reproduction, not routine observation.

## Safepoint operations other than GC

A safepoint is not only for garbage collection. Thread dumps (`jcmd Thread.print`),
deoptimisation, class redefinition, some `jcmd` operations and several JVMTI calls all
request one; single-thread operations have moved to handshakes (JDK-8185640, JDK 10) and
stop only the target. `GuaranteedSafepointInterval=0` disables that particular periodic
trigger in the tested 25 build; other VM operations can still request safepoints while idle.

Repeated traditional `jstack` dumps request global safepoints and can add latency.
For profiling, use a sampling profiler that does not
require a safepoint; for a point-in-time dump on an application with virtual threads, use
`jcmd <pid> Thread.dump_to_file -format=json <path>`: [JEP 444](https://openjdk.org/jeps/444)
specifies that this dump does not pause the application. It is not an atomic snapshot and
omits some traditional dump details. Account for command/output overhead separately.

## Reconciling the numbers

| Log pause | Client-observed pause | Reading                                              |
| --------- | --------------------- | ---------------------------------------------------- |
| 16 ms     | ~16 ms                | GC may contribute; align request and event intervals |
| 16 ms     | 200 ms                | examine TTSP, queueing, dependencies and scheduling  |
| 16 ms     | 16 ms but frequent    | compare allocation, capacity and collection triggers |

Correlate event intervals with affected requests before touching collector flags; similar
durations or unmatched maxima do not establish causation.
