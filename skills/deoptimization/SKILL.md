---
name: deoptimization
description: >
  Deoptimisation and recompilation on HotSpot: uncommon traps and their reason codes,
  the reinterpret / make_not_entrant / make_not_compilable actions, jdk.Deoptimization in
  JFR, -XX:+TraceDeoptimization, the per-method recompilation cutoffs, and diagnosing a
  method that never stabilises. Use when a method repeatedly shows "made not entrant" in the
  compilation log, when latency spikes correlate with class loading or a deploy, when a
  feature flag or APM agent is suspected of invalidating compiled code, when someone
  proposes raising PerMethodRecompilationCutoff, or when -Xlog:jit+deoptimization produced
  an empty file. Does not cover the tiered pipeline and warm-up (jit-compilation), reading
  the compilation log itself (compilation-and-inlining-logs), or C2's internal
  representation (c2-sea-of-nodes).
---

# Deoptimization

## Purpose

Decide whether a deoptimisation is the JIT working correctly or a method that will never
reach stable optimised code. Speculation is what makes C2 fast: it bets on a profiled
assumption, embeds a check, and unwinds without ever producing a wrong result when the bet
fails. A single unwind followed by recompilation and stabilisation is the design working.

The failure this prevents is both directions of the same mistake — alerting on every
`jdk.Deoptimization` event until the alert is ignored, and raising a recompilation cutoff so
the JVM takes longer to give up on a method whose underlying assumption keeps changing.

## Workflow

1. **Establish whether the question is one method or a post-deploy pattern**, and fix a
   reference window (a deploy, a config change, a library rollout) to correlate against.
2. **Collect the reason and the method**, not just the fact. JFR `jdk.Deoptimization` for
   continuous production, `-Xlog:deoptimization=debug` for a session. See
   `references/deopt-tooling.md`.
3. **Group events by method and by time window.** The criterion is recurrence, not presence:
   does the count fall to zero after the first recompilation burst, or persist indefinitely?
   There is no documented universal percentage that separates normal from pathological.
4. **For a `class_check`, decide which of the two routes it took.** A simultaneous burst
   across unrelated methods is a CHA dependency invalidated by class loading — no application
   bytecode ran to trigger it. Recurrence at one call site over time is a per-invocation guard
   failing. The mitigations differ.
5. **Attack the assumption, not the threshold.** `final` types on critical call sites,
   warm-up that exercises every expected concrete type, splitting an oscillating branch into
   separately compiled methods. See `references/reasons-and-actions.md`.
6. **Validate on the deoptimisation signal, not on latency.** Confirm through
   `jdk.Deoptimization` or `-Xlog:deoptimization` that the target method stopped
   deoptimising, and remove every diagnostic flag afterwards.

## Rules

- The correct log invocation is `-Xlog:deoptimization=debug:file=deopt.log`. The tag
  `jit+deoptimization` does not exist, and level `info` does not emit the uncommon-trap
  messages. Verify the produced file is non-empty before depending on it.
- `jdk.Deoptimization` exists since JDK 14. The method is reached as `method.type.name` and
  `method.name`; there is **no** `topFrame` field on this event, and asking for one throws
  `IllegalArgumentException` at runtime.
- `reason` and `action` answer different questions. `reason` is the cause
  (`class_check`, `null_check`, `range_check`, `div0_check`, `unstable_if`,
  `speculate_class_check`, `intrinsic`); `action` is the runtime's response, in increasing
  cost: `reinterpret`, `make_not_entrant`, `make_not_compilable`.
- Reason names come from HotSpot's internal `DeoptReason` enum, not from the JVM
  specification, and can vary between updates. Confirm any name a triage script depends on
  against a real collection: `jfr print --events jdk.Deoptimization <file> | grep reason`.
- `make_not_compilable` is permanent until restart and is reached only after repeated
  deoptimisations at the same point — never on a first failed assumption.
- Raising `PerMethodRecompilationCutoff` or `PerBytecodeRecompilationCutoff` postpones
  `make_not_compilable` without making the method converge. Read their values with
  `-XX:+PrintFlagsFinal | grep RecompilationCutoff`; they change between releases.
- Do not confuse `jdk.CompilationFailure` (the compiler never produced code) with
  `jdk.Deoptimization` (code was produced and later invalidated). Seeing both for the same
  method suggests something worse than either alone — pathologically complex, likely
  generated, bytecode.
- Do not evaluate a mutable feature flag inside the hot path. If C2 speculates on the result
  through inlining and the value keeps changing in production, the result is recurring
  `unstable_if`.
- Suspect reflection-based APM and monitoring agents when a burst of `class_check` hits call
  sites unrelated to what the agent was meant to observe — loading an unexpected type
  invalidates CHA dependencies far from the cause.
- `RedefineClasses` (HotSwap, some instrumentation agents) invalidates **every** nmethod
  referencing the redefined class, including any that inlined it — broader than a single CHA
  dependency, because the class identity itself changed.
- Budget scalar replacement into the cost: a method with aggressively eliminated allocations
  is more expensive to deoptimise, because each scalar-replaced object must be rematerialised
  on the heap during frame reconstruction. That is a reason to care about recurrence, not a
  reason to disable `EliminateAllocations`.
- `-XX:+TraceDeoptimization` requires `-XX:+UnlockDiagnosticVMOptions` and is far more verbose
  than unified logging. It is a one-off deep session, never continuous production.

## References

- [Reasons, actions and mitigations](references/reasons-and-actions.md) — the reason and
  action tables with their expected temporal signatures, the two routes into a
  class-loading deoptimisation, and the mitigation strategies in order of preference. Read
  when you have a reason code and need to decide what it means and what to change.
- [Deoptimisation tooling](references/deopt-tooling.md) — which tool answers which need, the
  JFR reading code with the real field paths, the unified-logging invocation, and how to
  correlate deoptimisation timestamps with latency spikes. Read before instrumenting a
  process or writing a script against deoptimisation data.
