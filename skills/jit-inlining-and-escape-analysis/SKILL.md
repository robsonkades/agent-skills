---
name: jit-inlining-and-escape-analysis
description: >
  Inlining and escape analysis in C2: why inlining is the multiplier that enables every
  other optimisation, scalar replacement versus "stack allocation", flow-insensitivity as
  the central limitation, megamorphic call sites, and measuring the result with
  gc.alloc.rate.norm. Use when allocation rate is high on a hot path, when someone proposes
  an object pool for small objects, when an interface gains a third implementation on a
  critical path, when "the JIT will handle it" or "allocation is expensive" is asserted
  without a measurement, when a rare branch makes an object escape, or when reflection or a
  lambda capture sits on a hot path. Does not cover the tiered pipeline and warm-up
  (jit-compilation), benchmark construction (jmh-microbenchmarks), or GC cost itself
  (gc-fundamentals). The analysis algorithm itself is escape-analysis-internals and byte
  attribution is allocation-profiling.
---

# JIT Inlining and Escape Analysis

## Purpose

Decide allocation questions by measurement instead of by belief. Two symmetric errors live
here — "allocation is expensive, avoid objects" and "the JIT handles it, allocate freely"
— and both are unverified. The defensible position is to measure, and the measurement
costs one command.

## Workflow

1. **Measure the allocation, do not infer it from the code.** Under JMH, `-prof gc` gives
   `gc.alloc.rate.norm` — bytes per operation. In production, `jdk.ObjectAllocationSample`
   in JFR names the most-allocated types.
2. **Read the result as near-binary.** Scalar replacement either removes the allocation or
   it does not. If you expect zero and see the object's size, something made it escape.
3. **For each hot allocation, ask where it goes.** Should this object be local? Is it
   returned, stored, or handed to another thread? **Does a rare path make it escape?** —
   that last one is the easiest to miss and the most common cause.
4. **Check the inlining chain** with `-XX:+PrintInlining`: `too big` or `megamorphic`
   anywhere in the chain explains a missing optimisation far from the call site.
5. **Quantify what the analysis is actually delivering** by comparing against
   `-XX:-DoEscapeAnalysis`, rather than assuming it delivers anything.

## Rules

- Inlining is the doorway to escape analysis. A method that is not inlined is an opaque
  box, and an object crossing that boundary must be allocated. `too big` on a hot path does
  not cost you a call — it costs the whole chain of downstream optimisations.
- **The JVM does not allocate objects on the stack.** HotSpot performs scalar replacement:
  the object is decomposed into variables and ceases to exist. That is not the same as
  moving it to another memory region, and the difference changes what you expect to
  measure.
- The analysis is **flow-insensitive**: if the object escapes on one path, it is treated as
  escaping on all of them. Roughly 80% of candidate methods are discarded for this reason.
  One rare `if` disables the optimisation for 100% of executions — so if you must retain
  the object in an exceptional case, **construct it inside that case**.
- `ArgEscape` permits lock elision only, not scalar replacement. There is no partial scalar
  replacement in C2.
- Splitting a large method into small ones usually **improves** the result: each part
  becomes more easily inlinable and the common path shrinks. Do not merge methods to avoid
  calls.
- Pooling small objects usually makes things worse: storing the object in a pool makes it
  escape and forces an allocation that would not have existed. Pools are for large or
  expensive-to-construct objects — and even then, measured, because the pool has its own
  cost.
- Megamorphic call sites cost through **lost optimisation**, not through dispatch. Three or
  more concrete types eliminate inlining, and without inlining there is no escape analysis
  in that stretch. This is why one extra implementation can have an impact wildly
  disproportionate to the change.
- Reflection is opaque, not merely slow. An object passed to `Method.invoke` escapes
  because the compiler cannot prove otherwise. A constant `MethodHandle` is transparent and
  can preserve the behaviour.
- A lambda that captures an object creates an escape path with it. Capturing primitives
  does not.
- Arrays have a hard limit: above `EliminateAllocationArraySizeLimit` (64 by default) there
  is no scalar replacement, escaping or not.
- Partial Escape Analysis in Graal exists precisely for the flow limitation — it decides
  per path rather than per method. Graal left the JDK with JEP 410 (JDK 17); using it
  requires the GraalVM distribution.

## References

- [Verifying escape analysis](references/verifying-escape-analysis.md) — the flags to
  confirm, the JMH and JFR measurements, and reading `-XX:+PrintInlining`. Read before
  changing any allocation-related code.
