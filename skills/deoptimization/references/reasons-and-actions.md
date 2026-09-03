# Reasons, actions and mitigations

Every string below is the one HotSpot prints, taken from `_trap_reason_name[]` and
`_trap_action_name[]` in `deoptimization.cpp` and confirmed against
`-Xlog:deoptimization=debug` and `jfr print --events jdk.Deoptimization` on Temurin 25.0.3.
Another JVM is under no obligation to use them; the tested JVMCI-enabled Temurin 25.0.3 build
suffixes three of them.

## Reasons — why the trap fired

| Reason                                                                                                      | Typical `instruction`                           | What C2 had assumed                                                                                                  | Observed action (25.0.3)                                                    |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `class_check`                                                                                               | `invokeinterface`, `invokevirtual`, `checkcast` | The profile showed one receiver type; the site was inlined behind a type guard                                       | `maybe_recompile` ×4, then the nmethod is `made not entrant: uncommon trap` |
| `bimorphic_or_optimized_type_check`                                                                         | `invoke*`                                       | Two receiver types, both inlined; a third arrived                                                                    | `maybe_recompile` ×4, then recompiled as a virtual call                     |
| `unstable_if`, `unstable_fused_if`                                                                          | `if_icmpge`, `ifne`, `ifge` …                   | The branch was never taken during profiling, so the other side was not compiled                                      | `reinterpret`, once per bci                                                 |
| `null_check`                                                                                                | `getfield`, `iaload`, `invoke*`                 | The reference was never null                                                                                         | `maybe_recompile` ×3, then `made not entrant: uncommon trap`                |
| `null_assert_or_unreached0`                                                                                 | —                                               | The reference was always null (JVMCI shares the slot with "unreached")                                               | (source only)                                                               |
| `range_check`                                                                                               | `iaload`, `iastore` …                           | The index was always in bounds                                                                                       | `make_not_entrant` on the first hit                                         |
| `div0_check`                                                                                                | `idiv`, `ldiv`                                  | The divisor was never zero; recorded per bci as a `null_check`                                                       | (source only)                                                               |
| `array_check`                                                                                               | `aastore`, `checkcast`                          | The array's element class matched the profile                                                                        | `maybe_recompile`                                                           |
| `intrinsic_or_type_checked_inlining`                                                                        | intrinsic call (`Arrays.copyOf`)                | An intrinsic's guard held (e.g. array type)                                                                          | `make_not_entrant`                                                          |
| `unloaded`, `uninitialized`, `initialized`                                                                  | `new`, `getstatic`, `invokestatic`              | The class was not loaded / not initialised when the method was compiled; the trap runs the loader or `<clinit>`      | `reinterpret` / `make_not_entrant`, once                                    |
| `predicate`, `loop_limit_check`, `profile_predicate`                                                        | loop header                                     | Loop predication or range-check elimination assumption (bounds, trip count)                                          | `maybe_recompile`                                                           |
| `speculate_class_check`, `speculate_null_check`, `speculate_null_assert`                                    | `invoke*`, `getfield`                           | Type speculation on argument/return types (`UseTypeSpeculation`), a weaker assumption than the profile               | limited by `PerMethodSpecTrapLimit`                                         |
| `constraint`, `unreached`, `unhandled`, `receiver_constraint`, `age`, `tenured`, `auto_vectorization_check` | —                                               | Compiler-internal: code the compiler proved unreachable ran, an exception handler that was never entered, code aging | (source only)                                                               |

`instruction` is a field of the JFR event and is the fastest way to tell a call-site trap
from a branch trap without opening the source.

## Actions — what the runtime does next

Five, not three. Only the last three invalidate the nmethod; every one of the five
deoptimises the current frame — the thread continues in the interpreter from `trap_bci`
regardless.

| Action                | Effect on the nmethod                                                                                          | Effect on the profile     | Cost                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `none`                | Kept. C2 emitted the trap without requesting another recompile                                                 | Not updated               | Frame deoptimisation on each hit while that nmethod remains installed — see below |
| `maybe_recompile`     | Kept; a recompilation is requested. Made not entrant once the bci has trapped `PerBytecodeTrapLimit` (4) times | Trap recorded at the bci  | Cheap until the fourth hit                                                        |
| `reinterpret`         | Made not entrant; invocation counters reset so the interpreter reprofiles for a while                          | Trap recorded; reprofiled | Interpreted until the counters climb again                                        |
| `make_not_entrant`    | Made not entrant; recompiled as soon as the counters allow                                                     | Trap recorded             | One recompilation                                                                 |
| `make_not_compilable` | Made not entrant and the loaded method is excluded from **C2**                                                 | —                         | Persistent for that loaded method; C1 can still compile it                        |

`make_not_compilable` is almost never the action C2 requests. The give-up decision in
production is the runtime's, taken in `uncommon_trap_inner` (`deoptimization.cpp`) when a
bci exceeds `PerBytecodeRecompilationCutoff` or, in `MethodData::inc_decompile_count()`,
when the method exceeds `PerMethodRecompilationCutoff`. Both call `set_not_compilable` with
`CompLevel_full_optimization`: the method stays compilable by C1 and
`CompilationPolicy::compile()` sends it to tier 1 when a tier-4 request is refused. It is
not interpreted from then on, but it is C1 code without profiling — a permanent, quiet
slowdown. Verified by forcing the cutoff (executed, 25.0.3):

```
841   56       4       DeoptLab::dispatch (7 bytes)   made not entrant: uncommon trap
made not compilable on level 4  DeoptLab::dispatch (7 bytes)   give up compiling
841   65       3       DeoptLab::dispatch (7 bytes)
```

and `jcmd <pid> Compiler.codelist` afterwards lists one live nmethod for the method at level 1.

## Why a method converges — and the two ways it fails to

Speculation is bounded by the method's profile, not by the cutoffs. Every trap is recorded
in the `MethodData` (one bit per bci per reason plus a per-reason counter), and when C2 next
compiles the method it asks `Compile::too_many_traps(method, bci, reason)`: **any** recorded
trap at that bci means "do not speculate here again" (`compile.cpp` — "Assume
PerBytecodeTrapLimit==0"). The record lives in the MDO of the method that owns the bytecode,
so an inlined callee that trapped in one caller is not speculated on in the next caller
either. That is why:

- an oscillating branch produces **one** `unstable_if` per bci, not a stream. A branch
  flipped sixty times in a loop produced exactly one event, and the recompiled code carried
  both sides (executed, 25.0.3);
- a call site that meets a second type traps at most four times before it is recompiled
  bimorphic, and at most four more before it becomes a plain virtual call. No further traps,
  no further inlining;
- `null_check`, `range_check` and `div0_check` converge on an explicit throw
  (`GraphKit::builtin_throw`, `graphKit.cpp`); once the throw is hot the exception is
  pre-allocated with no stack trace (`OmitStackTraceInFastThrow`).

`PerMethodTrapLimit` (100) is the backstop: once a method has trapped that many times for
one reason, C2 stops speculating on that reason anywhere in the method.
`PerMethodSpecTrapLimit` (5000, experimental) is the same for the `speculate_*` reasons,
which are recorded per compiled root method and bci rather than per bytecode.

The two shapes that do not converge:

**The `none` storm.** `Compile::too_many_recompiles` returns true once the method has
decompiled `PerMethodRecompilationCutoff / 2 + 1` times (201 by default) or a bci has
`PerBytecodeRecompilationCutoff / 8` (25) overflow recompiles. C2 then emits the trap with
`Action_none`: the nmethod is not invalidated by that action, the profile is not updated, and each hit
is a full deoptimisation of the frame — an interpreter round-trip per call. Forced with
`-XX:PerMethodRecompilationCutoff=3`, the same method logged 11,843 `unstable_if none` lines
at one `cid` and the run took 38 s instead of 2 s (executed, 25.0.3). This is what "never
stabilises" looks like in a real log, and it happens **before** the cutoff, which the method
may never reach. Reaching it requires roughly 200 distinct decompilations of one method —
generated code with hundreds of speculated sites, or a method whose MDO keeps being
replaced.

**The C1 fallback.** The cutoff itself, described above. Quieter than the storm: no events
at all, just a method that is now tier 1 and stays there.

## The two routes into a class-loading deoptimisation

They look alike in a latency graph and nothing alike in the logs.

**Per-invocation guard.** The compiled code carries an uncommon trap that a real invocation
hits with an unexpected type. Spread over time, one `cid` and `trap_bci` at a time, visible
in `jdk.Deoptimization` as `class_check` with `instruction = invokeinterface` (or
`invokevirtual`, `checkcast`), and it requires the new type to actually reach the site.

**CHA dependency invalidation.** C2 compiled a call site assuming an interface or abstract
class had a single concrete implementor and registered a dependency
(`unique_concrete_method`, `abstract_with_unique_concrete_subtype`, `leaf_type` —
`dependencies.cpp`). Loading a class that violates it — even if never instantiated — flushes
every dependent nmethod at once. No bytecode of the compiled method runs; class linkage is
the trigger. On JDK 25 it is executed by a `Handshake "Deoptimize"`
(`DeoptimizeMarkedClosure`, `deoptimization.cpp`), not a global safepoint (executed:
`-Xlog:handshake=info`), and it produces **no `jdk.Deoptimization` event and no
`-Xlog:deoptimization` line**. Its evidence is elsewhere:

```
[0.548s]   25   !   3       DeoptLab::main (463 bytes)   made not entrant: marked for deoptimization
```

in `-Xlog:jit+compilation=debug` or `PrintCompilation`, and in `-Xlog:dependencies=debug`:

```
Failed dependency of type leaf_type
  context = java.util.HashMap
  witness = java.util.LinkedHashMap
  code: nmethod
Marked for deoptimization
  dependee = java.util.LinkedHashMap
```

The signature is several unrelated methods marked within the same millisecond, right after a
`-Xlog:class+load` line for the dependee. A JFR-only monitoring setup will show the latency
spike and none of the cause.

`RedefineClasses` (JVMTI: HotSwap, some instrumentation agents) is broader still: it flushes
every nmethod with an `evol_method` dependency on the redefined class — every caller and
every method that inlined it — inside a global safepoint named `RedefineClasses`.

## The lifecycle, and where it can end

```
C2 compiles M under assumption S (a guard with an uncommon trap embedded,
or a dependency registered with no guard at all)
   |
   |-- S still holds ----------------------------------------------> stays compiled
   |
   +-- a dependency is violated by class loading / RedefineClasses
   |      -> Handshake "Deoptimize": "made not entrant: marked for deoptimization"
   |      -> no trap record, no JFR event; recompiled with the new hierarchy
   |
   +-- the guard fails: uncommon trap, reason recorded in the MDO
          -> action:
               none              -> nmethod kept, frame deoptimised, nothing learned
               maybe_recompile   -> nmethod kept until the 4th hit at this bci
               reinterpret       -> not entrant, counters reset, reprofiled
               make_not_entrant  -> not entrant, recompiled
          -> next compilation does NOT speculate at a bci that has trapped
               profile covers the behaviour        -> stable, done (the normal case)
               decompile_count > 201 (or bci > 25) -> traps emitted with action none: storm
               decompile_count > 400 (or bci > 200)-> not compilable on level 4: C1 for good
```

## Frame reconstruction, and why scalar replacement makes it dearer

1. A thread executes the compiled nmethod containing the trap for assumption S.
2. S stops holding: the trap is hit, or the class loader invalidates the dependency.
3. The JVM captures the execution state at that exact point — the program counter inside
   compiled code, the registers needed to reconstruct Java locals, and the state of objects
   eliminated by scalar replacement, which must now be rematerialised on the heap
   (`Deoptimization::realloc_objects` / `reassign_fields`, `deoptimization.cpp`).
4. Equivalent interpreted frames are rebuilt from that state (the packing and unpacking
   blocks under `TraceDeoptimization`, one `VFrame` per inlined level).
5. The thread continues in the interpreter from the deoptimisation point.
6. The method is reprofiled; once the new profile suffices, C2 recompiles.

Step 3 is why recurring deoptimisation in a method with many eliminated allocations costs
more than recompilation CPU alone: every scalar-replaced object gets created for real, when
on the happy path it would never have existed. It is also why an `action=none` storm in such
a method can allocate more than the method itself.

## Symptom to cause

| Log or JFR signature                                                                        | Likely code shape                                                                 | What to change                                                                                     |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A burst of `class_check` on one `cid`, then `made not entrant: uncommon trap`, then silence | A call site profiled monomorphic met its second implementation                    | Nothing, if once. If it is after every deploy: warm up with every type the site will see           |
| `bimorphic_or_optimized_type_check` then silence, but the method got slower                 | A third receiver type; the site is now a virtual call and no longer inlines       | A decision, not a bug: peel the hot type into its own site, or accept                              |
| Several methods `marked for deoptimization` in the same millisecond, after a `class+load`   | A new implementor of a still-single-implementor interface was loaded              | Warm-up that loads it before traffic, or a static type that cannot gain implementors               |
| The above, recurring for minutes after a deploy                                             | Lazy loading — plugins, proxies, generated classes, lambdas — under live traffic  | Preload / pre-generate at start-up; gate traffic on the invalidation rate reaching its floor       |
| The above, recurring in steady state                                                        | Runtime class generation per request (scripting, per-tenant proxies, serialisers) | Cache the generated classes; the invalidations stop when the hierarchy stops changing              |
| `unstable_if` once per bci across many methods at start-up                                  | Branches first taken under real traffic                                           | Normal. Only a rate that does not fall to zero is a finding                                        |
| `unloaded` / `uninitialized` at start-up                                                    | Classes loaded lazily after the caller compiled                                   | Normal. CDS / AOT class loading moves it earlier, nothing else                                     |
| `null_check` or `range_check` once, then an exception with no stack trace                   | An exception used as control flow, now compiled as a fast throw                   | `-XX:-OmitStackTraceInFastThrow` to see it once; then remove the exception from the path           |
| `action=none` at a steady rate on one `cid` and `trap_bci`                                  | A method past 201 decompilations: C2 stopped learning, the trap stays             | Find why it decompiled 200 times (generated code, `RedefineClasses` loops); restart clears the MDO |
| `made not compilable on level 4 … give up compiling`                                        | The cutoff was reached; the method is tier 1 now                                  | Same as above. Raising the cutoff only moves the line                                              |
| `jdk.Deoptimization` and `jdk.CompilationFailure` on the same method                        | Pathologically large or complex generated bytecode                                | Split the generated method; the compiler is telling you it cannot represent it                     |
| `speculate_class_check` recurring across callers of one callee                              | Type speculation on arguments that differ per caller                              | `-XX:-UseTypeSpeculation` as an experiment only; fix the API shape if confirmed                    |

## Mitigations, in order of preference

| Strategy                                                   | Effect                                                                                                                                                                          | When                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Static type at the call site that cannot gain implementors | A `final` class as the receiver's **static** type needs no CHA dependency and no guard; a `final` implementation behind an interface-typed variable changes nothing             | Whenever the call site can be typed concretely                            |
| Warm-up exercising every expected concrete type            | The profile is bimorphic or megamorphic before production; the deoptimisation never happens under traffic — at the price of the monomorphic inline you would otherwise have had | When the types are known up front, e.g. registered Spring implementations |
| Load or generate every class at start-up                   | The CHA invalidation happens once, before traffic                                                                                                                               | Plugins, proxies, generated accessors, scripting                          |
| Accept the single deploy-time deoptimisation               | No code change                                                                                                                                                                  | When the new class loads only at boot, not in steady state                |
| Isolate the problem call site into its own small method    | Limits the recompilation blast radius and the rematerialisation cost                                                                                                            | When the affected method is large or scalar-replaces a lot                |
| Remove the exception from the hot path                     | No trap, no fast-throw                                                                                                                                                          | `null_check` / `range_check` used as control flow                         |

Two entries are absent on purpose. Splitting an oscillating `if` into separately compiled
methods solves a problem that does not exist: after the first trap the branch is compiled
with both sides. Raising a recompilation cutoff changes when the JVM gives up, not whether
the method converges — and the `none` storm sits well before the cutoff.

## Authoritative sources

- [JDK 25 HotSpot `deoptimization.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/deoptimization.cpp)
- [JDK 25 HotSpot `compile.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/compile.cpp)
- [JDK 25 HotSpot `methodData.hpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/oops/methodData.hpp)
- [JDK-8216041: JFR event for deoptimization](https://bugs.openjdk.org/browse/JDK-8216041)
