# Correlating the evidence

## The decomposition

```
Safepoint Total         = Reaching safepoint (sync) + At safepoint (operation) + Leaving safepoint
                          \___________________/       \__________________/       \_______________/
                           thread-side problem          collector or VM-op        disarm + wake-up,
                           (TTSP)                       problem                   small, real
```

The GC log publishes the middle term only. Whatever remains after all three are accounted for
is not a safepoint: a per-thread stall or a host effect — `layer-decision-table.md`.

| Log field            | What it measures                                            | Answers "how long did the application stop"?              |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `Time since last`    | Interval since the previous safepoint — frequency, not cost | No                                                        |
| `Reaching safepoint` | Sync time; the slowest thread's TTSP                        | Partly                                                    |
| `At safepoint`       | Duration of the operation (GC, dump, …)                     | Partly — this is what the GC log already shows            |
| `Leaving safepoint`  | Disarming the polls and waking the threads                  | Partly — the term a two-field sum drops                   |
| `Total`              | Sync + operation + leaving                                  | JVM safepoint interval; correlate to application evidence |
| `Threads`            | `N runnable, M total` — how many had to be stopped          | No, but it scales the sync term                           |

Worked example of why the manual sum is not the metric — a real `G1CollectFull` line from
25.0.3 (executed):

```
Reaching safepoint:   10700 ns
At safepoint:       2808000 ns
Reaching + At     = 2818700 ns
Leaving safepoint:     4500 ns
Total:              2823200 ns     <- Reaching + At + Leaving, exact on 1,169 lines
```

A few microseconds per event is noise at a few safepoints per second. At thousands per
second — frequent GC, heavy deoptimisation — the accumulated omission stops being noise, and
a JDK ≤ 24 log, which prints no `Leaving` field, hides it entirely. Measure the term in
your own log before deciding whether it matters to your SLO; it has no universal magnitude.

## Enabling the safepoint log

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags -jar app.jar
```

Real output on 25.0.3 (executed; one line, wrapped):

```
[2026-09-02T02:43:47.726-0300][0.029s][info][safepoint] Safepoint "G1CollectForAllocation", \
Time since last: 14164000 ns, Reaching safepoint: 5400 ns, At safepoint: 1239400 ns, \
Leaving safepoint: 3200 ns, Total: 1248000 ns, Threads: 1 runnable, 12 total
```

The decorator set matters to every downstream parser: `time,uptime,level,tags` emits **four**
bracketed groups before the event body, not one.

## The parser trap

A regex written against a single `[X.Xs]` uptime prefix does not match a four-group prefix. It
does not error — it reports "0 events found", or worse, matches partially and reports an
aggregate over a subset. Two rules follow:

- Extract the uptime with its own pattern, separately from the event body.
- Capture `Total` from the line. Never recompute it.

```python
UPTIME_PATTERN = re.compile(r'\[(\d+\.\d+)s\]')

EVENT_PATTERN = re.compile(
    r'Safepoint "(\w+)".*?'
    r'Reaching safepoint: (\d+) ns.*?'
    r'At safepoint: (\d+) ns.*?'
    r'Total: (\d+) ns'
)
```

Report, per safepoint reason, count and distributions of both TTSP and `Total`, plus events
above an SLO-derived investigation threshold grouped by reason. A universal 10 ms threshold
can be irrelevant to either a low-latency or batch workload.

Before trusting any aggregate: run the analyser over twenty lines of the real log and check the
event count against a manual `grep -c Safepoint`.

## The JFR safepoint events

| Event                               | Scope                           | Useful fields                                                           | When to use                                                                                      |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `jdk.SafepointBegin`                | Start of the cycle              | `safepointId`                                                           | Marks the start; correlate with `SafepointEnd` on the same id                                    |
| `jdk.SafepointEnd`                  | End of the cycle                | `safepointId`                                                           | `SafepointEnd.startTime − SafepointBegin.startTime` is the cycle's Total                         |
| `jdk.SafepointStateSynchronization` | Each wait iteration during sync | `safepointId`, `initialThreadCount`, `runningThreadCount`, `iterations` | Watch sync progress and how many threads are still outstanding                                   |
| `jdk.ExecuteVMOperation`            | The operation itself            | `operation`, `safepoint`, `blocking`, `caller`, `safepointId`, duration | Says **what** ran at that safepoint, and joins to Begin/End on `safepointId`                     |
| `jdk.SafepointLatency`              | One profiling sample (JEP 518)  | `stackTrace`, `threadState`, duration                                   | Interrupt-to-poll delay of a sampled thread — residual sampling bias, **not** a safepoint's TTSP |

```bash
jcmd <pid> JFR.start duration=60s filename=safepoints.jfr settings=profile
jfr metadata --events jdk.SafepointBegin,jdk.SafepointEnd,jdk.SafepointLatency
```

`jdk.SafepointLatency` has no `safepointId` (verified against
`src/hotspot/share/jfr/metadata/metadata.xml`, tag `jdk-25-ga`) and its only field is
`threadState`. It cannot be correlated into a safepoint cycle, and using it as a shortcut to
`Total` produces a number that answers a different question.

## Reconstructing `Total` from JFR

Correlate the two events on `safepointId`. This is the programmatic path that removes hand
correlation of text logs:

```java
Map<Long, Instant> begin = new HashMap<>();
Map<Long, Instant> end = new HashMap<>();
Map<Long, String> operation = new HashMap<>();

try (RecordingFile rf = new RecordingFile(Path.of(args[0]))) {
    while (rf.hasMoreEvents()) {
        RecordedEvent e = rf.readEvent();
        switch (e.getEventType().getName()) {
            case "jdk.SafepointBegin" -> begin.put(e.getLong("safepointId"), e.getStartTime());
            case "jdk.SafepointEnd"   -> end.put(e.getLong("safepointId"), e.getStartTime());
            case "jdk.ExecuteVMOperation" -> {
                // confirm on your build whether this event carries safepointId; when it
                // does not, labelling falls back to temporal ordering
                try {
                    operation.put(e.getLong("safepointId"), e.getString("operation"));
                } catch (Exception ignored) { }
            }
            default -> { }   // includes jdk.SafepointLatency, a different quantity
        }
    }
}

begin.forEach((id, start) -> {
    Instant finish = end.get(id);
    if (finish != null) {
        System.out.printf("safepoint %d: %dms total (%s)%n",
            id, Duration.between(start, finish).toMillis(),
            operation.getOrDefault(id, "unknown operation"));
    }
});
```

A `SafepointBegin` with no matching `SafepointEnd` in the window is a truncated recording, not
an anomaly — skip it rather than treating the missing end as zero.

## The cross-check, and why it is the acceptance criterion

Run the JFR reconstruction against a recording taken over the same interval as the text log,
and compare the ten largest `Total` values from each. The two expose the same JVM cycle through
different encodings — unified logging text and JFR. Agreement is a strong parser/window
consistency check, not independent proof of application impact.

- **They converge (small rounding differences, ns versus ms, buffer flush timing):** the number
  is a property of the JVM, not an artefact of one parser.
- **They diverge systematically:** one of the two captures is wrong. Find out which before
  either is used for a production decision.

## Attributing the remainder

Once `Total` is trusted, compare it with request/thread progress over the same timestamp:

1. `Total` accounts for the whole gap → the pause is a JVM pause. Split it at
   `Reaching` vs `At` and hand it to the owning layer.
2. `At safepoint` dominates → the operation. `jdk.ExecuteVMOperation` names it; if it is a GC
   phase, the GC log for the same `GC(n)` is the continuation of the trail.
3. `Reaching safepoint` dominates → identify non-arrived thread(s) with timeout diagnostics,
   then obtain their stacks from an aligned wall-clock profile/thread dump; the timeout log
   itself is not assumed to contain a useful Java stack. Join the VM operation by ID/time.
4. `Total` accounts for only part of a request gap → the residual can be host scheduling,
   application queueing/blocking or a dependency, not automatically host-side. Follow the
   per-thread/request evidence and OS signals.

Alignment across sources is by absolute timestamp, which is why `time` belongs in the decorator
set of every log involved. Uptime alone cannot be aligned with an external dashboard.

## Cadence and the apparent gap

With `-XX:GuaranteedSafepointInterval=0` (default since JDK 23), the safepoint log contains
only safepoints with a real cause. Correlating against infrastructure metrics sampled at a
fixed interval, the missing background beat can read as an instrumentation gap when it is the
correct behaviour: no safepoint happened in that interval.

| Context                                                                          | Value                 | Why                                                           |
| -------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| Production, normal running                                                       | `0` (JDK 23+ default) | Removes the overhead of periodic safepoints with no purpose   |
| Short diagnostic experiment, only if a forced cadence answers a defined question | `1000`, temporarily   | Introduces safepoints; compare against an unmodified baseline |

```bash
java -XX:GuaranteedSafepointInterval=1000 \
     -Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags \
     -jar app.jar
```

Do not leave the diagnostic change in production without measuring its effect and documenting
why induced safepoints are required.
