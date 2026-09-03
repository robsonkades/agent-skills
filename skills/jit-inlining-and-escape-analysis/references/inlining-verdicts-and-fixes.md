# From an inlining verdict to a code change

Every default and verdict string below was read off Temurin 25.0.3 (`-XX:+PrintFlagsFinal`,
`-XX:+PrintInlining`) and cross-checked against the JDK 25 sources named in each section.
Confirm numbers, flag classes and verdict interpretation on the runtime you are reasoning
about; neither values nor policy structure are public contracts.

## The limits, and what each one measures

| Flag                              | Default on 25 | Class      | Measures                                                              |
| --------------------------------- | ------------- | ---------- | --------------------------------------------------------------------- |
| `MaxInlineSize`                   | 35            | product    | Bytecode bytes; ceiling at a **cold** call site                       |
| `FreqInlineSize`                  | 325           | product    | Bytecode bytes; ceiling at a **hot** call site                        |
| `MaxTrivialSize`                  | 6             | product    | Bytecode-size threshold used by trivial-callee policy paths           |
| `InlineSmallCode`                 | 2500          | product    | **Machine-code** bytes of a callee that already has an nmethod        |
| `MaxInlineLevel`                  | 15            | product    | Nesting depth of the inline tree (9 on older releases, not verified)  |
| `MaxRecursiveInlineLevel`         | 1             | product    | How many times a method may be inlined into itself                    |
| `InlineFrequencyRatio`            | 0.25          | diagnostic | Call-site count / caller invocations at or above which a site is hot  |
| `MinInlineFrequencyRatio`         | 0.0085        | diagnostic | Below this ratio the site is refused outright                         |
| `DesiredMethodLimit`              | 8000          | develop    | Aggregate bytecode bytes of one compilation unit after inlining       |
| `MaxNodeLimit`                    | 80000         | product    | Ideal-graph nodes per compilation; overridable per method             |
| `NodeLimitFudgeFactor`            | 2000          | product    | Reserve below `MaxNodeLimit` that some optimisations keep             |
| `LiveNodeCountInliningCutoff`     | 40000         | product    | Live nodes above which further inlining stops                         |
| `HugeMethodLimit`                 | 8000          | develop    | Huge-method cutoff when `DontCompileHugeMethods` policy applies       |
| `DontCompileHugeMethods`          | true          | product    | The switch for the previous line                                      |
| `TypeProfileWidth`                | 2             | product    | Receiver types recorded per call site; the rest fall into one counter |
| `TypeProfileMajorReceiverPercent` | 90            | product    | Share one receiver needs for C2 to inline it behind a type guard      |

`develop` flags are compiled out of a product build: they do not appear in `PrintFlagsFinal`
and passing one is `Unrecognized VM option`. So `DesiredMethodLimit` and `HugeMethodLimit`
cannot be raised in production; the code has to change. Declarations: `opto/c2_globals.hpp`,
`runtime/globals.hpp`, `compiler/compiler_globals.hpp`.

**One input to "hot" in this build.** C2 computes a call-site/caller frequency in
`InlineTree::should_inline` and uses it with profile state and other policy checks. Frequency
gates help select hot/cold size budgets and can produce `low call site frequency`, but do not
fully determine inlining: intrinsic/annotation rules, receiver profile, depth, node budget
and compiler state also apply.

## Verdict to fix

The string C2 prints is the limit's name in disguise. Read the **tier-4** tree; a tier-3 tree
above it carries C1's verdicts (`callee is too large`, `inlining prohibited by policy`,
`callee uses too much stack`, `total inlining greater than DesiredMethodLimit` — from
`c1/c1_GraphBuilder.cpp`) and says nothing about what C2 will do. `inlining prohibited by
policy` in particular only means C1 declined to inline a callee that already has C2 OSR code
(`compiler/compilationPolicy.cpp`, `should_not_inline`).

| Verdict (C2, `bytecodeInfo.cpp`)        | Cause                                                            | Fix, in order of preference                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `too big`                               | Callee > 35 bytes at a **cold** site                             | Usually nothing: the site is cold. If profiling says it matters, the caller's hot path is not where you think — re-read the profile         |
| `hot method too big`                    | Callee > 325 bytes at a hot site                                 | Move the rare part of the callee into its own method so the hot remainder fits; then `CompileCommand=inline` to confirm the gain in the lab |
| `already compiled into a big method`    | Callee's own nmethod > 2500 machine-code bytes                   | The callee grew (unrolling, vectorisation, its own inlining). Shrink what it inlines, or accept; raising `InlineSmallCode` is process-wide  |
| `already compiled into a medium method` | Cold site and callee nmethod > 625 bytes (`InlineSmallCode / 4`) | As `too big`: the site is cold                                                                                                              |
| `inlining too deep`                     | Tree deeper than `MaxInlineLevel`                                | Flatten the chain (a builder or fluent API that delegates fifteen levels deep); raising the limit rarely pays                               |
| `recursive inlining is too deep`        | Method inlined into itself more than once                        | Expected for recursion. Convert the hot recursion to a loop if it is on the critical path                                                   |
| `virtual call`                          | No usable guarded/static target under current profile/policy     | Inspect types at **this** site; isolate a stable hot site only if design remains sound                                                      |
| `no static binding`                     | Interface or abstract call with no usable profile                | Same as `virtual call`; often a call on a `default` method or through a generic helper with a polluted profile                              |
| `low call site frequency`               | Site below `MinInlineFrequencyRatio`                             | Nothing: it is cold                                                                                                                         |
| `never executed`                        | Callee has no counters and no code                               | Nothing; the path did not run during profiling                                                                                              |
| `call site not reached`                 | Current profile/graph treats the site as unreachable             | Exercise representative paths; later execution may trap and recompile                                                                       |
| `size > DesiredMethodLimit`             | Compilation unit already holds 8000 inlined bytes                | Something upstream is too big to be inlined at all; shrink the caller's inline tree rather than the refused callee                          |
| `NodeCountInliningCutoff`               | Live nodes above `LiveNodeCountInliningCutoff`                   | Same: the compilation unit is enormous. Split the caller                                                                                    |
| `not inlineable` after `(not loaded)`   | Callee class not loaded when the caller compiled                 | Warm the path before it matters, or accept: the recompilation after loading fixes it                                                        |
| `unloaded signature classes`            | A parameter or return type not yet loaded                        | Same                                                                                                                                        |
| `exception method`                      | Callee on a `Throwable` subclass called from normal code         | Nothing; exception construction is meant to stay out of line                                                                                |
| `native method`                         | JNI callee                                                       | Nothing; only intrinsics cross this boundary                                                                                                |
| `disallowed by CompileCommand`          | `-XX:CompileCommand=dontinline` or a directive                   | Remove the command — check for one inherited from an old launch script                                                                      |
| `don't inline by annotation`            | `@DontInline` on a **JDK** method                                | Nothing; it is not yours to change                                                                                                          |
| `force inline by CompileCommand`        | Your `inline` command was honoured                               | Lab confirmation only; the production fix is the refactoring that makes the command unnecessary                                             |

`megamorphic`, `too large` and `not inlined` are not strings C2 prints on 25. A script that
greps for them returns nothing and the silence reads as "everything inlined".

## Polymorphism: what the profile can express

The tested build recorded up to `TypeProfileWidth=2` receiver types plus overflow
information. C2 produced these outcomes for one interface-call benchmark; they illustrate
policy, not a universal “third type” rule:

| Types seen at the site | Outcome                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| 1                      | Inlined behind a class check (`inline (hot)`, `TypeProfile … = X`) |
| 2                      | Both inlined behind two checks (`UseBimorphicInlining`)            |
| 3+, one receiver ≥ 90% | The major receiver inlined behind a guard, the rest a virtual call |
| 3+, no receiver ≥ 90%  | `virtual call`, size never considered                              |

95% Circle / 5% split between two others inlined Circle; 85/10/5 and 50/45/5 were `virtual
call`. The tested threshold was `TypeProfileMajorReceiverPercent`. Changing it globally
alters guarding and code size across the process; use it only to test a hypothesis, then
prefer a source/design fix supported by the profile.

The site is the **bytecode**, not the method. A helper called from ten places with ten
receiver types has one profile, and every caller sees a megamorphic site even when each
caller alone is monomorphic. The fix is a separate call site per hot caller — duplicate the
small helper, or move the loop into type-specific code—only if the design supports it.
`final`/sealed hierarchy information can aid static binding or class-hierarchy speculation,
but the result still depends on the caller graph, loaded classes and current assumptions.

A sealed hierarchy switched over with pattern matching turns one `invokeinterface` into
`instanceof` chains with direct calls, which sidesteps the profile entirely; it is a design
change and worth it only when the profile shows the site.

## Internal inlining annotations are not an application contract

Both live in `jdk.internal.vm.annotation`, which `javac` refuses without
`--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED`, and HotSpot honours them
only on classes from the boot or platform loader (`classfile/classFileParser.cpp`,
`privileged`). Measured on 25.0.3: a 468-byte `@ForceInline` method on the class path was
still `hot method too big`, and a 4-byte `@DontInline` method was inlined. Ordinary
application use changed nothing in this build; that unsupported behavior can change and must
not become an application dependency.

The application-level equivalents, all verified on 25.0.3:

| Need                                 | Mechanism                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Force one call to inline (lab)       | `-XX:CompileCommand=inline,pkg.Class::method` → `force inline by CompileCommand`                 |
| Keep one method out of line          | `-XX:CompileCommand=dontinline,pkg.Class::method` → `disallowed by CompileCommand`               |
| Raise the node budget for one method | `-XX:CompileCommand=MaxNodeLimit,pkg.Class::method,160000` (listed by `-XX:CompileCommand=help`) |
| Same, in a running JVM               | `jcmd <pid> Compiler.directives_add file.json` with `"inline": ["+pkg.Class::method"]`           |
| Same, in a benchmark                 | JMH `@CompilerControl` with `INLINE`, `DONT_INLINE`, or `EXCLUDE`                                |

`inline` and `dontinline` are product options: no diagnostic unlock is needed for them, only
for `PrintInlining` to see the result. None of these is a production fix — they pin a
decision the profile should be making — but `dontinline` is the right tool for the lab
question "what does this allocation cost when the callee is opaque?"

## Huge-method exclusion

A method above the tested `HugeMethodLimit=8000` was excluded while
`DontCompileHugeMethods=true`. On 25.0.3 a 22,368-byte method produced **no line at
all** in `PrintCompilation` or `-Xlog:jit+compilation`, no `jdk.CompilationFailure` event,
and 432 of 436 `jdk.ExecutionSample` frames in it were `Interpreted`. One possible symptom is
therefore a hot method shown as interpreted, with nothing in the
compiler logs to explain it, and a callee that PrintInlining lists as `not inlineable`
because it has no code to inline.

Generated code is where this occurs—large switches, generated serializers or initializers.
Splitting is usually safer. Disabling `DontCompileHugeMethods` made this example compile, but
is a process-wide experiment, can create long/failed compilations, and has known JDK/tier
policy interactions (including JDK-8366118 in JDK 17–25). Check the exact release and
whole-process effect before using it as a stopgap.

`DesiredMethodLimit` is the same number applied to the **sum** of inlined bytecode in one
compilation unit; a caller that inlines many medium callees reaches it without any single
method being huge, and the verdict is `size > DesiredMethodLimit` on whichever call came
last.

## Changing a limit: the trade

| Change                              | Scope                         | What it costs                                                                                                        |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Refactor so the hot part fits       | One source area               | Engineering/semantic risk; may improve or worsen runtime and must be measured                                        |
| `CompileCommand=inline` / directive | One call site                 | A decision pinned outside the code; must ship with the launch config and be re-validated on every JDK upgrade        |
| `-XX:FreqInlineSize=<n>` globally   | Every hot site in the process | Larger nmethods, more code cache, longer C2 compiles, more `MaxNodeLimit` bailouts, worse I-cache locality elsewhere |
| `-XX:MaxInlineSize=<n>` globally    | Every cold site too           | The same, for code that was not hot enough to justify it                                                             |
| `-XX:MaxInlineLevel=<n>`            | Every deep chain              | Rarely the real cause; deep trees are usually a `DesiredMethodLimit` problem in waiting                              |
| `-XX:InlineSmallCode=<n>`           | Every already-compiled callee | Duplicates large machine code into every caller                                                                      |

A global limit is a process-wide bet that the gain at one site outweighs bloat elsewhere. It
needs whole-process throughput/tails, compilation CPU/time, code-cache and instruction-cache
evidence. Extracting a cold part is often the narrowest fix; sometimes accepting the call is
better than reshaping a clear API for one compiler heuristic.

## How this behaves in production

- **Profiles evolve.** A later receiver/path can invalidate speculative code and trigger
  deoptimization/recompilation. The new compilation may inline a dominant receiver, retain a
  virtual call or change again; correlate allocation changes with actual compile ids/events.
  A benchmark with one implementation is not representative of a production mix.
- **Rare escapes are profile-sensitive.** An unobserved branch may be absent behind an
  uncommon trap in the current compilation. When it executes, the VM may deoptimize and a
  later graph that retains the escape can allocate on common executions. This happened in
  the measured example; “once, then forever” is not a VM guarantee. Exercise rare paths and,
  where clear, construct the object only on the path that needs it.
- **Profile pollution comes from start-up and tests.** A helper exercised with many types
  by an initialiser, a warm-up routine or a test suite in the same JVM carries that profile
  into production. Per-caller call sites are the durable fix.
- **Escape analysis has a clock.** `EscapeAnalysisTimeout` (20 s, product) aborts the
  analysis of a compilation unit that takes too long; an enormous inline tree can lose EA
  entirely without any per-object verdict. Another reason to keep compilation units small.
- **Nothing here survives a JDK upgrade unmeasured.** `MaxInlineLevel` moved from 9 to 15
  (not verified here); `ReduceAllocationMerges` arrived in 22 (JDK-8287061); verdict strings
  are compiler-internal text. Re-run the measurement on the new runtime rather than the old
  conclusion.

## Primary references

- [HotSpot C2 inlining policy (`bytecodeInfo.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/bytecodeInfo.cpp)
- [HotSpot compiler globals](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compiler_globals.hpp)
- [HotSpot C2 globals](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/c2_globals.hpp)
- [HotSpot compiler control documentation](https://docs.oracle.com/en/java/javase/25/vm/compiler-control.html)
- [JDK-8366118: huge-method policy interaction](https://bugs.openjdk.org/browse/JDK-8366118)
