# Deoptimisation tooling

## Which tool for which need

| Need                                                           | Tool                                     |
| -------------------------------------------------------------- | ---------------------------------------- |
| Continuous production monitoring, low overhead                 | JFR `jdk.Deoptimization`                 |
| Investigation session, correlated with `PrintCompilation`      | `-Xlog:deoptimization=debug`             |
| Understanding frame reconstruction in detail                   | `-XX:+TraceDeoptimization`, one-off only |
| Confirming an observed `made not entrant` was a deoptimisation | Cross-reference either log above         |

## Unified logging

```bash
java -Xlog:deoptimization=debug:file=deopt.log -jar app.jar

# With time decorators, for correlating against other logs
java -Xlog:deoptimization=debug:file=deopt.log:time,uptime -jar app.jar
```

Unlike the compilation table, deoptimisation does have its own `-Xlog` tag. The common error
is composing it with a `jit` tag that has never existed, or asking for `info`, which is above
the level at which the uncommon-trap messages are emitted. `-Xlog:jit+deoptimization=info`
produces no output while the JVM starts normally, which is how an empty file gets read as
"nothing happened". Always confirm the file is non-empty before depending on it.

## JFR

```bash
jcmd <pid> JFR.start duration=60s filename=deopt.jfr settings=profile

# Confirm the real field names on your runtime before scripting
jfr print --events jdk.Deoptimization deopt.jfr | head -30
```

The event exists since JDK 14, so it is available across JDK 17, 21 and 25. In JMC it appears
under JVM Internals, Compiler, Deoptimizations.

```java
try (RecordingFile rf = new RecordingFile(Path.of("deopt.jfr"))) {
    Map<String, Map<String, Long>> byMethodAndReason = new HashMap<>();

    rf.readAllEvents().stream()
        .filter(e -> e.getEventType().getName().equals("jdk.Deoptimization"))
        .forEach(e -> {
            String method = e.getString("method.type.name") + "::"
                          + e.getString("method.name");
            byMethodAndReason
                .computeIfAbsent(method, k -> new HashMap<>())
                .merge(e.getString("reason"), 1L, Long::sum);
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

The method is a direct `method` field of type `jdk.types.Method`, reached with dot notation.
There is no nested `topFrame` on this event; `getString("topFrame.method.type.name")` throws
`IllegalArgumentException` at runtime. It fails loudly, but only on the first real run against
real data — which is the argument for exercising every collection command against an actual
recording before publishing it.

## PrintCompilation as an indirect signal

```bash
java -XX:+PrintCompilation -jar app.jar 2>&1 | grep "made not entrant\|made zombie"
```

`made not entrant` is what a `make_not_entrant` action looks like from the compilation log.
It does not carry the `reason` — it only confirms an invalidation happened — so it is useful
mainly when both logs are collected in the same session for cross-correlation.

## TraceDeoptimization

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+TraceDeoptimization \
  -jar app.jar 2>&1 | grep -A 10 "Deoptimizing"
```

Far more verbose than unified logging: it shows frame reconstruction in detail. Its I/O
overhead is proportional to total volume, not to what you wanted to see, so it belongs to a
single deep-dive session and never to continuous production.

## Recompilation cutoffs

```bash
java -XX:+PrintFlagsFinal -version | grep -E "RecompilationCutoff"
```

`PerMethodRecompilationCutoff` and `PerBytecodeRecompilationCutoff` change between releases,
so read them rather than reasoning from a remembered number. They exist to stop a
fundamentally unstable method from consuming compilation resources forever. Raising them
delays `make_not_compilable` and nothing else.

## Correlating deoptimisations with latency spikes

Extract deoptimisation timestamps from the log, extract spike timestamps from the request
log, and count spikes that fall within an explicit window of a deoptimisation. The window is
a parameter you state, not an impression from scrolling the log.

```python
# Illustrative — adapt the regexes to your actual log format, and assert both
# timestamp lists are non-empty before trusting the ratio.
import re

def correlate(deopt_log, request_log, window_s=2.0, spike_threshold_ms=500):
    deopt_times = []
    with open(deopt_log) as f:
        for line in f:
            m = re.search(r'\[(\d+\.\d+)s\].*[Dd]eoptimization', line)
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

## Session checklist

- [ ] Tag and level confirmed as `deoptimization=debug`, and the log file is not empty
- [ ] JFR field names confirmed against `jfr print --events jdk.Deoptimization | head`
- [ ] Each `class_check` classified as simultaneous burst (CHA dependency) or recurrence at
      one call site (per-invocation guard)
- [ ] Events grouped by method and time window before calling anything stable or unstable
- [ ] Deoptimisation count confirmed to fall to zero after recompilation, not merely that a
      recompilation occurred
- [ ] If the fix made a type `final`, no other code path depended on subclassing it
- [ ] No diagnostic flag left active outside the investigation session
