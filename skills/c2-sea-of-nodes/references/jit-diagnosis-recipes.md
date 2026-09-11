# JIT diagnosis recipes

Run these against the runtime in question. Every default cited elsewhere is a starting point,
not a substitute for `-XX:+PrintFlagsFinal` on the exact build.

Commands below are Bash templates: replace `MyApp`/`MyClass`, classpath and log paths
with the existing application's launch configuration. In PowerShell use `Select-String`
instead of `grep` and native continuation syntax. Check `java -Xlog:help` before using
release-sensitive logging tags; a missing tag or flag is a tooling limitation, not evidence
that no compilation or deoptimization happened. Retain the complete log before filtering:
fixed context windows can truncate nested inlining trees and mix compilation identities.
Reuse a sufficient existing capture. For a new one, use a bounded representative run and a
fresh writable artifact directory; verify process exit and capture completeness before
interpreting an empty result. Diagnose the measured hot path, not every non-inlined method.

## Flag classes: which flags a product JVM will even accept

| Class          | Needs                                                | Examples verified on Temurin 25.0.3                                                                     |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `product`      | nothing                                              | `PrintCompilation`, `PrintCodeCache`, `Tier*Threshold`, `DoEscapeAnalysis`, `EliminateAllocations`      |
| `diagnostic`   | `-XX:+UnlockDiagnosticVMOptions` **before** the flag | `PrintInlining`, `LogCompilation`, `TraceDeoptimization`, `CompilerDirectivesFile`, `PrintOptoAssembly` |
| `experimental` | `-XX:+UnlockExperimentalVMOptions` before the flag   | `EnableJVMCI`, `UseJVMCICompiler`, `UseGraalJIT`, `CodeCacheSegmentSize`                                |
| `develop`      | a **debug build** — a product JVM refuses to start   | `PrintEscapeAnalysis`, `PrintEliminateAllocations`, `PrintIdeal`, `PrintFieldLayout`                    |

The class is printed in braces by `-XX:+PrintFlagsFinal` (`{C2 diagnostic}`, `{JVMCI
experimental}`); include the appropriate unlock when listing locked options. Absence from a
plain flag listing does not distinguish a misspelling, a locked option or a debug-only flag:
check the explicit option error and the target source. `CodeCacheSegmentSize` is
`pd experimental` (128 bytes on the measured build), not `develop`.
The unlock must precede the flag on the command line —
`Error: The unlock option must precede 'PrintInlining'` otherwise. `CompileCommand` options
inherit the class of the flag they scope: `-XX:CompileCommand=PrintInlining,...` needs the
diagnostic unlock too, and a `develop` name is `Unrecognized option` — the JVM does not start.

## Decision path for "this method is not optimised"

```
Method suspected of being under-optimised
|
+-- 1. Does PrintCompilation show tier 4?
|      tier 1/2/3 -> inspect complete history, current nmethod, queues, policy and counters
|      yes        -> go to step 2
|
+-- 2. Does the hot path call other methods?
|      PrintInlining on the TIER-4 tree shows "too big" / "hot method too big" /
|      "already compiled into a big method" / "virtual call" / "inlining too deep"?
|      yes -> the string names the limit (c2-phases-and-ir.md); check size, hotness, depth
|      (a tier-3 tree saying "callee is too large" is C1's verdict, not C2's)
|
+-- 3. Is there an allocation that "should" have disappeared?
|      product C2: correlate LogCompilation elimination entries with the installed nmethod
|                  and compare normalized allocation/profile deltas; absence is inconclusive
|      debug build only: inspect escape state AND scalar replaceability/elimination result
|                        NoEscape alone does not prove allocation removal
|
+-- 4. Unstable compilation (recurring "made not entrant: uncommon trap")?
       -Xlog:deoptimization=debug / JFR jdk.Deoptimization -- a deoptimisation problem,
       not a threshold problem. "not used" can accompany replacement, including 3 -> 4;
       correlate the history instead of inferring that transition from the reason alone.
```

## Which tier is each method in

```bash
java -XX:+PrintCompilation MyApp > compilation.log 2>&1
grep MyClass compilation.log  # navigation only; retain and inspect the full log
```

Real output, Temurin 25.0.3:

```
    39   17       3       JitLab::medium (85 bytes)
    40   22       4       JitLab::medium (85 bytes)
    40   17       3       JitLab::medium (85 bytes)   made not entrant: not used
    46   28 %     4       JitLab::main @ 123 (256 bytes)
  4020   28 %     4       JitLab::main @ 123 (256 bytes)   made not entrant: uncommon trap
```

The tier column is necessary but one line is insufficient: correlate compilation ID, OSR,
timestamp and later non-entrant/deoptimization lines to determine the current history. The
same lines are available through unified logging as
`-Xlog:jit+compilation=info`, with time decorations and a file sink; the format is
`compilation-and-inlining-logs`' subject.

## Inlining decisions per call site

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation -XX:+PrintInlining \
     MyApp > inlining.log 2>&1
grep -n hotMethod inlining.log  # locate the compilation, then read its complete tree
```

Real output for the same caller, first the tier-3 tree and then the tier-4 tree:

```
    45   27       3       JitLab::main (256 bytes)
                            @ 135   JitLab::small (4 bytes)     inline
                            @ 140   JitLab::medium (85 bytes)   failed to inline: callee is too large
                            @ 146   JitLab::big (879 bytes)     failed to inline: callee is too large
    46   28 %     4       JitLab::main @ 123 (256 bytes)
                            @ 135   JitLab::small (4 bytes)     inline (hot)
                            @ 140   JitLab::medium (85 bytes)   inline (hot)
                            @ 146   JitLab::big (879 bytes)     failed to inline: hot method too big
                            @ 197   JitLab::sumAreas (42 bytes) inline (hot)
                              @ 27    JitLab$Shape::area (0 bytes)   failed to inline: virtual call
```

`medium` (85 bytes) is refused by C1 and inlined by C2 at a hot site; `big` (879 bytes) is
over `FreqInlineSize` and C2 says so by name. Without `-XX:+UnlockDiagnosticVMOptions` the
same trees come from `-Xlog:jit+inlining=debug`.

## Escape analysis and scalar replacement

Two flags, two different questions. `-XX:+PrintEscapeAnalysis` reports the escape state C2
assigned each allocation; `-XX:+PrintEliminateAllocations` reports specifically whether the
allocation was removed by scalar replacement — the question that matters when a `new` that
looked eligible is still there.

**Both are `develop` flags: they exist only in a debug build.** On any shipping JDK the JVM
refuses to start rather than ignoring them, so this is not a command to reach for on a
production runtime or a stock local JDK:

```
$ java -XX:+UnlockDiagnosticVMOptions -XX:+PrintEscapeAnalysis -version
Error: VM option 'PrintEscapeAnalysis' is develop and is available only in debug version of VM.
Improperly specified VM option 'PrintEscapeAnalysis'
Error: Could not create the Java Virtual Machine.
```

With a debug build (`--with-debug-level=fastdebug`, or a `-fastdebug` distribution) the pair
is driven like this:

```bash
java -XX:+UnlockDiagnosticVMOptions \
     -XX:+PrintEscapeAnalysis \
     -XX:+PrintEliminateAllocations \
     -XX:CompileCommand=compileonly,MyClass::accumulate \
     MyClass
```

The exact text these flags print for "not eliminated" is internal compiler diagnostics and
varies in format between builds. Read the output of your own runtime and cross-check it against
the method source — is there a reference that escapes, or not? Never build a log parser around
a fixed string here.

**On a product C2 JVM, start with available compiler evidence.** With `LogCompilation`, a
successful `eliminate_allocation` entry records the allocation type and method/BCI contexts.
Match it to the installed C2 compilation ID; it is evidence for that compilation, not all
executions of the source allocation. A missing entry does not prove survival. The
`escape-analysis-internals` skill owns this correlation and its limitations.

Compare allocated bytes/op (for example
JMH GC profiler or controlled runtime counters), async-profiler allocation samples and JFR
allocation events with compilation state fixed. Sampling absence is not proof; event settings,
TLAB/outside-TLAB coverage and workload equality matter. Where warranted, confirm no allocation
sequence in assembly/ideal-graph tooling. The
per-method form of the escape-analysis output, and the `CompileCommand` syntax that scopes it,
are in `escape-analysis-internals`.

## Offline deep dive

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation \
     -XX:LogFile=/tmp/hotspot.log MyApp
```

The resulting text-plus-XML log is consumed by **JITWatch**, which reconstructs the compilation
timeline and the inlining tree with reasons, and — combined with `hsdis` — shows bytecode and
assembly side by side. Logging and decoding can add CPU, storage and I/O costs; use a bounded
capture and assess its effect on the workload before considering continuous production use.

## Confirming defaults before reasoning about them

```bash
java -XX:+PrintFlagsFinal -version | grep -E "EscapeAnalysis|ScalarReplace|UseCountedLoopSafepoints|Tier[0-9]"
```

## Isolating one factor at a time

Before attributing a cost to inlining, escape analysis or C2 as a whole, turn off exactly one
thing:

```bash
java -XX:-Inline MyBench              # no inlining anywhere in the process
java -XX:-DoEscapeAnalysis MyBench    # EA off; dependent optimizations can also change
java -XX:-EliminateAllocations MyBench # EA on, scalar replacement off
java -XX:TieredStopAtLevel=1 MyBench  # C1-only control; a difference does not prove a C2 bug
```

`-XX:-Inline` is process-wide and blunt. JMH `@CompilerControl(DONT_INLINE)` or
`CompileCommand=dontinline,Class::method` scopes a **callee method**, still affecting all
relevant call sites/compilations rather than one source call site. Use compiler directives and
separate benchmark shapes when true call-site isolation matters.

## Threshold tuning under tiered compilation

In the default C1/C2 tiered mode on Temurin 25.0.3, `-XX:CompileThreshold` does not change
compilation eligibility. The boolean `TieredCompilation` alone is insufficient: on the same
build, C1-only modes such as `TieredStopAtLevel=1` apply legacy thresholds even with it true;
`-XX:-TieredCompilation` also honors them. Compare effective flags and modes before diagnosing
a no-op. See the pinned [legacy-policy initialization](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compilerDefinitions.cpp)
and [compiler-mode predicates](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/compiler/compilerDefinitions.inline.hpp).

| Flag                                                  | Controls                                | When to adjust                                                                                                   |
| ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `-XX:Tier3InvocationThreshold`                        | One eligibility input for tier 3 policy | Diagnostic experiment after observing history/queue; not a standalone “compile after N” control                  |
| `-XX:Tier4InvocationThreshold`                        | One eligibility input for tier 4 policy | Diagnostic experiment; earlier compilation can use immature profiles and increase CPU/code cache                 |
| `-XX:CompileThresholdScaling`                         | Scales tier-policy thresholds           | Broad experiment whose queue, profile-quality, startup CPU and code-cache effects must be measured               |
| `-XX:CompileCommand=CompileThresholdScaling,C::m,0.1` | The same factor for **one method**      | Scoped eligibility experiment; shared compiler queues, CPU and later compilation decisions can still be affected |

```bash
java -XX:CompileThresholdScaling=0.5 MyApp
# then re-check with PrintCompilation that the target methods reach tier 4 earlier
```

If tier 2 correlates with queue congestion, inspect `Compiler.queue`, compiler CPU, container
quota and code-cache pressure. Changing `CICompilerCount` or thresholds can shift startup CPU,
queueing and application contention; prefer fixing the deployment/warm-up cause and validate a
scoped experiment rather than declaring one universal lever.

## Not measuring an empty loop

C2 may remove a loop or computation whose result is unused and whose removal preserves
observable behavior, or replace a computation by a constant. Consume the result, but also
use runtime inputs so consumption does not merely preserve a precomputed constant.
This is a partial method for an existing JMH benchmark class with a nonconstant `array`
state field and JMH imports/dependencies; it is not a standalone Java program:

```java
@Benchmark
public long sumArray() {
    long sum = 0;
    for (int i = 0; i < array.length; i++) sum += array[i];
    return sum;  // JMH consumes a returned result
}
```

This applies with double force to benchmarks in this area. A `dotProduct` or an
escape-analysis benchmark that neither returns nor consumes its result is at real risk of
having its whole body removed, after which the "measurement" compares noise.
