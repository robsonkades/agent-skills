# Technique selection

## What each mechanism preserves

| Dimension                          | CDS / AppCDS                                    | CRaC                                        | Leyden AOT cache (483+514+515)                |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Unit preserved                     | Class metadata, plus some archived heap objects | The entire process: heap, threads, fds      | Loaded and linked classes, plus profiles      |
| Created when                       | Dump, explicit or automatic, before deploy      | Checkpoint on demand, after real warm-up    | Training run before deploy                    |
| Removes class verification/linking | Yes                                             | Yes                                         | Yes                                           |
| Removes JIT warm-up                | **No**                                          | **Yes** — restored code is already compiled | **Partly** — profiles speed recompilation     |
| Portability                        | Any platform with a standard JDK 25             | Linux only, CRaC-enabled build required     | Any platform with a standard JDK 25           |
| Needs a special JDK build          | No                                              | **Yes**                                     | No                                            |
| Application state (pools, timers)  | Nothing captured, nothing to reopen             | Explicit `beforeCheckpoint`/`afterRestore`  | Nothing captured; the process starts normally |

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
|     yes -> Leyden AOT cache (JEP 514 one-command flow): removes verification
|            and linking and shortens warm-up via profiles, with no special JDK
|            build and no CRIU
|     no  -> continue
|
+- Any case, low risk, no platform prerequisite:
      AppCDS with -XX:+AutoCreateSharedArchive. Smaller gain — it only attacks
      class verification and linking — but zero friction and fully portable.
```

## JEP status at this baseline (OpenJDK 25 LTS)

| JEP / issue | What it delivers                                                  | Status                             |
| ----------- | ----------------------------------------------------------------- | ---------------------------------- |
| 310         | Application classes in the shared archive (AppCDS)                | Delivered, JDK 10                  |
| 341         | Default CDS archives; `-Xshare:auto` is the factory behaviour     | Delivered, JDK 12                  |
| 350         | Dynamic CDS: `-XX:ArchiveClassesAtExit`                           | Delivered, JDK 13                  |
| JDK-8261455 | `-XX:+AutoCreateSharedArchive` (an enhancement, not a formal JEP) | Delivered, JDK 19                  |
| 483         | AOT class loading and linking; three-step `record`/`create` flow  | **Delivered, JDK 24**, not preview |
| 514         | One-command AOT ergonomics: `-XX:AOTCacheOutput`                  | Delivered, JDK 25                  |
| 515         | AOT method profiling persisted into the cache                     | Delivered, JDK 25                  |
| 516         | AOT cache with any collector, generational ZGC included           | **Candidate** — do not assume      |

## Numbers: what is sourced and what is not

| Technique        | Figure                       | Status                                                                                                                                                                 |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDS / AppCDS     | No citable single percentage | It attacks verification and linking only; that phase's share of total startup varies by application. Measure locally.                                                  |
| CRaC             | No citable single percentage | Eliminates JIT warm-up in theory; real restore time depends on heap size and image read cost. Expect a large reduction for warm-up-heavy applications, but measure it. |
| Leyden AOT cache | **~42%**, 4.486 s to 2.604 s | Primary source: SoftwareMill benchmark on Spring PetClinic. The only reconcilable public figure here.                                                                  |
| Native Image     | Sub-100 ms startup typical   | Trade-off: peak throughput typically 10–25% lower, no adaptive JIT. Out of scope — see graalvm-native-image.                                                           |

Label every other number as an expected order of magnitude, and say whether it covers total
startup or one phase.

## Which classes the AOT cache can cover (JEP 483)

| Category                                                               | Eligible for AOT linking |
| ---------------------------------------------------------------------- | ------------------------ |
| No `<clinit>`, or an initialiser of pure constants                     | Yes                      |
| `<clinit>` depending only on already-resolved classes                  | Usually yes              |
| `<clinit>` reading `System.getProperty` or environment-specific values | No, or handled carefully |
| `<clinit>` opening I/O — files, sockets                                | No                       |

JEP 483 makes this distinction itself: ineligible classes simply load and link at runtime as
before, uncovered by the cache. The practical consequence is that the gain scales with how much
of the codebase falls in the first category. Well-behaved frameworks benefit more than code
with heavy environment-bound static initialisation.

## Why CRaC costs more operationally

CDS and the AOT cache preserve metadata, so the artefact grows with class count — megabytes. A
CRaC checkpoint preserves the whole heap, so the on-disk image grows with the application's real
memory footprint — potentially gigabytes. Two consequences follow directly: restore time is not
a small constant, since it scales with the pages that must be remapped; and moving that image
from the checkpointing environment to the restoring one is itself a latency factor. Managed
mechanisms such as SnapStart address this with on-demand page restoration rather than loading
the whole image before resuming.
