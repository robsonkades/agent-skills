# From an inlining verdict to a code change

The reference baseline is Temurin 25.0.3 (`-XX:+PrintFlagsFinal`, `-XX:+PrintInlining`)
and the JDK 25 sources named below. Historical experiment anecdotes without retained harnesses
are illustrative, not reproduction evidence.
Confirm numbers, flag classes and verdict interpretation on the runtime you are reasoning
about; neither values nor policy structure are public contracts.

## The limits, and what each one measures

| Flag                              | Default on 25 | Class      | Measures                                                                      |
| --------------------------------- | ------------- | ---------- | ----------------------------------------------------------------------------- |
| `MaxInlineSize`                   | 35            | product    | Bytecode bytes; ceiling at a **cold** call site                               |
| `FreqInlineSize`                  | 325           | product    | Raised bytecode-size policy for frequent calls and selected EA/unboxing paths |
| `MaxTrivialSize`                  | 6             | product    | Bytecode-size threshold used by trivial-callee policy paths                   |
| `InlineSmallCode`                 | 2500          | product    | Callee's `inline_instructions_size()` heuristic; not whole nmethod size       |
| `MaxInlineLevel`                  | 15            | product    | Nesting depth of the inline tree                                              |
| `MaxRecursiveInlineLevel`         | 1             | product    | How many times a method may be inlined into itself                            |
| `InlineFrequencyRatio`            | 0.25          | diagnostic | Call-site count / caller invocations at or above which a site is hot          |
| `MinInlineFrequencyRatio`         | 0.0085        | diagnostic | Below this ratio the site is refused outright                                 |
| `DesiredMethodLimit`              | 8000          | develop    | Aggregate bytecode bytes of one compilation unit after inlining               |
| `MaxNodeLimit`                    | 80000         | product    | Ideal-graph nodes per compilation; overridable per method                     |
| `NodeLimitFudgeFactor`            | 2000          | product    | Reserve below `MaxNodeLimit` that some optimisations keep                     |
| `LiveNodeCountInliningCutoff`     | 40000         | product    | Live nodes above which further inlining stops                                 |
| `HugeMethodLimit`                 | 8000          | develop    | Huge-method cutoff when `DontCompileHugeMethods` policy applies               |
| `DontCompileHugeMethods`          | true          | product    | The switch for the previous line                                              |
| `TypeProfileWidth`                | 2             | product    | Receiver types recorded per call site; the rest fall into one counter         |
| `TypeProfileMajorReceiverPercent` | 90            | product    | Share one receiver needs for C2 to inline it behind a type guard              |

`develop` flags are not configurable in a product build and do not appear in `PrintFlagsFinal`.
Temurin 25.0.3 rejects them as available only in a debug VM; do not depend on one error string.
So `DesiredMethodLimit` and `HugeMethodLimit`
cannot be set in a product JVM; refactoring or a supported policy experiment may be needed. Declarations: `opto/c2_globals.hpp`,
`runtime/globals.hpp`, `compiler/compiler_globals.hpp`.

**One input to "hot" in this build.** C2 computes a call-site/caller frequency in
`InlineTree::should_inline` and uses it with profile state and other policy checks. Frequency
gates help select hot/cold size budgets and can produce `low call site frequency`, but do not
fully determine inlining: intrinsic/annotation rules, receiver profile, depth, node budget
and compiler state also apply.

## Verdict to fix

Match the compilation root, caller/BCI and tier before interpreting a verdict. Under the
stated HotSpot configuration, read the **tier-4** tree for C2; levels 1–3 use C1's verdicts
(`callee is too large`, `inlining prohibited by policy`,
`callee uses too much stack`, `total inlining greater than DesiredMethodLimit` — from
`c1/c1_GraphBuilder.cpp`). These do not predict C2's decision. `inlining prohibited by policy`
on these JDK 25 sources means a profiling C1 compilation (level 2 or 3) sees
`highest_osr_comp_level() == 4` for the callee (`compiler/compilationPolicy.cpp`,
`should_not_inline`). This records prior C2 OSR compilation, not proof that its nmethod is
still installed. Check the exact build before transferring that interpretation.

The actions below are candidates when the boundary has demonstrated workload cost. Keeping
the call is valid; neither a refusal nor a successful forced inline justifies a source rewrite.
On the pinned source, the raised size policy also applies to selected EA constructors and
unboxing methods: `hot method too big` does not itself prove measured hotness. Effective
compiler settings can differ from the defaults below. `inline_instructions_size()` normally
uses tier-4 instructions from verified entry to instruction end, less skipped instructions;
recorded training data can supply the metric instead. It is not total nmethod storage
(`ci/ciMethod.cpp`).

| Verdict (C2, `bytecodeInfo.cpp` / `doCall.cpp`) | Cause                                                                             | Fix, in order of preference                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `too big`                                       | Callee > 35 bytes at a **cold** site                                              | Usually nothing: the site is cold. If profiling says it matters, the caller's hot path is not where you think — re-read the profile |
| `hot method too big`                            | Callee exceeds the selected raised bytecode-size policy (default 325)             | Test a semantics-preserving cold split or scoped `CompileCommand=inline`; validate benefit before accepting either                  |
| `already compiled into a big method`            | Callee instruction heuristic > `InlineSmallCode` (default 2500)                   | The compiled callee may have grown through unrolling, vectorisation or inlining. Compare retaining it with a measured local change  |
| `already compiled into a medium method`         | Lower-policy path and instruction heuristic > `InlineSmallCode / 4` (default 625) | Usually retain; establish actual workload cost before changing the boundary                                                         |
| `inlining too deep`                             | Tree deeper than `MaxInlineLevel`                                                 | Compare retaining the chain with a local flattening experiment; preserve useful delegation/extension contracts                      |
| `recursive inlining is too deep`                | Method inlined into itself more than once                                         | Expected for recursion; test a behaviorally equivalent loop only when measured cost warrants it                                     |
| `virtual call`                                  | No usable guarded/static target under current profile/policy                      | Inspect types at **this** site; isolate a stable hot site only if design remains sound                                              |
| `low call site frequency`                       | Site below `MinInlineFrequencyRatio`                                              | Nothing: it is cold                                                                                                                 |
| `never executed`                                | Callee has no counters and no code                                                | Nothing; the path did not run during profiling                                                                                      |
| `call site not reached`                         | Current profile/graph treats the site as unreachable                              | Exercise representative paths; later execution may trap and recompile                                                               |
| `size > DesiredMethodLimit`                     | Current or proposed aggregate inline bytecodes reach the limit                    | Inspect caller total and proposed callee size; test a smaller inline tree only when worthwhile                                      |
| `NodeCountInliningCutoff`                       | Live nodes above `LiveNodeCountInliningCutoff`                                    | Same: the compilation unit is enormous. Split the caller                                                                            |
| `unloaded signature classes`                    | A parameter or return type not yet loaded                                         | Exercise the real path; loading may permit later compilation, but verify rather than assume a fix                                   |
| `exception method`                              | Callee on a `Throwable` subclass called from normal code                          | Nothing; exception construction is meant to stay out of line                                                                        |
| `native method`                                 | JNI callee                                                                        | Nothing; only intrinsics cross this boundary                                                                                        |
| `disallowed by CompileCommand`                  | `-XX:CompileCommand=dontinline` or a directive                                    | Establish the rule's purpose/owner; remove only if obsolete or a validated replacement preserves its required behavior              |
| `don't inline by annotation`                    | `@DontInline` on a **JDK** method                                                 | Nothing; it is not yours to change                                                                                                  |
| `force inline by CompileCommand`                | Your `inline` command was honoured                                                | Confirms a compiler decision, not a performance gain; compare unforced code and workload outcomes                                   |

Two similar-looking messages come from **C1** `GraphBuilder::invoke` in the pinned source:

- `no static binding`: C1 could not statically bind the call after its target analysis.
  This alone does not establish a polluted receiver profile or predict C2's guarded inlining.
- `not inlineable`: C1's initial eligibility gate failed; unloaded targets/holders,
  disabled inlining or appendix patching are possible causes. `(not loaded)` narrows the
  explanation, but the bare verdict does not. Inspect loading, flags and the exact call site.

Neither message means the callee needs a standalone nmethod before it can inline. C2 parses
callee bytecodes into the caller graph; an absent callee entry in `PrintCompilation` is not
an inlining verdict. Read the caller's inlining tree and subsequent compilations.

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
receiver types has one profile, and can share a mixed profile even when each caller alone is monomorphic. A caller with
statically known types may still specialize after inlining; contamination is not inevitable.
Separate hot call sites only when actual compilation evidence and maintainability justify it.
`final`/sealed hierarchy information can aid static binding or class-hierarchy speculation,
but the result still depends on the caller graph, loaded classes and current assumptions.

A Java 21 pattern-switch can expose narrower types in each branch, but its bytecode may use
an invokedynamic type-switch and later calls can remain virtual. It does not bypass profiling
or guarantee direct calls; inspect javap and compiled output before proposing the redesign.

## Internal inlining annotations are not an application contract

Both live in `jdk.internal.vm.annotation`, which `javac` refuses without
`--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED`, and HotSpot honours them
only on classes from the boot or platform loader (`classfile/classFileParser.cpp`,
`privileged`). Measured on 25.0.3: a 468-byte `@ForceInline` method on the class path was
still `hot method too big`, and a 4-byte `@DontInline` method was inlined. Ordinary
application use changed nothing in this build; that unsupported behavior can change and must
not become an application dependency.

The application-level equivalents, all verified on 25.0.3:

| Need                                           | Mechanism                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Request inlining of a matching method (lab)    | `-XX:CompileCommand=inline,pkg.Class::method` → `force inline by CompileCommand`                 |
| Keep one method out of line                    | `-XX:CompileCommand=dontinline,pkg.Class::method` → `disallowed by CompileCommand`               |
| Raise the node budget for one method           | `-XX:CompileCommand=MaxNodeLimit,pkg.Class::method,160000` (listed by `-XX:CompileCommand=help`) |
| Influence future compilations in a running JVM | `jcmd <pid> Compiler.directives_add file.json` with `"inline": ["+pkg.Class::method"]`           |
| Control benchmark method compilation           | JMH `@CompilerControl` with `INLINE`, `DONT_INLINE`, or `EXCLUDE`                                |

CompileCommand matching normally targets methods, not one arbitrary bytecode call site.
Directives can narrow the compilation roots in which an inline rule applies. Adding a
runtime directive affects subsequent compilations; it does not rewrite existing nmethods.
Confirm recompilation and the effective rule before attributing a result to it.

`inline` and `dontinline` are product options: no diagnostic unlock is needed for them, only
for `PrintInlining` to see the result. These are diagnostic controls, not automatic production
tuning recommendations. A scoped compiler-bug mitigation can still be justified with an owner,
acceptance evidence, rollback and revalidation. `dontinline` can test the lab question
"what does this allocation cost when the callee is opaque?"

## Huge-method exclusion

A method above the tested `HugeMethodLimit=8000` was excluded while
`DontCompileHugeMethods=true`. On 25.0.3 a 22,368-byte method produced **no line at
all** in `PrintCompilation` or `-Xlog:jit+compilation`, no `jdk.CompilationFailure` event,
and 432 of 436 `jdk.ExecutionSample` frames in it were `Interpreted`. One possible symptom is
therefore a hot method shown as interpreted, with nothing in the compiler logs to explain
it. Confirm bytecode size and compilation policy separately from the caller's inlining
decision; absence of a standalone compilation does not mean there are no bytecodes to inline.

Generated code is where this occurs—large switches, generated serializers or initializers.
Splitting is usually safer. Disabling `DontCompileHugeMethods` made this example compile, but
is a process-wide experiment, can create long/failed compilations, and has known JDK/tier
policy interactions (including JDK-8366118 in JDK 17–25). Check the exact release and
whole-process effect before using it as a stopgap.

`DesiredMethodLimit` applies to aggregate inline bytecodes. With `ClipInlining`, the pinned
C2 policy checks both the current total and the total plus the proposed callee against the
limit using `>=`, subject to force/incremental-inlining exceptions. The verdict
`size > DesiredMethodLimit` therefore need not mean the caller already accumulated 8000 bytes,
and does not prove any one method is huge.

## Changing a limit: the trade

| Change                              | Scope                                                  | What it costs                                                                                                        |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Refactor so the hot part fits       | One source area                                        | Engineering/semantic risk; may improve or worsen runtime and must be measured                                        |
| `CompileCommand=inline` / directive | Matching methods/compile roots                         | A decision pinned outside the code; must ship with the launch config and be re-validated on every JDK upgrade        |
| `-XX:FreqInlineSize=<n>` globally   | Every hot site in the process                          | Larger nmethods, more code cache, longer C2 compiles, more `MaxNodeLimit` bailouts, worse I-cache locality elsewhere |
| `-XX:MaxInlineSize=<n>` globally    | Every cold site too                                    | The same, for code that was not hot enough to justify it                                                             |
| `-XX:MaxInlineLevel=<n>`            | Every deep chain                                       | Rarely the real cause; deep trees are usually a `DesiredMethodLimit` problem in waiting                              |
| `-XX:InlineSmallCode=<n>`           | Sites consulting the callee instruction-size heuristic | May admit more/larger inline graphs; caller code size and compilation cost must be measured                          |

C2 reparses bytecode and optimizes it in the caller's context; it does not copy the callee's
existing machine code into every caller. Raising `InlineSmallCode` relaxes a heuristic,
not the other inlining gates, and cannot predict final caller size on its own.

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
  into production. Caller-specific type information can sometimes specialize it; separate call sites are a
  measured design option, not a mandatory or permanent cure.
- **Escape analysis has a build budget.** `EscapeAnalysisTimeout` (20 s, product) is checked
  during connection-graph building. The pinned source can abort when elapsed plus estimated
  remaining work reaches the budget, as well as at elapsed-time checks between phases; it is
  not an exact whole-compilation wall-time limit. A large graph can lose EA without a
  per-object verdict; confirm this mechanism before reshaping the compilation unit.
- **Recheck after a JDK upgrade.** `ReduceAllocationMerges` arrived in 22 (JDK-8287061); verdict strings
  are compiler-internal text. Re-run the measurement on the new runtime rather than the old
  conclusion.

## Primary references

- [HotSpot C2 inlining policy (`bytecodeInfo.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/bytecodeInfo.cpp)
- [HotSpot C1 call eligibility and verdicts (`c1_GraphBuilder.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/c1/c1_GraphBuilder.cpp)
- [HotSpot C2 call selection (`doCall.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/doCall.cpp)
- [HotSpot C2 bytecode parsing for inlining (`callGenerator.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/callGenerator.cpp)
- [HotSpot compilation eligibility (`compilationPolicy.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compilationPolicy.cpp)
- [HotSpot callee instruction-size metric (`ciMethod.cpp`)](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/ci/ciMethod.cpp)
- [HotSpot compiler globals](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compiler_globals.hpp)
- [HotSpot C2 globals](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/c2_globals.hpp)
- [JEP 165: Compiler Control](https://openjdk.org/jeps/165)
- [JDK-8366118: huge-method policy interaction](https://bugs.openjdk.org/browse/JDK-8366118)
