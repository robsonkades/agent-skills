# Diagnosing an elimination that did not happen

## Procedure

```
Suspicion: this object should be eliminated and is not
  |
  1. -prof gc: is gc.alloc.rate.norm ~0, or the object's full size?
     |-- ~0 ......... EA is working. The problem is something else. Stop.
     +-- full size .. continue
  |
  2. -XX:+PrintInlining: is there a "too big" / "not inlineable" on the chain?
     |
     |-- yes -> 3a. Does the callee fit within MaxBCEAEstimateSize (150 bytes)?
     |          |-- fits, and does not store the object
     |          |     -> should be ArgEscape via BCEA: still allocates,
     |          |        but a lock on it should elide
     |          +-- does not fit, or stores it
     |                -> GlobalEscape by default pessimism:
     |                   allocates AND keeps real synchronisation
     |
     +-- no, everything was inlined
                -> 3b. Which connection-graph edge reaches a sink?
                       (field, return, thread, rare path)
  |
  4. Fix the cause: extract the rare path, reduce polymorphism, or raise
     MaxBCEAEstimateSize only when the gain sought is lock elision.
     Then repeat step 1 on the same load.
```

## Flags, with corrected descriptions

```bash
java -XX:+PrintFlagsFinal -version \
  | grep -E "DoEscapeAnalysis|EliminateAllocations|EliminateLocks"
```

| Flag                                    | Default     | What it actually controls                                                                |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `-XX:+DoEscapeAnalysis`                 | `true`      | Whether the connection graph is built at all                                             |
| `-XX:+EliminateAllocations`             | `true`      | Scalar replacement — keeps the analysis, changes only macro expansion                    |
| `-XX:+EliminateLocks`                   | `true`      | Lock elision — independent of scalar replacement, and applies to ArgEscape too           |
| `-XX:EliminateAllocationArraySizeLimit` | 64 elements | Largest array eligible for scalar replacement; above it, allocated even without escaping |
| `-XX:MaxBCEAEstimateSize`               | 150         | **Bytecode bytes of the non-inlined callee**, not object size                            |

All three booleans default to `true`. Turning one off is a lab comparison technique, not a
production setting.

## CompileCommand: the correct form

```bash
# CORRECT — enables PrintEscapeAnalysis for one method (requires a debug build)
-XX:+UnlockDiagnosticVMOptions -XX:+PrintEscapeAnalysis \
-XX:CompileCommand=option,lab.EscapeAnalysisDeepBenchmark::noEscapeBase,PrintEscapeAnalysis
```

```bash
# WRONG — there is no "PrintEscapeAnalysis" verb in CompileCommand
-XX:CompileCommand=PrintEscapeAnalysis,*ClassName.methodName
```

The wrong form does not fail loudly. Depending on the build it is ignored silently or emits a
parse warning easy to lose in startup output. The symptom — no EA output for the method — is
indistinguishable from "EA found nothing to report" unless the syntax is checked first.

Other useful verbs, in the same `Class::method` form:

```bash
-XX:CompileCommand=dontinline,lab.EscapeAnalysisDeepBenchmark::readWithoutStoring
-XX:CompileCommand=inline,lab.EscapeAnalysisDeepBenchmark::someHelper
```

## Confirming macro expansion in the emitted code

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly \
     -XX:CompileCommand=print,lab.EscapeAnalysisDeepBenchmark::noEscapeBase \
     -jar target/benchmarks.jar
```

Look for a call to the allocation runtime routine. Present means macro expansion expanded the
node; absent means it removed it. The exact symbol name varies by build.

## JFR allocation events

```bash
jcmd <PID> JFR.start duration=60s settings=profile filename=/tmp/alloc.jfr
jfr print --events jdk.ObjectAllocationSample /tmp/alloc.jfr
```

| Event                             | Default status (JDK 16+)                           | Correct use                                                                                                |
| --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `jdk.ObjectAllocationSample`      | **Enabled**, including in `default.jfc`            | The correct source for "who is allocating", including for inferring that EA failed                         |
| `jdk.ObjectAllocationInNewTLAB`   | **Disabled** (JDK-8257602) — only in `profile.jfc` | A zero count proves nothing unless the session used `settings=profile` and the event was confirmed enabled |
| `jdk.ObjectAllocationOutsideTLAB` | **Disabled**, same condition                       | Same                                                                                                       |

The names that sound more precise are the ones disabled by default — the temptation to reach
for them grows exactly when someone is trying to be more rigorous. Even
`jdk.ObjectAllocationSample` is throttled sampling and cannot prove absence of allocation on
its own; in the lab, JMH `-prof gc` remains the primary metric.

## Checklists

**Baseline**

- [ ] `DoEscapeAnalysis`, `EliminateAllocations`, `EliminateLocks` confirmed `true` in production
- [ ] No malformed `CompileCommand` inherited from an older configuration
- [ ] For JFR: the session uses `settings=profile` explicitly, and the target event is
      confirmed enabled before a zero count is treated as evidence

**An ArgEscape that BCEA should have classified**

- [ ] `-XX:+PrintInlining` confirms `too big` / `not inlineable` for the relevant callee
- [ ] The callee's real bytecode size confirmed with `javap -c -p`, not inferred from source
- [ ] Explicit comparison: callee size against `MaxBCEAEstimateSize` (default 150)
- [ ] If the object is synchronised on: time measured with and without the `too big`, to
      confirm the difference is lock elision and not something else
- [ ] Expectation recorded correctly — the target is lock elision, **not** removing the
      allocation

**Deoptimisation in a method with aggressive scalar replacement**

- [ ] Correlated with `jdk.Deoptimization` or `-Xlog:deoptimization`, not with JMH. After
      warm-up a compiled method tends not to deoptimise again, and forcing deoptimisations
      inside the benchmark introduces larger side effects than the effect being measured
- [ ] Number of scalar-replaced objects in the method estimated (via `-XX:+PrintEscapeAnalysis`
      on a debug build, where available)
- [ ] Rematerialisation counted as an additional cost, not dismissed as "just recompilation"

**Before publishing any number from this kind of investigation**

- [ ] `gc.alloc.rate.norm` measured, not inferred
- [ ] Baseline taken before the change, under the same load
- [ ] Any figure from a composite or third-party case labelled as such, not presented as an
      own measurement
