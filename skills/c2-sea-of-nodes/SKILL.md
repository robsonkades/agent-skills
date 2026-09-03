---
name: c2-sea-of-nodes
description: >
  How HotSpot actually executes and compiles: the runtime-generated template interpreter,
  C2's sea-of-nodes IR, a release-scoped diagnostic map of compilation phases, and why a given
  transformation fired or did not. Use when a method is believed to be "not optimised", when
  an allocation that looks eliminable still shows up in allocation profiling, when a hot
  call site reports `too large` or stays non-inlined, when `made not entrant` repeats on the
  same method, when someone prescribes `-XX:CompileThreshold` under tiered compilation, or
  when explaining why the JIT did not fix an O(n^2) loop. Does not cover the tiered
  pipeline, warm-up and code cache sizing (jit-compilation), reading the compiler's own
  decision logs end to end (compilation-and-inlining-logs), the emitted machine code
  (reading-jit-assembly), or the bytecode the compiler consumes (jvm-bytecode).
---

# C2 and the Sea-of-Nodes IR

## Purpose

Decide _why_ a compilation came out the way it did, from the mechanism rather than from
folklore. The failure this prevents is the confident non-fix: a runbook that sets
`-XX:CompileThreshold` under tiered compilation and changes nothing at all, or a
refactoring done because "the JIT will optimise it" when the JIT never performs
algorithmic changes.

Start with tier/version, call-site inlining and escape state, then follow the failing
transformation: type/profile stability, alias/memory dependencies, loop/range checks,
vectorization, macro expansion, matching, scheduling and register pressure can each own the
result. The phase model routes evidence; it is not a three-question completeness claim.

## Workflow

1. **Establish the compilation history before anything else.** Run
   `-Xlog:jit+compilation=debug`/`PrintCompilation` and correlate compilation ID, level, OSR,
   invalidation and timestamp. One tier-1/3 line does not prove the method's final/current
   state; later versions can coexist or be made non-entrant.
2. **If it is stuck in tier 3, compare real counters against the tier-4 thresholds**
   (`Tier4InvocationThreshold`, `Tier4CompileThreshold`) rather than assuming a compiler bug.
3. **If it reached tier 4, check inlining on the hot call site** with `-XX:+PrintInlining`,
   reading the **tier-4** tree, not the tier-3 one above it. C2 names the limit it applied:
   `too big` is `MaxInlineSize` at a cold site, `hot method too big` is `FreqInlineSize`,
   `already compiled into a big method` is `InlineSmallCode`, `inlining too deep` is
   `MaxInlineLevel`. `callee is too large` is C1's verdict and says nothing about C2.
4. **If an allocation appears to survive, get the escape evidence before theorising.** On a **debug
   build**, `-XX:+PrintEscapeAnalysis` with `-XX:+PrintEliminateAllocations` answers two
   different questions; both are `develop` flags, so a product JVM refuses to start on
   them. On a shipping runtime use differential checks instead — allocation profiles are
   sampled and absence is not proof. Compare normalized allocated bytes/events under
   controlled compilation and use generated code/IR where justified. `ArgEscape` — passed to a call that was
   not inlined — normally remains heap-allocated even when the callee never stores the
   reference.
5. **If `made not entrant: uncommon trap` recurs on the same method, treat it as
   deoptimisation**, not as a threshold to tune. `made not entrant: not used` is the tier-3
   code being retired by the tier-4 version and is normal. Investigate with
   `-Xlog:deoptimization=debug` or the JFR `jdk.Deoptimization` event first.
6. **Isolate one factor at a time in a disposable experiment** before attributing a cost:
   process-wide `-XX:-DoEscapeAnalysis`, `-XX:-EliminateAllocations`, `-XX:-Inline` and
   `-XX:TieredStopAtLevel=1` radically change compilation and are not production fixes. See
   `references/jit-diagnosis-recipes.md`.
7. **Confirm every number against the runtime you are actually on** with
   `-XX:+PrintFlagsFinal -version`, then measure any change with JMH — never with an
   isolated `System.nanoTime()`.

## Rules

- Tiered compilation is the default on every supported release including JDK 25. Under it
  `-XX:CompileThreshold` is accepted **without error and without effect**. Never prescribe
  it. Treat tier-specific thresholds and `CompileThresholdScaling` as broad diagnostic
  experiments whose profile quality, compile CPU/queue and code-cache costs must be measured.
- There are five numbered levels (0-4). A common hot path is 0 → 3 → 4, while policy can use
  levels 1/2 and OSR separately. Thresholds scale with queue pressure (`Tier3LoadFeedback`, `Tier4LoadFeedback`),
  so under a start-up burst a method can sit below a threshold that its counters would have
  cleared on an idle JVM.
- The JIT does inlining, constant folding, escape analysis and vectorisation. It does **not**
  change algorithms (O(n²) stays O(n²)), does not swap a `List` for a `Map`, and does not
  remove I/O or a query. Do not assume repeated string concatenation, collection choice or
  asymptotic complexity will be redesigned across loop iterations.
- Escape analysis has three states — `NoEscape`, `ArgEscape`, `GlobalEscape` — not a binary.
  Only `NoEscape` gets full scalar replacement.
- Inlining is a precondition for escape analysis reaching its best result: after inlining the
  call boundary is gone, so an argument-passed object can be reclassified `NoEscape`.
- Receiver-type width, probability, compiler profile limits and speculative guards determine
  polymorphic inlining. Three observed types is a useful megamorphic warning on common builds,
  not a language-level cutoff. Do not change extensibility to `final` without showing the
  target call-site decision and architectural/API consequence.
- Escape analysis/scalar replacement occur before matching in the inspected C2 pipeline; phase
  numbering is a teaching model and internal passes can be repeated/reordered across releases.
  A successfully eliminated allocation has no allocation instruction in final machine code.
- C2's register allocator is **graph colouring, Chaitin-Briggs** (`opto/chaitin.cpp`). Linear
  scan is C1's technique. Do not describe C2 as linear scan.
- Strip mining supports safepoint polling in counted loops and interacts with loop optimization.
  On verified JDK 25.0.3, `UseCountedLoopSafepoints` is true for G1/ZGC/Shenandoah and false
  for Parallel/Serial — not one JDK-wide default.
- `DoEscapeAnalysis` has defaulted to `true` since JDK 6 Update 23 (~2010). Any material
  presenting it as a recent feature is out of date.
- Do not write a parser against `PrintEscapeAnalysis` / `PrintEliminateAllocations` output —
  it is internal compiler diagnostics and the exact strings vary between builds. Read it, then
  cross-check against the source of the method.
- In production, use allocation-rate/profile deltas as evidence, accounting for sampling,
  TLAB/outside-TLAB coverage, compilation state and workload. Absence of a sampled allocation
  cannot by itself confirm scalar replacement.
- A benchmark whose result is neither returned nor consumed by a `Blackhole` can have its whole
  body removed by dead code elimination. That is the default failure mode of any measurement in
  this area, not an edge case.
- Aggregate CPU overhead and p99 latency are different quantities. Never derive one from the
  other without an explicit queueing model.

## Decision/validation checklist

- Pin JDK vendor/update, compiler (C2 versus JVMCI), flags, compilation ID/level and profile
  maturity; reproduce after warm-up and after deoptimization/recompilation.
- State whether evidence is bytecode, ideal graph, compiler log, assembly, allocation sample or
  benchmark. Each can falsify different hypotheses and none substitutes for all others.
- Test semantic edge cases before refactoring for the compiler: exceptions, overflow, NaN,
  aliasing, concurrency/publication and uncommon paths can be the guards preventing an opt.
- Validate end-to-end throughput/tail/CPU/code-cache effects. A microbenchmark win under forced
  directives is not authorization for a process-wide production flag.

## References

- [C2 phases and the IR](references/c2-phases-and-ir.md) — the five tiers, the seven-phase
  pipeline, the three edge types of the sea-of-nodes graph, the inlining size limits and the
  three escape states, as tables. Read when you need to say _where_ in the pipeline a decision
  was made, or which limit a specific inlining verdict came from.
- [JIT diagnosis recipes](references/jit-diagnosis-recipes.md) — the exact flag combinations
  for tier, inlining and escape diagnosis, the factor-isolation runs, and the correct threshold
  tuning flags. Read when you are about to run the JVM to answer one of these questions.

Authoritative sources: [OpenJDK C2 sources](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/opto),
[HotSpot compiler control](https://docs.oracle.com/en/java/javase/25/vm/compiler-control.html),
and [JEP 165: Compiler Control](https://openjdk.org/jeps/165).
