# C2 phases, tiers and the ideal graph

Every table here is a default on the JDK 25 baseline. Confirm any number against
`-XX:+PrintFlagsFinal -version` on the runtime you are reasoning about before it becomes a
production decision — patch releases can move values without changing the structure.

## The five tiers

| Tier | Compiler              | Profiling collected                        | Role                                                      |
| ---- | --------------------- | ------------------------------------------ | --------------------------------------------------------- |
| 0    | Interpreter           | Invocation/backedge counters, type profile | Entry point for every method; feeds the compile decision  |
| 1    | C1, no profiling      | none                                       | **Terminal** for trivial methods — never reprofiled       |
| 2    | C1, limited profiling | invocation/backedge only                   | Fast transition state used when the C1 queue is congested |
| 3    | C1, full profiling    | branch and type profile                    | Stepping stone — produces the data C2 needs for tier 4    |
| 4    | C2                    | —                                          | Peak code, all C2 optimisations applied                   |

Threshold flags governing the transitions:

```
-XX:Tier3InvocationThreshold=200      # eligibility for tier 3
-XX:Tier3MinInvocationThreshold=100
-XX:Tier3CompileThreshold=2000        # invocation + backedge combined
-XX:Tier4InvocationThreshold=5000     # eligibility for tier 4
-XX:Tier4MinInvocationThreshold=600
-XX:Tier4CompileThreshold=15000
```

`-XX:Tier0InvokeNotifyFreqLog` is a base-2 logarithmic exponent, not a direct invocation
count. Do not restate it as "every N calls"; read its meaning from `PrintFlagsFinal`.

## Where the template interpreter fits

Tier 0 is not a C `switch` and not computed goto. HotSpot generates one block of raw assembly
per opcode (200+ of them) at JVM start-up, via its own built-in assembler (`TemplateTable`,
`InterpreterGenerator`), into a dispatch table indexed by opcode. Two consequences matter for
diagnosis:

- Each handler is born with the profiling counters already embedded — `invocation_counter`,
  `backedge_counter`, and the type profile per `invokevirtual`/`invokeinterface` call site.
  That type profile is the database C2 later uses for speculative inlining.
- Handlers can be specialised for the actual CPU the JVM boots on, which an interpreter
  compiled once ahead of time cannot do.

## The seven C2 phases

| #   | Phase     | What happens                                                                  |
| --- | --------- | ----------------------------------------------------------------------------- |
| 1   | Parse     | Bytecode to sea-of-nodes (ideal graph)                                        |
| 2   | Optimize  | Inlining, constant folding, dead code elimination, **escape analysis**        |
| 3   | IdealLoop | Loop unrolling, loop peeling, **strip mining**                                |
| 4   | CCP       | Conditional constant propagation — types and values along conditional paths   |
| 5   | Matcher   | Ideal nodes to machine nodes for the target CPU                               |
| 6   | RegAlloc  | Register allocation, **graph colouring (Chaitin-Briggs)**, `opto/chaitin.cpp` |
| 7   | Emit      | Final assembly generation                                                     |

The phase number answers most "why can I not see it" questions. Scalar replacement happens in
phase 2; the Matcher in phase 5 never sees an allocation for that object.

Source of truth: OpenJDK `src/hotspot/share/opto/` — `compile.cpp` (pipeline), `escape.cpp`
(`ConnectionGraph`), `loopTransform.cpp` (loop transformations). `opto` is HotSpot's internal
name for the optimizing compiler.

## The ideal graph and its three edge types

The sea-of-nodes unifies the control graph and the data graph. Each operation is a node, and
every edge carries one of three meanings — **data**, **control**, **memory**. There is no
implicit fourth category for "order within a basic block".

That absence is the whole point. A node with only data dependencies (a `CmpI`, say) can float
to any point compatible with its real dependencies, so hoisting, sinking and loop-invariant
code motion fall out of scheduling rather than needing separate, fragile passes. In a
conventional CFG with SSA, moving an instruction between blocks requires explicit dominance
analysis.

## Inlining limits

| Flag                      | Default   | Effect                                                         |
| ------------------------- | --------- | -------------------------------------------------------------- |
| `MaxInlineSize`           | 35 bytes  | Bytecode up to this size: inlined unconditionally              |
| `FreqInlineSize`          | 325 bytes | Bytecode up to this size: inlined only if the call site is hot |
| `MaxInlineLevel`          | 9         | Maximum nested inlining depth                                  |
| `MaxRecursiveInlineLevel` | 1         | Recursion: only one level is inlined                           |

A `too large` verdict is uninterpretable until you know which of the first two applied, and
that depends on whether the call site was hot. A hot call site rejected at 40 bytes is not a
size problem; it is a depth problem (`MaxInlineLevel`) or a polymorphism problem.

## The three escape states

| State          | Definition                                                                                    | Consequence                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NoEscape`     | Does not escape the method and is unreachable outside the allocating thread                   | Full **scalar replacement** — removed from the graph, fields become independent values or registers         |
| `ArgEscape`    | Passed as an argument to a call, but not persistently stored by it                            | Usually still heap-allocated: the non-inlined call boundary blocks scalar replacement. Enables lock elision |
| `GlobalEscape` | Stored in a field, returned, thrown, or otherwise reachable outside the local scope or thread | Normal heap allocation; no EA optimisation beyond possible partial lock elision                             |

`ArgEscape` is the state most often misread. An object passed to a method that was **not**
inlined always pays a real heap allocation, even when that method never keeps a reference. The
only way out is to make the compilation boundary disappear via inlining.

## Strip mining

Introduced by JDK-8186027 in JDK 10, for safepoints — not for SIMD. A fully unrolled or
vectorised counted loop can run a long time with no safepoint, which stalls every
stop-the-world operation behind that one thread. Strip mining splits the loop into a short
outer loop carrying a cheap safepoint check per strip, and a fully optimised inner loop with
no per-iteration safepoint cost. `-XX:+UseCountedLoopSafepoints`, default `true` since JDK 10.

The trade-off is the familiar one: less per-iteration checking cost, slightly higher latency
before the thread actually reaches a requested global safepoint.

## nmethod lifecycle states in PrintCompilation

- **`made not entrant`** — no new call enters this code; threads already inside finish
  normally. Happens on tier promotion (recompilation) and on deoptimisation.
- **`made zombie`** — no live activation remains on any stack; the sweeper may reclaim it from
  the code cache.

Every `made zombie` was `made not entrant` first. The reverse is not prompt: a thread stuck in
a long loop with no internal safepoint keeps the old code alive.
