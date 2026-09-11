# Diagnosis and versions

## Symptom to mechanism

Each row suggests a mechanism from references/collector-mechanisms.md, evidence that helps
distinguish it and the owning skill. These are hypotheses, not diagnoses from a log label.
G1 phase labels and baseline flag checks refer to Temurin 25.0.3.

| Symptom                                                                  | Mechanism                                                                          | How to distinguish                                                                                                   | What to measure                                                                                    | Owner of the fix                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Young pauses more frequent, each one unchanged                           | Allocation grew or effective young capacity/triggers changed                       | Compare Eden capacity, cause and allocation over equivalent windows                                                  | GC heap/cause logs plus allocation samples                                                         | allocation-profiling; g1-tuning-for-slo                               |
| Young pauses longer, `Object Copy` dominates                             | More evacuation work or slower workers/memory                                      | Compare survivors, mixed old work, CPU availability and graph shape                                                  | Phase/age logs and dependency latency aligned in time                                              | g1-tuning-for-slo; upstream owner if supported                        |
| Young pauses longer, few survivors, `Merge Heap Roots`/`Scan Heap Roots` | Old-to-young references: nepotism, a pool or cache being mutated                   | Promoted bytes small; dirty cards high; often follows a period of premature promotion                                | `gc+phases=debug`, `gc+remset=trace`                                                               | g1-internals; fix the structure holding young data from old           |
| Young pauses longer, `Ext Root Scanning` dominates                       | More/different thread, class-loader or JNI root work, or slower workers            | Compare root/thread counts and shape with worker CPU, scheduling and phase times                                     | Existing thread/JFR evidence; bounded root/CPU inspection if needed                                | thread-sizing-and-virtual-threads when thread pressure is established |
| Young pauses longer, `Reference Processing` dominates                    | Weak/soft/final/phantom references in the collection set                           | `gc+ref=debug` phase times; `jdk.GCReferenceStatistics` counts                                                       | Reference counts per type                                                                          | java-reference-types-and-leaks                                        |
| `new threshold N (max threshold 15)` with N < 15                         | Adaptive tenuring selected an earlier age; survivor pressure is one possible cause | Harm requires correlated old growth/promotion pressure and age-table bytes; a lower threshold alone is normal policy | `gc+age=trace`, old-growth proxy plus JFR when exact allocation matters                            | g1-tuning-for-slo (young size), gc-log-analysis (reading it)          |
| Old occupancy climbs then falls after reclamation                        | Reclaimable churn or floating garbage may explain growth                           | Compare equivalent reclamation and workload; flat floors do not exclude every leak                                   | Post-mixed/full trends; Remark is not full reclamation                                             | jvm-gc-tuning; retention analysis when floor grows                    |
| Old occupancy floor rises after comparable full collections              | Growing retained population, legitimate or unintended                              | Normalize workload/cache warm-up and inspect retaining paths                                                         | Compare heap evidence within diagnostic impact budget                                              | java-reference-types-and-leaks; heap-dump-analysis                    |
| `(Evacuation Failure: Allocation)`                                       | Evacuation destination allocation failed                                           | Check demand, usable space and policy; distinguish pinning and humongous contiguity                                  | gc+heap and phase/failure details                                                                  | g1-internals; jvm-gc-tuning                                           |
| `Pause Full` under G1 after humongous allocation                         | Contiguous allocation pressure is one candidate                                    | Check requested span versus usable contiguous space and other failures                                               | Humongous size/region logs, heap and failure context                                               | allocation-profiling; g1-tuning-for-slo                               |
| Concurrent cycles back to back (`Concurrent Start` every few pauses)     | Occupancy/prediction, humongous allocation or another recorded trigger             | Align causes, conditional `gc+ergo+ihop` checks and `gc+ihop=debug` predictor updates                                | Existing complete cycles, equivalent post-reclamation occupancy and headroom; do not force Full GC | g1-concurrent-marking; heap size is jvm-gc-tuning                     |
| `Allocation Stall` (ZGC) or `Degenerated GC` (Shenandoah)                | The concurrent cycle lost the race with allocation                                 | Stalls cluster at traffic peaks; cycle time × allocation rate exceeds headroom                                       | `jdk.ZAllocationStall`, cycle duration, allocation rate                                            | zgc-and-shenandoah                                                    |
| GC log clean, client p99 above logged pauses                             | TTSP, queueing, dependency delay or host contention                                | Correlate affected requests with safepoints; maxima alone are insufficient                                           | safepoint logs, traces, CPU throttling/PSI                                                         | safepoints; pause-attribution; linux-for-jvm                          |
| Throughput fell after collector change without pause regression          | Barriers, concurrent CPU, footprint or a regression                                | Compare equivalent workload/resources; profile before attributing                                                    | GC/mutator CPU, allocations and completed throughput                                               | jvm-gc-tuning; zgc-and-shenandoah                                     |
| Pauses on a one-CPU pod are long                                         | Serial ergonomics is one candidate through JDK 26                                  | Confirm Using Serial with -Xlog:gc and effective VM.flags; pause duration alone does not identify collector          | Collector name, CPU count and phase evidence                                                       | jvm-gc-tuning; container-awareness                                    |
| Flag copied from an older runbook stops the JVM or is ignored            | Flag lifecycle: obsolete (warned, ignored) or expired (unrecognised)               | Start-up output: `Ignoring option …; support was removed in N` versus `Unrecognized VM option`                       | `java -XX:+PrintFlagsFinal -version` on the target JDK                                             | jdk-upgrade-impact                                                    |

Three rules for using the table:

- Confirm the phase before the cause. Two rows share a symptom and differ only in which
  phase grew; `-Xlog:gc+phases=debug` is the cheapest instrument that separates them.
- Do not exclude collector/configuration regressions merely because upstream causes are common.
- Historical logs/JFR need to cover the event. A current flag query or heap snapshot supplies
  current-state evidence, not a reconstruction of the incident. Use incident-evidence-capture.

## Collector timeline, JDK 9 to 28

What a document about GC assumed depends on when it was written. Each row is the change
that most often makes an older text wrong.

| JDK         | Change                                                                                                      | Reference                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 9           | G1 becomes the default on server-class machines; ergonomics still pick Serial on one CPU or small memory    | JEP 248                                              |
| 9           | Unified logging replaces `-XX:+PrintGCDetails`                                                              | JEP 158, JEP 271                                     |
| 10          | Counted-loop strip mining available; polling defaults depend on collector/compiler; thread-local handshakes | JDK-8186027, JDK-8185640                             |
| 11          | ZGC experimental; Epsilon experimental                                                                      | JEP 333, JEP 318                                     |
| 12          | Shenandoah experimental (in builds that include it)                                                         | JEP 189                                              |
| 13          | ZGC uncommits unused memory                                                                                 | JEP 351                                              |
| 14          | CMS removed; ParallelScavenge + SerialOld combination deprecated                                            | JEP 363, JEP 366                                     |
| 15          | ZGC and Shenandoah product; biased locking disabled and deprecated                                          | JEP 377, JEP 379, JEP 374                            |
| 16          | ZGC scans thread stacks concurrently; long-counted loops strip-mined; Elastic Metaspace                     | JEP 376, JDK-8223051, JEP 387                        |
| 16          | Throttled `jdk.ObjectAllocationSample` joins the legacy TLAB allocation events                              | JDK-8257602                                          |
| 18          | Biased locking removed                                                                                      | JDK-8256425                                          |
| 21          | Generational ZGC, opt-in via `-XX:+ZGenerational`                                                           | JEP 439                                              |
| 22          | G1 region pinning: JNI critical sections no longer block the collector                                      | JEP 423                                              |
| 23          | Generational ZGC becomes ZGC's default mode                                                                 | JEP 474                                              |
| 24          | Non-generational ZGC removed; `ZGenerational` obsolete. Compact object headers experimental                 | JEP 490, JEP 450                                     |
| 25          | Compact object headers product (off by default); generational Shenandoah product                            | JEP 519, JEP 521                                     |
| 26          | G1 post-write barrier reworked around a second card table; `ZGenerational` expires                          | JEP 522                                              |
| 27          | G1 default in all environments; Closed/Delivered as of 2026-09-05, not runtime-tested here                  | [JEP 523](https://openjdk.org/jeps/523)              |
| 28 (target) | Shenandoah generational default; Targeted as of 2026-09-05, not delivered                                   | [JEP 535](https://openjdk.org/jeps/535), JDK-8379682 |

Historical rows identify primary change records; running a flag on 25 does not validate its
behavior on every historical JDK. Rows for 26–27 describe integrated JEP changes, not local
runtime tests or proof of a vendor build's availability. The JDK 28 row remains a target,
not a release promise. Recheck status before planning an upgrade.

## The flag lifecycle

HotSpot retires a `-XX:` flag in three stages (the `special_jvm_flags` table in
`src/hotspot/share/runtime/arguments.cpp`): **deprecated** (accepted, warns),
**obsolete** (ignored, warns `Ignoring option X; support was removed in N.0`), **expired**
(`Unrecognized VM option`, the JVM does not start). A flag can be obsoleted without a
deprecation release, which is how `ZGenerational` went straight from working on 23 to
ignored on 24 and, per its scheduled expiry, to fatal on 26. Any GC flag inherited from a
runbook is therefore tested with `java <flags> -version` on the target JDK before it
reaches a deployment; the exercise for a whole command line is jdk-upgrade-impact.
