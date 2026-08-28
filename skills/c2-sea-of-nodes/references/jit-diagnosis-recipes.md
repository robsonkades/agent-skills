# JIT diagnosis recipes

Run these against the runtime in question. Every default cited elsewhere is a starting point,
not a substitute for `-XX:+PrintFlagsFinal` on the exact build.

## Decision path for "this method is not optimised"

```
Method suspected of being under-optimised
|
+-- 1. Does PrintCompilation show tier 4?
|      no, tier 1 -> correct if the method is trivial; terminal, not a bug
|      no, tier 3 -> has not reached Tier4InvocationThreshold/Tier4CompileThreshold
|      yes        -> go to step 2
|
+-- 2. Does the hot path call other methods?
|      PrintInlining shows "too large"/"not inlined" at the relevant call site?
|      yes -> check which size limit actually applied, and the inline depth
|
+-- 3. Is there an allocation that "should" have disappeared?
|      product JVM: does it still appear in an allocation profile? -> it was not eliminated
|      debug build only: PrintEscapeAnalysis state other than NoEscape -> that is the answer
|                        PrintEliminateAllocations says not eliminated -> confirm the cause
|
+-- 4. Unstable compilation (recurring "made not entrant")?
       TraceDeoptimization / JFR jdk.Deoptimization -- a deoptimisation problem,
       not a threshold problem
```

## Which tier is each method in

```bash
java -XX:+PrintCompilation MyApp 2>&1 | grep MyClass
```

```
   234   45 % 4     MyClass::hotMethod @ 12 (87 bytes)
   235   46       3   MyClass::coldPath (140 bytes)
   240   47       4   MyClass::coldPath (140 bytes)
   241   46           MyClass::coldPath (140 bytes)   made not entrant
```

The tier column (`3`, `4` above) is the whole point. Without it there is no way to tell a
method stuck in tier 3 — still collecting profile, never seen by C2 — from one already
optimised at tier 4.

## Inlining decisions per call site

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilation -XX:+PrintInlining \
     -XX:CompileCommand=print,MyClass::hotMethod MyApp 2>&1 | grep -A 10 hotMethod
```

```
   234   45 % 4     MyClass::hotMethod @ 12 (87 bytes)
                     @ 8   Math::sqrt (6 bytes)          inline (hot)
                     @ 35  ArrayList::get (5 bytes)      inline (hot)
                     @ 52  Helper::compute (42 bytes)    too large
```

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
overhead, useless for isolating one call site. Use JMH's `@CompilerControl` for that.

## Threshold tuning under tiered compilation

`-XX:CompileThreshold` is accepted **without error and without effect** while tiered
compilation is on, which is the default on every supported release including JDK 25. It is
honoured only under `-XX:-TieredCompilation`. A runbook that "raises CompileThreshold to speed
up warm-up" is silently doing nothing, and the false sense of having acted is the worst part —
nobody investigates a problem that looks solved.

| Flag                           | Controls                                                   | When to adjust                                                                                      |
| ------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `-XX:Tier3InvocationThreshold` | Invocations to enter tier 3                                | Lower it to collect profile faster in short-lived services (serverless functions, short load tests) |
| `-XX:Tier4InvocationThreshold` | Invocations to promote to tier 4 (C2)                      | Lower it to reach peak optimisation earlier, at the cost of more compilation CPU up front           |
| `-XX:CompileThresholdScaling`  | Multiplicative factor over **all** tier thresholds at once | Safer than moving one tier in isolation — `0.5` halves every threshold, `2.0` doubles them          |

```bash
java -XX:Tier4InvocationThreshold=2000 -XX:CompileThresholdScaling=0.5 MyApp
# then re-check with PrintCompilation that the target methods reach tier 4 earlier
```

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
