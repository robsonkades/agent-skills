# C2 phases, tiers and the ideal graph

Every table here is a default on the JDK 25 baseline (Temurin 25.0.3, `-XX:+PrintFlagsFinal`).
Confirm any number against the runtime you are reasoning about before it becomes a production
decision — patch releases can move values without changing the structure.

## The five tiers

| Tier | Compiler              | Profiling collected                        | Role                                                                 |
| ---- | --------------------- | ------------------------------------------ | -------------------------------------------------------------------- |
| 0    | Interpreter           | Invocation/backedge counters, type profile | Entry for ordinary executable bytecode; feeds policy                 |
| 1    | C1, no profiling      | none                                       | Often selected as sufficient for simple methods; inspect history     |
| 2    | C1, limited profiling | invocation/backedge only                   | Fast transition state used when the C2 queue is congested            |
| 3    | C1, full profiling    | branch and type profile                    | Stepping stone — produces the data C2 needs for tier 4               |
| 4    | C2                    | speculative dependencies/traps remain      | Optimizing compilation; transformations are eligible, not guaranteed |

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

`-XX:Tier0InvokeNotifyFreqLog` is a logarithmic notification control, not a direct “compile
after N calls” threshold. Its interaction with counters/policy must be read from target source.

### Back-off under load

The effective policy thresholds are not constants at runtime (`compilationPolicy.cpp`). On the
inspected build, queue feedback includes a factor shaped like
`1 + queue_length / (TierNLoadFeedback × compiler_thread_count)` — `Tier3LoadFeedback=5`,
`Tier4LoadFeedback=3` — so a congested compile queue can raise the bar instead of growing the
queue without bound. Separately, when the C2 queue holds more than `Tier3DelayOn=5` tasks per
C2 thread, new compilations are sent to tier 2 (C1, counters only) rather than tier 3, and
return to tier 3 once it drops below `Tier3DelayOff=2`. This is a common reason tier 2 appears
in a log; policy transitions, flags and release changes still need inspection. A start-up burst can show methods at tier 2 or 3 with counters
that look sufficient: the thresholds were temporarily higher. Read the queue with
`jcmd <pid> Compiler.queue` or the JFR `jdk.CompilerQueueUtilization` event
(`queueSize`, `peakQueueSize`, `compilerThreadCount`).

## Where the template interpreter fits

In the inspected HotSpot template interpreter, tier 0 uses generated machine-code handlers,
rather than a C `switch` loop. `TemplateTable` and `TemplateInterpreterGenerator` build
bytecode dispatch entries, including variants for top-of-stack states. Two consequences matter for
diagnosis:

- Profiling is distributed across generated paths: method entry updates invocation counters,
  backward branches update backedge counters, and virtual/interface call paths collect
  receiver profiles when profiling is enabled. Do not attribute all counters to every opcode.
- Generation can specialize handlers for the runtime CPU and VM configuration. This describes
  this HotSpot implementation, not every JVM interpreter or a limitation of all AOT code.

See the pinned [interpreter generator](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/interpreter/templateInterpreterGenerator.cpp)
and its [x86 entry implementation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/cpu/x86/templateInterpreterGenerator_x86.cpp).

## A seven-stage diagnostic map of the C2 pipeline

| #   | Phase     | What happens                                                                  |
| --- | --------- | ----------------------------------------------------------------------------- |
| 1   | Parse     | Bytecode to sea-of-nodes (ideal graph)                                        |
| 2   | Optimize  | Inlining, constant folding, dead code elimination, **escape analysis**        |
| 3   | IdealLoop | Loop unrolling, loop peeling, **strip mining**                                |
| 4   | CCP       | Conditional constant propagation — types and values along conditional paths   |
| 5   | Matcher   | Ideal nodes to machine nodes for the target CPU                               |
| 6   | RegAlloc  | Register allocation, **graph colouring (Chaitin-Briggs)**, `opto/chaitin.cpp` |
| 7   | Emit      | Final assembly generation                                                     |

This is a routing model, not a canonical exhaustive list: C2 performs repeated IGVN/loop and
late/macro/scheduling work, and source ordering evolves. Scalar replacement precedes matching
on this build, so an eliminated allocation does not become an allocation machine node.

Source of truth: OpenJDK `src/hotspot/share/opto/` — `compile.cpp` (pipeline), `escape.cpp`
(`ConnectionGraph`), `loopTransform.cpp` (loop transformations). `opto` is HotSpot's internal
name for the optimizing compiler.

## The ideal graph and its three edge types

The sea-of-nodes unifies the control graph and the data graph. Each operation is a node, and
every edge carries one of three meanings — **data**, **control**, **memory**. There is no
implicit fourth category for "order within a basic block".

An unpinned node with only data dependencies (a `CmpI`, say) can be scheduled within the
region permitted by its inputs and uses. This freedom does not remove dominance analysis
or dedicated loop transformations: C2's global code motion uses dominators and loop depth
when choosing placement. Control and memory dependencies constrain motion, and trapping
operations must preserve exception behavior. Do not infer that source-level loop hoisting
is legal merely because the IR is a sea of nodes.

Implementation reference: [OpenJDK 25.0.3+9 global code motion](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/opto/gcm.cpp).

## Inlining limits

The refusal text is the limit's name in disguise. These are the exact strings C2 prints under
`-XX:+PrintInlining` (`bytecodeInfo.cpp`, confirmed on Temurin 25.0.3):

| Flag                      | Default                         | Effect                                                            | Refusal printed                       |
| ------------------------- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `MaxInlineSize`           | 35 bytecode bytes               | Base bytecode-size allowance                                      | `too big`                             |
| `FreqInlineSize`          | 325 bytecode bytes              | Larger allowance for eligible sites                               | `hot method too big`                  |
| `InlineSmallCode`         | 2500 adjusted instruction bytes | Eligible compiled-code size gate                                  | `already compiled into a big method`  |
| `MaxInlineLevel`          | 15 (C1: `C1MaxInlineLevel` 9)   | Maximum nested inlining depth                                     | `inlining too deep`                   |
| `MaxRecursiveInlineLevel` | 1                               | Recursion: only one level is inlined                              | `recursive inlining is too deep`      |
| —                         | —                               | Megamorphic or unprofiled receiver: size never considered         | `virtual call`, `no static binding`   |
| —                         | —                               | Callee class not yet loaded or resolved at compile time           | `not inlineable` after `(not loaded)` |
| `C1MaxInlineSize`         | 35 (C1 only)                    | C1's own limit, printed in **tier 1/2/3** trees, not a C2 verdict | `callee is too large`                 |

A verdict needs its compiler and compilation identity. In the recipe's example, C1 refuses
the 85-byte callee with `callee is too large`; C2 later says `inline (hot)` for that callee.
This is not a promise that C2 will inline every method C1 refused. Read the tier column of the compilation line the tree hangs
from before reading the tree. A hot 40-byte callee refused with `inlining too deep` or
`virtual call` is a depth or polymorphism problem, not a size problem.

On the inspected build, C2 can select the larger allowance for a frequent site, unboxing,
or an eligible constructor under escape analysis. Neither `inline (hot)` nor
`hot method too big` alone proves site frequency; the former is generic success text.
Independent legality and profitability gates still apply.

`InlineSmallCode` compares the callee's adjusted compiled instruction-size metric, not its
total nmethod or `Compiler.codelist` address span. The inspected
`ciMethod::inline_instructions_size()` uses the eligible nmethod's instruction end minus
its verified entry and skipped instructions. A larger compiled callee can block later
inlining and escape-analysis opportunities that depend on removing that call boundary.

Implementation references: [C2 allowance selection](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/opto/bytecodeInfo.cpp)
and [the compiled instruction-size metric](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/ci/ciMethod.cpp).

## The three escape states

| State          | Definition                                                                             | Consequence                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NoEscape`     | Does not escape the analyzed method or thread and is not passed to a remaining call    | Eligible for scalar replacement; not proof that elimination succeeded                                         |
| `ArgEscape`    | Passed as an argument to a call, but not persistently stored by it                     | Usually still heap-allocated: the non-inlined call boundary blocks scalar replacement. Enables lock elision   |
| `GlobalEscape` | Escapes the analyzed method or thread, including a store into globally reachable state | Normally remains heap-allocated; a store into another non-escaping object alone does not establish this state |

`ArgEscape` is often misread. An object passed across a call C2 cannot analyze inline is
normally blocked from scalar replacement by that boundary. Inspect compiler evidence rather
than treating the state label as a Java semantic guarantee.

`NoEscape` and scalar replaceability are separate properties. Unsupported uses, array size
or field reconstruction constraints can prevent elimination even without escape. Inspect
the elimination result and failed condition before changing source. The analyzed method
includes inlined callees, so returning an object from an inlined helper need not make it
escape the caller's compilation.

Implementation references: [OpenJDK 25.0.3+9 escape states and scalar-replaceable flag](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/opto/escape.hpp)
and [allocation elimination checks](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/opto/macro.cpp).

## Strip mining

Introduced by JDK-8186027 in JDK 10, for safepoints — not for SIMD. A fully unrolled or
vectorised counted loop can run a long time with no safepoint, which stalls every
stop-the-world operation behind that one thread. Strip mining splits the loop into a short
outer loop carrying a cheap safepoint check per strip, and a fully optimised inner loop with
no per-iteration safepoint cost. The feature arrived in JDK 10; on verified JDK 25.0.3 its
default is collector-dependent (true for G1/ZGC/Shenandoah, false for Parallel/Serial).

The trade-off is the familiar one: less per-iteration checking cost, slightly higher latency
before the thread actually reaches a requested global safepoint.

## nmethod lifecycle states in PrintCompilation

- **`made not entrant: <reason>`** — new normal calls no longer enter this code. Existing
  activations can continue when valid, or be deoptimized if their assumptions fail;
  the state transition alone does not prove what happened to active frames.
  JDK 25 prints the reason. `not used` commonly accompanies normal 0 → 3 → 4 promotion
  retiring the tier-3 code; `OSR invalidation of lower level` is the same for OSR code;
  `uncommon trap` is a deoptimisation; `marked for deoptimization` is a dependency — class
  loading, `RedefineClasses` — invalidated from outside. Correlate the reason with the
  replacement compilation and deoptimization events before attributing a regression.

  See [OpenJDK 25.0.3+9 nmethod transitions](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/code/nmethod.cpp).

- **`made zombie` no longer exists.** The sweeper thread and the zombie state were removed in
  JDK 20 (JDK-8290025). A not-entrant nmethod is unloaded by the GC once no frame references
  it, so reclaiming code cache is a GC event — `code-cache-segments` covers what that changed.

A thread stuck in a long loop with no internal safepoint keeps the old code alive; that is the
reverse direction that is not prompt.
