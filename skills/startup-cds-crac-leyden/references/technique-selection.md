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

The last two rows decide most real cases before the second-to-last one gets a vote.

## Decision tree, constraints first

```
Is slow startup a real, measured problem?
|
+- Linux, control over which JDK build ships, and the operational cost of a
|  checkpoint image plus external-resource coordination is justified?
|     yes -> CRaC, or a managed equivalent such as AWS Lambda SnapStart
|     no  -> continue
|
+- Can a cache be produced in build/CI and used by every production instance
|  without breaking reproducible builds?
|     yes -> JDK 25 AOT cache (JEP 514 one-command flow): reuses selected loaded/linked
|            state and profiles; requires a supporting HotSpot distribution/platform,
|            but not a CRaC build or CRIU
|     no  -> continue
|
+- Repeated short-lived local/CI process with writable persistent path?
|     yes -> dynamic AppCDS/AutoCreate may amortize creation; validate clean exit
|     no  -> build AppCDS explicitly with the immutable runtime image if measured value remains
|
+- Otherwise use the default archive actually present in the runtime image and optimize the
   measured dominant phase rather than adding another startup artifact.
```

## JEP status at the JDK 25 baseline

| JEP / issue | What it delivers                                                  | Status                                                                                              |
| ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 310         | Application classes in the shared archive (AppCDS)                | Delivered, JDK 10                                                                                   |
| 341         | Default CDS archives; `-Xshare:auto` is the factory behaviour     | Delivered, JDK 12                                                                                   |
| 350         | Dynamic CDS: `-XX:ArchiveClassesAtExit`                           | Delivered, JDK 13                                                                                   |
| JDK-8261455 | `-XX:+AutoCreateSharedArchive` (an enhancement, not a formal JEP) | Delivered, JDK 19                                                                                   |
| 483         | AOT class loading and linking; three-step `record`/`create` flow  | **Delivered, JDK 24**, not preview                                                                  |
| 514         | One-command AOT ergonomics: `-XX:AOTCacheOutput`                  | Delivered, JDK 25                                                                                   |
| 515         | AOT method profiling persisted into the cache                     | Delivered, JDK 25                                                                                   |
| 516         | AOT cache with any collector, ZGC included                        | Delivered, JDK 26 (not on 25)                                                                       |
| JDK-8377932 | Affected AOT-cache builds accepted a modified application JAR     | Fixed in mainline and at least some JDK 25 updates (including Corretto 25.0.3); verify vendor build |

## Measurement contract

There is no transferable percentage. Report cold-process cohorts for at least: process spawn,
application-ready, first successful representative transaction, first transaction meeting the
latency SLO, and time/requests to stable throughput. Record CPU quota, memory limit, storage/cache
state, JDK build/flags, image digest and training coverage. Compare p50/p95/p99 and failures under
concurrent scale-out; randomized interleaving avoids attributing host warming to one technique.

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
