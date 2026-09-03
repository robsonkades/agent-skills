---
name: virtual-threads-internals
description: >
  Diagnose HotSpot virtual-thread mounting, heap stack chunks, FIFO work-stealing scheduling,
  carrier capture, residual native/foreign pinning after JEP 491, scheduler compensation boundaries
  and memory/GC effects without treating implementation details as API guarantees. Use when pin
  events, scheduler queue/pool growth, native calls, CPU-ready virtual threads or retained suspended
  stacks explain a scalability regression on Java 21–25.
---

# Virtual Threads Internals

## Purpose

Distinguish four mechanisms that look like “carriers are busy” but require different decisions:

- CPU-ready virtual threads waiting for scheduler capacity;
- normal unmounted waiting, with pressure at a dependency/resource;
- carrier capture by a blocking operation that cannot unmount but for which the runtime may compensate;
- pinning by native/foreign execution, for which scheduler expansion is not a promised remedy.

Introductory adoption belongs to `thread-sizing-and-virtual-threads`; evidence collection to
`concurrency-diagnostics`; work-stealing in general to `forkjoinpool-and-work-stealing`.

## Diagnostic workflow

1. Record exact JDK/vendor/build, effective CPU, scheduler properties and whether tasks truly execute
   as virtual threads (`Thread.currentThread().isVirtual()`).
2. Define the regression: throughput, scheduler queue, dependency wait, CPU, memory/GC or tail latency.
3. Read `VirtualThreadSchedulerMXBean` time series (Java 24+): parallelism, pool size, mounted and
   queued estimates.
4. Capture JFR with inspected settings and thread dumps; classify pin/native/foreign stacks, file or
   other captured-carrier operations, CPU-ready tasks and ordinary parked dependency waits.
5. Correlate event duration/rate with scheduler queue and useful completion. A pin that has no capacity
   impact is not automatically worth a rewrite.
6. Test one mechanism-specific intervention: update/isolate native code, bound CPU phase, change I/O
   path, reduce admission or tune scheduler only with proven headroom.

## Stable execution model

A virtual thread is a Java `Thread` scheduled M:N over platform carrier threads. Mounting associates a
virtual thread with a carrier for execution; unmounting suspends it and frees that carrier. There is no
carrier affinity: native OS thread identity can differ between calls, and carrier ThreadLocal state is
not virtual-thread state.

The JDK scheduler is a work-stealing `ForkJoinPool`, distinct from the common pool, operating in FIFO
mode. Its target parallelism defaults from available processors and is configurable via
`jdk.virtualThreadScheduler.parallelism`. The scheduler does not currently promise time-sharing of
CPU-bound virtual threads, so long CPU tasks can delay other ready virtual threads.

These scheduler choices are implementation facts documented by JEP 444, not Java Language/JVM
Specification semantics. Applications must not depend on internal pool identity, queue fields or
carrier names.

## Continuations and stack chunks

HotSpot represents an unmounted virtual-thread continuation stack with heap `StackChunk` objects.
Stacks grow/shrink; locals and references retained across a wait remain live through the virtual
thread. The exact freeze/thaw copying, barriers, frame encoding and deoptimization paths are
release/architecture/collector implementation details. Do not teach a made-up “every optimized frame
is deoptimized before unmount” rule or infer it from one profile.

Heap stacks change accounting:

- millions of suspended threads imply at least millions of thread/task objects plus retained request
  state and stack chunks;
- deep stacks, large locals and ThreadLocals increase live heap and collector scanning work;
- fewer allocations than an async pipeline are possible, but not guaranteed;
- stack/request memory must be measured with the chosen collector and workload, not estimated only
  from virtual-thread count.

Correlate heap dominators/class histograms, live virtual-thread lifecycle, allocation/JFR and GC phase
times before attributing a GC regression to `StackChunk`. There is no generic collector flag that
turns on “virtual-thread mode.”

## Unmounting, capture and pinning

Many blocking JDK operations integrate with virtual threads and unmount. Some OS/JDK operations,
notably many file-system paths, may capture a carrier and cause the scheduler to temporarily expand
platform-thread count up to its configured maximum. This compensation is not the same as pinning.

Java 24 JEP 491 removed pinning caused by `synchronized` monitor ownership/acquisition and
`Object.wait`. Residual documented pinning occurs while executing a native method or foreign
function. If such a virtual thread blocks, it retains its carrier. JEP 444 explicitly states the
scheduler does not compensate for pinning by expanding parallelism; do not claim automatic
`ManagedBlocker` compensation for native pins.

`jdk.VirtualThreadPinned` reports pin durations crossing its active threshold. It is strong evidence
that pinning occurred, not that pinning caused the SLO. Sampling/profile/JFR settings can miss events,
and application/library instrumentation may provide additional evidence. The old
`jdk.tracePinnedThreads` property was removed with JDK 24 behavior changes; an arbitrary `-D` property
can still be accepted without any runtime consumer, so silence is meaningless.

## Scheduler capacity and compensation

On Java 24+, prefer `VirtualThreadSchedulerMXBean` to thread-name counting. Its counts are estimates
and may be unavailable (`-1`). Interpret:

| Evidence                                                                | Candidate mechanism                           | Do not conclude yet                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| queued rises, CPU saturated/throttled                                   | CPU-ready demand beyond effective parallelism | that increasing parallelism creates CPU                               |
| pool size exceeds target, file/native blocking stacks but no pin events | carrier capture/compensation                  | that every extra carrier is pinning                                   |
| pin events and queued rise                                              | pinning may constrain carriers                | that every pin is causal without time alignment                       |
| many parked VTs, scheduler queue low                                    | normal unmounted wait at resource             | that more carriers help                                               |
| submit-failed events                                                    | start/unpark resource failure                 | exact exhausted resource without associated exception/system evidence |

`jdk.virtualThreadScheduler.maxPoolSize` bounds platform threads available to the scheduler for cases
that expand the pool; it is not an admission limit for virtual threads. Raising it consumes native
thread/address-space/kernel resources and cannot increase dependency or CPU capacity. Size/tune only
after a capture mechanism and resource headroom are demonstrated.

## Decision guide

Prefer updating/reconfiguring a library or isolating work on a bounded platform executor when a
blocking native/foreign call is frequent, causal and cannot be changed. The isolation size must still
respect dependency/CPU/native-thread capacity and cancellation.

Prefer resource-local admission when many normally unmounted threads retain too much state or
overwhelm a dependency. Prefer a bounded CPU executor/gate for long CPU phases. Prefer observation
when pin volume is low and scheduler queue/SLO remain healthy.

Do not replace `synchronized` with `ReentrantLock` for Java 24+ pinning. Lock choice still affects
contention, timeouts, interruption, fairness and conditions; route that decision to concurrent locks.

## Failure modes

| Failure                                    | Evidence                                                         | Remediation/validation                                                  |
| ------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| native pin bottleneck                      | pin stacks + scheduler queue/latency aligned                     | update/isolate call; verify queue and throughput under same load        |
| captured file I/O expands carriers         | pool above target + file stacks/events, no equivalent pin signal | isolate/change I/O path or bound it; validate native memory and latency |
| CPU starvation                             | CPU-ready VT stacks, CPU/throttling high, queued estimate rises  | bound/isolate CPU phase; validate fairness and useful CPU               |
| suspended-stack memory pressure            | heap dominators/GC correlated with live waiting VTs              | reduce admission/depth/state; validate retained heap and GC phase       |
| scheduler tuning masks dependency overload | more carriers increase downstream in-flight/errors               | restore resource-local limit; revert unsupported tuning                 |

## Review checklist

- [ ] Pinning, carrier capture, CPU starvation and ordinary waiting are not conflated.
- [ ] Claims are scoped to exact Java/JDK implementation version.
- [ ] Scheduler MXBean replaces carrier-name heuristics where Java 24+ is available.
- [ ] JFR settings and time alignment are recorded; event absence is not overinterpreted.
- [ ] Native/foreign stack is identified before isolation or scheduler tuning.
- [ ] Heap/GC attribution uses retained-object and phase evidence.
- [ ] Intervention validates useful completion, tail SLO, scheduler queue and resource health.

## References

- [Continuation and scheduler mechanics](references/continuation-mechanics.md)
- [Pinning and carrier diagnostics](references/pinning-diagnostics.md)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [Java 25 virtual threads](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
