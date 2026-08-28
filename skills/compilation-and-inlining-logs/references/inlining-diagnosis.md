# Diagnosing an inlining refusal

## Capturing the decisions

```bash
java -XX:+PrintCompilation \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining \
     -jar app.jar 2>&1 | grep -A 20 "YourClass::yourMethod"
```

```
316   4   com.myapp.Calculator::compute (78 bytes)
            @ 5   java.lang.Math::abs (8 bytes)                inline (hot)
            @ 15  com.myapp.Utils::normalize (45 bytes)        inline (hot)
            @ 28  com.myapp.BigHelper::doHeavyWork (156 bytes) too large
            @ 45  com.myapp.Utils::format (28 bytes)           inline (hot)
            @ 61  java.lang.String::valueOf (5 bytes)          inline (hot)
```

Scoped to one method in a running JVM, without global noise:

```bash
jcmd <PID> Compiler.directives_add directives.json
jcmd <PID> Compiler.directives_clear
```

```json
[
  {
    "match": "com/myapp/Service.process(*)",
    "c2": { "PrintInlining": true }
  }
]
```

For the full tree, bytecode and compilation history side by side, offline:

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation \
     -XX:LogFile=/tmp/jit.log -jar app.jar
```

The file mixes text and XML and is meant for **JITWatch**, which rebuilds the inlining tree,
the per-method compilation history and annotated bytecode. Its overhead is noticeably higher
than `PrintCompilation` — synchronous I/O at much finer granularity — so it is a diagnostic
session, never continuous production.

## The three size bands

| Callee bytecode size | Condition to inline                       | Governing flag              |
| -------------------- | ----------------------------------------- | --------------------------- |
| ≤ 35 bytes           | **Unconditional** with respect to hotness | `-XX:MaxInlineSize`         |
| 36-325 bytes         | Only if the call site is hot              | `-XX:FreqInlineSize`        |
| > 325 bytes          | Never on the normal path, hot or not      | ceiling of `FreqInlineSize` |

Hotness decides something **only in the middle band**. Below 35 bytes it is irrelevant;
above 325 nothing saves the callee. This is why blaming `MaxInlineSize` for a hot 70-byte
method is incoherent: a hot method in that band is judged against `FreqInlineSize`, and 70 is
comfortably under both relevant limits.

Two further gates apply independently of the band:

- **Call-site polymorphism.** Monomorphic and bimorphic still allow inlining; megamorphic
  (3+ observed concrete types) blocks it entirely, whatever the callee's size.
- **Nesting depth**, `-XX:MaxInlineLevel`. Confirm its default on your build with
  `-XX:+PrintFlagsFinal | grep MaxInlineLevel` — it has changed between releases.

Order matters: megamorphism is checked before size, so a 40-byte callee at a four-type call
site invoked millions of times per second is still not inlined.

## Refusal categories

| Category                    | Cause                                                             | What to do                                                 |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Above `FreqInlineSize`, hot | Bytecode > 325 bytes                                              | Extract the rare part out of the common path               |
| Above `MaxInlineSize`, cold | 36-325 bytes, site not yet hot                                    | Wait for warm-up, or check the path is executed            |
| Never executed              | Cold path, no profile                                             | Normal — nothing to fix                                    |
| Megamorphic call site       | 3+ concrete types observed                                        | Reduce polymorphism, or accept the cost knowingly          |
| Depth exceeded              | `MaxInlineLevel` reached in a chain                               | Rarely worth changing; usually a symptom of something else |
| Method excluded             | `@DontInline`, `CompilerOracle` or a directive, or not compilable | Check active annotations and directives                    |

## Two decision flows

**Did the method reach the level it should?**

```
Suspect method
├── 1. Appears in PrintCompilation at tier 4?
│      no → still warming up, or correctly parked at tier 1 (trivial)
├── 2. Appears, disappears, returns with recurring "made not entrant"?
│      yes → deoptimisation loop; that is a different investigation
├── 3. Never appears at any level?
│      Compiler.queue persistently backed up → compiler threads exhausted
│      jdk.CodeCacheFull in JFR → JIT switched off
│      jdk.CompilationFailure for that method → C2 gave up
└── 4. At tier 4 but the hot path is still slow?
       Not a compilation-level problem. Go to PrintInlining.
```

**Why was this specific call not inlined?**

```
PrintInlining shows "too large" or similar for a hot call
├── 1. Measure the callee's real bytecode (javap -c, or the printed number)
│      ≤ 35 bytes   → size is not the reason; check polymorphism and depth
│      36-325 bytes → only fails when not hot; confirm with profiling
│      > 325 bytes  → size failure is expected, hot or not
├── 2. Is the call site polymorphic?
│      3+ types → megamorphic; size is irrelevant
└── 3. Refactor the common path to fit, then re-measure with PrintInlining
       before raising any global flag.
```

## Changing limits, in order of preference

| Option                                                           | Effect                                    | When                                                     |
| ---------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| Refactor the method to fit the limit                             | Fixes it at source, no side effects       | Almost always                                            |
| `@CompilerControl(Mode.INLINE)` in JMH, or an `Inline` directive | Forces the attempt for one method         | Isolating a call site in a benchmark; rare in production |
| Raise `-XX:FreqInlineSize` globally                              | Affects **every** call in the process     | Only with before/after measurement                       |
| Raise `-XX:MaxInlineSize` globally                               | Affects every call, cold methods included | Rarely justifiable                                       |

A global limit raised to fix one method is a non-local change: larger inlined bodies bloat
generated code, hurt instruction-cache locality, and can reduce aggregate throughput even
though the target method got "fixed". Measure the whole process, not the method.

## Continuous production instead of session flags

```bash
jcmd <PID> JFR.start duration=60s filename=jit.jfr settings=profile

jfr print --events jdk.Compilation jit.jfr
jfr print --events jdk.CompilationFailure jit.jfr
jfr print --events jdk.CompilerStatistics jit.jfr
jfr print --events jdk.Deoptimization jit.jfr
jfr print --events jdk.CodeCacheFull jit.jfr

# Confirm an event name on your own runtime before scripting against it
jfr summary jit.jfr | grep -i compil
```
