# Verifying escape analysis

Defaults below are scoped to Temurin 25.0.3. Allocation costs require complete benchmark
sources, inputs and raw results. Use the cases below to construct an experiment for the
target build; they are hypotheses, not measured B/op or ns/op guarantees.

## Confirm the optimisations are on

```bash
java -XX:+PrintFlagsFinal -version \
  | rg 'DoEscapeAnalysis|EliminateAllocations|EliminateLocks'
```

For the ordinary C2 scalar-replacement experiment, confirm these optimisations are enabled
and record command-line origins. An inherited disable or `dontinline` directive changes the
question being measured. Flag names/classes are implementation details; first check that the
exact JDK recognizes them.
The command above describes a fresh JVM with those launch options. It does not discover a
running service's overrides or directive stack; use its recorded launch/configuration and
targeted `jcmd` evidence where available before attributing behavior to defaults.

| Flag                                    | Default | Class      | Controls                                                          |
| --------------------------------------- | ------- | ---------- | ----------------------------------------------------------------- |
| `-XX:+DoEscapeAnalysis`                 | `true`  | product    | Whether the connection graph is built at all                      |
| `-XX:+EliminateAllocations`             | `true`  | product    | Scalar replacement of `NoEscape` objects                          |
| `-XX:+EliminateLocks`                   | `true`  | product    | Lock elision on `NoEscape` and `ArgEscape` objects                |
| `-XX:+EliminateAutoBox`                 | `true`  | product    | Box–unbox elimination for `Integer` and friends                   |
| `-XX:+ReduceAllocationMerges`           | `true`  | diagnostic | Scalar replacement across a `Phi` of allocations (JDK 22+)        |
| `-XX:EliminateAllocationArraySizeLimit` | 64      | product    | Largest constant-length array eligible for scalar replacement     |
| `-XX:EscapeAnalysisTimeout`             | 20 s    | product    | Connection-graph build budget; projected work can trigger bailout |
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

Record compressed-pointer settings, alignment and header mode. Compact headers, pointer
modes, alignment, subclass fields and array
layout change the sizes. Use JOL/`object-layout-and-footprint` on the same VM, then treat a
size match as a lead rather than proof of identity.

Compare separate, otherwise matched forks with `-XX:-DoEscapeAnalysis` where this can test
an elimination hypothesis. `-XX:-EliminateAllocations` retains EA while disabling scalar
replacement; `-XX:-EliminateLocks` targets lock elimination. These switches also interact
with inlining and graph optimization, so they are perturbations, not perfectly independent
factors or proof that a particular source allocation accounts for the entire delta.

## Outside JMH

A controlled approximation in another harness, including a production-shaped integration
test, can use allocated-thread bytes when the implementation supports and enables it:

Partial Java 17+ harness fragment; `run(n)` returns a consumed primitive result and `sink`
is a harness field. Check support before enabling measurement; modular applications need
`java.management` and `jdk.management`. Do not run this counter experiment on a virtual thread.

```java
var bean = ManagementFactory.getThreadMXBean();
if (!(bean instanceof com.sun.management.ThreadMXBean tmx)
        || !tmx.isThreadAllocatedMemorySupported()) {
    throw new UnsupportedOperationException("Thread allocation counters unavailable");
}
if (!tmx.isThreadAllocatedMemoryEnabled()) tmx.setThreadAllocatedMemoryEnabled(true);
if (n <= 0) throw new IllegalArgumentException("n must be positive");
for (int w = 0; w < 15; w++) sink += run(n); // illustrative; verify convergence separately
long before = tmx.getCurrentThreadAllocatedBytes();
long result = run(n);
long after = tmx.getCurrentThreadAllocatedBytes(); // finish before formatting/output
sink += result;
if (before < 0 || after < before) throw new IllegalStateException("Invalid counters");
System.out.println((after - before) / (double) n + " B/op");
```

Also measure/subtract an empty harness path, isolate work performed on other threads, and
record compilation/deoptimization events. Warm-up must cover representative receiver/path
mix; “fifteen” is an example, not a convergence criterion.

## Reproduction cases, not allocation guarantees

| Pattern                                                   | What the experiment must distinguish                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Local Point or record, fields consumed                    | Scalar replacement versus dead-code elimination; use changing inputs              |
| Rare branch publishes the object                          | Unobserved trapped path versus retained escape path; exercise realistic frequency |
| Object constructed only on publishing branch              | Rare allocations still exist; report precision and bytes per whole operation      |
| Point passed to a dontinline reader                       | Opaque boundary versus inlined uses; intrinsics/known calls are exceptions        |
| Same-class allocation merge                               | Compare supported ReduceAllocationMerges setting and actual eligibility           |
| Optional, boxing and capturing lambda                     | Cache/input ranges, target inlining and capture escape; attribute surviving types |
| Stream sum with and without map                           | Pipeline shape, per-invocation versus per-element normalization and runtime calls |
| Constant-length array with constant versus variable index | Length/offset eligibility, bounds checks and retained uses                        |
| Local monitor versus escaping argument                    | Allocation and lock elimination separately; validate concurrency semantics        |

For every case retain source, input distribution, complete commands, JDK/CPU/layout,
warm-up evidence, compiler logs, baseline harness cost and repeated raw results.
A rounded 0 B/op does not imply zero allocations, especially with rare publishing paths.
C2's `opto/escape.cpp` rejects some nonconstant lengths, oversized arrays and unknown offsets;
non-escape alone does not guarantee scalar replacement.

A stream pipeline can retain allocations or non-inlined calls, but application pipeline shape
and compilation context can change that result. Compare a behaviorally equivalent loop only
when the pipeline is hot and the measured benefit justifies the change.

## In production

```bash
jfr print --events jdk.ObjectAllocationSample recording.jfr
```

`jdk.ObjectAllocationSample` is enabled in the referenced default configuration; it is a
sample, not an allocation census. The TLAB events are not
(JDK-8257602, JDK 16), so a zero from `jdk.ObjectAllocationInNewTLAB` requires checking enablement,
thresholds, workload opportunity and loss before concluding anything. For each of the top allocated types, ask in order:

1. Should this object be local at all?
2. Is it returned, stored in a field, or handed to another thread?
3. Does it cross a call that was not inlined? — `PrintInlining` on the tier-4 tree, or
   `-Xlog:jit+inlining=debug` when the diagnostic unlock is not an option
4. **Has a rare path that leaks it executed at least once in this JVM?** — correlate with the
   current graph and deoptimization/recompilation; one execution does not fix policy forever
5. Is it captured by a lambda that itself escapes? The capture is not the escape; the
   lambda's destination is.
6. Does it cross reflection or method-handle machinery? Since JEP 416, constant reflective
   objects may optimize differently from non-constant targets; inspect the actual chain.

## Reading the inlining chain

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:CompileCommand=quiet \
     -XX:CompileCommand=PrintInlining,com.example.Hot::* -jar app.jar
```

The method-specific option prints inlining while compiling matching root methods; it is not
an arbitrary caller bytecode-index filter. Adding global `-XX:+PrintInlining` enables output
for other compilations too. Under default tiered policy, read the C2/tier-4 tree—the tier-3 tree is C1's
and follows C1's separate budgets/policy, which can also use profile information. On the
hot path, three verdicts matter most:

- `hot method too big` — the callee exceeds the selected raised size policy (default
  `FreqInlineSize` 325 bytecode bytes). Selected EA constructors/unboxing can also choose
  that policy; the text alone does not prove a hot site.
  The caller loses visibility across that ordinary boundary; the callee can still optimize
  its own compilation, and compiler-known calls are exceptions. Test extracting the rare part
  only when its semantics and measured workload benefit justify the change.
- `virtual call`—C2 found no usable static/guarded target under the current bounded receiver
  profile and policy. Inspect the actual type distribution and profile-width overflow rather
  than applying a universal “three types/90%” rule.
- `already compiled into a big method` — the callee's instruction-size heuristic exceeds
  `InlineSmallCode` (default 2500 bytes). Use the metric described in the verdict reference,
  not whole nmethod storage.

C2 in this build did not print `megamorphic`, `too large` or `not inlined`. The full verdict list and the
fix for each is `inlining-verdicts-and-fixes.md`.

## Before optimising an allocation

- [ ] The allocation was **measured**, not inferred from reading the code
- [ ] The measurement exercised representative common, rare, exceptional and receiver paths
- [ ] The allocation affects a relevant metric—CPU, allocation/GC pressure, memory footprint
      or tail latency—under realistic concurrency
- [ ] If reuse is proposed, measured lifecycle savings justify pooling's ownership,
      retention and synchronization costs; small hot allocations may still merit elimination
- [ ] A baseline exists from before the change, under the same load
- [ ] After the change, the **same** metric was measured again

Manual object reuse can regress allocation or workload cost by changing escape, retention or
ownership. Measure the actual effect; neither pooling nor scalar replacement guarantees a win.

## Primary references

- [HotSpot C2 escape analysis source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/escape.cpp)
- [HotSpot C2 macro expansion/scalar replacement](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/macro.cpp)
- [ThreadMXBean allocated-memory API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/com/sun/management/ThreadMXBean.html)
- [JDK 25 `jfr` artifact inspection](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
- [JDK-8287061: reduce allocation merges](https://bugs.openjdk.org/browse/JDK-8287061)
