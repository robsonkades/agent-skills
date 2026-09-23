# Time-to-safepoint triage

## The protocol, so the numbers have a place to sit

```
1. The VM thread signals: safepoint requested
2. Each Java thread reacts at its next opportunity:
     compiled code (C1/C2)  → tests its polling word at the next emitted poll
     HotSpot-recognized stable blocked state → safe without running Java to acknowledge
     ordinary native state → safe when stack-walkability requirements hold; return transition checks
3. The VM thread waits for the LAST required thread            ← sync time
4. The VM thread executes the operation (GC, deopt, dump, ...)  ← operation time
5. The safepoint is released; threads become eligible to resume (OS scheduling still applies)
```

A runnable Java/VM-transition thread that does not reach a safe state can dictate sync time.
An ordinary thread already in JNI/FFM native state does not; JNI critical regions can delay
particular GC progress and must be diagnosed as that mechanism rather than generic TTSP.
These are HotSpot internal states, not `java.lang.Thread.State` or classifications inferred
from a source operation such as I/O or `synchronized`. Stable state observation, walkable
Java frames and transition barriers matter; the Java enum alone does not prove them.

## Polling opportunities by execution state

| Execution state                                  | Synchronization consideration      | Why                                                                               |
| ------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------- |
| HotSpot-recognized stable blocked state          | No Java execution required         | Safe-state observation/coordination still takes time; a Java enum is insufficient |
| Interpreted code                                 | Relevant dispatch/transition check | Branch/return polling does not imply a fixed instruction or wall-time bound       |
| Compiled ordinary loop                           | emitted poll interval              | Inspect compiler/OSR code; not every source back-edge maps to a poll              |
| C2, strip-mined counted loop — G1/ZGC/Shenandoah | roughly one strip of computation   | Outer-loop poll when transformation actually applies                              |
| C2, counted loop — Parallel/Serial               | potentially long                   | strip-mining polls disabled on tested build; surrounding checks still matter      |
| Native (ordinary JNI/FFM state)                  | already safe                       | return-to-Java transition synchronizes before Java resumes                        |
| FFM critical downcall (checked HotSpot 25 x86)   | native-state transition omitted    | inspect linkage options and duration; `critical(false)` is still critical         |
| Runtime transition / JNI critical path           | mechanism-specific                 | prove state, collector-specific pinning/GC behavior and aligned stack             |

Host descheduling/page faults can stretch any runnable thread's acknowledgement; combine
thread state with OS scheduling evidence rather than reading this table as deterministic.

## Distinguish the native paths

For FFM, inspect the options used to create the downcall handle. In the checked JDK 25
implementation, `Linker.Option.critical(...)` disables the normal Java-to-native transition;
the x86 stub therefore cannot be treated as ordinary safepoint-safe native execution. A long
call on that path is a candidate for delayed synchronization, requiring aligned evidence for
an incident attribution. Both `critical(false)` and `critical(true)` select the critical path;
the boolean controls permission to pass heap segments, not whether the call is critical.
The API requires an extremely short-running function in every case and forbids upcalls.

If the function can block, run long or call back into Java, use an ordinary downcall and
review its argument/lifetime contract. Removing `critical(true)` also removes its permission
to pass heap segments as native addresses: use suitable off-heap storage/copying when needed,
with ownership and copy-back semantics preserved. Correcting misuse is justified by the API
contract; claiming that it fixed a measured pause additionally needs TTSP/throughput evidence.

JNI critical access is a different mechanism. G1 region pinning, delivered in JDK 22
(JEP 423), permits GC while those regions are active. On the JDK 25 baseline, investigate
pin duration and pinned-region/evacuation effects rather than assuming an active JNI critical
region prevents GC from starting or causes TTSP. GC-locker deferral on an older or different
collector needs its own evidence; inspect the actual runtime and collector path.

## Triage tree

```
p99 / p99.9 worse than the GC logs explain
│
├─ 1. Use adequate safepoint evidence, or collect missing coverage; correlate with the peak.
│     Align individual safepoint and GC intervals; sums describe process occupancy,
│     not a decomposition of endpoint p99 or the delay of every affected request.
│
├─ 2. Which term dominates?
│       "Reaching safepoint" high → step 3
│       "At safepoint" high       → safepoint time dominated by operation/cleanup, not TTSP
│                                    (collector tuning, or the deoptimisation cause)
│
├─ 3. Which thread is late?
│       existing evidence or a suitably derived SafepointTimeoutDelay → remaining-thread snapshot
│       aligned stack/profile and scheduling evidence               → candidate activity/cause
│
├─ 4. Classify:
│       ordinary JNI/FFM native state        → already safe; investigate only critical/transition evidence
│       FFM critical downcall               → inspect linkage contract, native duration and transition path
│       Parallel/Serial collector            → strip-mining polls are off; inspect surrounding compiled checks
│       compiled loop suspected              → identify C1/C2, normal/OSR and emitted polls first
│       counted loop, expensive body         → consider lowering LoopStripMiningIter
│       frequent non-GC operation            → pause-attribution's layer table (ThreadDump, HeapDumper, …)
│
└─ 5. For a supported change, isolate the cause and repeat relevant measurements;
      otherwise retain the adequate design or state the remaining attribution gap.
```

## Cause to strategy

| Cause                                                       | Strategy                                                                                               | Trade-off                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| JNI critical/transition path proven to delay progress       | Reduce critical-region duration or redesign ownership                                                  | More copying/transitions; validate GC and native throughput                              |
| FFM critical downcall violates its short/no-upcall contract | Use an ordinary downcall and review heap-address arguments                                             | Transition overhead; off-heap/copying and lifetime requirements may change               |
| C2 strip-mined loop with an expensive body                  | Consider lowering effective `LoopStripMiningIter` (1000 for tested G1/ZGC/Shenandoah)                  | Poll frequency/optimization cost is workload-dependent; measure both TTSP and throughput |
| C2 counted loop under Parallel or Serial                    | Test `-XX:+UseCountedLoopSafepoints` plus `-XX:LoopStripMiningIter=<n>` after confirming missing polls | Additional polls can alter compilation and throughput; no universal small-cost guarantee |
| Poll-free region proven in compiled code                    | Consider a semantics-preserving loop change only after inspecting emitted polls                        | Becoming a counted loop alone need not improve responsiveness; validate exceptions/order |
| Safepoint-coordinated statistical sampling                  | Use async wall/CPU sampling suited to the platform                                                     | Different blind spots, privileges and sampling loss; cross-check                         |

Mini-batching is not a generic safepoint fix. Use it only after evidence identifies a critical
or transition constraint, and measure added transitions/copies, total throughput and tail
latency; splitting work does not preserve throughput by definition.

## Before proposing a fix

Apply the checks needed for the proposed claim/change; a narrow explanation or supported
no-change decision need not complete an unrelated diagnostic matrix.

- [ ] Relevant cycle/sync/operation timing distinguished; use aggregates only for the matching claim
- [ ] When attributing a GC-related pause, GC and safepoint evidence compared over the _same_ interval
- [ ] When naming a late-thread cause, align state, stack and scheduling evidence; preserve independent valid timing if cause evidence is missing
- [ ] Proposed flag change compared with effective target values using a successful probe or process evidence
- [ ] If a JNI critical/transition cause is proven, remediation measured before and after
- [ ] If profiling is suspected, sampler trigger/reconstruction, loss and bias limits understood;
      deferred cooperative stack walking alone is not proof of safepoint-biased attribution

Primary sources for the native distinctions:
[JDK 25 Linker.Option critical contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.Option.html#critical(boolean)>),
[JDK 25 calling-sequence transition selection](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/jdk/internal/foreign/abi/CallingSequence.java),
[JDK 25 x86 downcall stub](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/downcallLinker_x86_64.cpp),
[JEP 423: Region Pinning for G1](https://openjdk.org/jeps/423), and
[JDK 25 G1 pin/unpin implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1CollectedHeap.inline.hpp).
