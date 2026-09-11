# Technique selection

## What each mechanism preserves

| Dimension                     | CDS / AppCDS                                   | CRaC                                                          | JDK 25 AOT cache (483/514/515)                                      |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Unit preserved                | Selected class metadata and heap artifacts     | Process/JVM state permitted by the engine and resource policy | Selected loaded/linked classes, heap artifacts and trained profiles |
| Created when                  | Static/dynamic archive build                   | Checkpoint at a defined lifecycle/warm-up point               | Training plus assembly before deploy                                |
| Class-loading/linking benefit | Reuses archived work; exact coverage varies    | Restores already-created process state                        | Adds trained AOT loading/linking                                    |
| JIT warm-up                   | Does not archive application native code       | Restores compiled/profile state captured at checkpoint        | Profiles can shorten later compilation; code still compiles         |
| Portability                   | Bound to compatible JDK/runtime/image/platform | CRaC build, engine, OS/kernel/CPU/container compatibility     | Bound to compatible application, JDK, OS and CPU architecture       |
| External state                | Process starts normally                        | Must close/recreate or explicitly handle every resource       | Process starts normally                                             |

Use compatibility and external-state requirements to exclude infeasible choices, then compare
the work each remaining mechanism can actually remove. Existing adequate behavior can stay.

## Decision tree, constraints first

```
Is there a measured startup cost that the current adequate default/CDS setup leaves unresolved?
  no -> retain it; answer the narrow capability/review question without an adoption campaign
  yes -> attribute the remaining cost and evaluate feasible candidates below
|
+- Is substantial initialization/warm-up reusable as process state, with an accepted
|  checkpoint lifecycle and supported runtime/engine/platform (or managed SnapStart contract)?
|     yes -> evaluate CRaC/managed restore against simpler adequate alternatives
|     no  -> exclude checkpoint/restore
|
+- Does supported class-loading/linking/profile coverage address the measured cost,
|  and can exact compatible cache artifacts be produced and consumed under the release contract?
|     yes -> compare supported AOT or AppCDS; JDK 25's one-command flow is an option,
|            not a reason to upgrade or discard an adequate older/two-phase recipe
|     no  -> retain default CDS and address the dominant uncached work
|
+- Repeated short-lived local/CI process with writable persistent path?
|     yes -> dynamic AppCDS/AutoCreate may amortize creation; validate clean exit
|     no  -> explicit AppCDS creation is another option if measured value remains
|
+- Adopt only a candidate whose measured benefit and lifecycle/compatibility costs justify it.
```

## JEP status at the JDK 25 baseline

The earlier 2026-09-05 status check recorded 514 Closed/Delivered for 25 and 516 for 26;
the 2026-09-11 source check retains those statuses.
These are release integration facts, not a promise about installed/vendor builds or GA artifacts
on a target platform. Verify vendor release availability separately. On 2026-09-11, JEP 544
lists AOT code compilation as Candidate with no release row, while Leyden's overview still
labels it in progress/TBD. The JDK 25 column above remains profile-based.

| JEP / issue | What it delivers                                                  | Status                                                                                                                                     |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 310         | Application classes in the shared archive (AppCDS)                | Delivered, JDK 10                                                                                                                          |
| 341         | Default CDS archives; `-Xshare:auto` is the factory behaviour     | Delivered, JDK 12                                                                                                                          |
| 350         | Dynamic CDS: `-XX:ArchiveClassesAtExit`                           | Delivered, JDK 13                                                                                                                          |
| JDK-8261455 | `-XX:+AutoCreateSharedArchive` (an enhancement, not a formal JEP) | Delivered, JDK 19                                                                                                                          |
| 483         | AOT class loading and linking; three-step `record`/`create` flow  | **Delivered, JDK 24**, not preview                                                                                                         |
| 514         | One-command AOT ergonomics: `-XX:AOTCacheOutput`                  | Delivered, JDK 25                                                                                                                          |
| 515         | AOT method profiling persisted into the cache                     | Delivered, JDK 25                                                                                                                          |
| 516         | AOT cache with any collector, ZGC included                        | Delivered, JDK 26 (not on 25)                                                                                                              |
| 544         | Native application code in an AOT cache                           | Candidate, no target release listed on 2026-09-11; not a JDK 25 capability                                                                 |
| JDK-8377932 | Affected AOT-cache builds accepted a modified application JAR     | Current Corretto develop capture lists it under 25.0.3.9.1; earlier record differed. See validation reference; qualify actual vendor build |

## Measurement contract

There is no transferable percentage. For a claimed speedup, compare cold-process cohorts at
the relevant boundary: useful command/job completion for finite work; application readiness,
representative success, latency target and stable throughput for service claims that depend on
those phases. Record relevant CPU/memory limits, storage/cache state, JDK build/flags, image
identity and training coverage. Report failures and distributions the sample count can support;
exercise concurrent scale-out when that is the claimed use. Interleave comparable runs to
control host warming. A source-only explanation or adequate unchanged setup needs no new benchmark.

## AOT coverage is observed, not inferred from `<clinit>` shape

Training determines candidate classes and profiles; compatibility and implementation rules
determine what can be archived/linked. Arbitrary application initialization is not equivalent to
AOT linking, and a “pure constants” visual inspection is not an eligibility proof. Inspect
creation/use logs and class sources, then correlate covered work with the startup profile. Classes
or paths absent from training run normally and may dominate the first real request.

## Why CRaC costs more operationally

CDS/AOT size depends on selected metadata and archived objects. CRaC image size/restore depends on
heap and native process state, dirty/resident pages, engine, compression, filesystem and lazy-page
strategy. Measure image creation, storage/transfer, restore CPU, major faults and first-request
latency. Managed snapshots may hide transfer behind lazy restoration, moving cost into page faults
rather than eliminating it.

## Primary references

- [Java 25 launcher: Ahead-of-Time Cache](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#ahead-of-time-cache)
- [Project Leyden delivered JEPs](https://openjdk.org/projects/leyden/)
- [JEP 341: Default CDS Archives](https://openjdk.org/jeps/341)
- [JEP 483: Ahead-of-Time Class Loading & Linking](https://openjdk.org/jeps/483)
- [JEP 514: Ahead-of-Time Command-Line Ergonomics](https://openjdk.org/jeps/514)
- [JEP 515: Ahead-of-Time Method Profiling](https://openjdk.org/jeps/515)
- [JEP 516: Ahead-of-Time Object Caching with Any GC](https://openjdk.org/jeps/516)
- [JEP 544: Ahead-of-Time Code Compilation](https://openjdk.org/jeps/544)
