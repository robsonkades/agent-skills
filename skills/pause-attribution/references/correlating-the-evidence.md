# Correlating the evidence

## The decomposition

```
Safepoint Total         = Reaching safepoint (sync) + At safepoint (VM work) + Leaving safepoint
                          \___________________/       \__________________/       \_______________/
                           thread-side problem          collector or VM-op        disarm + wake-up,
                           (TTSP)                       problem                   separate term
```

This is the tested JDK 25 log layout, not a cross-version parser schema. `At` spans the
synchronized interval, including VM work/cleanup; a GC log may time only a nested collector
phase. Host descheduling can inflate any term, so host time is not an independent additive
bucket to sum again. Match request intervals before reasoning about a remainder.

| Log field            | What it measures                                            | Answers "how long did the application stop"?              |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `Time since last`    | Interval since the previous safepoint — frequency, not cost | No                                                        |
| `Reaching safepoint` | Sync time; the slowest thread's TTSP                        | Partly                                                    |
| `At safepoint`       | Synchronized interval: VM work and cleanup                  | Partly; not necessarily equal to a GC event               |
| `Leaving safepoint`  | Disarming the polls and waking the threads                  | Partly — the term a two-field sum drops                   |
| `Total`              | Sync + operation + leaving                                  | JVM safepoint interval; correlate to application evidence |
| `Threads`            | Counts recorded by the synchronization pass                 | No; counts alone do not establish sync cost               |

Worked example of why the manual sum is not the metric — a real `G1CollectFull` line from
the package's historical 25.0.3 validation (not a new target observation):

```
Reaching safepoint:   10700 ns
At safepoint:       2808000 ns
Reaching + At     = 2818700 ns
Leaving safepoint:     4500 ns
Total:              2823200 ns     <- Reaching + At + Leaving, exact on 1,169 lines
```

The importance of an omitted term depends on its duration distribution, frequency and the
affected request/SLO contract, not a universal safepoints-per-second threshold. The checked
JDK 24 layout has no separate `Leaving` field, but its `At` is end minus sync and already
includes leaving; `Total` remains end minus begin. JDK 25 splits that old `At` interval into
`At` and `Leaving`. Do not add estimated leaving time to an older `Total` or apply the JDK 25
three-term schema to every historical log.

## Enabling the safepoint log

```bash
java -Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags -jar app.jar
```

Historical 25.0.3 output (one line, wrapped):

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

Before trusting an aggregate, compare a representative raw sample with the parser's accepted
completion records and rejected candidates. Count actual `Safepoint "...", ... Total: ...`
records, not every line containing the word `Safepoint` (timeout/debug messages can differ).
Do not interpret an unreadable file, failed producer or unmatched schema as zero events.

## The JFR safepoint events

These are duration events. In the checked JDK 25 source, SafepointBegin covers begin/sync,
SafepointEnd covers leaving, and StateSynchronization aggregates the synchronization pass
with an iteration count. They are not instantaneous markers or one event per waiting iteration.

| Event                               | Scope                          | Useful fields                                                           | When to use                                                                     |
| ----------------------------------- | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `jdk.SafepointBegin`                | Start of the cycle             | `safepointId`                                                           | Marks the start; correlate with `SafepointEnd` on the same id                   |
| `jdk.SafepointEnd`                  | End of the cycle               | `safepointId`                                                           | `SafepointEnd.endTime − SafepointBegin.startTime` approximates the cycle        |
| `jdk.SafepointStateSynchronization` | Whole synchronization pass     | `safepointId`, `initialThreadCount`, `runningThreadCount`, `iterations` | Aggregated counts/iterations, not a per-iteration timeline                      |
| `jdk.ExecuteVMOperation`            | The operation itself           | `operation`, `safepoint`, `blocking`, `caller`, `safepointId`, duration | Says **what** ran at that safepoint, and joins to Begin/End on `safepointId`    |
| `jdk.SafepointLatency`              | One profiling sample (JEP 518) | `stackTrace`, `threadState`, duration                                   | Sample-request-to-poll delay; neither global TTSP nor a quantitative bias score |

```bash
jfr configure --input profile.jfc --output safepoints.jfc \
    jdk.SafepointBegin#enabled=true jdk.SafepointBegin#threshold=0ms \
    jdk.SafepointEnd#enabled=true jdk.SafepointEnd#threshold=0ms \
    jdk.SafepointStateSynchronization#enabled=true \
    jdk.SafepointStateSynchronization#threshold=0ms \
    jdk.ExecuteVMOperation#enabled=true jdk.ExecuteVMOperation#threshold=0ms
jcmd <pid> JFR.start name=pause-attribution duration=60s filename=safepoints.jfr settings=safepoints.jfc
jfr metadata --events jdk.SafepointBegin,jdk.SafepointEnd,jdk.SafepointLatency
```

Run commands with the target JDK tools and target-visible paths, within the diagnostic budget.
On tested 25.0.3, `profile.jfc` disables SafepointEnd and StateSynchronization; plain
`settings=profile` cannot supply the advertised join. `JFR.start` returns before duration
expires and the final file is written. Confirm completion/readability or take a deliberate
`JFR.dump name=pause-attribution filename=snapshot.jfr` snapshot before analysis. A snapshot
is not the final duration window. Verify event settings and recording loss alongside metadata.

`jdk.SafepointLatency` has no `safepointId` (verified against
`src/hotspot/share/jfr/metadata/metadata.xml`, tag `jdk-25-ga`); its only event-specific payload
field is `threadState`, in addition to standard timing/thread/stack metadata. It cannot be correlated into a safepoint cycle, and using it as a shortcut to
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
            case "jdk.SafepointEnd"   -> end.put(e.getLong("safepointId"), e.getEndTime());
            case "jdk.ExecuteVMOperation" -> {
                // Version-check fields first; retain all operations at a shared safepoint.
                if (e.hasField("safepointId") && e.hasField("safepoint")
                        && e.getBoolean("safepoint")) {
                    operation.merge(e.getLong("safepointId"), e.getString("operation"),
                            (a, b) -> a + ", " + b);
                }
            }
            default -> { }   // includes jdk.SafepointLatency, a different quantity
        }
    }
}

begin.forEach((id, start) -> {
    Instant finish = end.get(id);
    if (finish != null) {
        if (finish.isBefore(start)) throw new IllegalStateException("reversed interval " + id);
        System.out.printf("safepoint %d: %dns JFR interval (%s)%n",
            id, Duration.between(start, finish).toNanos(),
            operation.getOrDefault(id, "unknown operation"));
    } else System.err.println("unmatched begin: " + id);
});
end.keySet().stream().filter(id -> !begin.containsKey(id))
        .forEach(id -> System.err.println("unmatched end: " + id));
```

This is a Java 17+ method-body snippet using `java.util`, `java.time`, `java.nio.file` and
`jdk.jfr.consumer` imports, for one JVM lifetime and a bounded file. Report unmatched events;
do not count them as zero. Window boundaries, disabled/thresholded events, loss or an unfinished
duration event can explain them. A currently stuck operation may not yet have emitted its event.
If an older schema lacks correlation fields, report unavailable labels; temporal attribution
is a separate hypothesis, not a silent fallback. Do not merge safepoint IDs across JVM restarts.

## Cross-checking a cycle when both sources are available

When a cycle comparison is needed, run the JFR reconstruction against a recording taken over
the same interval as the text log. Existing adequate captures suffice; absence of JFR leaves
this cross-check unavailable, not every log-based conclusion invalid.
Match individual cycles by interval/operation before comparing the largest durations; do not
pair independently sorted tails as if they identified the same events. The two expose the same JVM cycle through
different encodings — unified logging text and JFR. Agreement is a strong parser/window
consistency check, not independent proof of application impact.

- **They approximately converge:** that supports parser/window consistency. JFR event
  construction/commit and log tracing use nearby but different boundaries; log emission work
  may also fall inside the JFR interval. Do not require exact equality or explain duration
  differences as buffer-flush delay, which affects availability rather than recorded timing.
- **They diverge systematically:** inspect boundaries, configuration, missing events and clock
  conversion before accusing a parser or using the result for a production decision.

## Attributing the remainder

Once `Total` is trusted, compare it with request/thread progress over the same timestamp:

1. The aligned safepoint interval covers the progress gap → investigate that cycle, splitting
   `Reaching` vs `At`. Coverage alone does not exclude host scheduling as the underlying cause.
2. `At safepoint` dominates → the operation. `jdk.ExecuteVMOperation` names it; if it is a GC
   phase, the GC log for the same `GC(n)` is the continuation of the trail.
3. `Reaching safepoint` dominates → identify non-arrived thread(s) with timeout diagnostics,
   then obtain their stacks from an aligned wall-clock profile/thread dump; the timeout log
   itself is not assumed to contain a useful Java stack. Join the VM operation by ID/time.
4. `Total` accounts for only part of a request gap → the residual can be host scheduling,
   application queueing/blocking or a dependency, not automatically host-side. Follow the
   per-thread/request evidence and OS signals.

Align absolute timestamps with recorded timezone, clock drift/steps and uncertainty. Uptime
can also be aligned through a verified process-start anchor. A log timestamp usually marks
emission near the interval's end, not its start; reconstruct bounds from the target log semantics.
Compare actual overlaps and avoid double-counting nested GC/safepoint/JFR intervals.

## Cadence and the apparent gap

`-XX:GuaranteedSafepointInterval=0` is the default since JDK 23, but neither the flag's name
nor its help text establishes a periodic safepoint producer. In the checked 25.0.3 implementation,
it controls the VM-operation monitor's timed wait. Without an operation to execute or a separate
diagnostic forcing mechanism, waking that monitor does not itself request a safepoint.
Do not expect `1000` alone to produce a one-second beat. A gap can be correct behavior, but
exclude configuration/loss and an in-progress cycle whose completion line is still pending.

| Context                                                             | Value                 | Why                                                                           |
| ------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| Checked default invocation                                          | `0` (JDK 23+ default) | No timed monitor wake from this interval; other causes can request safepoints |
| Matched invocation to investigate an intentional nondefault setting | `1000`                | Compare actual operations/costs; this value alone does not force safepoints   |

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:GuaranteedSafepointInterval=1000 \
     -Xlog:safepoint=info:file=safepoint.log:time,uptime,level,tags \
     -jar app.jar
```

The command illustrates a nondefault invocation, not a guaranteed safepoint-generating fixture.
Retain an intentional nondefault setting only with a documented continuing purpose and
adequate target-build cost evidence. A supported existing configuration does not require
removal merely because it differs from the default.

Source for JFR duration boundaries and synchronization aggregation:
[OpenJDK 25 safepoint implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/safepoint.cpp).
Compare the [JDK 24 layout](https://github.com/openjdk/jdk/blob/jdk-24-ga/src/hotspot/share/runtime/safepoint.cpp)
before interpreting an older `At` or absent `Leaving` field.
For cadence, inspect the [25.0.3 VM-operation wait loop](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/runtime/vmThread.cpp)
and its actual operation producers rather than relying on a flag description.
