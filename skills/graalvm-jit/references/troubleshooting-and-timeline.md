# Troubleshooting Graal as a JIT, production behaviour, and the timeline

Messages quoted below were produced on GraalVM CE 25.0.2 (`25.0.2+10-jvmci-b01`) and Temurin
25.0.3, Windows x64, unless marked "(not verified here)".

## Symptom to cause

| Symptom                                                                                                        | Cause                                                                                               | Check                                                                                                                | Remedy                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Error: VM option 'UseJVMCICompiler' is experimental and must be enabled via -XX:+UnlockExperimentalVMOptions` | Stock OpenJDK: the flag class is `{JVMCI experimental}`                                             | `-XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version \| grep JVMCI`                                       | Add the unlock **before** the flag — and read the next row, because it will not help                            |
| `-version` passes, application dies: `Cannot use JVMCI compiler: No JVMCI compiler found`, exit 1              | JVMCI is present, no compiler is: this JDK is not a GraalVM                                         | `java --list-modules \| grep graal` then `jimage list` — `jdk.graal.compiler` has one class                          | Run on a GraalVM distribution; `-XX:+BootstrapJVMCI` turns the late failure into a start-up failure             |
| `Cannot use JVMCI compiler: JVMCI compiler 'graal' specified by jvmci.Compiler not found`                      | `-XX:+UseGraalJIT` on a JDK with the JDK 22+ placeholder module                                     | Same as above                                                                                                        | Same as above; the flag is a Galahad residue with nothing behind it on OpenJDK                                  |
| `Error parsing Graal options: Could not find option X` and the JVM does not start                              | A `-Djdk.graal.X` name this build does not know: renamed, edition-specific, or invented             | `-XX:+JVMCIPrintProperties -Djdk.graal.PrintPropertiesAll=true \| grep X`                                            | Remove or rename; `CompilerThreads` never existed, `Vectorization`/`OptDuplication` are Oracle GraalVM only     |
| `WARNING: The 'graal.' property prefix for the Graal option X ... is deprecated`                               | Legacy prefix on 25.0 (GraalVM for JDK 24 added the warning; 25.1 dropped it)                       | —                                                                                                                    | Rename to `-Djdk.graal.X`; the semantics are unchanged                                                          |
| `[warning][jit,compilation] JVMCI compiler disabled after N of N upcalls had errors`, then `hs_err`            | Every Graal compilation throws — typically `Compiler configuration 'enterprise' not found` on CE    | The `Last error:` text in the warning; `-Xlog:jit+compilation` for the rest                                          | Drop the `CompilerConfiguration` copied from Oracle GraalVM, or run Oracle GraalVM; there is no fallback to C2  |
| Graal "is slow" and every run shows `loaded from class files`                                                  | jargraal: `-XX:-UseJVMCINativeLibrary`, or a build without `libjvmcicompiler`                       | `-Djdk.graal.ShowConfiguration=info`; `PrintFlagsFinal \| grep UseJVMCINativeLibrary`                                | Use libgraal; do not tune warm-up — the compiler is C1-compiled for the life of the process                     |
| Benchmark shows no difference at all between "Graal" and "C2"                                                  | Both sides ran C2: `-XX:-UseJVMCICompiler` in a shared flags file, or the wrong `JAVA_HOME`         | JFR `jdk.Compilation` with `#threshold=0ms`: `compiler = "jvmci"` present on the Graal side?                         | Fix the launch; `-XX:+PrintCompilation` cannot detect this, its output is identical for both compilers          |
| Graal wins in JMH, loses in production                                                                         | Benchmark warmed to steady state; production restarts or scales out before Graal repays compilation | Time-to-steady-state from JFR `jdk.CompilerStatistics` and the p99 over the first N minutes after deploy             | Longer-lived instances, warm-up traffic before readiness, or stay on C2 — start-up is not Graal's dimension     |
| p99 fine, RSS higher than on OpenJDK, no Java-heap growth                                                      | libgraal isolate, compiler threads/code, or another native category                                 | Compare process/container RSS, NMT, compiler activity and identical baseline flags; account for unexplained residual | Test compiler concurrency/capacity changes, then size the container from measured peak plus margin              |
| Numeric hot loop slower than on C2                                                                             | CE before 25.3 has no loop vectorisation; C2's SuperWord did it                                     | `-Djdk.graal.PrintIntrinsics=true`; compare the GraalVM line; disassemble the loop on both sides                     | Move to CE 25.3+ (`VectorizeLoops`), Oracle GraalVM, or keep that service on C2                                 |
| `-XX:+PrintInlining` prints tier-3 trees only, no tier-4 verdicts                                              | HotSpot's inlining log is C1/C2's; Graal does not feed it                                           | `-Djdk.graal.TraceInlining=true -Djdk.graal.MethodFilter=Cls.method`                                                 | Read Graal's own trace: `yes, trivial (... nodes=9)`, `no, bytecode parser did not replace invoke`, etc.        |
| `-XX:+PrintEscapeAnalysis` refused, or prints nothing useful                                                   | `develop` flag on HotSpot, and C2's anyway                                                          | Allocation profiling: an eliminated allocation is absent from `-e alloc` / `jdk.ObjectAllocationInNewTLAB`           | Use the indirect check; `-Djdk.graal.Dump` with IGV shows virtualised nodes if the exact mechanism matters      |
| `[engine] WARNING: The polyglot engine uses a fallback runtime that does not support runtime compilation`      | A Truffle language on a JDK without Graal as the host compiler                                      | Which JDK: see the runtime matrix below                                                                              | Run on GraalVM 25.1+, or run the language as a polyglot isolate on OpenJDK; interpreter-only is the alternative |
| Oracle JDK upgrade 24 → 25 lost the Graal JIT                                                                  | Oracle JDK 25 removed the optional Graal JIT                                                        | Oracle JDK 25 release notes, "Removed Features and Options"                                                          | Move to a GraalVM distribution or to C2; there is no flag to bring it back                                      |

## Production and scale behaviour

**Compiler threads.** HotSpot sizes `CICompilerCount` ergonomically (12 on a 12-core host in
the runs here). With libgraal, `JVMCINativeLibraryThreadFraction=0.66` of them serve JVMCI
and the rest C1 — the same count C2 would have had, since GraalVM for JDK 24 (JDK-8337493:
"Number of libgraal threads might be too low"). The changelog states the trade openly: the
higher fraction "benefits the program warmup but could increase the maximum RSS". On a
container with a 2-CPU quota the ergonomic count is small, Graal's per-compilation cost is
higher, and the queue backs off exactly as under C2 (`Tier3DelayOn`, `Tier4LoadFeedback`),
so methods sit in tier 2/3 longer than they would under C2 on the same quota; the warm-up
mechanics are `jit-compilation`'s subject. Read the queue with `jcmd <pid> Compiler.queue`
or JFR `jdk.CompilerQueueUtilization`.

**Memory outside the Java heap.** libgraal is a native image with its own isolate heap and its
own GC (`gc=Serial GC` in the configuration line); it is not governed by the application's
`-Xmx`. Measure process/container RSS and NMT during representative compilation bursts. Do
not claim every residual byte is libgraal or that NMT categorically excludes it without
verifying the exact build's accounting.

**Code cache.** Graal-compiled methods land in the same segmented code cache
(`code-cache-segments`), and `JVMCINMethodSizeLimit=655360` caps a single nmethod. More
aggressive inlining produces larger nmethods; a code cache sized for C2 on a large
application should be re-checked with `jcmd <pid> Compiler.codecache` after the swap.

**Deoptimisation.** Speculation that C2 would not make is speculation Graal can lose. The
`made not entrant: uncommon trap` lines and the JFR `jdk.Deoptimization` event are the same
under both compilers; a rise in their rate after the swap is the price of the extra
speculation and is where a Graal "win" in JMH can turn into a loss on a workload whose type
profile shifts through the day.

**Observability.** JFR, JMX, `jcmd`, async-profiler and the unified logging tags all work
unchanged — Graal is a plug-in behind JVMCI, not a different VM. The one difference worth
knowing before an incident: `-XX:+PrintInlining` and the C2 `develop` diagnostics say nothing
about tier 4; Graal's own `-Djdk.graal.*` logging is the replacement.

**Rollback.** `-XX:-UseJVMCICompiler` on the same GraalVM binary restores C2 without changing
the image; that is the fastest rollback and the reason to have measured that configuration
in the first place. A full rollback to the OpenJDK build changes the class library too and
is the second step, not the first.

## Truffle: the other reason to need Graal

Truffle languages are AST or bytecode interpreters that reach native speed through partial
evaluation by the Graal compiler. Without Graal as the host JIT the language still runs, in
"fallback runtime" mode — interpreter only — and prints the warning quoted in the table. The
runtime-optimisation matrix from the GraalVM embedding reference, as of 25.1:

| Host JDK                    | Optimising runtime                                                     |
| --------------------------- | ---------------------------------------------------------------------- |
| Oracle GraalVM 25.1+        | Supported, with additional (Oracle-only) inlining heuristics           |
| GraalVM Community 25.1+     | Supported, no configuration                                            |
| Oracle JDK 25 or OpenJDK 25 | Polyglot isolate only — the guest runs as a native image in an isolate |
| JDK 21 runtimes             | Polyglot isolate only                                                  |

GraalVM 25.1's release notes withdraw the previous jargraal-on-OpenJDK route for Truffle:
the optimising runtime "is no longer supported with GraalVM 25.0 or earlier, or on plain
OpenJDK or Oracle JDK via jargraal". The 25.1 notes also move isolated `Engine`/`Context`
into CE, so sandboxing is no longer an Oracle-only reason to pick an edition. An application
embedding GraalJS or GraalPy is therefore on GraalVM for the language's sake; the C2-versus-
Graal question for its own Java code is then answered by the same measurement as anywhere
else, with `-XX:-UseJVMCICompiler` unavailable as an option because the language needs the
compiler.

## Timeline: JVMCI to the detachment

| When                               | What                                                                                                                                                                                                                                           | Source                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| JDK 9 (2017)                       | JEP 243 adds JVMCI; JEP 295 adds `jaotc`, which uses Graal for AOT                                                                                                                                                                             | JEP 243, JEP 295                                                  |
| JDK 10 (2018)                      | JEP 317: Graal usable as an experimental JIT on Linux/x64 with `-XX:+UnlockExperimentalVMOptions -XX:+UseJVMCICompiler`; the JEP itself warns of slower start-up and higher heap use                                                           | JEP 317                                                           |
| 2019                               | GraalVM 19.0, first GA; libgraal arrives during the 19.x line (exact release not verified here)                                                                                                                                                | GraalVM release notes                                             |
| JDK 17 (2021)                      | JEP 410 removes `jdk.aot`, `jdk.internal.vm.compiler` and `.management`; keeps `jdk.internal.vm.ci` "so that developers can continue to use externally-built versions of the compiler"                                                         | JEP 410                                                           |
| Dec 2022                           | Project Galahad proposed: contribute the Graal JIT to OpenJDK, AOT later                                                                                                                                                                       | openjdk.org/projects/galahad                                      |
| GraalVM for JDK 17/20 (23.0, 2023) | Oracle GraalVM under the GFTC; CE and Oracle GraalVM both free (release boundary not verified here)                                                                                                                                            | graalvm.org/downloads                                             |
| JDK 22 (2024)                      | Module renamed to `jdk.graal.compiler` and kept upgradeable so a GraalVM can be built from the JDK tree; OpenJDK builds ship it as a one-class placeholder; `-XX:+UseGraalJIT` exists                                                          | JDK-8318027; Temurin 25.0.3 `--list-modules`, `jimage list`       |
| GraalVM for JDK 22 (24.0)          | Options move to the `jdk.graal.` prefix; `graal.` deprecated                                                                                                                                                                                   | compiler CHANGELOG GR-49960                                       |
| GraalVM for JDK 23 (24.1)          | `-Djdk.graal.PrintPropertiesAll`; Generational ZGC supported                                                                                                                                                                                   | compiler CHANGELOG                                                |
| Oracle JDK 23–24                   | Oracle JDK bundles the Graal JIT as an optional compiler; OpenJDK does not                                                                                                                                                                     | Oracle JDK 24 release notes                                       |
| GraalVM for JDK 24 (24.2)          | JVMCI threads raised to 0.66 of `CICompilerCount`; `graal.` prefix now warns                                                                                                                                                                   | compiler CHANGELOG GR-57209, GR-54476; JDK-8337493                |
| Sept 2025                          | GraalVM 25 on a JDK 25 base; libgraal build logic moved into the compiler suite (GR-60088); Vector API lowering (GR-59869). Oracle's Java team announces the detachment of GraalVM from the Java SE train; Oracle JDK 25 removes the Graal JIT | GraalVM 25 release notes; Oracle JDK 25 release notes             |
| GraalVM 25.1 (2026)                | Monthly innovation releases with quarterly CPUs; `graal.` prefix accepted again without a warning; Truffle optimising runtime only on GraalVM 25.1+; record/replay of compilations                                                             | GraalVM 25.1 release notes; compiler CHANGELOG GR-69280           |
| GraalVM 25.3                       | Priority inlining becomes the default inliner (`UsePriorityInlining`); loop vectorisation in CE (`VectorizeLoops`)                                                                                                                             | GraalVM 25.3 release notes; compiler CHANGELOG GR-77137, GR-28213 |
| March 2026                         | Galahad dissolved by the HotSpot Group: "unnecessary in light of the September 2025 announcement"                                                                                                                                              | openjdk.org/projects/galahad                                      |
| GraalVM 25.4                       | Duplication and pull-through-phi phases added to the community configuration — in the compiler changelog; not verified as released at the time of writing                                                                                      | compiler CHANGELOG GR-79029                                       |

Two consequences for a 2026 decision follow directly. First, the dissolved Galahad project
is not a delivery plan for putting Graal into a future OpenJDK release; decide from software
that is actually shipped and supported. Second, the compiler now changes monthly inside a
fixed JDK base, so a result is a result for a GraalVM line — record 25.0 versus 25.3 alongside
the number, the way the JDK build is recorded for C2.

## Authoritative sources

- [GraalVM 25.3 release notes](https://www.graalvm.org/release-notes/25.3/)
- [GraalVM 25.1 release notes](https://www.graalvm.org/release-notes/25.1/)
- [GraalVM release calendar](https://www.graalvm.org/release-calendar/)
- [Oracle JDK 25 significant changes](https://docs.oracle.com/en/java/javase/25/migrate/significant-changes-jdk-25.html)
- [Oracle announcement: Detaching GraalVM from the Java Ecosystem Train](https://blogs.oracle.com/java/detaching-graalvm-from-the-java-ecosystem-train)
- [JEP 243: Java-Level JVM Compiler Interface](https://openjdk.org/jeps/243)
- [JEP 317: Experimental Java-Based JIT Compiler](https://openjdk.org/jeps/317)
- [JEP 410: Remove the Experimental AOT and JIT Compiler](https://openjdk.org/jeps/410)
