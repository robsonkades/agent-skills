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

1. **Confirm the baseline is not the explanation.** Record vendor, full JDK build, compiler,
   tiering and effective flags; this material targets HotSpot C2, chiefly JDK 25. Reuse
   established compiler evidence. For a confirmed Graal target, stop these C2 steps and hand off
   detailed partial-EA diagnosis to `graalvm-jit`, carrying the known build/settings, allocation
   site, available evidence and remaining gaps. For C2, check
   `DoEscapeAnalysis`, `EliminateAllocations` and `EliminateLocks` with unlocked
   `-XX:+PrintFlagsFinal`; inspect `ReduceAllocationMerges` only where available (JDK 22+).
   Inspect the build's compiler release/target separately from the running VM; bytecode shape
   can differ even with the same `javac` version. Preserve the project's target rather than
   upgrading it. Check diagnostics against the exact VM.
2. **Establish that allocation is really happening, then that EA is the mechanism.**
   Validate the counter/event, measured threads, execution window and operation denominator.
   Partial bytes/op can reflect execution frequency, mixed tiers or other allocations; full
   object size is not a prerequisite for investigation. Reject unavailable counter values
   before subtraction. At a valid zero, rerun
   with `-XX:-DoEscapeAnalysis`: still zero means EA dependence was not demonstrated. Inspect
   dead-code removal, caching, untaken paths and measurement scope before attributing a mechanism.
3. **Ask the compiler before theorising.** On the target HotSpot product build,
   `-XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation` writes `<eliminate_allocation>`,
   `<eliminate_boxing>` and `<eliminate_lock>` for their respective transformations in C2 tasks.
   Join compile IDs to installed C2 nmethods and match the allocation's method/BCI and inline
   context; absence alone is inconclusive.
   See `references/diagnosing-elimination.md`.
4. **Find the inlining boundary.** `-XX:+PrintInlining`, tier-4 tree — is there a refusal on
   the chain that carries the object? Confirm the callee's real bytecode size with
   `javap -c -p`, never by eyeballing the source.
5. **Decide which state is achievable, then set the expectation accordingly.** A callee that
   fits within `MaxBCEAEstimateSize` and receives a successful non-escaping BCEA summary
   can leave its argument ArgEscape — that
   can enable lock elision, not scalar replacement across that call. NoEscape is necessary for
   scalar replacement, but not sufficient: identity-sensitive uses, array/field limits, unsafe
   access, merges, and other graph shapes can still preserve the allocation.
6. **If everything was inlined, match the shape** against the "why did this allocation
   survive" table — a merge with an unsupported user, an identity hash, a non-constant array
   index, a field or array limit, a taken rare branch — then trace the escaping edge to its
   sink. See `references/connection-graph.md`.
7. **Choose a change only when the allocation matters to the workload.** Retain an adequate
   design within its budgets. Lifetime relocation, hot/cold splitting or inlining changes
   must preserve constructor effects, exception order, identity and caller contracts;
   semantic retention cannot be tuned away. Raising `MaxBCEAEstimateSize` is only a candidate
   for lock elision. Compare the relevant alternative and repeat steps 2 and 3 on the same load.
8. **Investigate rematerialisation cost separately**, with `-Xlog:deoptimization=debug` or
   `jdk.Deoptimization` over a real window, not with JMH. On the JDK 25 baseline these cover
   uncommon traps, not all dependency invalidations; use the appropriate compilation/dependency
   evidence from `deoptimization`. Reuse available evidence and the authorized capture budget.

## Rules

- ArgEscape is not eligible for scalar replacement in the examined C2 implementation.
  An object argument to an ordinary non-inlined Java call is at least ArgEscape; inlining
  can remove that boundary. Intrinsics and specially modelled runtime operations need their
  own graph analysis; do not apply the ordinary-call rule to every source-level invocation.
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
  `CompileCommand` option on the examined build — both `option,C::m,PrintEscapeAnalysis` and
  `PrintEscapeAnalysis,C::m` report `Unrecognized option`. On Temurin 25.0.3 both exited 1
  before `-version` ran; check exit status and actual execution on the target VM. There is no
  per-method form even on a debug build. `LogCompilation` is the product-build substitute.
- For allocation evidence in production use `jdk.ObjectAllocationSample`.
  `jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` are `enabled=false`
  in **both** `default.jfc` and `profile.jfc` on JDK 25 (JDK-8257602), so a zero count from
  them proves nothing unless the event was enabled by name. Even `ObjectAllocationSample` is
  throttled sampling — in the lab, JMH `-prof gc` remains the primary metric.
- Scalar replacement is not stack allocation. C2 decomposes the object into scalars;
  Graal's partial EA decides **when** to materialise on the heap, per path. Do not describe
  either as "stack allocation", and do not describe Graal's partial escape analysis as a
  more sophisticated version of C2's — it is a different technique, run iteratively
  interleaved with inlining rather than after parse-time inlining settles.
- Rematerialisation cost per event grows with the number and shape of virtual objects live at
  the deoptimizing safepoint; total cost also grows with deoptimization rate. Count allocation,
  field restoration, frame reconstruction, and downstream GC alongside recompilation.
  `-XX:+TraceDeoptimization` can expose objects on a controlled test run when supported.
- Not every call boundary is worth attacking. If the callee retains the object in escaping
  state, inlining cannot erase that semantic escape. Distinguish actual retention from an
  ArgEscape argument whose callee only reads fields; assess code size and workload benefit
  before trying to inline the latter.
- Project Valhalla may reduce identity and flattening costs structurally, but do not design from
  an EA draft as if it were a shipped guarantee. Recheck JEP status and the deployed release;
  JDK 17, 21, and 25 code still depends on existing object and EA behavior.
- Label any speedup figure taken from a composite or third-party case as such. Measure
  `gc.alloc.rate.norm` before and after on the same load rather than inferring it.

Deliver the allocation site/compile ID, observed allocation rate, supported mechanism or remaining
hypothesis, and the smallest confirming check. Missing compiler/runtime evidence means a conditional
diagnosis, not a flag recommendation.

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
  `LogCompilation`'s allocation, boxing and lock elimination elements, the corrected JFR
  event matrix, lock elision timings, and the checklists. Read while running an
  investigation.
- [HotSpot C2 escape analysis source, JDK 25](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/escape.cpp)
- [JDK-8287061: allocation-merge rematerialization](https://bugs.openjdk.org/browse/JDK-8287061)
- [Project Valhalla status](https://openjdk.org/projects/valhalla/)
