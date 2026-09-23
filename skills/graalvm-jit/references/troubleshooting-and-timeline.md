# Troubleshooting Graal as a JIT, production behaviour, and the timeline

Messages quoted below were produced on GraalVM CE 25.0.2 (`25.0.2+10-jvmci-b01`) and Temurin
25.0.3, Windows x64, unless marked "(not verified here)".

## Symptom to cause

| Symptom                                                                                                        | Candidate cause                                                                                     | Check                                                                                                                                | Remedy                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Error: VM option 'UseJVMCICompiler' is experimental and must be enabled via -XX:+UnlockExperimentalVMOptions` | Stock OpenJDK: the flag class is `{JVMCI experimental}`                                             | `-XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version \| grep JVMCI`                                                       | Add the unlock **before** the flag — and read the next row, because it will not help                            |
| `-version` passes, application dies: `Cannot use JVMCI compiler: No JVMCI compiler found`, exit 1              | JVMCI is present but no compiler was found; no bundled compiler in the tested stock JDK             | Inspect image modules and any external compiler configuration; the tested stock placeholder contains one class                       | Use a compatible compiler/runtime; an owned `BootstrapJVMCI` preflight can expose the missing compiler          |
| `Cannot use JVMCI compiler: JVMCI compiler 'graal' specified by jvmci.Compiler not found`                      | `-XX:+UseGraalJIT` on a JDK with the JDK 22+ placeholder module                                     | Same as above                                                                                                                        | Same as above; the flag is a Galahad residue with nothing behind it on OpenJDK                                  |
| `Error parsing Graal options: Could not find option X` and the JVM does not start                              | A `-Djdk.graal.X` name this build does not know: renamed, edition-specific, or invented             | `-XX:+JVMCIPrintProperties -Djdk.graal.PrintPropertiesAll=true \| grep X`                                                            | Remove or rename using the target-build listing; edition-specific option availability changes by release        |
| `WARNING: The 'graal.' property prefix for the Graal option X ... is deprecated`                               | Legacy prefix on 25.0 (GraalVM for JDK 24 added the warning; 25.1 dropped it)                       | —                                                                                                                                    | Rename to `-Djdk.graal.X`; the semantics are unchanged                                                          |
| `[warning][jit,compilation] JVMCI compiler disabled after N of N upcalls had errors`, then `hs_err`            | Every Graal compilation throws — typically `Compiler configuration 'enterprise' not found` on CE    | The `Last error:` text in the warning; `-Xlog:jit+compilation` for the rest                                                          | Drop the `CompilerConfiguration` copied from Oracle GraalVM, or run Oracle GraalVM; there is no fallback to C2  |
| Graal "is slow" and every run shows `loaded from class files`                                                  | jargraal: `-XX:-UseJVMCINativeLibrary`, or a build without `libjvmcicompiler`                       | `-Djdk.graal.ShowConfiguration=info`; `PrintFlagsFinal \| grep UseJVMCINativeLibrary`                                                | Compare modes explicitly; compilation CPU can be amortised once hot code is installed                           |
| Benchmark shows no difference at all between "Graal" and "C2"                                                  | Both sides may use the same compiler: fork overrides, shared flags or the wrong JVM                 | Inspect effective fork commands and successful level-4 JFR events for relevant methods in each fork; see `enabling-and-comparing.md` | Fix launch only if evidence shows the wrong compiler; equal scores may be a real result                         |
| Graal wins in JMH, loses in production                                                                         | Benchmark warmed to steady state; production restarts or scales out before Graal repays compilation | Time-to-steady-state from JFR `jdk.CompilerStatistics` and the p99 over the first N minutes after deploy                             | Longer-lived instances, warm-up traffic before readiness, or stay on C2 — start-up is not Graal's dimension     |
| p99 fine, RSS higher than on OpenJDK, no Java-heap growth                                                      | libgraal isolate, compiler threads/code, or another native category                                 | Compare process/container RSS, NMT, compiler activity and identical baseline flags; account for unexplained residual                 | Test compiler concurrency/capacity changes, then size the container from measured peak plus margin              |
| Numeric hot loop slower than on C2                                                                             | CE before 25.3 has no loop vectorisation; C2's SuperWord did it                                     | `-Djdk.graal.PrintIntrinsics=true`; compare the GraalVM line; disassemble the loop on both sides                                     | Evaluate an authorized target build with vectorisation, or retain C2; no automatic upgrade                      |
| `-XX:+PrintInlining` prints tier-3 trees only, no tier-4 verdicts                                              | HotSpot's inlining log is C1/C2's; Graal does not feed it                                           | `-Djdk.graal.TraceInlining=true -Djdk.graal.MethodFilter=Cls.method`                                                                 | Read Graal's own trace: `yes, trivial (... nodes=9)`, `no, bytecode parser did not replace invoke`, etc.        |
| `-XX:+PrintEscapeAnalysis` refused, or prints nothing useful                                                   | `develop` flag on HotSpot, and C2's anyway                                                          | Compare allocation bytes/op and compiler graphs; absence in sampled/TLAB events is not proof                                         | Use the indirect check; `-Djdk.graal.Dump` with IGV shows virtualised nodes if the exact mechanism matters      |
| `[engine] WARNING: The polyglot engine uses a fallback runtime that does not support runtime compilation`      | A Truffle language on a JDK without Graal as the host compiler                                      | Which JDK: see the runtime matrix below                                                                                              | Run on GraalVM 25.1+, or run the language as a polyglot isolate on OpenJDK; interpreter-only is the alternative |
| Oracle JDK upgrade 24 → 25 lost the Graal JIT                                                                  | Oracle JDK 25 removed the optional Graal JIT                                                        | Oracle JDK 25 release notes, "Removed Features and Options"                                                                          | Move to a GraalVM distribution or to C2; there is no flag to bring it back                                      |

## Production and scale behaviour

**Compiler threads.** HotSpot sizes `CICompilerCount` ergonomically (12 on a 12-core host in
the runs here). With libgraal, `JVMCINativeLibraryThreadFraction=0.66` of them serve JVMCI
and the rest C1 — the same count C2 would have had, since GraalVM for JDK 24 (JDK-8337493:
"Number of libgraal threads might be too low"). The changelog states the trade openly: the
higher fraction "benefits the program warmup but could increase the maximum RSS". On a
container with a 2-CPU quota the ergonomic count is small, Graal's per-compilation cost is
higher on some workloads. HotSpot tier feedback still applies (`Tier3DelayOn`, `Tier4LoadFeedback`),
but compare queueing and time in each tier rather than assuming they exceed C2 on the same quota; the warm-up
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

**Deoptimisation.** Compare JFR `jdk.Deoptimization` reasons, methods and recompilation
activity under equivalent load. A higher event rate is a symptom, not proof of more
aggressive speculation: changed inputs, class loading and compilation policy also matter.
Generic `made not entrant` lines alone do not establish deoptimisation or its cause.
Correlate phase-changing type profiles with latency before attributing a regression.

**Observability.** HotSpot JFR, JMX, `jcmd` and unified logging remain useful, but verify
target-build events, recording coverage and tool/OS support. For example, async-profiler v4.5's
supported native platforms do not include Windows; remaining on HotSpot does not make an
unsupported profiler portable. `-XX:+PrintInlining` and C2 `develop` diagnostics do not
describe Graal's tier-4 decisions; use Graal's own `-Djdk.graal.*` diagnostics for those.

**Rollback.** `-XX:-UseJVMCICompiler` on the same GraalVM binary restores C2 without changing
the image where that configuration is supported. Use the recovery route already tested for
the failure: a compiler switch needs a process restart and may not fix a distribution regression.
A previous OpenJDK image also changes class-library/runtime components; it may be the appropriate
first rollback. Preserve the actual recovery deadline and validated application/guest contracts.

## Truffle: the other reason to need Graal

Truffle languages are AST or bytecode interpreters optimized through partial evaluation by
the Graal compiler, in a compatible host setup or a polyglot isolate. Without an optimizing
guest runtime, execution uses the interpreter-only fallback; the warning identifies that mode. The
runtime-optimisation matrix from the GraalVM embedding reference, for Polyglot 25.1+:

| Host JDK                    | Optimising runtime                                                     |
| --------------------------- | ---------------------------------------------------------------------- |
| Oracle GraalVM 25.1+        | Supported, with additional (Oracle-only) inlining heuristics           |
| GraalVM Community 25.1+     | Supported, no configuration                                            |
| Oracle JDK 25 or OpenJDK 25 | Polyglot isolate only — the guest runs as a native image in an isolate |
| JDK 21 runtimes             | Polyglot isolate only                                                  |

Polyglot 25.1's release notes withdraw the previous jargraal-on-OpenJDK route for that Truffle runtime:
the optimising runtime "is no longer supported with GraalVM 25.0 or earlier, or on plain
OpenJDK or Oracle JDK via jargraal". The 25.1 notes also move isolated `Engine`/`Context`
into CE. The notes explicitly direct users needing the older optimizing OpenJDK route to
Polyglot 25.0 LTS; distinguish component compatibility from the Java baseline. An application
may instead use an adequate fallback or supported isolate, so embedding alone does not require
changing the host distribution. Do not assume that toggling `UseJVMCICompiler` preserves guest-language performance:
Java host compilation and the Truffle compiler/runtime are separate evidence to collect.
Verify the supported embedding configuration and actual guest compilation; an isolate route
has a different runtime and cannot be treated as a pure host-JIT swap.

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
- [Polyglot host and guest runtime support](https://www.graalvm.org/latest/reference-manual/embed-languages/)
- [async-profiler supported platforms, v4.5 source](https://github.com/async-profiler/async-profiler/blob/v4.5/README.md#supported-platforms)
