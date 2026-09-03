# Verifying escape analysis

Every number below was measured on Temurin 25.0.3 with the method described in the third
section: 2 000 000 iterations after fifteen warm-up runs, result consumed, opaque callees
pinned with `-XX:CompileCommand=dontinline`. They are one build's answers to one program.
Reproduce them on yours before they become a decision.

## Confirm the optimisations are on

```bash
java -XX:+PrintFlagsFinal -version \
  | grep -E 'DoEscapeAnalysis|EliminateAllocations|EliminateLocks'
```

For the ordinary C2 scalar-replacement experiment, confirm these optimisations are enabled
and record command-line origins. An inherited disable or `dontinline` directive changes the
question being measured. Flag names/classes are implementation details; first check that the
exact JDK recognizes them.

| Flag                                    | Default | Class      | Controls                                                          |
| --------------------------------------- | ------- | ---------- | ----------------------------------------------------------------- |
| `-XX:+DoEscapeAnalysis`                 | `true`  | product    | Whether the connection graph is built at all                      |
| `-XX:+EliminateAllocations`             | `true`  | product    | Scalar replacement of `NoEscape` objects                          |
| `-XX:+EliminateLocks`                   | `true`  | product    | Lock elision on `NoEscape` and `ArgEscape` objects                |
| `-XX:+EliminateAutoBox`                 | `true`  | product    | Box–unbox elimination for `Integer` and friends                   |
| `-XX:+ReduceAllocationMerges`           | `true`  | diagnostic | Scalar replacement across a `Phi` of allocations (JDK 22+)        |
| `-XX:EliminateAllocationArraySizeLimit` | 64      | product    | Largest constant-length array eligible for scalar replacement     |
| `-XX:EscapeAnalysisTimeout`             | 20 s    | product    | Analysis abandoned for a compilation unit that takes longer       |
| `-XX:+PrintEscapeAnalysis`              | —       | develop    | Debug builds only; absent from `PrintFlagsFinal` on a product JVM |

## The measurement that answers the question

```bash
java -jar target/benchmarks.jar -prof gc MyBenchmark
```

`gc.alloc.rate.norm` estimates normalized bytes allocated per benchmark operation. It is
often more stable than nanosecond timing for an elimination question, but harness activity,
compilation path, object layout and profiler support still matter. Treat the following as
hypothesis patterns, not a decoder:

| Expected | Observed                 | Reading                                                          |
| -------- | ------------------------ | ---------------------------------------------------------------- |
| 0 B/op   | repeatable 0 B/op        | candidate allocation was likely eliminated; corroborate          |
| 0 B/op   | near aligned object size | one object-shaped allocation likely survives; profile type/stack |
| 0 B/op   | a repeatable multiple    | several allocations or iterations/path effects; attribute them   |

The listed JDK 25 default-layout examples used compressed class pointers, 8-byte alignment
and non-compact headers. Compact headers, pointer modes, alignment, subclass fields and array
layout change the sizes. Use JOL/`object-layout-and-footprint` on the same VM, then treat a
size match as a lead rather than proof of identity.

To quantify what the analysis is actually delivering, run the same benchmark with
`-XX:-DoEscapeAnalysis` and compare. "The JIT resolves it" is exactly as unverified as
"allocation is expensive" until this comparison exists. `-XX:-EliminateAllocations` keeps
the analysis but stops scalar replacement, which separates the allocation gain from the
lock-elision gain; `-XX:-EliminateLocks` does the reverse.

## Outside JMH

A controlled approximation in another harness, including a production-shaped integration
test, can use allocated-thread bytes when the implementation supports and enables it:

```java
var tmx = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
if (!tmx.isThreadAllocatedMemorySupported()) throw new UnsupportedOperationException();
if (!tmx.isThreadAllocatedMemoryEnabled()) tmx.setThreadAllocatedMemoryEnabled(true);
for (int w = 0; w < 15; w++) sink += run(n);          // warm into C2 first
long before = tmx.getCurrentThreadAllocatedBytes();
sink += run(n);                              // consume the result, or C2 removes the work
System.out.println((tmx.getCurrentThreadAllocatedBytes() - before) / (double) n + " B/op");
```

Also measure/subtract an empty harness path, isolate work performed on other threads, and
record compilation/deoptimization events. Warm-up must cover representative receiver/path
mix; “fifteen” is an example, not a convergence criterion.

## Measured outcomes on JDK 25

| Pattern                                                         | EA on                               | EA off    |
| --------------------------------------------------------------- | ----------------------------------- | --------- |
| `new Point(i, j)` consumed in the same compilation unit         | 0                                   | 24        |
| Same, with `if (rare) field = p` where the branch **never ran** | 0                                   | 24        |
| Same, with the branch taken once per 262 144 iterations         | **24**                              | 24        |
| Same, object constructed inside the rare branch                 | 0                                   | 0         |
| Same, fields passed to a method that constructs it on that path | 0                                   | 24        |
| `Point` passed to a `dontinline` callee that only reads a field | **24**                              | 24        |
| `cond ? new Point(a) : new Point(b)` merge                      | 0 (24 if `-ReduceAllocationMerges`) | 24        |
| `Optional.of(i).map(v -> v + 1).orElse(0)` fully inlined        | 0                                   | 64        |
| `Optional` returned from a `dontinline` method, then `orElse`   | **28**                              | 28        |
| `Optional.ofNullable(s).map(String::length).orElse(0)` inlined  | 0                                   | 28        |
| Lambda capturing an `int`, consumed by an inlined call          | 0                                   | 32        |
| Lambda capturing a `Point`, consumed by an inlined call         | 0                                   | 56        |
| Same lambda passed to a `dontinline` callee                     | **40**                              | 56        |
| `IntStream.range(0, 4).sum()`                                   | **56**                              | 128       |
| `IntStream.range(0, 100).map(v -> v * 2).sum()`, per element    | **2.0**                             | 2.2       |
| `Integer b = i` for `i > 127`, unboxed in the same unit         | 0                                   | 16        |
| `record R(int a, int b)` constructed and read locally           | 0                                   | 24        |
| `for (Integer v : List.of(1, 2, 3, 4))` iterator                | 0                                   | 32        |
| `"k" + i`                                                       | **24**                              | 48        |
| `new int[8]` written at a constant index                        | 0                                   | —         |
| `new int[8]` written at `a[i & 7]`                              | **48**                              | 48        |
| `new int[65]` (over `EliminateAllocationArraySizeLimit`)        | **280**                             | 280       |
| `synchronized (new Object())` — B/op and ns/op                  | 0, 0.2 ns                           | 16, 13 ns |
| `synchronized (p)` with `p` `ArgEscape` — B/op and ns/op        | 24, **2.8 ns**                      | 24, 13 ns |

What the table says about this program/build: inlining exposed many objects to C2, while
ordinary opaque calls, retained escape paths and array-offset limits blocked several
eliminations. Compiler-known calls/intrinsics are exceptions, and another JDK can differ.
`opto/escape.cpp` names array cases
directly — "has a non-constant length", "has a length that is too big", "has field with
unknown offset" — and the last is the variable index.

The stream row is the one to remember: the pipeline itself is the allocation, and it sits
behind `no static binding` and `callee is too large` verdicts inside the JDK, which no
application-side change reaches. Choose a loop on a hot path by design; do not expect EA to
turn one into the other.

## In production

```bash
jfr print --events jdk.ObjectAllocationSample recording.jfr
```

`jdk.ObjectAllocationSample` is enabled in the referenced default configuration; it is a
sample, not an allocation census. The TLAB events are not
(JDK-8257602, JDK 16), so a zero from `jdk.ObjectAllocationInNewTLAB` proves only that the
session did not enable it. For each of the top allocated types, ask in order:

1. Should this object be local at all?
2. Is it returned, stored in a field, or handed to another thread?
3. Does it cross a call that was not inlined? — `PrintInlining` on the tier-4 tree, or
   `-Xlog:jit+inlining=debug` when the diagnostic unlock is not an option
4. **Has a rare path that leaks it executed at least once in this JVM?** — the number
   changes at the first incident, not at the deploy
5. Is it captured by a lambda that itself escapes? The capture is not the escape; the
   lambda's destination is.
6. Does it cross reflection or method-handle machinery? Since JEP 416, constant reflective
   objects may optimize differently from non-constant targets; inspect the actual chain.

## Reading the inlining chain

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -XX:CompileCommand=quiet \
     -XX:CompileCommand=PrintInlining,com.example.Hot::* -jar app.jar
```

Scope it with `CompileCommand=PrintInlining,Class::method` or it prints every compilation
in the process. Under default tiered policy, read the C2/tier-4 tree—the tier-3 tree is C1's
and says `callee is too large` for anything over 35 bytes regardless of hotness. On the
hot path, three verdicts matter most:

- `hot method too big` — the callee exceeds `FreqInlineSize` (325 bytecode bytes).
  Everything downstream of that frontier loses escape analysis, constant propagation and
  dead-code elimination. Extract the callee's rare part so the hot remainder fits.
- `virtual call`—C2 found no usable static/guarded target under the current bounded receiver
  profile and policy. Inspect the actual type distribution and profile-width overflow rather
  than applying a universal “three types/90%” rule.
- `already compiled into a big method` — the callee's own machine code exceeds
  `InlineSmallCode` (2500 bytes), usually because it was compiled first and grew.

C2 in this build did not print `megamorphic`, `too large` or `not inlined`. The full verdict list and the
fix for each is `inlining-verdicts-and-fixes.md`.

## Before optimising an allocation

- [ ] The allocation was **measured**, not inferred from reading the code
- [ ] The measurement exercised representative common, rare, exceptional and receiver paths
- [ ] The allocation affects a relevant metric—CPU, allocation/GC pressure, memory footprint
      or tail latency—under realistic concurrency
- [ ] The object is large or expensive to construct — otherwise manual reuse probably makes
      it worse
- [ ] A baseline exists from before the change, under the same load
- [ ] After the change, the **same** metric was measured again

The last one is not ceremony. Manual object reuse routinely regresses
`gc.alloc.rate.norm` by turning a scalar-replaced object into a pooled, escaping one.

## Primary references

- [HotSpot C2 escape analysis source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/escape.cpp)
- [HotSpot C2 macro expansion/scalar replacement](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/macro.cpp)
- [ThreadMXBean allocated-memory API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/com/sun/management/ThreadMXBean.html)
- [JFR runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide.html)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
- [JDK-8287061: reduce allocation merges](https://bugs.openjdk.org/browse/JDK-8287061)
