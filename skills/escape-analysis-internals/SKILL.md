---
name: escape-analysis-internals
description: >
  How C2's escape analysis actually works: the connection graph and its node and edge kinds,
  the three escape states and how they propagate to a fixed point, flow insensitivity and
  what it costs, macro expansion as the point where the decision becomes code, scalar
  replacement limits, lock elision, rematerialisation on deoptimisation, and reading the
  analysis output. Use when an object that should be eliminated still allocates, when
  PrintInlining shows "too big" or "not inlineable" on the path, when someone raises
  MaxBCEAEstimateSize expecting less allocation, when -XX:CompileCommand=PrintEscapeAnalysis
  produces no output, when zero jdk.ObjectAllocationInNewTLAB events are read as proof, or
  when a hot method both eliminates many objects and deoptimises repeatedly. Does not cover
  the introductory design rules and the gc.alloc.rate.norm measurement
  (jit-inlining-and-escape-analysis), the surrounding compiler phases (c2-sea-of-nodes), or
  partial escape analysis as an alternative (graalvm-jit).
---

# Escape Analysis Internals

## Purpose

Explain why a specific object was not eliminated, using the mechanism rather than folklore.
The failure this skill prevents is chasing the wrong target: tuning a flag towards
ArgEscape in the hope of removing an allocation, when ArgEscape categorically never
produces scalar replacement — the only optimisation it guarantees is lock elision.

Escape classification is the fixed point of edge propagation over a connection graph, and
macro expansion then removes an `AllocateNode` entirely or expands it entirely. There is no
third path. That is the mechanical reason `gc.alloc.rate.norm` behaves as a binary signal.

## Workflow

1. **Confirm the baseline is not the explanation.** Check `DoEscapeAnalysis`,
   `EliminateAllocations` and `EliminateLocks` are `true` with `-XX:+PrintFlagsFinal`, and
   that no malformed `CompileCommand` was inherited from an old configuration.
2. **Establish that allocation is really happening.** `gc.alloc.rate.norm` at roughly zero
   means EA worked and the problem is elsewhere. A value at the object's full size is the
   only reason to continue.
3. **Find the inlining boundary.** `-XX:+PrintInlining` — is there a `too big` or
   `not inlineable` on the chain? Confirm the callee's real bytecode size with
   `javap -c -p`, never by eyeballing the source.
4. **Decide which state is achievable, then set the expectation accordingly.** A callee that
   fits within `MaxBCEAEstimateSize` and stores nothing reaches ArgEscape via BCEA — that
   buys lock elision, not less allocation. Only NoEscape removes the allocation.
5. **If everything was inlined, trace the escaping edge** to its sink: a static field, a
   return, another thread, or a callee with no summary. See
   `references/connection-graph.md`.
6. **Fix the cause, not the symptom.** Extract the rare escaping path, reduce polymorphism,
   or raise `MaxBCEAEstimateSize` — the last only when the gain sought is lock elision.
   Then repeat step 2 on the same load.
7. **Investigate rematerialisation cost separately**, with `-Xlog:deoptimization=debug` or
   `jdk.Deoptimization` over a real window, not with JMH.

## Rules

- ArgEscape never yields scalar replacement. Categorical — there is no partial scalar
  replacement in C2. Header, layout and TLAB allocation all remain. If the goal is removing
  the allocation, the target must be NoEscape.
- The analysis is flow-insensitive: a single path on which the object escapes marks the
  whole method, even if 99.9% of executions never take it. Extracting the rare path into a
  separate method is the fix, not a flag.
- `MaxBCEAEstimateSize` (default 150) measures **bytecode bytes of the non-inlined callee**,
  not object size. Raising it extends the analysis to larger callees without inlining them;
  its ceiling is ArgEscape, so the real benefit is lock elision across the inlining boundary.
- No EA flag measures "object size" in the usual sense. `EliminateAllocationArraySizeLimit`
  (default 64) counts array elements. Objects with many fields are limited by register
  pressure, not by a flag.
- `PrintEscapeAnalysis` is a boolean flag, not a `CompileCommand` verb. The correct form is
  `-XX:CompileCommand=option,Class::method,PrintEscapeAnalysis`, and it requires a debug
  build. The wrong form fails silently or with a parse warning that is easy to miss in
  startup output, and the symptom is indistinguishable from "EA found nothing".
- For allocation evidence in production use `jdk.ObjectAllocationSample`.
  `jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` have been disabled
  by default since JDK 16 (JDK-8257602), so a zero count from them proves only that the
  session was not `settings=profile`. Even `ObjectAllocationSample` is throttled sampling —
  in the lab, JMH `-prof gc` remains the primary metric.
- Neither C2 nor Graal performs stack allocation. C2 decomposes the object (scalar
  replacement); Graal decides **when** to materialise on the heap, per path. Do not describe
  either as "stack allocation", and do not describe Graal's partial escape analysis as a
  more sophisticated version of C2's — it is a different technique, run iteratively
  interleaved with inlining rather than once after inlining settles.
- Rematerialisation cost is proportional to the number of scalar-replaced objects live at
  the safepoint, not to the number of deoptimisations. When a method that eliminates a chain
  of nested objects deoptimises repeatedly, count that as a second bill on every event, not
  only as recompilation.
- Not every ArgEscape is worth attacking. Where the callee genuinely needs the object beyond
  the caller's scope — a logger, a serialiser, a registered listener — forcing NoEscape
  means inlining something that should not be inlined. The case worth investigating is
  ArgEscape where the callee only reads fields.
- Project Valhalla's **JEP 401 (Value Objects, Preview)** and **JEP 539 (Strict Field
  Initialization, Preview)** are Integrated for **JDK 28** — previewable only on a JDK 28
  early-access build, not on 25, 26 or 27. **JEP 402 (Enhanced Primitive Boxing) is a
  Draft with no target release**, so it cannot be cited as scheduled. Code that depends on
  escape analysis to avoid allocation still does.
- Label any speedup figure taken from a composite or third-party case as such. Measure
  `gc.alloc.rate.norm` before and after on the same load rather than inferring it.

## References

- [The connection graph](references/connection-graph.md) — node and edge kinds, the
  propagation path from parse to escape state, what macro expansion does with each state,
  the rematerialisation descriptor mechanism, and how Graal's per-path materialisation
  differs. Read when explaining why a specific object received the state it did.
- [Diagnosing a failed elimination](references/diagnosing-elimination.md) — the flag table
  with corrected descriptions, the correct and incorrect `CompileCommand` forms, the JFR
  event matrix, and the step-by-step decision procedure with its checklists. Read while
  running an investigation.
