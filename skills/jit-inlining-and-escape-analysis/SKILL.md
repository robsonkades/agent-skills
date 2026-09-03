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

1. **Measure the allocation, do not infer it from source.** Under JMH, `-prof gc` estimates
   normalized bytes per operation for the benchmark fork. A controlled harness can use a
   supported/enabled `com.sun.management.ThreadMXBean`, but must subtract harness work,
   isolate the measured thread and confirm compilation state; it is not automatically the
   same experiment. In production,
   `jdk.ObjectAllocationSample` in JFR names the most-allocated types; `allocation-profiling`
   owns the attribution.
2. **Reconcile bytes with object layout and compilation.** A repeatable delta close to an
   aligned object size is a useful hypothesis, not identity proof: boxing, lambda objects,
   arrays, harness/class-init work and different compiled paths contribute too. Compare
   allocation profiles/types and the same compile id before attributing the bytes.
3. **Find the boundary before theorising:** non-inlined/unknown calls; returns or stores to
   heap/global/thread-visible state; identity-sensitive uses; merges, arrays and indices C2
   cannot scalarize; or profile-dependent paths excluded from the current graph. Use the
   inlining log and `escape-analysis-internals`; do not infer an escape category from one
   source construct.
4. **For a non-inlined hot call, pick the fix from the verdict**, not from the flag list:
   `hot method too big` wants the callee's rare part extracted, `virtual call` wants fewer
   types at that site, `inlining too deep` wants a flatter chain, `already compiled into a
big method` means the callee grew. Refactor first; `CompileCommand` to confirm in the lab;
   a global limit last, measured process-wide. See
   `references/inlining-verdicts-and-fixes.md`.
5. **Isolate factors in a disposable benchmark fork.** Compare EA/allocation/lock-elision
   switches only as diagnostic experiments; they are global and change many compilations.
   Then establish whether retained CPU, allocation rate, GC or tail latency matters to the
   service before accepting a less maintainable source shape.

## Rules

- Inlining commonly exposes object uses to C2's connection graph and downstream
  optimisations. A non-inlined ordinary Java call is usually an escape boundary, but
  intrinsics and compiler-known methods are exceptions. A refused call can cost more than
  dispatch—constant propagation, scalar replacement and dead-code elimination may also stop.
- **Current HotSpot C2 scalar replacement is not stack allocation.** The object is
  decomposed into scalar values and ceases to exist in optimized code. That is not the same as
  moving it to another memory region. Deoptimization may rematerialize virtual objects, so
  preserve debug/deopt semantics when interpreting assembly and profiles.
- C2's connection-graph escape state is generally flow-insensitive for code retained in the
  compiled graph. An unobserved path may initially be removed behind an uncommon trap; if it
  later executes, deoptimization/recompilation can produce a different graph. One execution
  does not guarantee a permanent state. Exercise realistic rare paths and correlate each
  allocation result with compilation/deoptimization history.
- In current C2, `ArgEscape` is not enough for scalar replacement; it may still enable some
  lock elimination. Treat measured nanoseconds and byte counts as benchmark-specific.
- Splitting rare/cold work can improve inlining, but extra boundaries can also block it.
  Refactor around the measured hot graph. `HugeMethodLimit` and `DontCompileHugeMethods` are
  implementation policy: scope the 8,000-byte observation to JDK/build and check known
  version/policy exceptions in `compilation-and-inlining-logs`.
- Pooling small objects often adds escape, retention, synchronization/cache traffic and stale
  state risk. Consider it only for resources with measured construction/lifecycle cost and a
  bounded ownership protocol; compare against ordinary allocation plus GC under load.
- Polymorphic sites can cost through dispatch and lost optimisation. C2 records a bounded
  receiver profile and may guard-inline dominant types; exact width/percent thresholds and
  behavior are version-specific. Profile data belongs to a bytecode call site and can be
  affected by all executions reaching that site, especially shared helpers.
- `@ForceInline` and `@DontInline` are unsupported internal annotations. The tested JDK 25
  build honored them only for privileged boot/platform classes; class-path use with exports
  changed nothing. Do not depend on that implementation detail. Application experiments use
  `-XX:CompileCommand=inline|dontinline`, compiler directives and JMH `@CompilerControl`,
  and all three are lab tools, not the fix.
- A lambda/capture, `Optional` or stream is not intrinsically free or allocating. Its
  allocation depends on linkage, caching, inlining, escape and the exact pipeline. Use the
  measured JDK 25 examples in the reference as observations, never as API cost guarantees.
- C2 array scalar replacement has stricter implementation limits than object scalar
  replacement, commonly requiring constant small length and analyzable constant offsets.
  `EliminateAllocationArraySizeLimit=64` is a tested JDK 25 policy value, not a Java rule.
- Some same-shape allocation merges became scalar-replaceable with
  `ReduceAllocationMerges` work delivered from JDK 22. Eligibility depends on classes,
  control flow and uses; do not carry either “merges always escape” or “merges are free”
  across JDKs without evidence.
- Reflection/method-handle transparency depends on constant targets, modern reflection
  implementation, linkage and inlining. `Method.invoke` is not universally opaque after
  JEP 416, and a `MethodHandle` is not automatically transparent. Measure the concrete chain.
- Partial escape analysis in Graal exists precisely for the flow limitation — it decides
  per path rather than per method. Graal left the JDK with JEP 410 (JDK 17); using it is
  `graalvm-jit`.

## Decision framework

| Observation                                            | Prefer                                                              | Avoid until proven                             |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| allocation survives but is not hot/retained            | keep readable code                                                  | pooling or API distortion                      |
| non-inlined hot boundary blocks several optimisations  | extract cold work or specialize a local hot path                    | global inlining limits                         |
| rare escape invalidates common-path scalar replacement | construct on the rare path or pass scalars, if semantics stay clear | benchmark that never exercises the path        |
| polymorphic shared site loses inlining                 | isolate stable call sites or redesign only with profile evidence    | type checks added solely to game C2            |
| JDK upgrade changes allocation/code shape              | compare compile logs, bytes/op, CPU and tails                       | pinning an obsolete compiler heuristic forever |

The production acceptance test is not “0 B/op”. Require the same behavior, maintainable code,
improved relevant SLO/resource metric under realistic concurrency, no code-cache/compile-time
regression, and stable results across supported JDK/CPU variants.

## Troubleshooting

```text
Allocation or latency regression
  ↓ correlate deploy/JDK, allocation type+stack, compile id and deoptimizations
Expected call did not inline
  ↓ read the C2 verdict at the exact call site; inspect profile/size/node budget
Call inlined but allocation remains
  ↓ inspect stores/returns/identity/array/merge and escape-analysis limits
Allocation disappears in JMH only
  ↓ exercise production receiver mix, rare paths, exceptions and framework boundaries
Bytes improve but service does not
  ↓ measure CPU, GC, tails, code cache and bottleneck migration; revert complexity if no value
```

## References

- [Verifying escape analysis](references/verifying-escape-analysis.md) — the flags to
  confirm, the JMH, `ThreadMXBean` and JFR measurements, the table of measured outcomes for
  the common patterns on JDK 25, and the factor-isolation runs. Read before changing any
  allocation-related code.
- [From an inlining verdict to a code change](references/inlining-verdicts-and-fixes.md) —
  the limits with their JDK 25 defaults and what each measures, the verdict-to-fix table,
  polymorphism outcomes, why internal inlining annotations are not an application contract,
  huge-method exclusion, the cost of raising a limit, and production behavior. Read when
  a hot call was refused and the next step is unclear.
