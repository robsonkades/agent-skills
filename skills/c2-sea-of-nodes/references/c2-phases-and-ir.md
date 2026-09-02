# C2 phases, tiers and the ideal graph

Every table here is a default on the JDK 25 baseline (Temurin 25.0.3, `-XX:+PrintFlagsFinal`).
Confirm any number against the runtime you are reasoning about before it becomes a production
decision — patch releases can move values without changing the structure.

## The five tiers

| Tier | Compiler              | Profiling collected                        | Role                                                      |
| ---- | --------------------- | ------------------------------------------ | --------------------------------------------------------- |
| 0    | Interpreter           | Invocation/backedge counters, type profile | Entry point for every method; feeds the compile decision  |
| 1    | C1, no profiling      | none                                       | **Terminal** for trivial methods — never reprofiled       |
| 2    | C1, limited profiling | invocation/backedge only                   | Fast transition state used when the C2 queue is congested |
| 3    | C1, full profiling    | branch and type profile                    | Stepping stone — produces the data C2 needs for tier 4    |
| 4    | C2                    | —                                          | Peak code, all C2 optimisations applied                   |

Threshold flags governing the transitions:

```
-XX:Tier3InvocationThreshold=200      # eligibility for tier 3
-XX:Tier3MinInvocationThreshold=100
-XX:Tier3CompileThreshold=2000        # invocation + backedge combined
-XX:Tier3BackEdgeThreshold=60000      # OSR into tier 3
-XX:Tier4InvocationThreshold=5000     # eligibility for tier 4
-XX:Tier4MinInvocationThreshold=600
-XX:Tier4CompileThreshold=15000
-XX:Tier4BackEdgeThreshold=40000      # OSR into tier 4
-XX:TieredStopAtLevel=4               # 1 = C1 only: no profiling, no C2, one code heap
```

`-XX:Tier0InvokeNotifyFreqLog` is a base-2 logarithmic exponent, not a direct invocation
count. Do not restate it as "every N calls"; read its meaning from `PrintFlagsFinal`.

### Back-off under load

The thresholds are not constants at runtime (`compilationPolicy.cpp`). Each is multiplied by
`1 + queue_length / (TierNLoadFeedback × compiler_thread_count)` — `Tier3LoadFeedback=5`,
`Tier4LoadFeedback=3` — so a congested compile queue raises the bar instead of growing the
queue without bound. Separately, when the C2 queue holds more than `Tier3DelayOn=5` tasks per
C2 thread, new compilations are sent to tier 2 (C1, counters only) rather than tier 3, and
return to tier 3 once it drops below `Tier3DelayOff=2`. That is the only reason tier 2 appears
in a log, and it is why a start-up burst shows methods "stuck" at tier 2 or 3 with counters
that look sufficient: the thresholds were temporarily higher. Read the queue with
`jcmd <pid> Compiler.queue` or the JFR `jdk.CompilerQueueUtilization` event
(`queueSize`, `peakQueueSize`, `compilerThreadCount`).

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

The refusal text is the limit's name in disguise. These are the exact strings C2 prints under
`-XX:+PrintInlining` (`bytecodeInfo.cpp`, confirmed on Temurin 25.0.3):

| Flag                      | Default                        | Effect                                                               | Refusal printed                       |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------- | ------------------------------------- |
| `MaxInlineSize`           | 35 bytecode bytes              | Larger callees are inlined only at a hot site                        | `too big`                             |
| `FreqInlineSize`          | 325 bytecode bytes             | Ceiling even at a hot site                                           | `hot method too big`                  |
| `InlineSmallCode`         | 2500 bytes of **machine code** | A callee that already has an nmethod larger than this is not inlined | `already compiled into a big method`  |
| `MaxInlineLevel`          | 15 (C1: `C1MaxInlineLevel` 9)  | Maximum nested inlining depth                                        | `inlining too deep`                   |
| `MaxRecursiveInlineLevel` | 1                              | Recursion: only one level is inlined                                 | `recursive inlining is too deep`      |
| —                         | —                              | Megamorphic or unprofiled receiver: size never considered            | `virtual call`, `no static binding`   |
| —                         | —                              | Callee class not yet loaded or resolved at compile time              | `not inlineable` after `(not loaded)` |
| `C1MaxInlineSize`         | 35 (C1 only)                   | C1's own limit, printed in **tier 2/3** trees, not a C2 verdict      | `callee is too large`                 |

A verdict is uninterpretable until you know which compiler printed it. `PrintInlining` emits
a tree for every compilation, and a tier-3 tree says `callee is too large` for anything over
35 bytes regardless of hotness; the C2 tree for the same caller, a few lines later, says
`inline (hot)` for the same callee. Read the tier column of the compilation line the tree hangs
from before reading the tree. A hot 40-byte callee refused with `inlining too deep` or
`virtual call` is a depth or polymorphism problem, not a size problem.

`InlineSmallCode` is the limit people forget: it is measured in machine-code bytes of the
callee's existing nmethod, so a callee that was compiled first and grew large (unrolling,
vectorisation) blocks its own inlining later, and with it every escape-analysis result that
depended on the call boundary disappearing.

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

- **`made not entrant: <reason>`** — no new call enters this code; threads already inside
  finish normally. JDK 25 prints the reason. `not used` is the normal 0 → 3 → 4 promotion
  retiring the tier-3 code; `OSR invalidation of lower level` is the same for OSR code;
  `uncommon trap` is a deoptimisation; `marked for deoptimization` is a dependency — class
  loading, `RedefineClasses` — invalidated from outside. Only the last two are worth a second
  look.
- **`made zombie` no longer exists.** The sweeper thread and the zombie state were removed in
  JDK 20 (JDK-8290025). A not-entrant nmethod is unloaded by the GC once no frame references
  it, so reclaiming code cache is a GC event — `code-cache-segments` covers what that changed.

A thread stuck in a long loop with no internal safepoint keeps the old code alive; that is the
reverse direction that is not prompt.
