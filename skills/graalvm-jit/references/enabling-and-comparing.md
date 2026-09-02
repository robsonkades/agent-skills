# Enabling Graal and comparing it fairly

Every flag and message below was verified on GraalVM CE 25.0.2 (`25.0.2+10-jvmci-b01`,
Windows x64) and Temurin 25.0.3 unless marked otherwise. Confirm option names against
`-XX:+JVMCIPrintProperties -Djdk.graal.PrintPropertiesAll=true` on the build in use before
they go into a script: an unknown Graal option is fatal at start-up.

## Where the compiler comes from

```bash
# A full GraalVM distribution — the only supported production route in 2026.
# libgraal is embedded and is the default.
sdk install java 25-graalce      # SDKMAN identifier; confirm with: sdk list java
export JAVA_HOME=$GRAALVM_HOME
java MyApp                       # Graal is already the tier-4 compiler; no flags
```

What a GraalVM 25 distribution actually contains: the compiler as the `jdk.graal.compiler`
module in the runtime image (5,038 classes on CE 25.0.2 — that is jargraal) and the same
compiler compiled ahead of time into `bin/jvmcicompiler.dll` on Windows
(`lib/libjvmcicompiler.so` on Linux, not verified here) — that is libgraal. There is no
`lib/jvmci/` directory and no `graal-compiler.jar` any more; material that injects one with
`--module-path` describes the pre-22.x layout.

What a stock OpenJDK contains, verified on Temurin 25.0.3:

```
$ java --list-modules | grep graal
jdk.graal.compiler@25.0.3
jdk.graal.compiler.management@25.0.3
$ jimage list $JAVA_HOME/lib/modules   # jdk.graal.compiler holds exactly one class:
    module-info.class
```

The module exists so that a GraalVM build can be produced from the same source tree
(JDK-8318027, Galahad preparation); it carries no compiler. Every JVMCI flag is present but
`{JVMCI experimental}`:

```
$ java -XX:+UseJVMCICompiler -version
Error: VM option 'UseJVMCICompiler' is experimental and must be enabled via -XX:+UnlockExperimentalVMOptions.

$ java -XX:+UnlockExperimentalVMOptions -XX:+EnableJVMCI -XX:+UseJVMCICompiler -version
openjdk version "25.0.3" 2026-04-21 LTS        # exit 0 — nothing was compiled yet

$ java -XX:+UnlockExperimentalVMOptions -XX:+EnableJVMCI -XX:+UseJVMCICompiler Hot
Cannot use JVMCI compiler: No JVMCI compiler found  # exit 1, at the first compile request

$ java -XX:+UnlockExperimentalVMOptions -XX:+UseGraalJIT Hot
Cannot use JVMCI compiler: JVMCI compiler 'graal' specified by jvmci.Compiler not found
```

`-version` is therefore not a smoke test. `-XX:+BootstrapJVMCI` forces the compiler to load
at start-up and fails there with the same message, which is the check to put in a launch
script. On GraalVM the same three flags print as `{JVMCI product}` (`EnableJVMCIProduct=true
{jimage}`), and `-XX:+UseGraalJIT` is accepted as a synonym for the default.

Bringing the Graal compiler onto a stock OpenJDK through `--upgrade-module-path` with the
`org.graalvm.compiler` Maven artifacts is the jargraal route that Truffle used to document;
GraalVM 25.1's release notes withdraw support for it ("no longer supported ... on plain
OpenJDK or Oracle JDK via jargraal"). It is not verified here and should not be a production
plan.

## Confirming the mode and who compiled tier 4

```bash
java -Djdk.graal.ShowConfiguration=info -cp app.jar Main
# libgraal:
#   Using "Graal Community compiler with Truffle extensions" loaded from a Native Image shared library (gc=Serial GC)
# jargraal (-XX:-UseJVMCINativeLibrary):
#   Using "Graal Community compiler with Truffle extensions" loaded from class files
# Oracle GraalVM prints its own compiler name; economy prints "Graal Economy compiler".
```

`(gc=Serial GC)` describes the libgraal isolate's own heap, not the application: the same
run has `UseG1GC=true {ergonomic}` in `-XX:+PrintFlagsFinal`. Do not file it as "Graal
switched my GC".

`-XX:+PrintFlagsFinal -version | grep UseJVMCINativeLibrary` gives the same answer as a
boolean (`true` libgraal, `false` jargraal) without running the application.

Which compiler produced a given nmethod is **not** in `-XX:+PrintCompilation`: under Graal the
lines are identical to C2's, tier column `4`, same `made not entrant: uncommon trap` reasons.
The two places that do name it:

```bash
# Graal's own log, one line per completed compilation (option verified on CE 25.0.2):
java -Djdk.graal.PrintCompilation=true Main
# HotSpotCompilation-146  Ljava/util/HashMap;  afterNodeInsertion  (Z)V | 231us  2B bytecodes  128B codesize ...

# JFR: the compiler field of jdk.Compilation. The default and profile settings carry a
# 1000 ms threshold that drops every ordinary compilation, so set it to zero.
java -XX:StartFlightRecording=filename=g.jfr,jdk.Compilation#threshold=0ms Main
jfr print --events jdk.Compilation g.jfr | grep -c 'compiler = "jvmci"'   # Graal tier 4
jfr print --events jdk.Compilation g.jfr | grep -c 'compiler = "c2"'      # C2 tier 4
```

On Temurin the tier-4 events say `compiler = "c2"`; on GraalVM CE they say `"jvmci"`; C1
says `"c1"` on both. This is the check that survives into production, because it needs no
flag at launch.

## Comparing with JMH: one binary, one variable

The GraalVM documentation's own recommendation for a comparison is `-XX:-UseJVMCICompiler`,
which hands tier 4 back to C2 inside the same GraalVM build. Verified on CE 25.0.2: with the
flag, `Hot::sum` reaches tier 4 with no Graal configuration line and the JFR compiler field
reads `c2`. That removes the JDK base, the class library and the GC build as variables.

```bash
# Graal side (default on GraalVM):
$GRAALVM_HOME/bin/java -XX:+UseG1GC -jar benchmarks.jar MyBench -f 3 -rf json -rff graal.json

# C2 side, same binary:
$GRAALVM_HOME/bin/java -XX:-UseJVMCICompiler -XX:+UseG1GC -jar benchmarks.jar MyBench -f 3 \
    -rf json -rff c2.json
```

A second run of the C2 side on the production OpenJDK build is still worth doing once,
because that is the binary the rollback lands on — but it answers "is this OpenJDK build
different from GraalVM's OpenJDK base", a separate question from "is Graal faster than C2".

Pin the GC explicitly on both runs even though both default to G1: an explicit flag is what
makes the compiler the only variable in the record.

## Warm-up: how much is enough

```java
@Warmup(iterations = 10, time = 2)   // a starting point for Graal;
                                     // C2 usually stabilises with fewer
```

The stabilisation criterion is the score, not the iteration count: it should not vary by more
than roughly 5% across the last warm-up iterations. `-v EXTRA` prints the per-iteration score
so you can confirm that visually instead of assuming a fixed number suffices.

If the run is in jargraal mode the picture is different in kind, not only in degree. Under
`-XX:-UseJVMCINativeLibrary` on CE 25.0.2, `-XX:+PrintCompilation` shows 1,903 compilations
of `jdk.graal.compiler.*` classes, 1,554 of them at tier **1** — `CompileGraalWithC1Only=true`
is the default, so the compiler is compiled by C1 without profiling and never reaches tier 4.
A program that runs in 25 ms under libgraal and 26 ms under C2 took 306–333 ms under jargraal
across three runs. That is the compiler's own C1-level speed on every compilation, for the
life of the process; more warm-up iterations do not amortise it. Confirm the mode before
treating "Graal needs N warm-up iterations" as a property of the compiler.

## Compiler configurations

`-Djdk.graal.CompilerConfiguration=<name>` selects the phase plan:

| Name         | Available on        | Intent                                                |
| ------------ | ------------------- | ----------------------------------------------------- |
| `community`  | CE, Oracle GraalVM  | The default on CE; PEA, graph inlining, speculation   |
| `economy`    | CE, Oracle GraalVM  | Fastest compilation, least optimisation; not for peak |
| `enterprise` | Oracle GraalVM only | The default there; adds the Oracle-only optimisations |

Asking CE 25.0.2 for `enterprise` produces, in order: `[warning][jit,compilation] JVMCI
compiler disabled after 11 of 11 upcalls had errors (Last error: ... Compiler configuration
'enterprise' not found. Available configurations are: community, economy)`, `COMPILE SKIPPED`
on every later tier-4 candidate, and then an `hs_err_pid` file with exit code 1. There is no
fallback to C2.

## Graal-side diagnostic and tuning options

Names and defaults from `-XX:+JVMCIPrintProperties -Djdk.graal.PrintPropertiesAll=true` on CE
25.0.2 (342 options; the default listing without `PrintPropertiesAll` shows a subset):

```bash
# Prefix. -Dgraal.X still works: on 25.0 it prints a three-line deprecation warning,
# GraalVM 25.1 dropped the warning (compiler CHANGELOG, GR-69280). Write jdk.graal. anyway.
-Djdk.graal.ShowConfiguration=info            # which compiler, which mode
-Djdk.graal.PrintCompilation=true             # one line per Graal compilation
-Djdk.graal.TraceInlining=true                # per-call-site verdicts with relevance/probability
-Djdk.graal.MethodFilter=Hot.sum              # <class>.<method>, dot not ::; narrows any of the above
-Djdk.graal.Dump=:2 -Djdk.graal.DumpPath=dir  # IGV graphs; default dir graal_dumps/, very verbose
-Djdk.graal.CompilationFailureAction=Diagnose # Silent|Print|Diagnose|ExitVM — retries with dumps
-Djdk.graal.PrintIntrinsics=true              # which intrinsics this runtime actually uses
-Djdk.graal.LogFile=graal.log                 # redirect all of the above from stdout
```

```bash
# Escape analysis and inlining knobs (defaults shown; change only with a measurement):
-Djdk.graal.PartialEscapeAnalysis=true
-Djdk.graal.MaximumEscapeAnalysisArrayLength=128   # arrays longer than this are never virtualised
-Djdk.graal.EscapeAnalysisIterations=2
-Djdk.graal.TrivialInliningSize=10                 # graph nodes: always inlined below this
-Djdk.graal.MaximumInliningSize=300                # graph nodes: inlining explored up to this
-Djdk.graal.SmallCompiledLowLevelGraphSize=330     # callee's previous low-level graph above this: not inlined
-Djdk.graal.InlineDuringParsing=true               # bytecode parser inlines trivial callees itself
-Djdk.graal.UsePriorityInlining=false              # 25.3+ only: restore the pre-25.3 inliner
-Djdk.graal.VectorizeLoops=false                   # 25.3+ only: disable CE loop vectorisation
-Djdk.graal.OptimizeVectorAPI=false                # 25.0+: disable the Vector API lowering
```

Sizes are graph nodes, not bytecode bytes: a Graal inlining verdict such as
`yes, trivial (relevance=0.019986, probability=0.019588, bonus=1.000000, nodes=9)` is
comparing `nodes=9` against `TrivialInliningSize`, and no C2 limit (`MaxInlineSize=35`,
`FreqInlineSize=325`) maps onto it.

Options that do **not** exist and will refuse to start the JVM: `CompilerThreads` (use
`-XX:CICompilerCount` and `-XX:JVMCINativeLibraryThreadFraction`), anything named
`Vectorization`, `OptDuplication` or `TuneInlinerExploration` on CE 25.0.2 (Oracle GraalVM
only per the GraalVM options reference; GraalVM 25.4's changelog moves duplication into the
community configuration — not verified as released here).

## Ideal Graph Visualizer

IGV visualises Graal's graph across the high, mid and low tiers of the phase plan.
Documentation and usage live at `graalvm.org/latest/tools/igv/`; the source is in
`github.com/oracle/graal`. Dumps come from `-Djdk.graal.Dump` above; narrow them with
`MethodFilter` or the output is unmanageable. Tool paths move between releases, so check the
documentation for the GraalVM in use.
