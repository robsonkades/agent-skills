# Diagnosis and versions

## Symptom to mechanism

Each row names the mechanism from references/collector-mechanisms.md that produces the
symptom, how to tell it from its neighbours, the cheapest measurement that confirms it,
and the skill that owns the fix. Log text and flag names are as 25.0.3 prints them.

| Symptom                                                                  | Mechanism                                                                               | How to distinguish                                                                                               | What to measure                                                                           | Owner of the fix                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Young pauses more frequent, each one unchanged                           | Allocation rate rose; Eden fills sooner                                                 | `after` occupancy stable, interval between pauses shrank                                                         | Allocation rate from the log (gc-log-analysis); `jdk.ObjectAllocationSample` for the site | allocation-profiling                                                |
| Young pauses longer, `Object Copy` dominates                             | More survivors — hypothesis failing or requests piling up                               | `Object Copy` grows with survivor/promoted bytes; downstream latency rose at the same time                       | `gc+phases=debug`, `gc+age=trace`, dependency p99 by timestamp                            | upstream latency (littles-law-and-queueing), then g1-tuning-for-slo |
| Young pauses longer, few survivors, `Merge Heap Roots`/`Scan Heap Roots` | Old-to-young references: nepotism, a pool or cache being mutated                        | Promoted bytes small; dirty cards high; often follows a period of premature promotion                            | `gc+phases=debug`, `gc+remset=trace`                                                      | g1-internals; fix the structure holding young data from old         |
| Young pauses longer, `Ext Root Scanning` dominates                       | Thousands of platform threads with deep stacks                                          | Phase tracks thread count, not heap                                                                              | `jcmd <pid> Thread.print` count, `jdk.ThreadDump`                                         | thread-sizing-and-virtual-threads                                   |
| Young pauses longer, `Reference Processing` dominates                    | Weak/soft/final/phantom references in the collection set                                | `gc+ref=debug` phase times; `jdk.GCReferenceStatistics` counts                                                   | Reference counts per type                                                                 | java-reference-types-and-leaks                                      |
| `new threshold N (max threshold 15)` with N < 15                         | Premature promotion: survivor space overflowed                                          | Promoted bytes rise on the same pauses; old grows without retention                                              | `gc+age=trace`, promotion rate from the log                                               | g1-tuning-for-slo (young size), gc-log-analysis (reading it)        |
| Old occupancy climbs, falls back after each mixed/full collection        | Floating garbage or nepotism, not a leak                                                | The floor after a **full** collection is flat                                                                    | `after` of `Pause Full` or `Pause Remark` across cycles                                   | none — expected; sizing headroom is jvm-gc-tuning                   |
| Old occupancy floor rises after every full collection                    | Retention: leak or unbounded cache                                                      | Floor rises monotonically; no collector reclaims it                                                              | Two heap dumps, dominator tree                                                            | java-reference-types-and-leaks, heap-dump-analysis                  |
| `(Evacuation Failure: Allocation)` on a young pause line                 | No free region to copy into: old full, humongous fragmentation, or the reserve consumed | Free regions at pause start; humongous count; whether marking was running                                        | `gc+heap=debug` region counts, `gc+humongous=debug`                                       | g1-internals; then jvm-gc-tuning for sizing                         |
| `Pause Full` under G1 with `G1 Humongous Allocation` before it           | Contiguous regions unavailable for a humongous object                                   | Free regions plentiful but scattered                                                                             | Humongous object size versus `G1HeapRegionSize` from `gc+init`                            | allocation site; region size is g1-tuning-for-slo                   |
| Concurrent cycles back to back (`Concurrent Start` every few pauses)     | Old occupancy sits above the IHOP, or humongous allocation keeps requesting cycles      | `gc+ergo+ihop=debug` `source:` field says which                                                                  | Live set after full collection against the heap                                           | g1-concurrent-marking; heap size is jvm-gc-tuning                   |
| `Allocation Stall` (ZGC) or `Degenerated GC` (Shenandoah)                | The concurrent cycle lost the race with allocation                                      | Stalls cluster at traffic peaks; cycle time × allocation rate exceeds headroom                                   | `jdk.ZAllocationStall`, cycle duration, allocation rate                                   | zgc-and-shenandoah                                                  |
| GC log clean, client p99 far above every pause                           | Time-To-SafePoint, or the host                                                          | `Reaching safepoint` large versus `At safepoint`; or neither, and the host is throttling                         | `-Xlog:safepoint`, cgroup `nr_throttled`, PSI                                             | safepoints, pause-attribution, linux-for-jvm                        |
| Throughput fell after a collector change, no pause regression            | Barrier cost and concurrent GC CPU on the mutators' cores                               | CPU per request rose; GC threads visible in a CPU profile                                                        | GC thread CPU, `jdk.GCPhaseConcurrent`, mutator CPU per request                           | jvm-gc-tuning (CPU count), zgc-and-shenandoah                       |
| Pauses on a one-CPU pod are stop-the-world and long                      | Ergonomics picked Serial (through JDK 26)                                               | `Using Serial` in `gc+init`; `jcmd <pid> VM.flags` shows `-XX:+UseSerialGC` without it being on the command line | Collector name at start-up                                                                | jvm-gc-tuning; container-awareness for the CPU count                |
| Flag copied from an older runbook stops the JVM or is ignored            | Flag lifecycle: obsolete (warned, ignored) or expired (unrecognised)                    | Start-up output: `Ignoring option …; support was removed in N` versus `Unrecognized VM option`                   | `java -XX:+PrintFlagsFinal -version` on the target JDK                                    | jdk-upgrade-impact                                                  |

Three rules for using the table:

- Confirm the phase before the cause. Two rows share a symptom and differ only in which
  phase grew; `-Xlog:gc+phases=debug` is the cheapest instrument that separates them.
- A row that ends in "upstream" or "the structure" is the common case. The collector rows
  are last because the collector is usually behaving correctly.
- Every measurement above comes from logging that must already be on. Turning it on after
  the incident measures the next one, not this one — incident-evidence-capture.

## Collector timeline, JDK 9 to 28

What a document about GC assumed depends on when it was written. Each row is the change
that most often makes an older text wrong.

| JDK | Change                                                                                                   | Reference                     |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 9   | G1 becomes the default on server-class machines; ergonomics still pick Serial on one CPU or small memory | JEP 248                       |
| 9   | Unified logging replaces `-XX:+PrintGCDetails`                                                           | JEP 158, JEP 271              |
| 10  | Loop strip mining: counted loops poll every 1000 iterations; thread-local handshakes                     | JDK-8186027, JDK-8185640      |
| 11  | ZGC experimental; Epsilon experimental                                                                   | JEP 333, JEP 318              |
| 12  | Shenandoah experimental (in builds that include it)                                                      | JEP 189                       |
| 13  | ZGC uncommits unused memory                                                                              | JEP 351                       |
| 14  | CMS removed; ParallelScavenge + SerialOld combination deprecated                                         | JEP 363, JEP 366              |
| 15  | ZGC and Shenandoah product; biased locking disabled and deprecated                                       | JEP 377, JEP 379, JEP 374     |
| 16  | ZGC scans thread stacks concurrently; long-counted loops strip-mined; Elastic Metaspace                  | JEP 376, JDK-8223051, JEP 387 |
| 16  | Throttled `jdk.ObjectAllocationSample` joins the legacy TLAB allocation events                           | JDK-8257602                   |
| 18  | Biased locking removed                                                                                   | JDK-8256425                   |
| 21  | Generational ZGC, opt-in via `-XX:+ZGenerational`                                                        | JEP 439                       |
| 22  | G1 region pinning: JNI critical sections no longer block the collector                                   | JEP 423                       |
| 23  | Generational ZGC becomes ZGC's default mode                                                              | JEP 474                       |
| 24  | Non-generational ZGC removed; `ZGenerational` obsolete. Compact object headers experimental              | JEP 490, JEP 450              |
| 25  | Compact object headers product (off by default); generational Shenandoah product                         | JEP 519, JEP 521              |
| 26  | G1 post-write barrier reworked around a second card table; `ZGenerational` expires                       | JEP 522                       |
| 27  | G1 the default in every environment — no more Serial by ergonomics                                       | JEP 523                       |
| 28  | Generational Shenandoah becomes Shenandoah's default (Targeted)                                          | JEP 535                       |

Rows for 9–25 are established by the cited JEP or JBS issue and, where a flag is involved,
were executed on Temurin 25.0.3; rows for 26–28 are the JEP's stated target and were not
verified here.

## The flag lifecycle

HotSpot retires a `-XX:` flag in three stages (the `special_jvm_flags` table in
`src/hotspot/share/runtime/arguments.cpp`): **deprecated** (accepted, warns),
**obsolete** (ignored, warns `Ignoring option X; support was removed in N.0`), **expired**
(`Unrecognized VM option`, the JVM does not start). A flag can be obsoleted without a
deprecation release, which is how `ZGenerational` went straight from working on 23 to
ignored on 24 and, per its scheduled expiry, to fatal on 26. Any GC flag inherited from a
runbook is therefore tested with `java <flags> -version` on the target JDK before it
reaches a deployment; the exercise for a whole command line is jdk-upgrade-impact.
