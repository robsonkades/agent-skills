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

1. **Decide which question you are asking**, because it picks the tool. When and at which
   tier a method became native code is `PrintCompilation` or `-Xlog:jit+compilation`; which
   calls inside one compilation tree were inlined is `PrintInlining` or
   `-Xlog:jit+inlining=debug`; what tier a method is in **right now** on a live JVM is
   `jcmd <pid> Compiler.codelist`; continuous production monitoring is JFR.
2. **Record the runtime and compilation mode** before interpreting a tier. On the usual
   server HotSpot with tiered compilation enabled, levels 1–3 are C1 modes and level 4 is C2.
   Under `-XX:-TieredCompilation` the tier column is structurally absent; JVMCI compilers,
   compiler-only builds, and vendor runtimes can require a different interpretation.
3. **Parse the line structurally.** Timestamp, compile id, a five-position flag field, tier,
   `Class::method (bytes)`, optional status. A blank flag field emits no token, so a
   whitespace-split field index is wrong for most lines. See
   `references/printcompilation-format.md`.
4. **Walk the method down the tree**: absent at every tier, present at tier 1 after a
   `COMPILE SKIPPED:` line, stuck at tier 3, returning with `made not entrant: uncommon
trap`, or at tier 4 with the hot path still slow — each points somewhere different, and
   only the last one leads to `PrintInlining`. A one-off `made not entrant: not used` commonly
   accompanies promotion; repeated invalidation still needs correlation with recompilation,
   class loading, directives, and deoptimization evidence.
5. **Read the verdict on the tier-4 tree, not the tier-3 one above it.** C2 names the limit
   it applied — `too big`, `hot method too big`, `inlining too deep`, `virtual call`,
   `already compiled into a big method` — and `callee is too large` is C1's verdict, which
   says nothing about C2. See `references/inlining-diagnosis.md`.
6. **Refactor the common path to fit** rather than raising a global limit. A bigger
   `FreqInlineSize` applies to every call in the process and can cost aggregate throughput
   through code bloat while "fixing" the target method.
7. **Steer one method, not the process.** A compiler directive or `CompileCommand` scoped
   to one method changes one compilation; a directive added with `jcmd` applies only to
   compilations that start after it. See `references/directives-and-production-logging.md`.
8. **Confirm the fix in a controlled comparison** — that the call is now inlined or the
   method now compiles, and that workload-level latency/throughput did not regress. Remove
   session-only flags; retain bounded production logging only when its operational value and
   cost are established.

## Rules

- `PrintCompilation` is a product flag. `PrintInlining`, `LogCompilation`,
  `CompilerDirectivesFile` and `-XX:CompileCommand=PrintInlining,…` all need
  `-XX:+UnlockDiagnosticVMOptions` **before** them on the command line; the JVM refuses to
  start otherwise (executed, 25.0.3).
- The unified-logging equivalents exist and need no unlock: `-Xlog:jit+compilation` prints
  the same lines as `PrintCompilation` (minus the timestamp column, plus decorations) and
  `-Xlog:jit+inlining=debug` prints the same trees as `PrintInlining`. Plain `-Xlog:jit`
  matches no tag set and warns `No tag set matches selection: jit`. Both can be turned on in
  a running JVM with `jcmd <pid> VM.log what=jit+compilation output=<file>`.
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
- `-XX:CompileThreshold` is honoured only under `-XX:-TieredCompilation`. Under the default
  it is accepted and ignored. The real thresholds are per tier
  (`Tier3InvocationThreshold`, `Tier4InvocationThreshold`); read them with
  `-XX:+PrintFlagsFinal`, and read the live counters with `-XX:+PrintTieredEvents`.
- Current HotSpot JFR does expose inlining: `jdk.CompilerInlining` carries caller, callee, `bci`,
  `succeeded` and the same verdict `message`, one event per call site per compilation. It is
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
  still far from what tier 4 would produce; tier 1 after `COMPILE SKIPPED:` is C2 giving up.
- Use JMH for isolated causal experiments and a representative workload for the engineering
  decision. `@CompilerControl` can stabilize a particular experiment but creates an artificial
  compilation policy; confirm the final unforced code. `System.nanoTime()` around one loop mixes
  interpreter, C1, C2, OSR, and harness effects.

## References

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
