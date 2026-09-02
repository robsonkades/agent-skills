---
name: jit-inlining-and-escape-analysis
description: >
  Inlining and escape analysis in C2: inlining as the multiplier, scalar replacement versus
  "stack allocation", flow-insensitivity, turning a PrintInlining verdict into a code
  change, and measuring with gc.alloc.rate.norm. Use when allocation rate is high on a hot
  path, when a hot call is refused inlining and the fix is unclear, when an object pool for
  small objects, @ForceInline on application code or a higher FreqInlineSize is proposed,
  when an interface gains a third implementation on a critical path, when "the JIT will
  handle it" or "allocation is expensive" is asserted without a measurement, when a rare
  branch makes an object escape, when Optional, a stream or a lambda capture is blamed or
  excused for allocation, or when a hot method never appears in PrintCompilation. Does not
  cover warm-up and the tiered pipeline (jit-compilation), benchmark construction
  (jmh-microbenchmarks) or GC cost (gc-fundamentals). The algorithm itself is
  escape-analysis-internals; byte attribution is allocation-profiling.
---

# JIT Inlining and Escape Analysis

## Purpose

Decide allocation and inlining questions by measurement instead of by belief. Two
symmetric errors live here — "allocation is expensive, avoid objects" and "the JIT handles
it, allocate freely" — and both are unverified. The defensible position is to measure, and
the measurement costs one command. This skill is the practitioner's layer: what to do about
a hot call that was not inlined or an allocation that survived. The mechanism is
`escape-analysis-internals` and `c2-sea-of-nodes`; reading the logs end to end is
`compilation-and-inlining-logs`.

## Workflow

1. **Measure the allocation, do not infer it from the code.** Under JMH, `-prof gc` gives
   `gc.alloc.rate.norm` — bytes per operation. In any other harness,
   `com.sun.management.ThreadMXBean.getCurrentThreadAllocatedBytes()` around N warmed
   iterations whose result is consumed gives the same number. In production,
   `jdk.ObjectAllocationSample` in JFR names the most-allocated types; `allocation-profiling`
   owns the attribution.
2. **Read the result as near-binary.** Scalar replacement either removes the allocation or
   it does not. If you expect zero and see the object's size, something made it escape; a
   multiple of the size means it escapes and is allocated more than once.
3. **Find the boundary before theorising, in this order:** a call the object crosses that
   was not inlined (`-XX:+PrintInlining`, tier-4 tree, the verdict names the limit); a rare
   branch that has actually executed; a store into a field, array, static or another
   thread; an array that is not constant-length, constant-index and at most 64 elements; a
   merge of two allocations. Only then the analysis itself.
4. **For a non-inlined hot call, pick the fix from the verdict**, not from the flag list:
   `hot method too big` wants the callee's rare part extracted, `virtual call` wants fewer
   types at that site, `inlining too deep` wants a flatter chain, `already compiled into a
big method` means the callee grew. Refactor first; `CompileCommand` to confirm in the lab;
   a global limit last, measured process-wide. See
   `references/inlining-verdicts-and-fixes.md`.
5. **Quantify what the analysis is delivering** with `-XX:-DoEscapeAnalysis` before and
   after, and `-XX:-EliminateAllocations` to separate scalar replacement from lock elision.
   Then ask whether the allocation is on the critical path at all — a TLAB bump costs a few
   nanoseconds and its GC cost is the subject of `gc-fundamentals` — before changing code
   for it.

## Rules

- Inlining is the doorway to escape analysis. A method that is not inlined is an opaque
  box, and an object crossing that boundary is allocated even when the callee only reads
  it — measured 24 B/op for a two-field object passed to a `dontinline` callee. A refused
  hot call does not cost you a call; it costs the whole chain of downstream optimisations.
- **The JVM does not allocate objects on the stack.** HotSpot performs scalar replacement:
  the object is decomposed into variables and ceases to exist. That is not the same as
  moving it to another memory region, and the difference changes what you expect to
  measure.
- The analysis is **flow-insensitive**, with one profile-shaped exception. A branch on
  which the object escapes marks it escaping on every path — but only once that branch has
  executed. A branch never taken during profiling is pruned with an uncommon trap and the
  object stays `NoEscape` (0 B/op measured); the first time it runs, the method recompiles
  with the branch present and the object escapes on **every** iteration thereafter
  (24 B/op). A benchmark that never triggers the rare event reports a number production
  loses at the first incident. Construct the object inside the rare branch, or pass its
  fields to a method that does.
- `ArgEscape` permits lock elision only, not scalar replacement. Measured: `synchronized`
  on an object passed to an opaque callee ran at 2.8 ns/op with the lock elided and
  12.7 ns/op without, while the allocation stayed at 24 B/op in both.
- Splitting a large method into small ones usually **improves** the result: each part
  becomes more easily inlinable and the common path shrinks. Do not merge methods to avoid
  calls, and do not let a method grow past `HugeMethodLimit` (8000 bytecode bytes) — above
  it the method is never compiled, prints nothing in any compiler log, and shows up only as
  interpreted frames in a profiler.
- Pooling small objects usually makes things worse: storing the object in a pool makes it
  escape and forces an allocation that would not have existed. Pools are for large or
  expensive-to-construct objects — and even then, measured, because the pool has its own
  cost.
- Megamorphic call sites cost through **lost optimisation**, not through dispatch. One or
  two receiver types inline; three or more inline only the receiver that holds at least
  `TypeProfileMajorReceiverPercent` (90%) of the profile, behind a guard, and otherwise
  the verdict is `virtual call` regardless of callee size. The profile belongs to the
  bytecode, so a shared helper is megamorphic for every caller once any caller made it so.
- `@ForceInline` and `@DontInline` are `jdk.internal.vm.annotation` and are honoured only
  for boot and platform loader classes. On application code they compile (with
  `--add-exports`) and change nothing — measured. The application-level tools are
  `-XX:CompileCommand=inline|dontinline`, compiler directives and JMH `@CompilerControl`,
  and all three are lab tools, not the fix.
- A lambda is not an escape path by itself. A lambda capturing an object, consumed by an
  inlined call, allocates nothing (0 B/op measured, primitives or objects); the lambda
  object and everything it captured allocate together once the lambda reaches a
  non-inlined callee, a field, a queue or an executor (40 B/op). Ask where the **lambda**
  goes.
- `Optional` and streams are free only while the whole chain is one compilation unit.
  `Optional.of(i).map(f).orElse(0)` inlined end to end measured 0 B/op; the same
  `Optional` returned from a non-inlined method, 28 B/op. A stream pipeline is several
  objects behind interface calls, most of them refused as `no static binding` or
  `callee is too large`; `IntStream.range(0, 4).sum()` measured 56 B/op and the plain loop 0. On a hot path that is a design choice, not something to expect EA to remove.
- Arrays are scalar-replaced only when the length is constant, at most
  `EliminateAllocationArraySizeLimit` (64) elements, **and every index is constant**.
  `new int[8]` written at `a[i & 7]` allocates 48 B/op; the same array at `a[3]`, 0.
- `cond ? new A(...) : new B(...)` was a guaranteed escape before JDK 22; since
  `ReduceAllocationMerges` (JDK-8287061) it scalar-replaces (0 B/op on 25, 24 with the
  flag off). Do not carry the "never merge allocations" rule forward unmeasured.
- Reflection is opaque, not merely slow. An object passed to `Method.invoke` escapes
  because the compiler cannot prove otherwise. A constant `MethodHandle` is transparent and
  can preserve the behaviour.
- Partial escape analysis in Graal exists precisely for the flow limitation — it decides
  per path rather than per method. Graal left the JDK with JEP 410 (JDK 17); using it is
  `graalvm-jit`.

## References

- [Verifying escape analysis](references/verifying-escape-analysis.md) — the flags to
  confirm, the JMH, `ThreadMXBean` and JFR measurements, the table of measured outcomes for
  the common patterns on JDK 25, and the factor-isolation runs. Read before changing any
  allocation-related code.
- [From an inlining verdict to a code change](references/inlining-verdicts-and-fixes.md) —
  the limits with their JDK 25 defaults and what each measures, the verdict-to-fix table,
  polymorphism outcomes, why `@ForceInline` does nothing for you, the method that never
  compiles, the cost of raising a limit, and how all of it behaves in production. Read when
  a hot call was refused and the next step is unclear.
