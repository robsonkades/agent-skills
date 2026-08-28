# Enabling Graal and comparing it fairly

## Two ways to activate, and why they are not equivalent

```bash
# Method 1 — a full GraalVM distribution (recommended for production).
# libgraal is embedded and is the default.
sdk install java 25-graalce   # confirm the exact version with: sdk list java
export JAVA_HOME=$GRAALVM_HOME
java MyApp

# Method 2 — inject the Graal compiler as a standalone module on a stock OpenJDK:
java -XX:+UnlockExperimentalVMOptions \
     -XX:+EnableJVMCI \
     -XX:+UseJVMCICompiler \
     --module-path graal-compiler.jar \
     MyApp
```

Method 2 injects Graal as a module jar compiled to ordinary Java bytecode — **not** the
libgraal native library a full GraalVM distribution embeds. The usual result is **jargraal**
mode, carrying the double warm-up: the compiler heating up on top of the target code heating
up. `-XX:+UseJVMCICompiler` alone gives no warning about this. If the goal is Graal's
steady-state performance rather than jargraal's specifically, confirm the mode first.

## Confirming the mode

```bash
java -XX:+PrintFlagsFinal -version 2>&1 | grep UseJVMCINativeLibrary
# true  -> libgraal (native compiler, no warm-up of its own)
# false -> jargraal (compiler as bytecode, with its own warm-up cycle)

# Confirm JVMCI is really the compiler in use:
java -XX:+PrintCompilation -jar app.jar 2>&1 | grep -iE "JVMCI|Graal" | head
```

libgraal is itself ahead-of-time compiled, using GraalVM native image technology, into a
shared library the JVM loads at start-up. That is exactly why it pays no warm-up: by the time
your application starts heating up, the compiler that will compile it is already native code
rather than bytecode still climbing tiers 0 to 4.

## Comparing with JMH

```bash
# C2 side:
java -jar benchmarks.jar MyBench -f 3 -rff c2-results.json -rf json

# Graal side:
$GRAALVM_HOME/bin/java -jar benchmarks.jar MyBench -f 3 \
    -rff graal-results.json -rf json
```

Pin the same GC on both sides so the compiler is the only variable:

```bash
java -XX:+UseG1GC MyBench                      # C2 with G1
$GRAALVM_HOME/bin/java -XX:+UseG1GC MyBench    # Graal with G1
```

Both distributions default to G1, but comparing each side under "whatever its default is"
mixes two variables and invalidates attributing any difference to the compiler.

## Warm-up: how much is enough

```java
@Warmup(iterations = 10, time = 2)   // a starting point for Graal;
                                     // C2 usually stabilises with fewer
```

The stabilisation criterion is the score, not the iteration count: it should not vary by more
than roughly 5% across the last warm-up iterations. `-v EXTRA` prints the per-iteration score
so you can confirm that visually instead of assuming a fixed number suffices.

If the run is in jargraal mode, the warm-up required is larger still, and part of that time is
the **Graal compiler** reaching native code — not (only) deeper analysis of the target code.
Confirm the mode before treating "Graal needs N warm-up iterations" as a fixed property of the
compiler.

## Graal-side diagnostic and tuning flags

```bash
java -Dgraal.PrintCompilation=true -Dgraal.Dump=:2 MyApp
```

```bash
# Escape analysis aggressiveness:
-Dgraal.MaximumEscapeAnalysisArrayLength=128   # EA for arrays up to 128 elements
-Dgraal.PartialEscapeAnalysis=true             # default: true

# Cap compiler CPU usage:
-Dgraal.CompilerThreads=4

# IR dump for surgical analysis (needs IGV; very verbose):
-Dgraal.Dump=:2 -Dgraal.MethodFilter=MyClass::myMethod
```

The exact names and the `-Dgraal.*` prefix are not guaranteed stable across GraalVM
distributions and versions. Confirm them against the documentation for the version in use
before depending on them in a diagnostic script.

## Ideal Graph Visualizer

IGV visualises Graal's IR (HIR and MIR graphs across the optimisation phases). Documentation
and usage live at `graalvm.org/latest/tools/igv/`; the source is in `github.com/oracle/graal`.
The old download URL under `labs.oracle.com/technology/igv` is no longer the current reference
point — the documentation and the build moved to the main project repository. Tool paths move
between releases, so check the documentation for the GraalVM in use.
