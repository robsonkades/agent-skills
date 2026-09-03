# Directives and production logging

Two mechanisms steer one method's compilation, and four mechanisms observe it. Everything
below was executed on Temurin 25.0.3 unless marked otherwise; the directive semantics are
JEP 165 (JDK 9) as implemented in `compilerDirectives.cpp` and `compilerOracle.cpp`.

## Which steering mechanism

| Need                                              | Use                                  | Why                                                                           |
| ------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| One run, one method, one option                   | `-XX:CompileCommand=<opt>,C::m`      | No file, no unlock for product options, echoed at start-up                    |
| C1 and C2 treated differently, or several options | Directives file                      | Per-compiler blocks; `CompileCommand` cannot say "C2 only"                    |
| Change a live JVM without restart                 | `jcmd <pid> Compiler.directives_add` | No start-up flag needed at all — but only future compilations see it (below)  |
| Work around a compiler bug on one method          | `Exclude` / `exclude`                | Prevents matching compilation/inlining; scoped mitigation, not general tuning |
| Reproduce a compile in a bug report               | `DumpReplay` / `-XX:+ReplayCompiles` | Outside this skill; both diagnostic                                           |

## CompileCommand

```
-XX:CompileCommand=<option>,<pattern>[,<value>]
-XX:CompileCommand=quiet                 # silence the echo
-XX:CompileCommandFile=<file>            # one command per line: "dontinline Lab::medium"
-XX:CompileCommand=help                  # the authoritative option list for your build
```

Options that matter for reading and steering (the full list is `help`): `exclude`,
`compileonly`, `inline`, `dontinline`, `log`, `print`, `PrintInlining`, `PrintCompilation`,
`PrintAssembly`, `PrintIntrinsics`, `BackgroundCompilation`, `CompileThresholdScaling`,
`DisableIntrinsic`, `ControlIntrinsic`, `RepeatCompilation`, `MaxNodeLimit`, `MemLimit`,
`MemStat`, `blackhole`. An option inherits the class of the flag it scopes:
`PrintInlining`, `PrintAssembly` and `log` need `-XX:+UnlockDiagnosticVMOptions`, and the
error is the same `must be enabled via -XX:+UnlockDiagnosticVMOptions` wrapped in
`CompileCommand: An error occurred during parsing`.

Patterns:

```
Lab::hot                     Lab.hot                      package/Class.method
*::hot          Lab::*       *ackage/Clas*.*etho*         Lab::hot(I[LLab$Shape;)I
```

Wildcards only lead or trail a class or method name; the signature, when given, is literal.
Three things the echo line does **not** tell you:

- `CompileCommand: dontinline Lab.hot bool dontinline = true` confirms the command
  **parsed**, not that it will ever match. `Lab::hot(I` — a truncated signature — is echoed
  the same way and matches nothing.
- `exclude`, `inline`, `dontinline` and `compileonly` on the same method are documented as
  undefined behaviour ("no priority of commands").
- `exclude` removes the method from top-level compilation **and** from inlining;
  `compileonly` removes nonmatching methods from top-level compilation but can still let them be
  inlined into an allowed compilation. A broad or mistaken `compileonly` can leave most ordinary
  Java methods interpreted; inspect the effective commands and compilation log.

What each looks like in the compilation log:

```
### Excluding compile: static Lab::big
made not compilable on level 3  Lab::big (1015 bytes)   excluded by CompileCommand
made not compilable on level 4  Lab::big (1015 bytes)   excluded by CompileCommand
                              @ 7   Lab::medium (86 bytes)   failed to inline: disallowed by CompileCommand
                              @ 14   Lab::big (1015 bytes)   force inline by CompileCommand
```

An unknown option is fatal at start-up (`Error: Unrecognized option 'frobnicate'`), which is
the right failure mode; a mistyped pattern is not, which is the wrong one.

## The directives file

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:CompilerDirectivesFile=directives.json \
     -XX:+CompilerDirectivesPrint -jar app.jar      # print what was parsed, then run
```

```json
[
  {
    "match": ["com/myapp/Service.process", "com/myapp/Service.process(Ljava/lang/String;)V"],
    "inline": ["+com/myapp/Parser.parseHeader", "-com/myapp/Metrics.*"],
    "c1": { "Exclude": false },
    "c2": { "PrintInlining": true, "MaxNodeLimit": 120000 }
  },
  {
    "match": "com/myapp/Generated.huge",
    "Exclude": true
  }
]
```

- **`match`** is a string or an array. `Class.method`, `Class::method`, `*.method`,
  `Class.*` and a full descriptor `Class.method(I[LLab$Shape;)I` (with or without a space
  before the parenthesis) all matched in the lab. A wildcard **inside** the signature is a
  parse error the JVM refuses to start on: `Method pattern error:  Wildcard * not allowed
in signature`. An unknown option is `Key error … No such key: 'Frobnicate'`.
- **`inline`** is an ordered list of `+pattern` / `-pattern`; the first match decides. When
  present it **replaces** `CompileCommand=inline/dontinline` for compilations of the matched
  caller (`DirectiveSet::should_inline`).
- Options outside `c1`/`c2` apply to both compilers. `Enable: false` makes a directive
  transparent without deleting it. `CompilerDirectivesLimit` (diagnostic, default 50) caps
  the stack.
- The verdicts a directive produces still say `CompileCommand`: `disallowed by
CompileCommand`, `force inline by CompileCommand`, `excluded by CompileCommand`. The text
  does not tell you which mechanism spoke; `Compiler.directives_print` does.

## Precedence, as executed

| Situation                                                                 | Winner                                        |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| Several directives match the method                                       | The **first from the top of the stack**       |
| Directives in one file                                                    | Earlier entries are higher: `[A, B]` → A wins |
| Directive added with `jcmd` after start-up                                | Pushed on top: shadows the file's entries     |
| Directive sets an option explicitly; a `CompileCommand` sets the same one | The directive (`_modified[]` guard)           |
| Directive does not mention the option; a `CompileCommand` sets it         | The `CompileCommand` fills the gap            |
| Directive has an `inline` list; `CompileCommand=inline/dontinline` too    | The directive's list, exclusively             |
| `-XX:+CompilerDirectivesIgnoreCompileCommands`                            | Every `CompileCommand` is ignored             |

"Compiler Control has the highest priority" in JEP 165 is the first six rows; the seventh
is the switch that makes it absolute. A directive with `"c2": { "PrintInlining": false }`
and `-XX:CompileCommand=PrintInlining,C::m` on the command line prints the **C1** tree only —
the directive set nothing for C1, so the command applied there.

## The jcmd lifecycle

```bash
jcmd <pid> Compiler.directives_add directives.json     # "N compiler directives added"
jcmd <pid> Compiler.directives_print                   # the stack, top first, default last
jcmd <pid> Compiler.directives_remove                  # pops the top directive
jcmd <pid> Compiler.directives_clear                   # everything but the default
```

None of these needs `-XX:+UnlockDiagnosticVMOptions` at start-up, including a directive
that turns on `PrintInlining` (executed: a JVM started with no flags accepted it and printed
the tree). The output goes to the JVM's stdout, not to the `jcmd` terminal.

**A directive applies only to compilations that start after it is added.** In the lab, a
`PrintInlining` directive added three seconds after start-up printed nothing for the already
tier-4 `hot` method and printed the full tree for `late`, first compiled ten seconds later.
There is no supported way on the examined 25.0.3 build to make an existing nmethod recompile under a new
directive: the `-r` option that re-aligned compiled methods (JDK-8309271) was integrated and
then backed out (JDK-8332111); its redo (JDK-8331749) is not in this build. Practical
consequence: to see C2's tree for a method that is already hot, either restart with
`-XX:CompilerDirectivesFile`, or wait for a natural deoptimisation and recompilation — and
know that `made not entrant: uncommon trap` followed by a new tier-4 line is your cue.

## What each observation flag costs

Output depends on compile count, call sites per compilation, stack/event settings, and failure
rate; bytes from a toy run do not scale reliably. Measure event count, bytes/sec, recording or
filesystem growth, CPU, and lost-event/log-backpressure indicators on the real workload.

| Mechanism                              | Relative volume            | Sink and lifecycle guidance                                     |
| -------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `-XX:+PrintCompilation`                | low per compilation        | shared VM output; bounded session or use unified logging        |
| `-Xlog:jit+compilation:file=…`         | low, plus decorations      | preferred text form; isolate and rotate; dynamically switchable |
| `PrintInlining` / `jit+inlining=debug` | proportional to call sites | scope to caller/duration; can become large during startup       |
| `LogCompilation`                       | detailed XML per task/tree | diagnostic capture for JITWatch; bound duration and disk        |
| `PrintTieredEvents`                    | high policy-event volume   | short startup or reproduction session                           |
| JFR compiler events                    | configurable               | bounded recording; thresholds and stack traces control cost     |

Text emitted by VM/compiler threads can contend on output synchronization or a slow stdout/log
pipeline, and shared stdout contaminates application log processing. Prefer a rotated unified-log
file or bounded JFR recording, monitor the sink, and test overhead. `-XX:+DisplayVMOutputToStderr`
changes the stream but does not bound it.

## The JFR events

| Event                          | `default.jfc`         | `profile.jfc`        | Answers                                                      |
| ------------------------------ | --------------------- | -------------------- | ------------------------------------------------------------ |
| `jdk.Compilation`              | on, threshold 1000 ms | on, threshold 100 ms | Which method, which tier, how long, `succeded`, `isOsr`      |
| `jdk.CompilationFailure`       | **off**               | on                   | `failureMessage`, e.g. `out of nodes parsing method`         |
| `jdk.CompilerInlining`         | **off**               | **off**              | Per call site: caller, callee, `bci`, `succeeded`, `message` |
| `jdk.CompilerPhase`            | on, threshold 60 s    | on, threshold 10 s   | C2 phase timings per compile id                              |
| `jdk.CompilerStatistics`       | every 1000 ms         | every 1000 ms        | Totals: `compileCount`, `bailoutCount`, `invalidatedCount`   |
| `jdk.CompilerQueueUtilization` | every 10 s            | every 5 s            | Queue length per compiler; the "stuck at tier 2/3" evidence  |
| `jdk.CodeCacheFull`            | on                    | on                   | JIT switched off                                             |
| `jdk.Deoptimization`           | on, no stack          | on, with stack       | Which nmethod, `reason`, `action`, the bci                   |

These defaults are from Temurin 25.0.3; inspect the `.jfc` bundled with the runtime. In the lab,
a 1500 ms default recording produced **zero**
`jdk.Compilation` events although 1650 compilations happened, and `jcmd <pid> JFR.view
compiler-statistics` answers `No recording data available` until a recording is running.
Override per event on the command line or in `JFR.start`
(`jdk.Compilation#threshold=0ms`), or bake a configuration:

```bash
jfr configure --input profile jdk.CompilerInlining#enabled=true jdk.Compilation#threshold=0ms \
    jdk.CompilationFailure#enabled=true --output jit.jfc
java -XX:StartFlightRecording:settings=/path/jit.jfc,filename=jit.jfr -jar app.jar
```

Views that read them without scripting: `jfr view compiler-statistics`,
`longest-compilations`, `compiler-phases`, `compiler-configuration`,
`deoptimizations-by-reason`, `deoptimizations-by-site`.

## Symptom to cause

| Symptom                                                             | Most likely cause                                                             | Check                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `-Xlog:jit` prints only a warning                                   | No tag set is exactly `jit`                                                   | `-Xlog:jit+compilation`; the warning lists the valid sets                              |
| `awk '$4 == 4'` returns a handful of lines                          | Blank flag field emits no token                                               | Structural regex in `printcompilation-format.md`                                       |
| `grep 'made zombie'` finds nothing                                  | State removed in JDK 20                                                       | Grep `made not entrant: uncommon trap` instead                                         |
| JVM refuses to start on `PrintInlining`                             | Diagnostic flag, unlock missing or after it                                   | `-XX:+UnlockDiagnosticVMOptions` first                                                 |
| Method absent from compilation log/events                           | Never invoked, currently uncompiled, excluded, or huge-method policy          | invocation evidence, `Compiler.codelist`, commands, bytecode size, tiered mode/version |
| Method at tier 1 and never higher                                   | Trivial method (normal), or `COMPILE SKIPPED` bailout                         | Look for the `COMPILE SKIPPED:` line; `jdk.CompilationFailure`                         |
| Method at tier 2                                                    | C2 queue congested; thresholds scaled up                                      | `Compiler.queue`, `jdk.CompilerQueueUtilization`, `k=` in events                       |
| Method at tier 3 with high counts                                   | Thresholds not met after load-feedback scaling, or C2 queue                   | `PrintTieredEvents` `total=` and `k=`; not `CompileThreshold`                          |
| `made not entrant: uncommon trap` repeats on one method             | Deoptimisation loop                                                           | `jdk.Deoptimization` `reason`/`action`; a different investigation                      |
| `made not entrant: marked for deoptimization` in a burst            | Class loading broke CHA dependencies, or a directive/redefinition             | `-Xlog:class+load`, `Compiler.directives_print`                                        |
| Tree says `callee is too large` for a 60-byte hot callee            | You are reading the tier-3 (C1) tree                                          | Find the tier-4 line of the same caller                                                |
| `hot method too big` on a method that "used to inline"              | Callee grew past 325 bytes, or was refactored into the caller's hot path      | `javap -c`; compare the printed byte count                                             |
| `already compiled into a big method` after a JDK or code change     | Callee's nmethod grew past `InlineSmallCode` (machine code, not bytecode)     | `Compiler.codelist` addresses give the nmethod size range                              |
| `disallowed by CompileCommand` with no `CompileCommand` on the line | A directives file, a `jcmd` addition, or `CompileCommandFile`                 | `Compiler.directives_print`; `.hotspot_compiler`, start scripts                        |
| `jcmd Compiler.directives_add` says added, nothing changes          | Target already compiled; directives apply to later compilations only          | `Compiler.codelist` state; wait for or force a recompilation                           |
| Directive file rejected at start-up                                 | `(*)` in a signature, unknown key, or more than `CompilerDirectivesLimit`     | The parser prints line and byte offset                                                 |
| JFR recording shows no `jdk.Compilation`                            | 1000 ms / 100 ms threshold                                                    | `jdk.Compilation#threshold=0ms`                                                        |
| JFR shows no `jdk.CompilerInlining`                                 | Disabled in the examined default/profile configs or filtered by settings      | inspect target `.jfc`; enable event explicitly                                         |
| `JFR.view compiler-statistics` says no data                         | No recording running                                                          | `JFR.start` first                                                                      |
| `CompileCommand=log,C::m` produced no file                          | Needs `-XX:+LogCompilation` too                                               | Add it, or use `-Xlog:jit+inlining=debug:file=`                                        |
| JITWatch instructions fail with `Unrecognized VM option`            | `-XX:+TraceClassLoading` was removed                                          | `-Xlog:class+load=info`                                                                |
| `CompileCommand=print` prints no assembly                           | `hsdis` not on the library path: `[warning][os] Loading hsdis library failed` | Install `hsdis`; the rest of the output is still valid                                 |

## Version notes

| Release | Change                                                                          | Source                                           |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| JDK 9   | Compiler directives, `-XX:CompilerDirectivesFile`, `jcmd Compiler.directives_*` | JEP 165                                          |
| JDK 9   | Unified logging; `-Xlog:jit+compilation` and `-Xlog:jit+inlining` tag sets      | JEP 158; `compileTask.cpp`                       |
| JDK 11  | JFR in OpenJDK, including `jdk.CompilerInlining` and `jdk.CompilationFailure`   | JEP 328                                          |
| JDK 14  | `MaxInlineLevel` default 9 → 15                                                 | JDK-8234863                                      |
| JDK 20  | Sweeper and `made zombie` removed                                               | JDK-8290025                                      |
| JDK 25  | Observed reason suffixes and refusal prefixes documented in this reference      | Executed on 25.0.3; treat as build-specific text |
| JDK 25  | `-XX:+TraceClassLoading` is `Unrecognized VM option`                            | Executed on 25.0.3                               |
| JDK 26  | Fixes `DontCompileHugeMethods` not being respected with non-tiered compilation  | JDK-8366118                                      |

## Primary references

- [JEP 165: Compiler Control](https://openjdk.org/jeps/165)
- [JEP 158: Unified JVM Logging](https://openjdk.org/jeps/158)
- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK 25 `jfr`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [HotSpot compiler directives source](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/compilerDirectives.cpp)
