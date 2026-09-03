# Deoptimisation tooling

Every invocation and every output line here was executed on Temurin 25.0.3 unless marked
otherwise.

## Which tool for which need

| Need                                                          | Tool                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Continuous production monitoring, low overhead                | JFR `jdk.Deoptimization` — on in `default.jfc`, with stack traces in `profile.jfc`          |
| Investigation session, one line per trap with `cid` and `bci` | `-Xlog:deoptimization=debug`                                                                |
| Dependency invalidation (class loading, `RedefineClasses`)    | `-Xlog:jit+compilation=debug` (`marked for deoptimization`) plus `-Xlog:dependencies=debug` |
| Was the invalidation a safepoint or a handshake, and how long | `-Xlog:handshake=info`, `-Xlog:safepoint=info`                                              |
| Frame reconstruction in detail, rematerialised objects        | `-XX:+UnlockDiagnosticVMOptions -XX:+TraceDeoptimization`, one-off only                     |
| What tier a method is at right now, without a restart         | `jcmd <pid> Compiler.codelist`                                                              |
| Machine-readable trap history for JITWatch                    | `-XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation`                                        |

The first two see **uncommon traps only**. A CHA invalidation or a class redefinition
produces no `jdk.Deoptimization` event and no `-Xlog:deoptimization` line; a production
setup that collects only JFR will see the latency spike and not the cause.

## Unified logging

```bash
java -Xlog:deoptimization=debug:file=deopt.log:time,uptime -jar app.jar
```

One line per uncommon trap (`Deoptimization::uncommon_trap_inner`, `deoptimization.cpp`):

```
[2026-09-02T12:56:04.778-0300][0.796s] cid=1635     level=4 DeoptLab.dispatch(LDeoptLab$Shape;)J trap_bci=1 class_check maybe_recompile pc=0x00000186906628cc relative_pc=0x000000000000004c
[2026-09-02T12:56:04.262-0300][0.280s] cid=1640 osr level=4 DeoptLab.osrLoop(I)J trap_bci=6 osr_bci=4 unstable_if reinterpret pc=0x00000186906635ec relative_pc=0x00000000000002ec
```

`cid` is the compile id that `PrintCompilation` and `jdk.Compilation` use — the join key.
`osr` and `osr_bci=` mark an on-stack-replacement compilation; a long loop in a method
invoked once (a `main`, a batch driver) deoptimises through OSR code and shows here as the
enclosing method. The method name is the JVM descriptor form, not the `Class::method` form
of `PrintCompilation`.

Three things the levels do:

- `info` emits nothing — the trap lines are at `debug`.
- `trace` adds nothing over `debug` on 25.0.3; every line is tagged `[debug]`.
- `jit+deoptimization` is not a tag set. The JVM warns and **starts anyway**, which is how
  an empty file gets read as "nothing happened". Check the file is non-empty before
  reasoning from it. The warning:

  ```
  No tag set matches selection: jit+deoptimization. Did you mean any of the following? deoptimization jit+thread jit+inlining jit+compilation
  ```

Dependency invalidations need the other two tags:

```bash
java -Xlog:jit+compilation=debug,dependencies=debug,class+load=info:file=jit.log:uptime -jar app.jar
```

```
[0.795s] Failed dependency of type unique_concrete_method_4
[0.795s]   context = *DeoptLab$Shape
[0.795s]   method  = {method} {0x00000186a640b478} 'area' '()J' in 'DeoptLab$Square'
[0.795s]   class   = DeoptLab$Shape
[0.795s]   method  = *{method} {0x00000186a640af30} 'area' '()J' in 'DeoptLab$Shape'
[0.795s]   witness = *DeoptLab$Shape
[0.795s]   code: nmethod
[0.795s] Marked for deoptimization
[0.795s]   dependee = DeoptLab$Circle
[0.796s]   1638   !   3       DeoptLab::main (463 bytes)   made not entrant: marked for deoptimization
```

`dependee` is the class whose loading broke the assumption; `context` is the type the
assumption was about. The `class+load` line for the dependee immediately precedes the block.
`-Xlog:handshake=info` shows the mechanism and its cost:

```
[0.548s] Handshake "Deoptimize", Targeted threads: 11, Executed by requesting thread: 11, Total completion time: 27900 ns
```

## JFR

```bash
jcmd <pid> JFR.start duration=60s filename=deopt.jfr settings=profile
jfr print --events jdk.Deoptimization deopt.jfr | head -40
```

The event exists since JDK 14 (JDK-8216041). `default.jfc` enables it without stack traces;
`profile.jfc` adds them. What one looks like:

```
jdk.Deoptimization {
  startTime = 12:56:04.777 (2026-09-02)
  compileId = 1635
  compiler = "c2"
  method = DeoptLab.dispatch(DeoptLab$Shape)
  lineNumber = 12
  bci = 1
  instruction = "invokeinterface"
  reason = "class_check"
  action = "maybe_recompile"
  eventThread = "main" (javaThreadId = 3)
  stackTrace = [
    DeoptLab.dispatch(DeoptLab$Shape) line: 12
    DeoptLab.main(String[]) line: 49
  ]
}
```

`method` is a direct field of type `jdk.types.Method`; there is no `topFrame` on this event,
and `getString("topFrame.method.type.name")` throws `IllegalArgumentException`.
`instruction` is the bytecode at `bci` — `invokeinterface` says call site, `if_icmpge` says
branch — and it is the field a triage script should group by alongside `reason` and
`action`. In JMC the event is under JVM Internals, Compiler, Deoptimizations (not verified
here).

```java
try (RecordingFile rf = new RecordingFile(Path.of("deopt.jfr"))) {
    Map<String, Map<String, Long>> byMethodAndReason = new HashMap<>();

    rf.readAllEvents().stream()
        .filter(e -> e.getEventType().getName().equals("jdk.Deoptimization"))
        .forEach(e -> {
            String site = e.getString("method.type.name") + "::"
                        + e.getString("method.name") + "@" + e.getInt("bci");
            String key = e.getString("reason") + "/" + e.getString("action");
            byMethodAndReason
                .computeIfAbsent(site, k -> new HashMap<>())
                .merge(key, 1L, Long::sum);
        });

    byMethodAndReason.entrySet().stream()
        .sorted((a, b) -> Long.compare(
            b.getValue().values().stream().mapToLong(Long::longValue).sum(),
            a.getValue().values().stream().mapToLong(Long::longValue).sum()))
        .limit(10)
        .forEach(e -> {
            System.out.println(e.getKey());
            e.getValue().forEach((r, c) -> System.out.printf("  %s: %d%n", r, c));
        });
}
```

Group by site (method **and** bci), not by method: a method that traps once at each of forty
sites during warm-up is converging; one that traps forty times at one site with `action`
`none` is not. Verify every path against a real recording before the script ships — it fails
loudly, but only on the first run against real data.

## PrintCompilation and the compilation log

```bash
java -XX:+PrintCompilation -jar app.jar 2>&1 | grep -E "made not entrant|made not compilable"
```

JDK 25 prints the reason after `made not entrant:`. The set on 25.0.3:

```
    40   17       3       JitLab::medium (85 bytes)   made not entrant: not used
    37   23 % !   3       DeoptLab::main @ 21 (463 bytes)   made not entrant: OSR invalidation of lower level
   549   21       4       DeoptLab::dispatch (7 bytes)   made not entrant: uncommon trap
   548   24   !   3       DeoptLab::main (463 bytes)   made not entrant: marked for deoptimization
made not compilable on level 4  DeoptLab::dispatch (7 bytes)   give up compiling
```

`not used` and `OSR invalidation of lower level` are the tier-3 code being retired by the
tier-4 version — normal. `uncommon trap` is a trap that invalidated the code and has a
matching `-Xlog:deoptimization` line with the same `cid`. `marked for deoptimization` is a
dependency invalidation and has **no** matching line there. The `made not compilable` line
is the recompilation cutoff; the next line for the method is a C1 compile.

`made zombie` no longer exists: the sweeper and the zombie state were removed in JDK 20
(JDK-8290025). A not-entrant nmethod is unloaded by the GC once no frame references it.

The same lines with a file sink and decorators come from `-Xlog:jit+compilation=debug`. The
XML log adds the trap history C2 consulted:

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+LogCompilation -XX:LogFile=comp.xml -jar app.jar
```

```xml
<uncommon_trap thread='52936' reason='class_check' action='maybe_recompile' debug_id='0' compile_id='22' compiler='c2' level='4' count='2' state='class_check' stamp='0.539'>
<make_not_entrant thread='6056' reason='not used' compile_id='18' compiler='c1' level='3' stamp='0.022'/>
```

`count` and `state` are the MDO's per-bci record — the value `Compile::too_many_traps` reads
on the next compilation. JITWatch reads this file.

## The live process

```bash
jcmd <pid> Compiler.codelist | grep 'Hold.dispatch'
```

```
16 4 1 Hold.dispatch(LHold$Shape;)J [0x0000013b87bb0d88, 0x0000013b87bb0e80 - 0x0000013b87bb0f20]
21 4 1 Hold.dispatch(LHold$Shape;)J [...]
30 1 0 Hold.dispatch(LHold$Shape;)J [...]
```

Columns are compile id, tier, state (`0` in use, `1` not entrant), method. Two not-entrant
tier-4 versions and one live tier-1 version is the picture of a method that hit the cutoff
(this process was run with `-XX:PerBytecodeRecompilationCutoff=0` to force it). No restart,
no flag, and the answer to "what is this method running as right now".

## TraceDeoptimization

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+TraceDeoptimization -jar app.jar 2>&1 | grep -A 6 "UNCOMMON TRAP"
```

A `diagnostic` flag since JDK 18 (JDK-8154011); without the unlock the JVM refuses to start
with `Error: VM option 'TraceDeoptimization' is diagnostic and must be enabled via …` on the
JDK 25 baseline. For later releases, inspect `java -Xlog:help` and `PrintFlagsFinal` rather
than assuming a mainline change has shipped. The output on 25.0.3:

```
UNCOMMON TRAP method=DeoptLab.dispatch(LDeoptLab$Shape;)J  bci=1 pc=0x000001c6da2411cc, relative_pc=0x000000000000004c, debug_id=0 compiler=c2 compile_id=21 (@0x000001c6da2411cc) thread=68856 reason=class_check action=maybe_recompile unloaded_class_index=-1 debug_id=0
DEOPT PACKING thread=0x000001c6c7701fa0 vframeArray=0x000001c6efb43dc0
   Compiled frame (sp=0x00000050a31ff1d0 unextended sp=0x00000050a31ff1d0, fp=0x000000062383bd20, real_fp=0x00000050a31ff1f0, pc=0x000001c6da2411cc)
   Virtual frames (innermost/newest first):
      VFrame 0 (0x000001c6efa49fe8) - DeoptLab.dispatch(LDeoptLab$Shape;)J - invokeinterface @ bci=1
DEOPT UNPACKING thread=0x000001c6c7701fa0 vframeArray=0x000001c6efb43dc0 mode=2
```

One `VFrame` per inlined level is what it adds over `-Xlog:deoptimization`: it shows which
inlined callee the trap actually sits in. Unlike the unified log it also prints the packing
block for a dependency invalidation, since that goes through the same frame reconstruction.
Its volume is proportional to every deoptimisation in the process, so it belongs to a single
deep-dive session and never to continuous production.

## The limits, and where each is enforced

Defaults from `-XX:+PrintFlagsFinal -version` on Temurin 25.0.3; enforcement points from the
JDK 25 source.

| Flag                             | Default             | Enforced in                                                                          | Effect when reached                                                                                   |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `PerBytecodeTrapLimit`           | 4                   | `uncommon_trap_inner`, `deoptimization.cpp`                                          | A `maybe_recompile` trap at a bci with prior traps makes the nmethod not entrant                      |
| `PerMethodTrapLimit`             | 100                 | `Compile::too_many_traps`, `compile.cpp`                                             | C2 stops speculating on that reason anywhere in the method                                            |
| `PerMethodSpecTrapLimit`         | 5000 (experimental) | same                                                                                 | The same for `speculate_*` reasons                                                                    |
| `PerBytecodeRecompilationCutoff` | 200                 | `uncommon_trap_inner`; `/8` in `too_many_recompiles`                                 | At 25 overflow recompiles of one bci C2 emits `Action_none`; at 200 the method is not C2-compilable   |
| `PerMethodRecompilationCutoff`   | 400                 | `MethodData::inc_decompile_count`, `methodData.hpp`; `/2+1` in `too_many_recompiles` | At 201 decompilations C2 emits `Action_none` at trapped sites; at 400 the method is not C2-compilable |

`PerBytecodeTrapLimit` is not what makes C2 stop speculating at a bci: `too_many_traps`
treats any recorded trap as enough ("Assume PerBytecodeTrapLimit==0"). The limit only
decides how many `maybe_recompile` hits the old code tolerates before it is invalidated.
Some reasons are also counted by the interpreter when the bytecode re-executes after the
trap, so the limit is "in effect a little smaller than it looks" (comment in
`deoptimization.cpp`) — a `null_check` site was invalidated on the third hit, a
`class_check` site on the fourth.

## Correlating deoptimisations with latency spikes

Extract trap timestamps from the log, extract spike timestamps from the request log, and
count spikes that fall within an explicit window of a trap. The window is a parameter you
state, not an impression from scrolling the log. Include the `marked for deoptimization`
lines from the compilation log, or the correlation misses every class-loading event.

```python
# Illustrative — adapt the request-log regex, and assert both timestamp lists are
# non-empty before trusting the ratio. Log files written with the `uptime` decorator.
import re

def correlate(deopt_log, comp_log, request_log, window_s=2.0, spike_threshold_ms=500):
    deopt_times = []
    with open(deopt_log) as f:
        for line in f:
            m = re.search(r'\[(\d+\.\d+)s\].*trap_bci=', line)
            if m:
                deopt_times.append(float(m.group(1)))
    with open(comp_log) as f:
        for line in f:
            m = re.search(r'\[(\d+\.\d+)s\].*marked for deoptimization', line)
            if m:
                deopt_times.append(float(m.group(1)))

    spikes = []
    with open(request_log) as f:
        for line in f:
            m = re.search(r'ts=(\d+\.\d+).*latency=(\d+)', line)
            if m and int(m.group(2)) > spike_threshold_ms:
                spikes.append(float(m.group(1)))

    hit = sum(1 for s in spikes
              if any(abs(s - d) < window_s for d in deopt_times))
    print(f"spikes={len(spikes)} deopts={len(deopt_times)} correlated={hit}")
```

A trap costs the trapping thread one frame reconstruction and an interpreted stretch; it
does not stop the process. A latency spike across all threads that coincides with a trap is
more likely the recompilation burst or the `Handshake "Deoptimize"` fan-out than the trap
itself — read `-Xlog:safepoint` and `-Xlog:handshake` for the same window before attributing
it.

## Session checklist

- [ ] Tag and level confirmed as `deoptimization=debug`, and the log file is not empty
- [ ] `jit+compilation=debug` and `dependencies=debug` collected in the same session, or
      class-loading invalidations are invisible
- [ ] JFR field names and reason strings confirmed with `jfr print` on this runtime —
      including the `_or_` suffixed names
- [ ] Each `class_check` classified as a per-invocation guard (trap lines, `instruction`) or
      a CHA invalidation (`marked for deoptimization`, no trap line)
- [ ] Events grouped by method **and** bci, reason and action, over a stated time window
- [ ] Any `action=none` site identified, and the method's decompile history explained
- [ ] Rate confirmed to fall to its floor after the recompilation burst, not merely that a
      recompilation occurred
- [ ] If the fix narrowed a static type or made a class `final`, no other code path depended
      on subclassing it
- [ ] No diagnostic flag left active outside the investigation session

## Authoritative sources

- [JDK 25 HotSpot `deoptimization.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/deoptimization.cpp)
- [JDK 25 JFR event definitions](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml)
- [JDK 25 `jcmd` documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK-8154011: make `TraceDeoptimization` diagnostic](https://bugs.openjdk.org/browse/JDK-8154011)
