---
name: escape-analysis-internals
description: >
  C2 escape-analysis internals: connection graphs, escape-state propagation, flow
  insensitivity, bytecode escape summaries, scalar replacement and allocation merges,
  lock elimination, macro expansion, and deoptimization rematerialization. Use when a hot
  object still allocates, an inlining boundary changes EA, a product-build diagnostic is
  misleading, a disabled JFR allocation event is treated as proof, or recurring deoptimization
  makes eliminated objects costly. Does not cover introductory design/measurement rules
  (jit-inlining-and-escape-analysis), general C2 phases (c2-sea-of-nodes), or Graal partial
  escape analysis (graalvm-jit).
---

# Escape Analysis Internals

## Purpose

Explain why a specific object was not eliminated, using the mechanism rather than folklore.
The failure this skill prevents is chasing the wrong target: tuning bytecode escape-analysis
limits toward ArgEscape in the hope of removing an allocation. In current C2, ArgEscape is not
eligible for scalar replacement; it can make monitor elimination possible, but even that remains
subject to the surrounding lock shape and compiler policy.

Escape classification is the fixed point of edge propagation over a connection graph, and
macro expansion then removes an `AllocateNode` or lowers the surviving allocation. Dead-code and
macro cleanup can also discard an allocation whose result has no surviving use, independently of
EA. That is one reason a zero-allocation microbenchmark needs an EA-disabled control and emitted-
code/compiler-log evidence.

## Workflow

1. **Confirm the baseline is not the explanation.** Check `DoEscapeAnalysis`,
   `EliminateAllocations`, `EliminateLocks` and `ReduceAllocationMerges` are `true` with
   `-XX:+PrintFlagsFinal`, and that no `CompileCommand` names `PrintEscapeAnalysis` — the
   JVM would not have started.
2. **Establish that allocation is really happening, then that EA is the mechanism.**
   `gc.alloc.rate.norm` at the object's full size is the reason to continue. At zero, rerun
   with `-XX:-DoEscapeAnalysis`: still zero means the object had no use and was yanked, and
   the measurement says nothing about escape analysis.
3. **Ask the compiler before theorising.** On any product JVM,
   `-XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation` writes `<eliminate_allocation>` and
   `<eliminate_lock>` per tier-4 task; an absent element for the class and `bci` is the
   verdict. See `references/diagnosing-elimination.md`.
4. **Find the inlining boundary.** `-XX:+PrintInlining`, tier-4 tree — is there a refusal on
   the chain that carries the object? Confirm the callee's real bytecode size with
   `javap -c -p`, never by eyeballing the source.
5. **Decide which state is achievable, then set the expectation accordingly.** A callee that
   fits within `MaxBCEAEstimateSize` and stores nothing reaches ArgEscape via BCEA — that
   can enable lock elision, not scalar replacement across that call. NoEscape is necessary for
   scalar replacement, but not sufficient: identity-sensitive uses, array/field limits, unsafe
   access, merges, and other graph shapes can still preserve the allocation.
6. **If everything was inlined, match the shape** against the "why did this allocation
   survive" table — a merge with an unsupported user, an identity hash, a non-constant array
   index, a field or array limit, a taken rare branch — then trace the escaping edge to its
   sink. See `references/connection-graph.md`.
7. **Fix the cause, not the symptom.** Construct the object inside the rare branch, split the
   escaping path into its own method, reduce polymorphism, or raise `MaxBCEAEstimateSize` —
   the last only when the gain sought is lock elision. Then repeat steps 2 and 3 on the same
   load.
8. **Investigate rematerialisation cost separately**, with `-Xlog:deoptimization=debug` or
   `jdk.Deoptimization` over a real window, not with JMH.

## Rules

- ArgEscape never yields scalar replacement. Categorical — every argument of a non-inlined
  call is at least ArgEscape, and there is no partial scalar replacement in C2. If the goal is
  removing the allocation, the target must be NoEscape, which only inlining produces.
- The analysis is flow-insensitive over the **compiled** graph. A branch that stores the
  object marks it for every path **when that store is present in the compiled graph**. Profiles
  may instead lead C2 to replace a sufficiently unlikely branch with an uncommon trap; “taken
  once” versus “never” is not the portable decision boundary. Inspect the graph/log and trap
  history. Constructing the object inside the escaping branch often restores the common path,
  but validate changed allocation, code size, and deoptimization behavior.
- Merges are no longer categorically rejected. JDK 22 added reduction for supported Phis over
  allocations (JDK-8287061); JDK 23 added nullable cases (JDK-8316991). Eligible user shapes are
  narrow—principally supported field loads, safepoint debug use, constant/null comparisons, and
  guarded casts. Calls, stores, class/identity-sensitive access, arrays, or other unsupported uses
  can still block reduction; confirm against the target release and log.
- `MaxBCEAEstimateSize` (default 150) measures **bytecode bytes of the non-inlined callee**,
  not object size. Raising it extends the summary to larger callees without inlining them;
  its ceiling is ArgEscape, so the real benefit is lock elision across the inlining boundary.
- No EA flag measures "object size" in the usual sense. `EliminateAllocationArraySizeLimit`
  (64) counts array elements and `EliminateAllocationFieldsLimit` (512, diagnostic) counts
  fields; both are refusals to hold that many scalars live at every safepoint, not a bug.
- `PrintEscapeAnalysis`, `PrintEliminateAllocations` and `PrintEliminateLocks` are `develop`
  flags: a product JVM refuses to start on them, and `PrintEscapeAnalysis` is not a
  `CompileCommand` option in any spelling — both `option,C::m,PrintEscapeAnalysis` and
  `PrintEscapeAnalysis,C::m` are `Unrecognized option` and the JVM exits. There is no
  per-method form even on a debug build. `LogCompilation` is the product-build substitute.
- For allocation evidence in production use `jdk.ObjectAllocationSample`.
  `jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` are `enabled=false`
  in **both** `default.jfc` and `profile.jfc` on JDK 25 (JDK-8257602), so a zero count from
  them proves nothing unless the event was enabled by name. Even `ObjectAllocationSample` is
  throttled sampling — in the lab, JMH `-prof gc` remains the primary metric.
- Neither C2 nor Graal performs stack allocation. C2 decomposes the object (scalar
  replacement); Graal decides **when** to materialise on the heap, per path. Do not describe
  either as "stack allocation", and do not describe Graal's partial escape analysis as a
  more sophisticated version of C2's — it is a different technique, run iteratively
  interleaved with inlining rather than after parse-time inlining settles.
- Rematerialisation cost per event grows with the number and shape of virtual objects live at
  the deoptimizing safepoint; total cost also grows with deoptimization rate. Count allocation,
  field restoration, frame reconstruction, and downstream GC alongside recompilation.
  `-XX:+TraceDeoptimization` can expose objects on a controlled test run when supported.
- Not every ArgEscape is worth attacking. Where the callee genuinely needs the object beyond
  the caller's scope — a logger, a serialiser, a registered listener — forcing NoEscape
  means inlining something that should not be inlined. The case worth investigating is
  ArgEscape where the callee only reads fields.
- Project Valhalla may reduce identity and flattening costs structurally, but do not design from
  an EA draft as if it were a shipped guarantee. As of the current JDK 28 early-access work,
  JEP 401 value classes and strict-field support appear in draft/preview specifications, while
  JEP 402 enhanced primitive boxing remains Draft. Recheck JEP status and the deployed release;
  JDK 17, 21, and 25 code still depends on existing object and EA behavior.
- Label any speedup figure taken from a composite or third-party case as such. Measure
  `gc.alloc.rate.norm` before and after on the same load rather than inferring it.

## References

- [The connection graph](references/connection-graph.md) — node and edge kinds, the
  propagation path from parse to escape state with the iterative loop and its bailout, what
  BCEA can and cannot buy, reducible merges and their exact user rules, the three exits from
  macro expansion including the unused-allocation yank, boxing and string concatenation,
  lock elision kinds, the rematerialisation mechanism, and how Graal's per-path
  materialisation differs. Read when explaining why a specific object received the state it
  did.
- [Diagnosing a failed elimination](references/diagnosing-elimination.md) — the procedure
  with its EA-off control, the "why did this allocation survive" table with measured
  results on 25.0.3, the flag table by class, what `CompileCommand` does not accept, reading
  `LogCompilation`'s `eliminate_allocation` / `eliminate_lock` elements, the corrected JFR
  event matrix, lock elision timings, and the checklists. Read while running an
  investigation.
- [HotSpot C2 escape analysis source](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/escape.cpp)
- [JDK-8287061: allocation-merge rematerialization](https://bugs.openjdk.org/browse/JDK-8287061)
- [Project Valhalla status](https://openjdk.org/projects/valhalla/)
