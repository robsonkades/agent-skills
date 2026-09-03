# Time-to-safepoint triage

## The protocol, so the numbers have a place to sit

```
1. The VM thread signals: safepoint requested
2. Each Java thread reacts at its next opportunity:
     compiled code (C1/C2)  → tests its polling word at the next emitted poll
     blocked (sleep, I/O, synchronized, park) → already in a safe state by definition
     native code (JNI/FFM)  → ordinary native state is already safe; return transition checks
3. The VM thread waits for the LAST required thread            ← sync time
4. The VM thread executes the operation (GC, deopt, dump, ...)  ← operation time
5. The safepoint is released; all threads resume
```

A runnable Java/VM-transition thread that does not reach a safe state can dictate sync time.
An ordinary thread already in JNI/FFM native state does not; JNI critical regions can delay
particular GC progress and must be diagnosed as that mechanism rather than generic TTSP.

## Expected TTSP by thread state

| Thread state                            | Typical TTSP       | Why                                                                          |
| --------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| Blocked (sleep / wait / park / I/O)     | ≈ 0                | Already safe; the JVM only has to observe it                                 |
| Interpreted code                        | a few instructions | The interpreter checks at control-flow bytecodes                             |
| C1/C2, ordinary loop                    | one iteration      | Poll on the loop back-edge                                                   |
| C1/C2, counted loop — G1/ZGC/Shenandoah | one strip          | Strip mining puts the poll on the **outer** back-edge                        |
| C1/C2, counted loop — Parallel/Serial   | potentially long   | strip-mining polls disabled on tested build; surrounding checks still matter |
| Native (ordinary JNI/FFM state)         | already safe       | return-to-Java transition synchronizes before Java resumes                   |
| Runtime transition / JNI critical path  | mechanism-specific | prove thread state, GC-locker/critical evidence and aligned stack            |

Host descheduling/page faults can stretch any runnable thread's acknowledgement; combine
thread state with OS scheduling evidence rather than reading this table as deterministic.

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
│       ordinary JNI/FFM native state        → already safe; investigate only critical/transition evidence
│       Parallel/Serial collector            → strip-mining polls are off; inspect surrounding compiled checks
│       loop not recognised as counted       → simplify the loop shape; check PrintCompilation
│       counted loop, expensive body         → consider lowering LoopStripMiningIter
│       frequent non-GC operation            → pause-attribution's layer table (ThreadDump, HeapDumper, …)
│
└─ 5. Fix ONE cause, then repeat the same measurement with the same procedure.
```

## Cause to strategy

| Cause                                                 | Strategy                                                                       | Trade-off                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| JNI critical/transition path proven to delay progress | Reduce critical-region duration or redesign ownership                          | More copying/transitions; validate GC and native throughput                          |
| Counted loop with an expensive body                   | Lower `-XX:LoopStripMiningIter` (default 1000)                                 | More polls, less room for vectorisation                                              |
| Counted loop under Parallel or Serial                 | `-XX:+UseCountedLoopSafepoints` (off there) plus `-XX:LoopStripMiningIter=<n>` | Small throughput cost; the reason it is off by default for the throughput collectors |
| Loop not recognised as counted                        | Simplify the loop shape — no exceptions or complex jumps in the body           | May require restructuring the algorithm                                              |
| Safepoint-coordinated statistical sampling            | Use async wall/CPU sampling suited to the platform                             | Different blind spots, privileges and sampling loss; cross-check                     |

Mini-batching is not a generic safepoint fix. Use it only after evidence identifies a critical
or transition constraint, and measure added transitions/copies, total throughput and tail
latency; splitting work does not preserve throughput by definition.

## Before proposing a fix

- [ ] Sync time summed separately from operation time for the incident window
- [ ] `-Xlog:gc` and `-Xlog:safepoint` compared over the _same_ interval
- [ ] The late thread identified by stack, not inferred
- [ ] The proposed flag confirmed **not** to be the default already, in the target runtime
- [ ] If a JNI critical/transition cause is proven, remediation measured before and after
- [ ] If the cause is profiling, the production tool confirmed not to sample at safepoints
