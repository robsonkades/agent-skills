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
`-XX:CompileThreshold` in the default C1/C2 tiered mode and changes no compilation
threshold, or a refactoring that relies on the JIT to redesign an unsuitable algorithm.

Start with tier/version, call-site inlining and escape state, then follow the failing
transformation: type/profile stability, alias/memory dependencies, loop/range checks,
vectorization, macro expansion, matching, scheduling and register pressure can each own the
result. The phase model routes evidence; it is not a three-question completeness claim.

## Workflow

The authoring baseline is HotSpot C2 on JDK 25 (reference measurements use Temurin
25.0.3); these are implementation details, not Java language guarantees. Before running
recipes, inspect the project's toolchain, CI/runtime image and actual `java -version`,
including vendor/update, product versus debug build, compiler and effective flags.
Level 4 can be JVMCI rather than C2; route that compiler's internals to `graalvm-jit`.
Do not upgrade the target runtime or enable preview features to match this baseline.
For another release, check `java -Xlog:help` and flag availability first; unavailable
diagnostics require an alternative evidence source, not an assumed result.

1. **Establish the question and reuse existing evidence.** For a method-specific diagnosis,
   correlate existing `-Xlog:jit+compilation`/`PrintCompilation` records by compilation ID, level, OSR,
   invalidation and timestamp. One tier-1/3 line does not prove the method's final/current
   state; later versions can coexist or be made non-entrant. A method may execute inlined
   in callers without a standalone nmethod. Capture missing evidence only when it can change
   the diagnosis; an explanatory question need not trigger a new JVM run.
2. **If it is stuck in tier 3, inspect policy eligibility and compiler capacity.** Compare
   counters with effective tier-4 thresholds, including queue feedback, and check compilation
   exclusions/failures and CPU/code-cache constraints before assuming a compiler bug.
3. **If it reached tier 4, check inlining on the hot call site** with `-XX:+PrintInlining`,
   reading the **tier-4** tree, not the tier-3 one above it. C2 names the limit it applied:
   `too big` is `MaxInlineSize` at a cold site, `hot method too big` is `FreqInlineSize`,
   `already compiled into a big method` is `InlineSmallCode`, `inlining too deep` is
   `MaxInlineLevel`. `callee is too large` is C1's verdict and says nothing about C2.
4. **If an allocation appears to survive, get the escape evidence before theorising.** On a **debug
   build**, `-XX:+PrintEscapeAnalysis` with `-XX:+PrintEliminateAllocations` answers two
   different questions; both are `develop` flags, so a product JVM refuses to start on
   them. A product C2 `LogCompilation` task can record `eliminate_allocation`: match its
   method/BCI and inline context to the installed compilation ID. `escape-analysis-internals`
   owns this analysis; absence of that entry is inconclusive. Compare normalized allocated bytes/events under
   controlled compilation and use generated code/IR where justified. `ArgEscape` — passed to a call that was
   not inlined — normally remains heap-allocated even when the callee never stores the
   reference.
5. **If `made not entrant: uncommon trap` recurs on the same method, treat it as
   deoptimisation**, not as a threshold to tune; route recurring invalidation to `deoptimization`.
   `made not entrant: not used` commonly accompanies replacement, including tier-3 to tier-4
   promotion, but is not proof of that transition. Correlate the replacement/history. Investigate with
   `-Xlog:deoptimization=debug` where supported or the JFR `jdk.Deoptimization` event first;
   verify event availability and recording settings on the target runtime.
6. **Isolate one factor at a time in a disposable experiment** before attributing a cost:
   process-wide `-XX:-DoEscapeAnalysis`, `-XX:-EliminateAllocations`, `-XX:-Inline` and
   `-XX:TieredStopAtLevel=1` radically change compilation and are not production fixes. See
   `references/jit-diagnosis-recipes.md`.
7. **Confirm every number against the runtime you are actually on** with
   `-XX:+PrintFlagsFinal -version`. For a proposed change, use representative application
   validation and JMH when a microbenchmark isolates the question. A single timed invocation
   is insufficient. Keep adequate code when the refusal has no material measured cost;
   compare a scoped source change or diagnostic directive only when evidence warrants it.

## Rules

- In the default HotSpot C1/C2 tiered mode on the inspected JDK 25 build,
  `-XX:CompileThreshold` does not control compilation eligibility. Do not infer this from
  `TieredCompilation=true` alone: C1-only modes such as `TieredStopAtLevel=1` honor legacy
  thresholds on this build. Check effective mode/flags and target source. Treat tier-specific
  thresholds and `CompileThresholdScaling` as broad diagnostic
  experiments whose profile quality, compile CPU/queue and code-cache costs must be measured.
- There are five numbered levels (0-4). A common hot path is 0 → 3 → 4, while policy can use
  levels 1/2 and OSR separately. Thresholds scale with queue pressure (`Tier3LoadFeedback`, `Tier4LoadFeedback`),
  so under a start-up burst a method can sit below a threshold that its counters would have
  cleared on an idle JVM.
- The JIT does inlining, constant folding, escape analysis and vectorisation; legal loop
  elimination can change the amount of executed work. Do not rely on it to replace a poor
  algorithm or collection choice, eliminate required I/O, or combine application queries.
  Validate complexity and observable behavior rather than assuming either universal
  algorithm redesign or that every source-level iteration must remain in machine code.
- Escape analysis has three states — `NoEscape`, `ArgEscape`, `GlobalEscape` — not a binary.
  `NoEscape` is necessary for C2's scalar replacement of an allocation, not sufficient:
  scalar replaceability and elimination must also succeed. A surviving allocation does
  not prove escape, and storing into a field of another non-escaping object does not
  automatically imply `GlobalEscape`.
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

- If source, compilation identity or runtime evidence is missing, state the gap and the
  smallest capture that can resolve it. Keep the proposed cause conditional; do not
  recommend an inlining/threshold flag as a confirmed fix from source shape alone.
- Pin JDK vendor/update, compiler (C2 versus JVMCI), flags, compilation ID/level and profile
  maturity; reproduce after warm-up and after deoptimization/recompilation.
- State whether evidence is bytecode, ideal graph, compiler log, assembly, allocation sample or
  benchmark. Each can falsify different hypotheses and none substitutes for all others.
- For graph comparisons, identify the compilation and phase: node IDs can be renumbered,
  and an absent `Allocate` after macro expansion can mean lowering rather than elimination.
- Test semantic edge cases before refactoring for the compiler: exceptions, overflow, NaN,
  aliasing, concurrency/publication and uncommon paths can be the guards preventing an opt.
- Validate end-to-end throughput/tail/CPU/code-cache effects. A microbenchmark win under forced
  directives is not authorization for a process-wide production flag.

Deliver the relevant compile ID and artifact location, the observed decision, the inferred
blocking mechanism, and one confirming or falsifying check. For a proposed change, include
the semantic constraints and before/after metric; say explicitly when it remains untested.

## References

- [C2 phases and the IR](references/c2-phases-and-ir.md) — the five tiers, the seven-phase
  diagnostic map, control/value/memory dependencies, precedence edges and alias slices,
  the inlining size limits and the three escape states. Read when locating a decision in
  the pipeline, interpreting graph changes, or identifying an inlining refusal's limit.
- [JIT diagnosis recipes](references/jit-diagnosis-recipes.md) — the exact flag combinations
  for tier, inlining and escape diagnosis, the factor-isolation runs, and the correct threshold
  tuning flags. Read when you are about to run the JVM to answer one of these questions.

Authoritative sources: [OpenJDK 25.0.3+9 C2 sources](https://github.com/openjdk/jdk25u/tree/jdk-25.0.3%2B9/src/hotspot/share/opto),
[HotSpot compiler control](https://docs.oracle.com/en/java/javase/25/vm/compiler-control1.html),
and [JEP 165: Compiler Control](https://openjdk.org/jeps/165).
