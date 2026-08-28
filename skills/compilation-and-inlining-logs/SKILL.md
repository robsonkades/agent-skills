---
name: compilation-and-inlining-logs
description: >
  Reading what the JIT actually did: the six columns of -XX:+PrintCompilation and its flag
  characters, -XX:+PrintInlining and its refusal categories, -XX:+LogCompilation with
  JITWatch, targeted compiler directives, and turning a refusal into a code change. Use when
  a hot method is suspected of not reaching tier 4, when a call site shows "too large" or
  another inlining refusal, when a method never appears in the compilation log at all, when
  someone prescribes -XX:CompileThreshold or -Xlog:jit, when a script greps the compilation
  log and returns nothing, or when raising FreqInlineSize globally is proposed to fix one
  method. Does not cover the tiered pipeline, warm-up and the code cache as concepts
  (jit-compilation), the design rules about inlining and escape
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
a tier filter on the wrong column, a `-Xlog` tag that does not exist, a grep for a refusal
string this build never prints — and is then read as "there is nothing to see".

## Workflow

1. **Decide which question you are asking**, because it picks the tool. When and at which
   tier a method became native code is `PrintCompilation`; which calls inside one compilation
   tree were inlined is `PrintInlining`; continuous production monitoring is JFR.
2. **Confirm `TieredCompilation` is at its default** before expecting a tier column at all.
   Under `-XX:-TieredCompilation` the column is structurally absent, not fixed at 4.
3. **Parse all six columns.** Timestamp, compile id, flags, **tier**, `Class::method (bytes)`,
   and an optional status. Treating the tier as part of the flags is the structural
   misreading. See `references/printcompilation-format.md`.
4. **Walk the method down the tree**: no tier-4 line at all, a line that keeps returning with
   `made not entrant`, no line in any tier, or tier 4 reached with the hot path still slow —
   each points somewhere different, and only the last one leads to `PrintInlining`.
5. **For a refusal, measure the callee's bytecode before naming a limit.** Under 35 bytes the
   size is not the reason. Between 36 and 325 it only fails when the site is not hot. Above
   325 it fails regardless. Then check the call site's polymorphism.
6. **Refactor the common path to fit** rather than raising a global limit. A bigger
   `FreqInlineSize` applies to every call in the process and can cost aggregate throughput
   through code bloat while "fixing" the target method.
7. **Confirm the fix in `PrintInlining` from the same run** — that the call is now inlined, or
   that the method now compiles — and remove every diagnostic flag afterwards.

## Rules

- `PrintCompilation` is a plain product flag; `PrintInlining` and `LogCompilation` both need
  `-XX:+UnlockDiagnosticVMOptions`.
- `PrintCompilation` is **not** part of unified logging. There is no `-Xlog:jit*` or
  `-Xlog:compilation*` tag; a script asking for one produces no log, and the absence is easily
  read as "nothing to report".
- Filter by tier as a field (`awk '$4 == 4'`), not by position-sensitive text like
  `grep -v " [123] "`, which breaks silently on a five-digit compile id. Validate any
  extraction command against real output before it enters a diagnostic script.
- `%` is OSR, `s` synchronized, `!` has an exception handler, `b` blocking compilation, `n`
  native wrapper. None of them is the tier.
- Below `MaxInlineSize` (35 bytes) inlining is unconditional **with respect to hotness only**.
  A megamorphic call site, `MaxInlineLevel`, `@DontInline`, a compiler directive, `not
compilable`, or unloaded signature classes all still refuse an 8-byte callee.
- A megamorphic call site (3+ concrete types) blocks inlining before size is even considered.
  Check polymorphism before attributing a refusal to size.
- Do not grep for the name of the exceeded limit in the refusal text. C2 does not distinguish
  `MaxInlineSize` from `FreqInlineSize` literally; the message is generic (`too large`) and
  its wording varies by build.
- `-XX:CompileThreshold` is honoured only under `-XX:-TieredCompilation`. Under the default it
  is accepted and ignored. The real thresholds are per tier
  (`Tier3InvocationThreshold`, `Tier4InvocationThreshold`); read them with
  `-XX:+PrintFlagsFinal`, as the values change between releases.
- The JFR event for compilation failures is `jdk.CompilationFailure`. `jdk.CompilerFailure`
  has never existed in any version, and survives review because it sounds right. Confirm any
  event name against `jfr summary` on your own runtime.
- `PrintInlining` has no JFR equivalent — per-call-site inlining decisions are not exposed as
  structured events. Continuous monitoring gets `jdk.Compilation`, `jdk.CompilationFailure`,
  `jdk.CompilerStatistics`; per-call detail requires a session tool.
- `PrintInlining` and `LogCompilation` are session tools. Their overhead shows up in I/O and
  tail latency, not in obvious metrics. Never leave them on in continuous production; use
  `jcmd Compiler.directives_add` to scope `PrintInlining` to one method instead.
- "Compiled" is not "optimised". A hot method sitting at tier 1 or tier 3 is compiled and
  still far from what tier 4 would produce.
- Measure the effect of an inlining decision with JMH, using `@CompilerControl` when the
  comparison needs the decision to be deterministic. `System.nanoTime()` around a loop mixes
  interpreter, C1 and C2 into one sample.

## References

- [The PrintCompilation format](references/printcompilation-format.md) — the six columns, the
  flag characters, what changes without tiered compilation, the status values, and filtering
  commands that survive a wide compile id. Read before parsing or scripting against
  compilation output.
- [Diagnosing an inlining refusal](references/inlining-diagnosis.md) — the three-band size
  model, the refusal categories and what to do about each, the escalation order for changing
  limits, and the JFR, directive and JITWatch invocations. Read when a specific call was not
  inlined and you need to know why.
