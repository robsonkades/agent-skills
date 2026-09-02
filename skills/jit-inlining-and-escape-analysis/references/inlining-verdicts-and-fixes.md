# From an inlining verdict to a code change

Every default and verdict string below was read off Temurin 25.0.3 (`-XX:+PrintFlagsFinal`,
`-XX:+PrintInlining`) and cross-checked against the JDK 25 sources named in each section.
Confirm the numbers on the runtime you are reasoning about; the structure is stable, the
values are not.

## The limits, and what each one measures

| Flag                              | Default on 25 | Class      | Measures                                                              |
| --------------------------------- | ------------- | ---------- | --------------------------------------------------------------------- |
| `MaxInlineSize`                   | 35            | product    | Bytecode bytes; ceiling at a **cold** call site                       |
| `FreqInlineSize`                  | 325           | product    | Bytecode bytes; ceiling at a **hot** call site                        |
| `MaxTrivialSize`                  | 6             | product    | Bytecode bytes; trivial callees inlined regardless of hotness         |
| `InlineSmallCode`                 | 2500          | product    | **Machine-code** bytes of a callee that already has an nmethod        |
| `MaxInlineLevel`                  | 15            | product    | Nesting depth of the inline tree (9 on older releases, not verified)  |
| `MaxRecursiveInlineLevel`         | 1             | product    | How many times a method may be inlined into itself                    |
| `InlineFrequencyRatio`            | 0.25          | diagnostic | Call-site count / caller invocations at or above which a site is hot  |
| `MinInlineFrequencyRatio`         | 0.0085        | diagnostic | Below this ratio the site is refused outright                         |
| `DesiredMethodLimit`              | 8000          | develop    | Aggregate bytecode bytes of one compilation unit after inlining       |
| `MaxNodeLimit`                    | 80000         | product    | Ideal-graph nodes per compilation; overridable per method             |
| `NodeLimitFudgeFactor`            | 2000          | product    | Reserve below `MaxNodeLimit` that some optimisations keep             |
| `LiveNodeCountInliningCutoff`     | 40000         | product    | Live nodes above which further inlining stops                         |
| `HugeMethodLimit`                 | 8000          | develop    | Bytecode bytes above which a method is **never compiled**             |
| `DontCompileHugeMethods`          | true          | product    | The switch for the previous line                                      |
| `TypeProfileWidth`                | 2             | product    | Receiver types recorded per call site; the rest fall into one counter |
| `TypeProfileMajorReceiverPercent` | 90            | product    | Share one receiver needs for C2 to inline it behind a type guard      |

`develop` flags are compiled out of a product build: they do not appear in `PrintFlagsFinal`
and passing one is `Unrecognized VM option`. So `DesiredMethodLimit` and `HugeMethodLimit`
cannot be raised in production; the code has to change. Declarations: `opto/c2_globals.hpp`,
`runtime/globals.hpp`, `compiler/compiler_globals.hpp`.

**What "hot" means.** C2 computes `freq = call-site count / caller invocation count`
(`opto/bytecodeInfo.cpp`, `InlineTree::should_inline`). At or above `InlineFrequencyRatio`
the site is judged against `FreqInlineSize`; below it, against `MaxInlineSize`; below
`MinInlineFrequencyRatio` it is refused as `low call site frequency`. Hotness is relative to
the caller, so a call inside a loop that runs a thousand times per invocation is hot at
frequency 1000, and a call guarded by a branch taken once per million invocations is cold no
matter how hot the caller is. Unboxing methods and constructors under escape analysis are
treated as hot regardless.

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
| `virtual call`                          | Receiver profile megamorphic, or no receiver at 90%              | Reduce the types seen at **this** site (see below). A guard-inlined major receiver is the fallback                                          |
| `no static binding`                     | Interface or abstract call with no usable profile                | Same as `virtual call`; often a call on a `default` method or through a generic helper with a polluted profile                              |
| `low call site frequency`               | Site below `MinInlineFrequencyRatio`                             | Nothing: it is cold                                                                                                                         |
| `never executed`                        | Callee has no counters and no code                               | Nothing; the path did not run during profiling                                                                                              |
| `call site not reached`                 | Profile says the site is unreachable                             | Nothing; if it later runs, an uncommon trap recompiles                                                                                      |
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

The interpreter and C1 record `TypeProfileWidth` (2) receiver types per call site; a third
type increments an overflow counter. C2 then chooses among four outcomes, measured on 25.0.3
with an interface call in a loop:

| Types seen at the site | Outcome                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| 1                      | Inlined behind a class check (`inline (hot)`, `TypeProfile … = X`) |
| 2                      | Both inlined behind two checks (`UseBimorphicInlining`)            |
| 3+, one receiver ≥ 90% | The major receiver inlined behind a guard, the rest a virtual call |
| 3+, no receiver ≥ 90%  | `virtual call`, size never considered                              |

95% Circle / 5% split between two others inlined Circle; 85/10/5 and 50/45/5 were `virtual
call`. The threshold is `TypeProfileMajorReceiverPercent`; lowering it globally trades a
guard-miss deoptimisation risk at every site for the one you are looking at, so change the
site instead.

The site is the **bytecode**, not the method. A helper called from ten places with ten
receiver types has one profile, and every caller sees a megamorphic site even when each
caller alone is monomorphic. The fix is a separate call site per hot caller — duplicate the
small helper, or move the loop into the type-specific code — not a flag. `final` on the
class or method does not create a profile; it lets C2 bind statically without one, which is
why it helps only when the receiver's static type is already the concrete one.

A sealed hierarchy switched over with pattern matching turns one `invokeinterface` into
`instanceof` chains with direct calls, which sidesteps the profile entirely; it is a design
change and worth it only when the profile shows the site.

## `@ForceInline` and `@DontInline` are not available to application code

Both live in `jdk.internal.vm.annotation`, which `javac` refuses without
`--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED`, and HotSpot honours them
only on classes from the boot or platform loader (`classfile/classFileParser.cpp`,
`privileged`). Measured on 25.0.3: a 468-byte `@ForceInline` method on the class path was
still `hot method too big`, and a 4-byte `@DontInline` method was inlined. A PR that adds them
to application code changes nothing and looks like it did.

The application-level equivalents, all verified on 25.0.3:

| Need                                 | Mechanism                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Force one call to inline (lab)       | `-XX:CompileCommand=inline,pkg.Class::method` → `force inline by CompileCommand`                 |
| Keep one method out of line          | `-XX:CompileCommand=dontinline,pkg.Class::method` → `disallowed by CompileCommand`               |
| Raise the node budget for one method | `-XX:CompileCommand=MaxNodeLimit,pkg.Class::method,160000` (listed by `-XX:CompileCommand=help`) |
| Same, in a running JVM               | `jcmd <pid> Compiler.directives_add file.json` with `"inline": ["+pkg.Class::method"]`           |
| Same, in a benchmark                 | JMH `@CompilerControl(Mode.INLINE                                                                | DONT_INLINE | EXCLUDE)` |

`inline` and `dontinline` are product options: no diagnostic unlock is needed for them, only
for `PrintInlining` to see the result. None of these is a production fix — they pin a
decision the profile should be making — but `dontinline` is the right tool for the lab
question "what does this allocation cost when the callee is opaque?"

## The method that never compiles

A method above `HugeMethodLimit` (8000 bytecode bytes) is never submitted to either compiler
(`CompilationPolicy::can_be_compiled`). On 25.0.3 a 22 368-byte method produced **no line at
all** in `PrintCompilation` or `-Xlog:jit+compilation`, no `jdk.CompilationFailure` event,
and 432 of 436 `jdk.ExecutionSample` frames in it were `Interpreted`. The symptom is
therefore a hot method that a profiler shows as interpreted frames, with nothing in the
compiler logs to explain it, and a callee that PrintInlining lists as `not inlineable`
because it has no code to inline.

Generated code is where this happens — large `switch` tables, static initialisers turned
into methods, serialisers, and test fixtures. Split the method. `-XX:-DontCompileHugeMethods`
compiles it (measured: tier 3 then tier 4 on the same run) and is a stopgap for a deploy you
cannot change, at the cost of a compilation that can take seconds and may hit
`MaxNodeLimit` anyway.

`DesiredMethodLimit` is the same number applied to the **sum** of inlined bytecode in one
compilation unit; a caller that inlines many medium callees reaches it without any single
method being huge, and the verdict is `size > DesiredMethodLimit` on whichever call came
last.

## Changing a limit: the trade

| Change                              | Scope                         | What it costs                                                                                                        |
| ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Refactor so the hot part fits       | One method                    | Engineering time; nothing at runtime                                                                                 |
| `CompileCommand=inline` / directive | One call site                 | A decision pinned outside the code; must ship with the launch config and be re-validated on every JDK upgrade        |
| `-XX:FreqInlineSize=<n>` globally   | Every hot site in the process | Larger nmethods, more code cache, longer C2 compiles, more `MaxNodeLimit` bailouts, worse I-cache locality elsewhere |
| `-XX:MaxInlineSize=<n>` globally    | Every cold site too           | The same, for code that was not hot enough to justify it                                                             |
| `-XX:MaxInlineLevel=<n>`            | Every deep chain              | Rarely the real cause; deep trees are usually a `DesiredMethodLimit` problem in waiting                              |
| `-XX:InlineSmallCode=<n>`           | Every already-compiled callee | Duplicates large machine code into every caller                                                                      |

A global limit is a process-wide bet that the gain at one site outweighs the bloat at all the
others; it needs a whole-process measurement (throughput, p99, code cache occupancy), not a
microbenchmark of the target method. In practice the refactoring
is the fix nearly every time, because the method that failed to inline was also the one that
was too big to read.

## How this behaves in production

- **The profile is a snapshot of warm-up.** A site that saw one type while the JVM warmed
  up and a third type an hour later deoptimises (`made not entrant: uncommon trap`) and
  recompiles as a virtual call — every allocation that depended on that inlining comes back
  at the same moment. The reverse trap is a benchmark that exercised one implementation and
  reported an inlined result production will never get.
- **The rare branch fires once, then costs forever.** A branch never taken during
  profiling is pruned with an uncommon trap, so an object it would have leaked is still
  `NoEscape`; measured 0 B/op. The first time the branch runs, the method deoptimises and
  recompiles with the branch present, and from then on the object escapes on **every**
  iteration; measured 24 B/op with the branch taken once per 262 144 iterations. A benchmark
  that never triggers the rare event reports the number production will lose at the first
  incident. Build the object inside the branch, or pass its fields to a method that does.
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
