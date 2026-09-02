# Time-to-safepoint triage

## The protocol, so the numbers have a place to sit

```
1. The VM thread signals: safepoint requested
2. Each Java thread reacts at its next opportunity:
     compiled code (C1/C2)  → tests its polling word at the next emitted poll
     blocked (sleep, I/O, synchronized, park) → already in a safe state by definition
     native code (JNI/FFM)  → signalled, but only counted when it RETURNS to Java
3. The VM thread waits for the LAST required thread            ← sync time
4. The VM thread executes the operation (GC, deopt, dump, ...)  ← operation time
5. The safepoint is released; all threads resume
```

One thread in native code dictates the whole sync time: everyone else has already
confirmed, and the safepoint advances only when all of them have.

## Expected TTSP by thread state

| Thread state                            | Typical TTSP           | Why                                                                       |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Blocked (sleep / wait / park / I/O)     | ≈ 0                    | Already safe; the JVM only has to observe it                              |
| Interpreted code                        | a few instructions     | The interpreter checks at control-flow bytecodes                          |
| C1/C2, ordinary loop                    | one iteration          | Poll on the loop back-edge                                                |
| C1/C2, counted loop — G1/ZGC/Shenandoah | one strip              | Strip mining puts the poll on the **outer** back-edge                     |
| C1/C2, counted loop — Parallel/Serial   | **the whole loop**     | `UseCountedLoopSafepoints=false` there: no poll at all (executed, 25.0.3) |
| Native (JNI/FFM), no return             | until it leaves native | No poll is possible in unmanaged code                                     |

The last row is the one that is consistently underestimated, and it is the one no Java-side
flag can reach.

## Triage tree

```
p99 / p99.9 worse than the GC logs explain
│
├─ 1. Enable -Xlog:safepoint=info; correlate with the peak.
│     Sum "Total" for EVERY safepoint in the window and compare with -Xlog:gc.
│
├─ 2. Which term dominates?
│       "Reaching safepoint" high → step 3
│       "At safepoint" high       → not a safepoint problem; it is the operation
│                                    (collector tuning, or the deoptimisation cause)
│
├─ 3. Which thread is late?
│       -XX:+SafepointTimeout -XX:SafepointTimeoutDelay=<low ms>  → NAME and state of the late thread
│       async-profiler wall-clock on that thread, same window     → what it was doing
│
├─ 4. Classify:
│       thread in JNI/FFM without returning  → mini-batching (table below)
│       Parallel/Serial collector            → UseCountedLoopSafepoints is off: the whole loop is one poll interval
│       loop not recognised as counted       → simplify the loop shape; check PrintCompilation
│       counted loop, expensive body         → consider lowering LoopStripMiningIter
│       frequent non-GC operation            → pause-attribution's layer table (ThreadDump, HeapDumper, …)
│
└─ 5. Fix ONE cause, then repeat the same measurement with the same procedure.
```

## Cause to strategy

| Cause                                  | Strategy                                                                       | Trade-off                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| One long single-batch JNI/FFM call     | Split into mini-batches, returning to Java between them                        | One JNI/FFM transition per mini-batch                                                |
| Counted loop with an expensive body    | Lower `-XX:LoopStripMiningIter` (default 1000)                                 | More polls, less room for vectorisation                                              |
| Counted loop under Parallel or Serial  | `-XX:+UseCountedLoopSafepoints` (off there) plus `-XX:LoopStripMiningIter=<n>` | Small throughput cost; the reason it is off by default for the throughput collectors |
| Loop not recognised as counted         | Simplify the loop shape — no exceptions or complex jumps in the body           | May require restructuring the algorithm                                              |
| Safepoint-based profiler in production | Replace with `perf_events`-based profiling                                     | None; strictly better for this purpose                                               |

Mini-batching in practice:

```java
// Before: one 100 ms native batch — blocks any pending safepoint for up to 100 ms
nativeProcessBatch(1_000_000);

// After: ~1 ms mini-batches — the thread returns to Java often enough
// for the JVM to count it as safe
for (int i = 0; i < 1000; i++) {
    nativeProcessMini(1_000);
}
```

Total native throughput is unchanged — it is still the same 100 ms of work. What changes is
the worst-case TTSP, from the size of the whole batch to the size of one mini-batch.

## Before proposing a fix

- [ ] Sync time summed separately from operation time for the incident window
- [ ] `-Xlog:gc` and `-Xlog:safepoint` compared over the _same_ interval
- [ ] The late thread identified by stack, not inferred
- [ ] The proposed flag confirmed **not** to be the default already, in the target runtime
- [ ] If the cause is JNI/FFM, the mini-batch size chosen so it can be measured before and after
- [ ] If the cause is profiling, the production tool confirmed not to sample at safepoints
