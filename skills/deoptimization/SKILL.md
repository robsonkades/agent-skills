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
reach stable optimised code. C2 can optimise using profile assumptions protected by guards,
or registered dependencies checked when the runtime changes. Deoptimisation preserves Java
behavior when an assumption fails. Recorded trap history can change later compilation
decisions. A bounded burst that decays under continued representative traffic can be normal; continued
events at the same site require diagnosis rather than an assumption that all deoptimisation
is benign.

The failure this prevents is both directions of the same mistake — alerting on every
`jdk.Deoptimization` event until the alert is ignored, and raising a recompilation cutoff so
the JVM takes longer to give up on a method whose underlying assumption keeps changing.

## Workflow

1. **Establish whether the question is one method or a post-deploy pattern**, and fix a
   reference window (a deploy, a config change, a library or plugin rollout) to correlate
   against. Inspect the deployed vendor/build, compiler mode and flags alongside project
   toolchains; JDK 25 observations are not authorization to upgrade the target or enable flags.
   Reuse supplied logs, workload history and prior checks. Establish the affected startup or
   steady-state service criterion, recovery authority and capture budget; ask only for missing
   facts that would change the next action.
2. **Collect the reason, the action and the compile id**, not just the fact. JFR
   `jdk.Deoptimization` (enabled in the baseline `default.jfc`; stacks enabled by `profile.jfc`
   or explicit event settings) for
   production, `-Xlog:deoptimization=debug` for a session. Both see **uncommon traps only**:
   a class-loading or `RedefineClasses` invalidation appears in neither. If that path matters,
   use existing evidence or collect `-Xlog:jit+compilation=debug` with
   `-Xlog:dependencies=debug` for class loading, or `-Xlog:redefine+class+nmethod=debug`
   for redefinition scope, within the budget. See
   `references/deopt-tooling.md`.
3. **Group by method and bci, reason and action, over a stated window.** The criterion is
   the rate per site and its decay, not presence: a site trapping once, or up to four times
   with `maybe_recompile`, then going quiet under comparable demand suggests convergence.
   Silence after traffic stops is not evidence of readiness. A site emitting `none` at a
   steady rate needs its compilation history checked — the action preserves compiled code
   and does not update trap state, but the action alone does not identify why it was emitted.
4. **Distinguish receiver guards from dependency invalidation.** `class_check` trap lines and events
   with `instruction = invokeinterface` at one `cid` are a per-invocation guard. Several
   unrelated methods `made not entrant: marked for deoptimization` in the same millisecond,
   right after a `class+load` line, suggest dependency invalidation. Confirm the failed
   dependency, context and dependee; timing alone does not prove CHA. That confirmed path
   needs no invocation at the affected site and emits no uncommon-trap event.
5. **Choose a proportionate response to the evidenced assumption.** Accept convergence or
   negligible service cost; otherwise compare targeted representative warm-up, loading known
   classes before traffic, or a compatible call-site change. Do not preload every possible
   class or remove required polymorphism just to reduce event counts. See
   `references/reasons-and-actions.md` for the reason-to-fix table and
   `references/production-patterns.md` for the levers and what each costs.
6. **Validate mechanism and service outcome together.** Check the target site's rate and
   compilation state under comparable workload, then CPU, allocation and latency guardrails.
   Eliminating events by disabling compilation can worsen performance. Restore temporary
   diagnostics to their prior settings; retain intentionally configured monitoring. Finish
   with the supported diagnosis, evidence limits, change or no-change decision, and verified
   outcome. If evidence is insufficient, name the smallest discriminating next check and what
   result would change the decision; do not require a new capture after the question is resolved.

## Rules

- The correct log invocation is `-Xlog:deoptimization=debug:file=deopt.log:time,uptime`.
  `jit+deoptimization` is not a tag set: the JVM prints `No tag set matches selection` and
  starts anyway; `info` emits nothing; `trace` adds nothing over `debug` (executed, 25.0.3).
  Verify tag acceptance and collection coverage. An empty file can also mean no traps occurred;
  do not force a production trap merely to make it non-empty.
- `jdk.Deoptimization` exists since JDK 14 (JDK-8216041). Fields: `compileId`, `compiler`,
  `method`, `lineNumber`, `bci`, `instruction`, `reason`, `action`, `eventThread`,
  `stackTrace`. There is **no** `topFrame`; asking for one throws
  `IllegalArgumentException`.
- `reason` and `action` answer different questions. `reason` is the cause; `action` is the
  runtime's response, and there are five: `none`, `maybe_recompile`, `reinterpret`,
  `make_not_entrant`, `make_not_compilable`. The last three request invalidation;
  `maybe_recompile` can also invalidate after sufficient traps. All
  five deoptimise the frame that hit the trap.
- Reason names come from `_trap_reason_name[]` in `deoptimization.cpp`, not from any
  specification. On the tested JVMCI-enabled Temurin 25.0.3 build, three are suffixed:
  `intrinsic_or_type_checked_inlining`, `bimorphic_or_optimized_type_check`,
  `null_assert_or_unreached0`. Confirm any name a script matches against a real collection.
- Recorded trap history can suppress the same speculation at a bci through
  `Compile::too_many_traps`. The prior oscillating-branch experiment produced one `unstable_if`,
  but concurrent frames, compiled versions, missing/replaced profiles and action `none` prevent
  a universal one-event bound. Do not split an `if` merely because its first trap appeared.
- The observed defaults on Temurin 25.0.3 are `PerBytecodeTrapLimit=4`, `PerMethodTrapLimit=100`,
  `PerMethodSpecTrapLimit=5000` (experimental), `PerBytecodeRecompilationCutoff=200`,
  `PerMethodRecompilationCutoff=400`. C2's `too_many_recompiles` can select action `none`
  at eligible trap sites using a cumulative decompile count of at least 201, or a MethodData
  overflow-recompile count of at least 25, with the required prior reason/site history.
  These are not independent per-bci event counters or automatic method-wide exclusion.
  Runtime C2 exclusion uses counts strictly above 400/200 respectively. These are implementation
  details, not Java contracts; verify flags and source on the deployed build. A sustained
  same-site storm is the signal to investigate, not a magic count copied from this baseline.
- C2 recompilation-cutoff exclusion is at C2 level in the baseline. `PrintCompilation` prints
  `made not compilable on level 4 … give up compiling` and the method is recompiled by C1 —
  tier 1, no profiling — in the prior tiered experiment (`Compiler.codelist`). C1 fallback
  requires enabled/available C1 and policy scheduling; inspect live code instead of assuming it.
  Treat the exclusion as lasting for that loaded method; redefinition/reloading and
  another JVM release can alter the lifecycle.
- `made zombie` no longer exists (JDK 20, JDK-8290025). JDK 25 prints the reason after
  `made not entrant:`. `not used` marks replacement of an existing entry and often accompanies
  promotion; it does not identify the successor tier. `OSR invalidation of lower level` denotes
  lower-level OSR replacement, not necessarily tier 3 to 4. Correlate compilation IDs, tiers and
  successor entries. `uncommon trap` identifies a trap invalidation; `marked for deoptimization`
  needs dependency/redefinition context to establish the cause.
- A CHA invalidation on JDK 25 runs as a `Handshake "Deoptimize"` (`-Xlog:handshake=info`;
  `DeoptimizeMarkedClosure`, `deoptimization.cpp`), not a global safepoint.
  `RedefineClasses` is a global safepoint; its invalidation scope depends on compiled-code
  references to old methods and dependency-recording coverage. Do not infer every caller or
  a whole-code-cache flush from the operation name. See the production reference for the
  scoped and broad paths; `safepoints` owns the cost model.
- Linking another lambda implementation can load a hidden class and invalidate a still-valid
  unique-implementor dependency (observed in the prior lab). Re-evaluating one lambda expression
  does not imply a new class each time. Proxies, generated accessors and scripting can do the same; `jvm-class-loading`
  covers where they come from.
- A mutable feature flag with stable retained profiling usually converges to a real
  branch — the lost constant folding, not recurring deoptimisation. A flag that swaps the
  **type** at a hot call site may change guarded inlining; type count alone does not determine
  the resulting inline tree (`jit-inlining-and-escape-analysis`). Moving the choice outside a
  hot loop is an option when the actual inline shape and measured cost justify the boundary.
- Do not confuse `jdk.CompilationFailure` (that compilation attempt failed) with
  `jdk.Deoptimization` (an active compiled frame was deoptimised; its nmethod may remain usable).
  Both on one method require failure text, compile IDs and timing before diagnosing complexity.
- Budget scalar replacement into the cost: eliminated objects needed by reconstructed live state may be rematerialised on
  the heap during frame reconstruction (`realloc_objects`, `deoptimization.cpp`). A reason
  to care about recurrence, not to disable `EliminateAllocations`.
- `-XX:+TraceDeoptimization` is `diagnostic` since JDK 18 (JDK-8154011) and needs
  `-XX:+UnlockDiagnosticVMOptions` **before** it; it prints one `VFrame` per inlined level
  and is a one-off deep session, not a default continuous-production setting. Do not describe
  a proposed or mainline change as released behavior; inspect the target JDK's `java -Xlog:help`
  and flags.

## References

All numeric thresholds and output shapes in these references are JDK 25 HotSpot observations.
Confirm them against the exact vendor build before automation or production tuning.

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
