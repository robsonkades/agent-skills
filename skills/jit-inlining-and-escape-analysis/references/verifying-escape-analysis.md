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

All three must be `true`. The realistic risk is not that they were turned off deliberately
but that a startup script inherited from an older JVM still disables one of them, or
carries a `-XX:CompileCommand=dontinline` nobody remembers. `-XX:+PrintFlagsFinal` prints
`{command line}` instead of `{default}` in the last column for anything a script set.

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

`gc.alloc.rate.norm` is bytes allocated per operation. It is deterministic given the same
code and compilation, which makes it far more reliable than a timing number, and it is
effectively binary for this question:

| Expected | Observed                | Reading                                    |
| -------- | ----------------------- | ------------------------------------------ |
| 0 B/op   | 0 B/op                  | scalar replacement happened                |
| 0 B/op   | the object's exact size | something made it escape — find the path   |
| 0 B/op   | a multiple of that size | it escapes and is allocated more than once |

An object's size is a 12-byte header padded to 8-byte alignment plus its fields, with
compressed class pointers on: a two-`int` object is 24, an `Integer` 16, a lambda capturing
one reference 16, an `int[8]` 48. Knowing the sizes lets you read _which_ object survived
from the sum.

To quantify what the analysis is actually delivering, run the same benchmark with
`-XX:-DoEscapeAnalysis` and compare. "The JIT resolves it" is exactly as unverified as
"allocation is expensive" until this comparison exists. `-XX:-EliminateAllocations` keeps
the analysis but stops scalar replacement, which separates the allocation gain from the
lock-elision gain; `-XX:-EliminateLocks` does the reverse.

## Outside JMH

The same number in any harness, including a production-shaped integration test:

```java
var tmx = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
for (int w = 0; w < 15; w++) sink += run(n);          // warm into C2 first
long before = tmx.getCurrentThreadAllocatedBytes();
sink += run(n);                              // consume the result, or C2 removes the work
System.out.println((tmx.getCurrentThreadAllocatedBytes() - before) / (double) n + " B/op");
```

The warm-up matters twice: the number must come from C2 code, and it must come from a
profile that has already seen every path the production code takes — a rare branch not yet
taken reports the pre-incident number (see the table).

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

What the table says in one sentence: escape analysis is thorough inside one compilation
unit and helpless across its boundary, and the boundary is drawn by inlining, by a taken
branch, by a store, and by the array rules. `opto/escape.cpp` names the array cases
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

`jdk.ObjectAllocationSample` is enabled in `default.jfc`; the TLAB events are not
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
6. Does it reach `Method.invoke`? Reflection is opaque, so it escapes by construction.

## Reading the inlining chain

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -XX:CompileCommand=quiet \
     -XX:CompileCommand=PrintInlining,com.example.Hot::* -jar app.jar
```

Scope it with `CompileCommand=PrintInlining,Class::method` or it prints every compilation
in the process. Read the tree under the **tier-4** line — the tier-3 tree above it is C1's
and says `callee is too large` for anything over 35 bytes regardless of hotness. On the
hot path, three verdicts matter most:

- `hot method too big` — the callee exceeds `FreqInlineSize` (325 bytecode bytes).
  Everything downstream of that frontier loses escape analysis, constant propagation and
  dead-code elimination. Extract the callee's rare part so the hot remainder fits.
- `virtual call` — three or more receiver types and none at 90%. Inlining stops, and with
  it every optimisation in that stretch. The cost appears far from the call site, in what
  stopped being optimised.
- `already compiled into a big method` — the callee's own machine code exceeds
  `InlineSmallCode` (2500 bytes), usually because it was compiled first and grew.

C2 never prints `megamorphic`, `too large` or `not inlined`. The full verdict list and the
fix for each is `inlining-verdicts-and-fixes.md`.

## Before optimising an allocation

- [ ] The allocation was **measured**, not inferred from reading the code
- [ ] The measurement came from a profile that had seen every path, including the rare one
- [ ] The allocation is on the critical path — a TLAB bump is a few nanoseconds; its real
      cost is GC pressure, and that is measured in allocation rate, not per-object
- [ ] The object is large or expensive to construct — otherwise manual reuse probably makes
      it worse
- [ ] A baseline exists from before the change, under the same load
- [ ] After the change, the **same** metric was measured again

The last one is not ceremony. Manual object reuse routinely regresses
`gc.alloc.rate.norm` by turning a scalar-replaced object into a pooled, escaping one.
