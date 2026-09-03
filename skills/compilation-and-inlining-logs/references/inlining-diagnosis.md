# Diagnosing an inlining refusal

## Capturing the decisions

```bash
# Session flags: PrintInlining is diagnostic, so the unlock must come first
java -XX:+PrintCompilation \
     -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining \
     -jar app.jar 2>&1 | grep -A 20 'YourClass::yourMethod'

# Same trees, no unlock, with the compilation header they hang from
java -Xlog:jit+compilation,jit+inlining=debug -jar app.jar

# One caller only
java -XX:+UnlockDiagnosticVMOptions -XX:CompileCommand=quiet \
     -XX:CompileCommand=PrintInlining,com.myapp.Service::process -jar app.jar
```

Real output for one caller, Temurin 25.0.3 — first the tier-3 tree, then the tier-4 tree:

```
26   17       3       Lab::hot (44 bytes)
                              @ 1   Lab::small (4 bytes)   inline
                              @ 7   Lab::medium (86 bytes)   failed to inline: callee is too large
                              @ 14   Lab::big (1015 bytes)   failed to inline: callee is too large
              s               @ 21   Lab::sync (4 bytes)   inline
               !              @ 30   Lab::handler (8 bytes)   inline
                              @ 37   Lab::sumAreas (40 bytes)   failed to inline: callee is too large
31   36       4       Lab::hot (44 bytes)
                              @ 1   Lab::small (4 bytes)   inline (hot)
                              @ 7   Lab::medium (86 bytes)   inline (hot)
                              @ 14   Lab::big (1015 bytes)   failed to inline: hot method too big
              s               @ 21   Lab::sync (4 bytes)   inline (hot)
               !              @ 30   Lab::handler (8 bytes)   inline (hot)
                              @ 37   Lab::sumAreas (40 bytes)   inline (hot)
                                @ 25   Lab$Sq::area (10 bytes)   inline (hot)
                                @ 25   Lab$Rect::area (10 bytes)   inline (hot)
                                 \-> TypeProfile (6752/13504 counts) = Lab$Rect
                                 \-> TypeProfile (6752/13504 counts) = Lab$Sq
```

`medium` (86 bytes) is refused by C1 and inlined by C2 at the same hot site. Reading the
tier-3 tree as C2's verdict is the most common misdiagnosis this output invites: **find the
compilation line the tree hangs from and read its tier first**. A bimorphic site prints one
`@ bci` line per receiver type and the `TypeProfile` counts that justified it; indentation is
nesting depth. `-Xlog:jit+inlining=debug` prints the same lines, undecorated, and without the
`jit+compilation` tag alongside it there is no header to tell one tree from the next.

## The verdict strings

C2's strings come from `bytecodeInfo.cpp`, C1's from `c1_GraphBuilder.cpp`; the examined
25.0.3 build prefixes refusals with `failed to inline:`. Treat message text as an
implementation detail and confirm it on the exact runtime before automating. The
limit-to-flag mapping in depth is `c2-sea-of-nodes`'s; this is the reading list.

| Printed                                                 | Compiler | Meaning                                                                   |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `inline`                                                | C1       | Inlined under `C1MaxInlineSize` (35)                                      |
| `inline (hot)`                                          | C2       | Inlined; the site was hot enough for `FreqInlineSize`                     |
| `intrinsic`                                             | both     | Replaced by an intrinsic, no bytecode inlined                             |
| `failed to inline: callee is too large`                 | C1       | Over `C1MaxInlineSize`. **Says nothing about C2**                         |
| `failed to inline: too big`                             | C2       | Over `MaxInlineSize` (35) at a site that was not hot                      |
| `failed to inline: hot method too big`                  | C2       | Over `FreqInlineSize` (325) even though the site was hot                  |
| `failed to inline: already compiled into a big method`  | C2       | Callee's own nmethod exceeds `InlineSmallCode` (2500 machine-code bytes)  |
| `failed to inline: inlining too deep`                   | C2       | `MaxInlineLevel` (15 since JDK 14, JDK-8234863) reached                   |
| `failed to inline: recursive inlining is too deep`      | C2       | `MaxRecursiveInlineLevel` (1)                                             |
| `failed to inline: virtual call`                        | C2       | No profitable/safe speculative target was selected at this virtual site   |
| `failed to inline: no static binding`                   | both     | Interface/virtual target was not statically bindable at this compilation  |
| `failed to inline: not inlineable` after `(not loaded)` | both     | Callee class not loaded or resolved at compile time; usual for cold paths |
| `failed to inline: native method`                       | both     | JNI target                                                                |
| `failed to inline: disallowed by CompileCommand`        | both     | `dontinline` or `exclude`, from a `CompileCommand` **or a directive**     |
| `force inline by CompileCommand`                        | both     | `inline` from a `CompileCommand` or a directive `inline` list             |
| `failed to inline: callee uses too much stack`          | C2       | C2's stack-size guard; rare outside deep recursion                        |

The strings are exact on 25.0.3 and safe to grep for **on that build**; confirm them on the
runtime you are reading with a two-minute run of a lab before a script depends on one.

## The three size bands

| Callee bytecode size on this JDK 25 build | C2 size/hotness allowance                    | Governing flag              |
| ----------------------------------------- | -------------------------------------------- | --------------------------- |
| ≤ 35 bytes                                | Does not require the hot-site size allowance | `-XX:MaxInlineSize`         |
| 36-325 bytes                              | Only if the call site is hot                 | `-XX:FreqInlineSize`        |
| > 325 bytes                               | Never on the normal path, hot or not         | ceiling of `FreqInlineSize` |

These are default size gates, not promises. Below 35 bytecodes no hot-site allowance is needed;
in the middle band it matters; above 325 the normal size policy rejects the callee. Independent
legality, profitability, profile, depth, recursion, code-size, intrinsic, and directive checks
still decide. C1 uses its own limits, so a tier-3 refusal does not predict C2. Read actual flag
values from the target runtime rather than carrying these numbers across vendors/releases.

Gates that apply independently of the band, in the order C2 checks them:

- **Call-site type profile.** Monomorphic and some limited-polymorphic sites may be inlined;
  profile width, receiver distribution, compiler state, and speculation policy determine whether
  multiple targets remain profitable. “Three receiver classes means megamorphic” is a useful lab
  observation, not a universal Java rule.
- **Nesting depth**, `MaxInlineLevel` — 15 on JDK 14 and later (JDK-8234863), 9 before.
- **Existing code size**, `InlineSmallCode` — measured in machine-code bytes of the callee's
  own nmethod, so a callee compiled first and grown large by unrolling blocks its own
  inlining later. It is the limit people forget, and it explains "it inlined on Monday".

## Refusal categories

| Category                    | Printed                                | What to do                                                          |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Above `FreqInlineSize`, hot | `hot method too big`                   | Extract the rare part out of the common path                        |
| Above `MaxInlineSize`, cold | `too big`                              | Wait for warm-up, or check the path is executed                     |
| Never executed              | `not inlineable` after `(not loaded)`  | Normal — nothing to fix                                             |
| Megamorphic call site       | `virtual call`                         | Reduce polymorphism, or accept the cost knowingly                   |
| Depth exceeded              | `inlining too deep`                    | Rarely worth changing; usually a symptom of something else          |
| Callee already large        | `already compiled into a big method`   | Shrink the callee, or accept; raising `InlineSmallCode` is global   |
| Excluded                    | `disallowed by CompileCommand`         | Find the `CompileCommand` or directive; `Compiler.directives_print` |
| Refused by C1 only          | `callee is too large` on a tier-3 tree | Nothing — read the tier-4 tree                                      |

## Two decision flows

**Did the method reach the level it should?**

```
Suspect method
├── 1. Appears in PrintCompilation / Compiler.codelist at tier 4?
│      no → step 2; yes → step 4
├── 2. Which shape of "no"?
│      tier 3 only        → inspect thresholds/counters, queues, directives, failures and code-cache state
│      tier 2             → inspect C2 queue and load-feedback scaling; do not assume threshold alone
│      tier 1 after COMPILE SKIPPED → C2 bailed out; jdk.CompilationFailure has the message
│      recurring "made not entrant: uncommon trap" → deoptimisation loop; a different investigation
├── 3. Never appears at any level?
│      > 8000 bytecodes              → check DontCompileHugeMethods plus version/mode (JDK-8366118)
│      "excluded by CompileCommand"  → someone excluded it; directives_print, CompileCommand flags
│      Compiler.queue backed up      → compiler threads exhausted
│      jdk.CodeCacheFull in JFR      → JIT switched off
└── 4. At tier 4 but the hot path is still slow?
       Not a compilation-level problem. Go to PrintInlining.
```

**Why was this specific call not inlined?**

```
Tier-4 tree shows a refusal for a hot call
├── 1. Read the string — it names the limit
│      too big / hot method too big  → size band; measure the callee (javap -c, or the printed number)
│      virtual call                  → megamorphic; size is irrelevant
│      inlining too deep             → depth; look at the chain above it
│      already compiled into a big method → InlineSmallCode; the callee's nmethod is large
│      disallowed by CompileCommand  → a flag or directive, not the compiler
├── 2. Is it really the tier-4 tree?
│      "callee is too large" → that is C1; find the tier-4 compilation of the same caller
└── 3. Refactor the common path to fit, then re-measure with PrintInlining
       before raising any global flag.
```

## Changing limits, in order of preference

| Option                                                               | Effect                                                               | When                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| Refactor the hot/cold boundary, preserving semantics                 | Can reduce size and expose optimization; may harm locality or design | When profile and benchmark identify a real causal limit  |
| `@CompilerControl(Mode.INLINE)` in JMH, or a directive `inline` list | Forces the attempt for one call site                                 | Isolating a call site in a benchmark; rare in production |
| `-XX:CompileCommand=inline,C::m`                                     | Same, process-wide for that callee                                   | Confirming a hypothesis, one run                         |
| Raise `-XX:FreqInlineSize` globally                                  | Affects many call sites and code-cache/compiler cost                 | Controlled experiment; rarely a fleet default            |
| Raise `-XX:MaxInlineSize` globally                                   | Affects cold and hot candidates and code shape                       | Controlled experiment only                               |

A global limit raised to fix one method is a non-local change: larger inlined bodies bloat
generated code, hurt instruction-cache locality, and can reduce aggregate throughput even
though the target method got "fixed". Measure the whole process, not the method. A forced
inline still loses to `virtual call` and to `(not loaded)`: the command wins arguments about
size, not about types.

## The JFR view of inlining

`jdk.CompilerInlining` is the structured form of one `@ bci` line — one event per call site
per compilation, with the same verdict text:

```
jdk.CompilerInlining {
  compileId = 1732
  caller = Lab.hot(int, Lab$Shape[])
  callee = { type = "Lab"  name = "big"  descriptor = "(I)I" }
  succeeded = false
  message = "callee is too large"
  bci = 14
  eventThread = "C1 CompilerThread0"
}
```

It is **disabled in both `default.jfc` and `profile.jfc`**, and `jdk.Compilation` — which
gives the tier (`compileLevel`) the event belongs to — is filtered by a threshold of 1000 ms
(`default`) or 100 ms (`profile`) that drops every ordinary compilation; a `profile` recording
of the lab contained 492 inlining events and zero compilation events. Enable both explicitly:

```bash
-XX:StartFlightRecording:filename=jit.jfr,settings=profile,jdk.CompilerInlining#enabled=true,jdk.Compilation#threshold=0ms
jcmd <pid> JFR.start filename=jit.jfr jdk.CompilerInlining#enabled=true jdk.Compilation#threshold=0ms

jfr print --events jdk.CompilerInlining jit.jfr | grep -B6 -A3 'name = "process"'
jfr view longest-compilations jit.jfr
```

Read `eventThread` — `C1 CompilerThread…` or `C2 CompilerThread…` — for the same reason as
the tier column in the text form. Cost was about 85 bytes per event in the lab, roughly eight
events per compilation; multiply by `jstat -compiler`'s `Compiled` count for an estimate.

## LogCompilation and JITWatch

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation \
     -XX:LogFile=/tmp/jit.log -Xlog:class+load=info -jar app.jar
```

Without `-XX:LogFile` the file is `hotspot_pid<pid>.log` in the working directory. The file is
XML (`<hotspot_log version='160 1'>`): `<task_queued>`, `<task>` with `count`, `iicount`,
`level` and `decompiles`, `<nmethod>` with sizes and addresses, `<inline_success reason='inline
(hot)'>` and `<inline_fail reason='hot method too big'>` — the same strings as the text form,
with `&apos;` escaping — `<uncommon_trap>`, `<make_not_entrant … reason='not used'>`,
`<dependency>`, `<failure>` on a bailout, and one `<thread_logfile>` section per compiler
thread. In the small lab it produced materially more output than `PrintCompilation`; size it on
the real workload because call-tree shape and compiler activity dominate volume.

**JITWatch** ([AdoptOpenJDK/jitwatch](https://github.com/AdoptOpenJDK/jitwatch), `mvn clean package && java -jar
ui/target/jitwatch-ui-shaded.jar`) rebuilds the compilation timeline, the inlining tree with
reasons, and bytecode next to assembly when `-XX:+PrintAssembly` and `hsdis` were present. Its
instructions ask for `-Xlog:class+load=info` to build the class model; the older
`-XX:+TraceClassLoading` they mention for Java 8 is `Unrecognized VM option` on 25.0.3 and the
JVM does not start. The JDK's own parser for the same file lives in `src/utils/LogCompilation`
in the OpenJDK tree.

`-XX:CompileCommand=log,C::m` on its own writes no file at all (executed, 25.0.3); it only
narrows what a run that already has `-XX:+LogCompilation` records. Scope volume by duration
— a warm-up window, a `jcmd`-driven recording — rather than by that command.

## Continuous production instead of session flags

```bash
jcmd <pid> JFR.start duration=60s filename=jit.jfr settings=profile jdk.Compilation#threshold=0ms

jfr print --events jdk.Compilation jit.jfr
jfr print --events jdk.CompilationFailure jit.jfr
jfr print --events jdk.CompilerStatistics jit.jfr
jfr print --events jdk.Deoptimization jit.jfr
jfr print --events jdk.CodeCacheFull jit.jfr
jfr view compiler-statistics jit.jfr

# Confirm an event name on your own runtime before scripting against it
jfr metadata | grep -E '@Name\("jdk\.(Compil|CodeCache|Deopt)'
```

Which events exist, their default thresholds, and what each of these flags costs to leave on
are tabulated in `directives-and-production-logging.md`.

## Primary references

- [HotSpot C2 inlining policy (`bytecodeInfo.cpp`)](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/bytecodeInfo.cpp)
- [HotSpot C1 graph builder](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/c1/c1_GraphBuilder.cpp)
- [JDK Flight Recorder command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
