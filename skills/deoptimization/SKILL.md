---
name: deoptimization
description: >
  Deoptimisation and recompilation on HotSpot: uncommon traps and their reason codes, the
  none / maybe_recompile / reinterpret / make_not_entrant / make_not_compilable actions,
  jdk.Deoptimization in JFR, -XX:+TraceDeoptimization, the per-method trap limits and
  recompilation cutoffs, and diagnosing a method that never stabilises. Use when a method
  repeatedly shows "made not entrant" in the compilation log, when latency spikes correlate
  with class loading or a deploy, when a burst of "marked for deoptimization" follows a deploy
  or a plugin load, when a feature flag or APM agent is suspected of invalidating compiled
  code, when "made not compilable" or a flood of action "none" appears for a hot method, when
  someone proposes raising PerMethodRecompilationCutoff, or when -Xlog:jit+deoptimization
  produced an empty file. Does not cover the tiered pipeline and warm-up (jit-compilation),
  reading the compilation log itself (compilation-and-inlining-logs), or C2's internal
  representation (c2-sea-of-nodes).
---

# Deoptimization

## Purpose

Decide whether a deoptimisation is the JIT working correctly or a method that will never
reach stable optimised code. Speculation is what makes C2 fast: it bets on a profiled
assumption, embeds a check, and unwinds without ever producing a wrong result when the bet
fails. The bet is recorded in the method's profile, and the next compilation does not make
it again — so a single unwind followed by a recompilation that stays is the design working,
and it is the overwhelmingly common outcome.

The failure this prevents is both directions of the same mistake — alerting on every
`jdk.Deoptimization` event until the alert is ignored, and raising a recompilation cutoff so
the JVM takes longer to give up on a method whose underlying assumption keeps changing.

## Workflow

1. **Establish whether the question is one method or a post-deploy pattern**, and fix a
   reference window (a deploy, a config change, a library or plugin rollout) to correlate
   against.
2. **Collect the reason, the action and the compile id**, not just the fact. JFR
   `jdk.Deoptimization` (on in `default.jfc`; stack traces only with `profile.jfc`) for
   production, `-Xlog:deoptimization=debug` for a session. Both see **uncommon traps only**:
   a class-loading or `RedefineClasses` invalidation appears in neither, so collect
   `-Xlog:jit+compilation=debug` and `-Xlog:dependencies=debug` alongside. See
   `references/deopt-tooling.md`.
3. **Group by method and bci, reason and action, over a stated window.** The criterion is
   the rate per site and its decay, not presence: a site trapping once, or up to four times
   with `maybe_recompile`, then going quiet is converging. A site emitting `none` at a
   steady rate is the compiler having given up — every hit is a full deoptimisation and
   nothing is learned.
4. **For a `class_check`, decide which of the two routes it took.** Trap lines and events
   with `instruction = invokeinterface` at one `cid` are a per-invocation guard. Several
   unrelated methods `made not entrant: marked for deoptimization` in the same millisecond,
   right after a `class+load` line, are a CHA dependency invalidated by class loading — no
   application bytecode ran to trigger it, and no trap line or JFR event exists for it.
5. **Attack the assumption, not the threshold.** A static type that cannot gain implementors
   at the call site, warm-up that exercises every expected type, loading generated classes
   before traffic. See `references/reasons-and-actions.md` for the reason-to-fix table and
   `references/production-patterns.md` for the levers and what each costs.
6. **Validate on the deoptimisation signal, not on latency.** Confirm through
   `jdk.Deoptimization` and the compilation log that the target site stopped, and remove
   every diagnostic flag afterwards.

## Rules

- The correct log invocation is `-Xlog:deoptimization=debug:file=deopt.log:time,uptime`.
  `jit+deoptimization` is not a tag set: the JVM prints `No tag set matches selection` and
  starts anyway; `info` emits nothing; `trace` adds nothing over `debug` (executed, 25.0.3).
  Verify the produced file is non-empty before depending on it.
- `jdk.Deoptimization` exists since JDK 14 (JDK-8216041). Fields: `compileId`, `compiler`,
  `method`, `lineNumber`, `bci`, `instruction`, `reason`, `action`, `eventThread`,
  `stackTrace`. There is **no** `topFrame`; asking for one throws
  `IllegalArgumentException`.
- `reason` and `action` answer different questions. `reason` is the cause; `action` is the
  runtime's response, and there are five: `none`, `maybe_recompile`, `reinterpret`,
  `make_not_entrant`, `make_not_compilable`. Only the last three invalidate the nmethod. All
  five deoptimise the frame that hit the trap.
- Reason names come from `_trap_reason_name[]` in `deoptimization.cpp`, not from any
  specification. On a JVMCI-enabled build — every Temurin build — three are suffixed:
  `intrinsic_or_type_checked_inlining`, `bimorphic_or_optimized_type_check`,
  `null_assert_or_unreached0`. Confirm any name a script matches against a real collection.
- A method converges because the MDO records every trap and C2 does not speculate again at a
  bci that has trapped (`Compile::too_many_traps`, `compile.cpp`). An oscillating `if`
  therefore yields **one** `unstable_if` per bci, after which both sides are compiled
  (executed: a branch flipped sixty times produced one event). Do not split it into methods.
- The limits on Temurin 25.0.3: `PerBytecodeTrapLimit=4`, `PerMethodTrapLimit=100`,
  `PerMethodSpecTrapLimit=5000` (experimental), `PerBytecodeRecompilationCutoff=200`,
  `PerMethodRecompilationCutoff=400`. C2 stops recompiling — emitting traps with action
  `none` — once a method has decompiled `PerMethodRecompilationCutoff/2+1` = 201 times or a
  bci has 25 overflow recompiles. That storm, not the cutoff, is what "never stabilises"
  looks like, and raising the cutoff moves neither number in a useful direction.
- `make_not_compilable` from the cutoff is at C2 level only. `PrintCompilation` prints
  `made not compilable on level 4 … give up compiling` and the method is recompiled by C1 —
  tier 1, no profiling — not interpreted (executed; `jcmd <pid> Compiler.codelist` shows
  it). Permanent until restart.
- `made zombie` no longer exists (JDK 20, JDK-8290025). JDK 25 prints the reason after
  `made not entrant:` — `not used` and `OSR invalidation of lower level` are tier
  promotion, `uncommon trap` is a trap, `marked for deoptimization` is a dependency
  invalidation.
- A CHA invalidation on JDK 25 runs as a `Handshake "Deoptimize"` (`-Xlog:handshake=info`;
  `DeoptimizeMarkedClosure`, `deoptimization.cpp`), not a global safepoint.
  `RedefineClasses` is a global safepoint and flushes every nmethod with an `evol_method`
  dependency on the class — callers and inliners alike. `safepoints` owns the cost model of
  each.
- A second lambda for a functional interface is a new hidden class and a
  `unique_concrete_method` failure for every nmethod that assumed one implementor
  (executed). Proxies, generated accessors and scripting do the same; `jvm-class-loading`
  covers where they come from.
- A mutable feature flag in the hot path costs one `unstable_if` per bci and then a real
  branch — the lost constant folding, not recurring deoptimisation. A flag that swaps the
  **type** at a hot call site costs the inline tree: monomorphic to bimorphic to a virtual
  call (`jit-inlining-and-escape-analysis`). Put the choice one level up.
- Do not confuse `jdk.CompilationFailure` (the compiler never produced code) with
  `jdk.Deoptimization` (code was produced and later invalidated). Both on one method
  suggests pathologically complex, likely generated, bytecode.
- Budget scalar replacement into the cost: every scalar-replaced object is rematerialised on
  the heap during frame reconstruction (`realloc_objects`, `deoptimization.cpp`). A reason
  to care about recurrence, not to disable `EliminateAllocations`.
- `-XX:+TraceDeoptimization` is `diagnostic` since JDK 18 (JDK-8154011) and needs
  `-XX:+UnlockDiagnosticVMOptions` **before** it; it prints one `VFrame` per inlined level
  and is a one-off deep session, never continuous production. JDK 28 moves it to unified
  logging (JDK-8287010; not verified here).

## References

- [Reasons, actions and mitigations](references/reasons-and-actions.md) — the reason and
  action tables with the strings JDK 25 prints and the action observed for each, why a
  method converges and the two ways it fails to, the two routes into a class-loading
  deoptimisation with their evidence, the symptom-to-cause table, and the mitigations. Read
  when you have a reason code and need to decide what it means and what to change.
- [Deoptimisation tooling](references/deopt-tooling.md) — which tool sees which kind of
  deoptimisation, the exact log lines and JFR fields, `PrintCompilation` reasons,
  `Compiler.codelist` for the live process, the limit flags with where each is enforced, and
  correlation with latency spikes. Read before instrumenting a process or writing a script
  against deoptimisation data.
- [Production patterns and decisions](references/production-patterns.md) — the post-deploy
  timeline and the rate-to-floor criterion, what a restart clears, the sources of runtime
  class loading, agents, feature flags, the act-or-accept table and the levers with their
  trade-offs. Read when the question is fleet behaviour after a deploy, or which change to
  propose.
