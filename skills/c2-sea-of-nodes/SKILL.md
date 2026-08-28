---
name: c2-sea-of-nodes
description: >
  How HotSpot actually executes and compiles: the runtime-generated template interpreter,
  C2's sea-of-nodes IR, the seven compilation phases and their order, and why a given
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

Every optimisation question here reduces to one of three: which tier is this method in,
did the call site inline, and what escape state did C2 assign the allocation. The IR and
the phase order tell you which question is even answerable — an object proved `NoEscape`
disappears in phase 2 (Optimize) and never becomes a machine node, so no amount of
assembly reading will show you the allocation that was removed.

## Workflow

1. **Establish the tier before anything else.** Run `-XX:+PrintCompilation` and read the
   tier column, not merely whether the method appears. Tier 1 is a _terminal_ state for
   trivial methods, not a method that failed to heat up; tier 3 means C1-with-full-profiling
   and C2 has never seen it.
2. **If it is stuck in tier 3, compare real counters against the tier-4 thresholds**
   (`Tier4InvocationThreshold`, `Tier4CompileThreshold`) rather than assuming a compiler bug.
3. **If it reached tier 4, check inlining on the hot call site** with `-XX:+PrintInlining`.
   A `too large` verdict means checking which limit actually applied — `MaxInlineSize` for
   unconditional inlining, `FreqInlineSize` for hot call sites, or `MaxInlineLevel` for depth.
4. **If an allocation survives, get the escape state before theorising.** On a **debug
   build**, `-XX:+PrintEscapeAnalysis` with `-XX:+PrintEliminateAllocations` answers two
   different questions; both are `develop` flags, so a product JVM refuses to start on
   them. On a shipping runtime use the indirect check instead — an eliminated allocation
   does not appear in allocation profiling at all. `ArgEscape` — passed to a call that was
   not inlined — still allocates on the heap even when the callee never stores the
   reference.
5. **If `made not entrant` recurs on the same method, treat it as deoptimisation**, not as
   a threshold to tune. Investigate with `-XX:+TraceDeoptimization` or the JFR
   `jdk.Deoptimization` event first.
6. **Isolate one factor at a time** before attributing a cost: `-XX:-DoEscapeAnalysis`,
   `-XX:-EliminateAllocations`, `-XX:-Inline`, `-XX:TieredStopAtLevel=1`. See
   `references/jit-diagnosis-recipes.md`.
7. **Confirm every number against the runtime you are actually on** with
   `-XX:+PrintFlagsFinal -version`, then measure any change with JMH — never with an
   isolated `System.nanoTime()`.

## Rules

- Tiered compilation is the default on every supported release including JDK 25. Under it
  `-XX:CompileThreshold` is accepted **without error and without effect**. Never prescribe
  it; use `Tier3InvocationThreshold`, `Tier4InvocationThreshold`, or `CompileThresholdScaling`
  as the safer whole-ladder adjustment.
- There are five tiers (0-4), not three blocks. The normal path for a hot method is
  0 → 3 → 4. Tier 2 appears when the C1 queue is congested; tier 1 is terminal.
- The JIT does inlining, constant folding, escape analysis and vectorisation. It does **not**
  change algorithms (O(n²) stays O(n²)), does not swap a `List` for a `Map`, and does not
  remove I/O or a query. `result += "item" + i` in a loop is never rewritten into a
  `StringBuilder`.
- Escape analysis has three states — `NoEscape`, `ArgEscape`, `GlobalEscape` — not a binary.
  Only `NoEscape` gets full scalar replacement.
- Inlining is a precondition for escape analysis reaching its best result: after inlining the
  call boundary is gone, so an argument-passed object can be reclassified `NoEscape`.
- A call site that observes three or more concrete types is no longer inlinable, and every
  optimisation downstream of inlining is lost with it. If profiling shows one concrete type
  consistently, make it explicit with `final`.
- Scalar replacement of a `NoEscape` object happens in phase 2 (Optimize), **before** the
  Matcher (phase 5). The allocation never becomes a machine instruction — there is no
  "remove the allocation afterwards" step.
- C2's register allocator is **graph colouring, Chaitin-Briggs** (`opto/chaitin.cpp`). Linear
  scan is C1's technique. Do not describe C2 as linear scan.
- Strip mining exists to insert safepoints safely into counted loops, **not** to enable SIMD.
  `-XX:+UseCountedLoopSafepoints`, default `true` since JDK 10 (JDK-8186027).
- `DoEscapeAnalysis` has defaulted to `true` since JDK 6 Update 23 (~2010). Any material
  presenting it as a recent feature is out of date.
- Do not write a parser against `PrintEscapeAnalysis` / `PrintEliminateAllocations` output —
  it is internal compiler diagnostics and the exact strings vary between builds. Read it, then
  cross-check against the source of the method.
- Confirming scalar replacement in production is better done indirectly: an eliminated
  allocation simply does not appear in allocation profiling (async-profiler `-e alloc`, JFR
  `jdk.ObjectAllocationInNewTLAB`).
- A benchmark whose result is neither returned nor consumed by a `Blackhole` can have its whole
  body removed by dead code elimination. That is the default failure mode of any measurement in
  this area, not an edge case.
- Aggregate CPU overhead and p99 latency are different quantities. Never derive one from the
  other without an explicit queueing model.

## References

- [C2 phases and the IR](references/c2-phases-and-ir.md) — the five tiers, the seven-phase
  pipeline, the three edge types of the sea-of-nodes graph, the inlining size limits and the
  three escape states, as tables. Read when you need to say _where_ in the pipeline a decision
  was made, or which limit a specific inlining verdict came from.
- [JIT diagnosis recipes](references/jit-diagnosis-recipes.md) — the exact flag combinations
  for tier, inlining and escape diagnosis, the factor-isolation runs, and the correct threshold
  tuning flags. Read when you are about to run the JVM to answer one of these questions.
