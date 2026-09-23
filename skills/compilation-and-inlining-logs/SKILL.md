---
name: compilation-and-inlining-logs
description: >
  Reading what the JIT actually did: the columns of -XX:+PrintCompilation and its flag
  characters, -XX:+PrintInlining and its verdict strings, -XX:+LogCompilation with JITWatch,
  the -Xlog:jit+compilation and JFR forms, targeted compiler directives, and turning a
  refusal into a code change. Use when a hot method is suspected of not reaching tier 4, when
  a call site shows "too big" or another inlining refusal, when a method never appears in the
  compilation log at all, when someone prescribes -XX:CompileThreshold or -Xlog:jit, when a
  script greps the compilation log and returns nothing, when a directive added with jcmd
  changed nothing, when JFR shows no compilation events, or when raising FreqInlineSize
  globally is proposed to fix one method. Does not cover the tiered pipeline, warm-up and the
  code cache as concepts (jit-compilation), the design rules about inlining and escape
  (jit-inlining-and-escape-analysis), recompilation and uncommon traps (deoptimization), or
  C2's internal representation (c2-sea-of-nodes).
---

# Compilation and Inlining Logs

## Purpose

Read the compiler's own output instead of guessing at it. Three diagnoses look alike from
the outside and lead to three different flags: the method never became native code at all;
a specific call inside a tree that compiled fine was not inlined; or code that was already
generated got invalidated afterwards. Confusing them is how a session ends with the wrong
flag changed.

The failure this prevents is the plausible-looking command that silently answers nothing —
a tier filter on the wrong field, `-Xlog:jit` with no sub-tag, a JFR recording whose
threshold drops every compilation, a directive that only applies to compilations that have
not happened yet — and is then read as "there is nothing to see".

## Workflow

1. **Decide which question you are asking**, and reuse relevant existing captures before
   collecting more. For compilation-attempt timing and tier, use
   `PrintCompilation` or `-Xlog:jit+compilation`; their attempt headers precede completion,
   so confirm the outcome before claiming installed code. Use `PrintInlining` or
   `-Xlog:jit+inlining=debug` for decisions within an attempt. Currently listed nmethods and
   their tier/state are visible through
   `jcmd <pid> Compiler.codelist`; continuous production monitoring is JFR. A method can execute
   inlined in several callers without its own listed nmethod.
2. **Record the runtime and compilation mode** before interpreting a tier. On the usual
   server HotSpot with tiered compilation enabled, levels 1–3 are C1 modes and level 4 is C2.
   Under `-XX:-TieredCompilation` the tier column is structurally absent; JVMCI compilers,
   compiler-only builds, and vendor runtimes can require a different interpretation.
   Inspect `TieredStopAtLevel`, runtime vendor/build, effective flags/directives and the capture
   start time; absence of tier 4 can be intentional. Examples use HotSpot 25.0.3, not a portable
   Java API contract. Preserve the target project/toolchain rather than upgrading to fit a flag.
3. **Parse the line structurally.** Timestamp, compile id, a five-position flag field, tier,
   `Class::method (bytes)`, optional status. A blank flag field emits no token, so a
   whitespace-split field index is wrong for most lines. See
   `references/printcompilation-format.md`.
4. **Walk the method down the tree**: absent at every tier, present at tier 1 after a
   `COMPILE SKIPPED:` line, stuck at tier 3, returning with `made not entrant: uncommon
trap`, or at tier 4 with the hot path still slow — each suggests a different next check.
   A one-off `made not entrant: not used` commonly
   accompanies promotion; repeated invalidation still needs correlation with recompilation,
   class loading, directives, and deoptimization evidence. Inlining matters at any active compiler
   tier; interpret C2 verdicts only when C2 is the relevant target and a profile implicates this call.
5. **Read the verdict for the relevant compiler and compilation.** When investigating C2,
   use its tier-4 tree rather than a nearby C1 tree; deliberate C1-only modes need C1 diagnosis.
   An inlining decision in a task that later fails does not describe installed code.
   C2 names the limit it applied — `too big`, `hot method too big`, `inlining too deep`, `virtual call`,
   `already compiled into a big method` — and `callee is too large` is C1's verdict, which
   says nothing about C2. See `references/inlining-diagnosis.md`.
6. **Establish a material cost before changing code or policy.** Keep adequate code when
   the refusal is immaterial. When evidence implicates it, compare a semantics-preserving
   common-path refactor or scoped diagnostic directive before raising a global limit. A bigger
   `FreqInlineSize` applies to every call in the process and can cost aggregate throughput
   through code bloat while "fixing" the target method.
7. **Steer one method, not the process.** A compiler directive or `CompileCommand` scoped
   to a caller affects matching compilation tasks; callee `CompileCommand` patterns may affect many
   callers. On the examined HotSpot implementation, tasks capture directives when initialized,
   so already queued tasks can retain old policy. See `references/directives-and-production-logging.md`.
8. **Confirm the intended compiler outcome in a controlled comparison.** For an inlining
   change, verify that its enclosing task succeeded and installed code. Check workload-level
   latency/throughput for regressions. Remove
   session-only flags; retain bounded production logging only when its operational value and
   cost are established.

## Rules

- `PrintCompilation` is a product flag. `PrintInlining`, `LogCompilation`,
  `CompilerDirectivesFile` and `-XX:CompileCommand=PrintInlining,…` all need
  `-XX:+UnlockDiagnosticVMOptions` **before** them on the command line; the JVM refuses to
  start otherwise (executed, 25.0.3).
- Unified logging needs no unlock: `-Xlog:jit+compilation` formats attempt and retirement
  records like `PrintCompilation` (minus the timestamp column, plus decorations), but omits
  its `COMPILE SKIPPED` bailout records on 25.0.3. `-Xlog:jit+inlining=debug` exposes the
  inlining decisions. Plain `-Xlog:jit` matches no tag set and warns
  `No tag set matches selection: jit`. Both can be turned on in
  a running JVM with `jcmd <pid> VM.log what=jit+compilation,jit+inlining=debug output=<file>`.
- Filter by structure, not by field index: `awk '$4 == 4'` matches only lines that carry
  exactly one flag character — 6 of 21 tier-4 lines in a small run (executed, 25.0.3). Use
  `grep -E '^ *[0-9]+ +[0-9]+ [ %s!bn]{5} 4 '`, and validate any extraction command
  against real output before it enters a script.
- The flag field has five fixed positions: `%` OSR, `s` synchronized, `!` exception handler,
  `b` blocking, `n` native wrapper. A native wrapper prints tier `0` and `(native)`, not a
  byte count. None of the positions is the tier.
- `made zombie` no longer exists in JDK 20+ because JDK-8290025 removed the sweeper and zombie
  state. Interpret `made not entrant` by rate, reason, and successor compilation; do not alert
  on a reason string alone.
- `DontCompileHugeMethods` defaults to true and `HugeMethodLimit` to 8000 bytecodes on current
  OpenJDK, but this is an implementation policy, not a JVM specification. JDK 17–25 have
  JDK-8366118: the guard can be bypassed with `-XX:-TieredCompilation`; JDK 26 fixes it.
  A huge method can therefore be absent from compilation events, explicitly rejected, or—on
  affected non-tiered runtimes—compiled. Confirm flags, mode, version, and bytecode size.
- C2 names the limit in the verdict on JDK 25 (`bytecodeInfo.cpp`); the generic `too
large` string exists only as C1's `callee is too large`. Grep for the exact strings your
  build prints, and read the tier of the line the tree hangs from first.
- On the examined JDK 25 server build, a callee below `MaxInlineSize` (default 35 bytecodes)
  does not need a hot-site allowance, but it is never guaranteed to inline. `virtual call` or
  `no static binding` (polymorphic, megamorphic, unresolved, or insufficiently profiled receiver),
  `inlining too deep`, `disallowed by CompileCommand`, `not inlineable` after `(not
loaded)`, or `already compiled into a big method` all still refuse an 8-byte callee.
- In the examined HotSpot 25.0.3 default C1/C2 tiered mode, `-XX:CompileThreshold` does not
  control compilation eligibility. C1-only modes such as `TieredStopAtLevel=1` honor legacy
  thresholds even with `TieredCompilation=true`; non-tiered mode also honors them. Inspect
  the actual mode and effective per-tier thresholds (`Tier3InvocationThreshold`,
  `Tier4InvocationThreshold`) with `-XX:+PrintFlagsFinal`; use bounded
  `-XX:+PrintTieredEvents` captures for policy events and counters.
- Current HotSpot JFR does expose inlining: `jdk.CompilerInlining` carries caller, callee, `bci`,
  `succeeded` and the same verdict `message` for an inlining attempt; one site can yield multiple
  events. Correlate `compileId` with the compilation's compiler/tier and preserve nested context. It is
  disabled in both `default` and `profile`, and `jdk.Compilation` has a threshold of 1000 ms
  (`default`) or 100 ms (`profile`) on the examined JDK 25 configuration, which filters most
  ordinary compilations. Inspect the configuration shipped by the runtime and enable them
  explicitly: `jdk.CompilerInlining#enabled=true,jdk.Compilation#threshold=0ms`.
- The current failure event is `jdk.CompilationFailure` with `failureMessage`; its default
  enablement is recording-configuration specific. Do not substitute the plausible but wrong
  name `jdk.CompilerFailure`; confirm names and fields with `jfr metadata` on the target runtime.
- A startup `-XX:CompileCommand=exclude` prevents matching top-level compilation and inlining;
  `compileonly` restricts the compilation set. These are high-risk compiler controls, appropriate
  mainly for diagnosis or a scoped compiler-bug mitigation—not general tuning. Confirm the live
  directive stack because runtime directives can change future compilation policy.
- A directive with an `inline` list replaces `CompileCommand=inline/dontinline` for that
  caller; an option a directive sets explicitly beats the same `CompileCommand` option; the
  first matching directive from the top of the stack wins, so a `jcmd` addition shadows the
  file. None of it touches code that is already compiled.
- `PrintInlining` and `LogCompilation` are session tools; `-Xlog:jit+compilation` to a
  rotated file is the one that can stay on. Volume and overhead are in
  `references/directives-and-production-logging.md`.
- "Compiled" is not "optimised". A hot method sitting at tier 1 or tier 3 is compiled and
  may benefit from further compilation, but tier alone proves no performance deficit. A matching
  tier-1 retry after a tier-4 `COMPILE SKIPPED:` documents a C2 bailout, not every tier-1 method.
- Use JMH for isolated causal experiments and a representative workload for the engineering
  decision. `@CompilerControl` can stabilize a particular experiment but creates an artificial
  compilation policy; confirm the final unforced code. `System.nanoTime()` around one loop mixes
  interpreter, C1, C2, OSR, and harness effects.

## References

Deliver the target runtime/mode, capture interval/settings, caller and compilation identity,
observed verdict versus causal hypothesis, and the smallest controlled next experiment. With
missing profiles or filtered/partial logs, state what remains unknown; do not infer no compilation
or a performance fix from absence alone. Record measured workload outcomes and instrumentation
cost separately from the changed compiler decision.

- [The PrintCompilation format](references/printcompilation-format.md) — the columns, the
  five flag positions, the status suffixes on JDK 25, the `-Xlog:jit+compilation` form,
  what changes without tiered compilation, and filtering commands that survive a blank flag
  field and a wide compile id. Read before parsing or scripting against compilation output.
- [Diagnosing an inlining refusal](references/inlining-diagnosis.md) — the verdict strings C1
  and C2 print, the three-band size model, the refusal categories and what to do about each,
  the escalation order for changing limits, `jdk.CompilerInlining`, and the `LogCompilation`
  XML that JITWatch reads. Read when a specific call was not inlined and you need to know why.
- [Directives and production logging](references/directives-and-production-logging.md) —
  `CompileCommand` and the directives file side by side, match syntax, precedence, the
  `jcmd` lifecycle, per-flag volume and overhead, the JFR events and their default
  thresholds, and a symptom-to-cause table. Read before steering a compilation or before
  enabling any of these in an environment that matters.
- [JEP 165: Compiler Control](https://openjdk.org/jeps/165)
- [JEP 158: Unified JVM Logging](https://openjdk.org/jeps/158)
- [JDK 25 `java` launcher options](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JDK-8366118: `DontCompileHugeMethods` and non-tiered compilation](https://bugs.openjdk.org/browse/JDK-8366118)
