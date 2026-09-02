# JIT diagnosis recipes

Run these against the runtime in question. Every default cited elsewhere is a starting point,
not a substitute for `-XX:+PrintFlagsFinal` on the exact build.

## Flag classes: which flags a product JVM will even accept

| Class          | Needs                                                | Examples verified on Temurin 25.0.3                                                                          |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `product`      | nothing                                              | `PrintCompilation`, `PrintCodeCache`, `Tier*Threshold`, `DoEscapeAnalysis`, `EliminateAllocations`           |
| `diagnostic`   | `-XX:+UnlockDiagnosticVMOptions` **before** the flag | `PrintInlining`, `LogCompilation`, `TraceDeoptimization`, `CompilerDirectivesFile`, `PrintOptoAssembly`      |
| `experimental` | `-XX:+UnlockExperimentalVMOptions` before the flag   | `EnableJVMCI`, `UseJVMCICompiler`, `UseGraalJIT`                                                             |
| `develop`      | a **debug build** — a product JVM refuses to start   | `PrintEscapeAnalysis`, `PrintEliminateAllocations`, `PrintIdeal`, `PrintFieldLayout`, `CodeCacheSegmentSize` |

The class is printed in braces by `-XX:+PrintFlagsFinal` (`{C2 diagnostic}`, `{JVMCI
experimental}`); a `develop` flag does not appear there at all on a product build, which is how
to tell "misspelled" from "debug-only". The unlock must precede the flag on the command line —
`Error: The unlock option must precede 'PrintInlining'` otherwise. `CompileCommand` options
inherit the class of the flag they scope: `-XX:CompileCommand=PrintInlining,...` needs the
diagnostic unlock too, and a `develop` name is `Unrecognized option` — the JVM does not start.

## Decision path for "this method is not optimised"

```
Method suspected of being under-optimised
|
+-- 1. Does PrintCompilation show tier 4?
|      no, tier 1 -> correct if the method is trivial; terminal, not a bug
|      no, tier 2 -> C2 queue congested (Tier3DelayOn); check Compiler.queue, not counters
|      no, tier 3 -> has not reached Tier4InvocationThreshold/Tier4CompileThreshold
|      yes        -> go to step 2
|
+-- 2. Does the hot path call other methods?
|      PrintInlining on the TIER-4 tree shows "too big" / "hot method too big" /
|      "already compiled into a big method" / "virtual call" / "inlining too deep"?
|      yes -> the string names the limit (c2-phases-and-ir.md); check size, hotness, depth
|      (a tier-3 tree saying "callee is too large" is C1's verdict, not C2's)
|
+-- 3. Is there an allocation that "should" have disappeared?
|      product JVM: does it still appear in an allocation profile? -> it was not eliminated
|      debug build only: PrintEscapeAnalysis state other than NoEscape -> that is the answer
|                        PrintEliminateAllocations says not eliminated -> confirm the cause
|
+-- 4. Unstable compilation (recurring "made not entrant: uncommon trap")?
       -Xlog:deoptimization=debug / JFR jdk.Deoptimization -- a deoptimisation problem,
       not a threshold problem. "made not entrant: not used" is the normal 3 -> 4 promotion.
```

## Which tier is each method in

```bash
java -XX:+PrintCompilation MyApp 2>&1 | grep MyClass
```

Real output, Temurin 25.0.3:

```
    39   17       3       JitLab::medium (85 bytes)
    40   22       4       JitLab::medium (85 bytes)
    40   17       3       JitLab::medium (85 bytes)   made not entrant: not used
    46   28 %     4       JitLab::main @ 123 (256 bytes)
  4020   28 %     4       JitLab::main @ 123 (256 bytes)   made not entrant: uncommon trap
```

The tier column (`3`, `4` above) is the whole point. Without it there is no way to tell a
method stuck in tier 3 — still collecting profile, never seen by C2 — from one already
optimised at tier 4. The same lines are available through unified logging as
`-Xlog:jit+compilation=info`, with time decorations and a file sink; the format is
`compilation-and-inlining-logs`' subject.

## Inlining decisions per call site

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation -XX:+PrintInlining \
     -XX:CompileCommand=print,MyClass::hotMethod MyApp 2>&1 | grep -A 10 hotMethod
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

**On a product JVM — which is the normal case — use the indirect check**, which is in any case
usually the more reliable one: an eliminated allocation does not appear in allocation profiling
at all. Compare async-profiler `-e alloc`, or the JFR `jdk.ObjectAllocationInNewTLAB` /
`jdk.ObjectAllocationOutsideTLAB` events, with and without the code under suspicion. The
per-method form of the escape-analysis output, and the `CompileCommand` syntax that scopes it,
are in `escape-analysis-internals`.

## Offline deep dive

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation \
     -XX:LogFile=/tmp/hotspot.log MyApp
```

The resulting text-plus-XML log is consumed by **JITWatch**, which reconstructs the compilation
timeline and the inlining tree with reasons, and — combined with `hsdis` — shows bytecode and
assembly side by side. Overhead is noticeably higher than `PrintCompilation` and
`PrintInlining` alone; do not run it continuously in production.

## Confirming defaults before reasoning about them

```bash
java -XX:+PrintFlagsFinal -version | grep -E "EscapeAnalysis|ScalarReplace|UseCountedLoopSafepoints|Tier[0-9]"
```

## Isolating one factor at a time

Before attributing a cost to inlining, escape analysis or C2 as a whole, turn off exactly one
thing:

```bash
java -XX:-Inline MyBench              # no inlining anywhere in the process
java -XX:-DoEscapeAnalysis MyBench    # EA off, rest of C2 intact
java -XX:-EliminateAllocations MyBench # EA on, scalar replacement off
java -XX:TieredStopAtLevel=1 MyBench  # C1 only — is the bug C2's, or logic?
```

`-XX:-Inline` is process-wide and blunt: fine for an order-of-magnitude check on call
overhead, useless for isolating one call site. Use JMH's `@CompilerControl`, or
`-XX:CompileCommand=dontinline,Class::method` for that.

## Threshold tuning under tiered compilation

`-XX:CompileThreshold` is accepted **without error and without effect** while tiered
compilation is on, which is the default on every supported release including JDK 25. It is
honoured only under `-XX:-TieredCompilation`. A runbook that "raises CompileThreshold to speed
up warm-up" is silently doing nothing, and the false sense of having acted is the worst part —
nobody investigates a problem that looks solved.

| Flag                                                  | Controls                                                   | When to adjust                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `-XX:Tier3InvocationThreshold`                        | Invocations to enter tier 3                                | Lower it to collect profile faster in short-lived services (serverless functions, short load tests) |
| `-XX:Tier4InvocationThreshold`                        | Invocations to promote to tier 4 (C2)                      | Lower it to reach peak optimisation earlier, at the cost of more compilation CPU up front           |
| `-XX:CompileThresholdScaling`                         | Multiplicative factor over **all** tier thresholds at once | Safer than moving one tier in isolation — `0.5` halves every threshold, `2.0` doubles them          |
| `-XX:CompileCommand=CompileThresholdScaling,C::m,0.1` | The same factor for **one method**                         | When only a handful of methods must reach tier 4 early; leaves the rest of the process untouched    |

```bash
java -XX:Tier4InvocationThreshold=2000 -XX:CompileThresholdScaling=0.5 MyApp
# then re-check with PrintCompilation that the target methods reach tier 4 earlier
```

If the log shows tier 2, no threshold change helps: the C2 queue is congested and the policy is
backing off (`c2-phases-and-ir.md`). More compiler threads (`CICompilerCount`) or fewer methods
compiled is the lever, and `jcmd <pid> Compiler.queue` is the measurement.

## Not measuring an empty loop

C2 will remove a loop or a computation entirely when the result is unused (dead code
elimination), when every value is known at compile time (constant folding), or when the loop
has no observable side effect. Consume the result:

```java
@Benchmark
public long sumArray(Blackhole bh) {
    long sum = 0;
    for (int i = 0; i < array.length; i++) sum += array[i];
    bh.consume(sum);
    return sum;  // belt and braces
}
```

This applies with double force to benchmarks in this area. A `dotProduct` or an
escape-analysis benchmark that neither returns nor consumes its result is at real risk of
having its whole body removed, after which the "measurement" compares noise.
