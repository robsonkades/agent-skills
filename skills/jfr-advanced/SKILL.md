---
name: jfr-advanced
description: >
  Engineering JDK Flight Recorder evidence beyond stock settings: discovering event schemas
  and settings on the target build, designing threshold/period/throttle/stack trade-offs,
  composing and validating JFC configurations, accounting for concurrent recordings, defining
  low-cost custom events and relational metadata, operating Recording/RecordingStream/MXBean
  consumers, and validating loss, parsing, retention, privacy, and Java 25 JFR features. Use
  when an event is absent, a field/parser is guessed, fine events are thresholded away, custom
  instrumentation or live export is proposed, or recording overhead/coverage is uncertain.
  Does not own first-tool selection, async-profiler, or fleet continuous-profiling operations.
---

# JFR Advanced

## Purpose

Design a recording that can answer a declared question at a measured cost, and prove that the
result contains the expected event population. JFR configuration is an observation contract:
disabled events, thresholds, periods, throttles, stack settings, chunk retention, concurrent
recordings, and consumer loss determine what absence or width can mean.

JFR evolves with the JDK. Event names, fields, annotations, settings, built-in configurations,
views, command syntax, platform support, and implementation behavior must be discovered on the
target build. Examples here are patterns, not a frozen JDK event catalogue.

## Ownership boundary

- `jfr-and-async-profiler` chooses a first capture and production baseline.
- This skill owns JFR configuration, APIs, event schema, custom events, and consumers.
- `continuous-profiling` owns fleet collection/storage/retention/query operations.
- `async-profiler-advanced` owns async-profiler's JFR producer/events/converter.
- Domain skills interpret GC, allocation, locks, I/O, JIT, and virtual-thread events.

## Evidence contract

Before changing settings, reuse established facts and record the material parts of this
contract for the proposed change:

```text
hypothesis and decision:
target JDK vendor/build/platform and process:
required event types, fields, relation, and weight/duration semantics:
smallest duration/rate/contribution that must remain observable:
eligible threads/tasks/objects and known blind spots:
period/threshold/throttle/stack/filter settings:
duration, chunk/repository/file/retention budget:
CPU/allocation/latency/file-size and consumer-lag budget:
expected event count/rate and validation workload:
privacy/access/retention classification:
```

Do not lower every threshold because “more data is better.” The useful question is whether the
configuration has sufficient coverage and power for the target mechanism while staying inside
the production budget.

## Discover before configuring

Use the exact runtime/tools:

```bash
java -version
jcmd <pid> help JFR.start
jcmd <pid> JFR.check
jfr metadata [recording.jfr]
jfr configure --interactive
jfr help view
jfr summary recording.jfr
```

Programmatically inspect `FlightRecorder.getFlightRecorder().getEventTypes()`, `EventType.getFields()`,
`getSettingDescriptors()`, and annotations. A string-based `enable(name)` can create settings
without proving a matching event is currently registered or will emit. Validate registration,
effective active settings, and a positive-control event count.

Metadata in one file/build is not a contract for another vendor/update. Keep a schema snapshot
or generated extractor tests per supported JDK epoch.

## Choose settings by event mechanism

| Setting/mechanism      | Meaning                                                                 | Failure mode                                                  |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `enabled`              | requested enablement; combined across active recordings                 | unknown/unregistered/unsupported event yields no useful data  |
| `threshold`            | requested minimum duration; effective bound can be lower during overlap | short costly events disappear; lowering can flood             |
| `period`               | periodic event cadence/convention                                       | not every periodic event samples every entity; phase aliasing |
| `throttle`             | implementation-defined event rate or interval control                   | drops/subsampling require weight/lost-event interpretation    |
| `stackTrace`           | capture commit stack when supported                                     | stack walking/storage dominates high-rate events              |
| custom filter/settings | event-specific selection                                                | semantics and syntax are event/JDK-specific                   |

For waits, choose by Java mechanism and target-JDK event metadata: monitor enter, monitor wait,
thread park, socket/file I/O, virtual-thread pinning, and executor/application queues are not
interchangeable. A `ThreadPark` stack locates the parked code; it does not identify the resource
owner or full request delay without correlation.

Thresholds create left censoring. If 100,000 waits of 200 µs matter but the threshold is 10 ms,
absence is expected. Lower progressively on a canary, measure event rate/overhead, or use an
aggregate/custom counter when recording every event is not viable.

## JFC and configuration composition

Prefer generating/reviewing configuration using the target JDK's `jfr configure` and checked-in
JFC files. Treat the JFC as code:

- pin its base JDK/configuration digest;
- review every enabled event and setting descriptor;
- validate XML and start a disposable JVM;
- run positive/negative workload controls;
- assert event counts, fields, thresholds, stacks, file size, and overhead;
- diff effective settings after a JDK upgrade;
- keep an emergency rollback/kill switch.

JDK distributions normally provide `default` and `profile`, but custom/provider configurations
can exist. Do not assert an exact universal list or infer semantics from labels. A continuous
recording means lifecycle/retention design, not a magic `continuous` name; finite-duration
constraints and start syntax are target-version inputs.

When composing multiple files/inline settings, verify precedence with effective settings and a
fixture. `none`, `+event#setting`, duplicate settings, and command-line parsing have
version-specific rules. Never rely only on a JVM start exit code; inspect `JFR.check` and the
resulting file.

## Concurrent recordings

Multiple recordings can request different settings for the same event. JVM-side instrumentation
and event production use combined active settings. HotSpot recordings share event data;
do not assume a file is filtered independently by that recording's requested threshold or
enabled set. A temporary high-detail recording can increase both process overhead and the
event population/file size of a concurrent baseline. Filter during analysis when necessary,
and record overlap windows instead of inferring capture settings from a file's configured label.

Inventory active recordings before escalation. Calibrate overlap, and stop/close by ID/name
carefully. Event `isEnabled()`/`shouldCommit()` consider active recording settings; one permissive
recording can make custom event work execute for all application calls.

## Custom event decision

Use a custom event when application semantics are required to correlate JVM/resource events and
ordinary metrics/traces cannot supply the relationship cheaply. Exclude request bodies,
credentials and arbitrary payload objects. Add identifiers only for a required relationship,
with explicit namespace, privacy, rate, payload-size and retention limits. A bounded window may
need a token on every selected event to preserve its join contract; sampling is a choice, not a
substitute for required coverage. Do not capture raw URLs or tenant/trace IDs by default.

Design:

- stable reverse-DNS event/annotation names and schema version;
- fields with correct `@DataAmount`, `@Timespan`, `@Timestamp`, `@Percentage`, or custom
  metadata units;
- bounded String/int codes for enum-like values, or sampled correlation tokens under privacy
  policy; enum and array fields are silently omitted by JFR, so verify recorded descriptors;
- `@StackTrace(false)` by default for high-rate events;
- threshold/filter/period controls appropriate to event type;
- source compatibility and reader behavior for added/removed/renamed fields;
- explicit event-rate and payload-size limits.

`@Relational` is a **meta-annotation** applied to a custom annotation type, which is then placed
on related fields. Applying `@Relational` directly to a field does not compile. It marks a
semantic relationship for tools; it does not automatically join events or enforce referential
integrity.

## Custom event hot-path pattern

`Event.isEnabled()` is an instance method; `MyEvent.isEnabled()` is not a valid static guard.
Options:

1. allocate the event directly and defer expensive non-filter payload work until `shouldCommit()`;
2. cache/use `EventType.getEventType(MyEvent.class).isEnabled()` as a coarse precheck before
   expensive payload construction, while still using `shouldCommit()` for duration threshold;
3. restructure to collect expensive non-filter fields only after the event's duration qualifies.

Populate bounded fields used by a custom `@SettingDefinition` predicate before `shouldCommit()`;
otherwise the predicate sees default values and can discard a qualifying event. Predicates must
be cheap, non-throwing and free of side effects; do not rely on exactly one evaluation.

Pattern for an event without a field-dependent custom filter:

```java
RequestEvent event = new RequestEvent();
event.begin();
try {
    handle(request);
} finally {
    event.end();
    if (event.shouldCommit()) {
        event.operation = boundedOperation(request);
        event.result = boundedResult(request);
        event.commit();
    }
}
```

`shouldCommit()` accounts for enablement, duration threshold and custom settings after `end()`.
It does not make the operation or event allocation free, and concurrent settings can change
dynamically. Use a static `EventType` check only as an optimization proven safe with class
registration and tests.

Do not quote nanoseconds/cycles or an event-rate threshold as universal. Before making an
overhead claim, measure the relevant disabled, stack, burst, concurrent-recording or
exporter-failure conditions on the target JVM/workload. A schema-only question does not require
an unrelated benchmark matrix.

The snippet is partial application instrumentation: payload helpers must be bounded and safe
on success and failure, without masking the business exception. See
[Custom events and consumers](references/custom-events-and-streaming.md) when implementing
the event schema, failure handling or consumer lifecycle.

## Recording APIs

Choose intentionally:

- `Recording`: lifecycle/settings/destination/dump control inside the process;
- `RecordingStream`: local live event consumption;
- `EventStream.openRepository`/file APIs where supported for repository/offline consumption;
- `RecordingFile`: sequential offline event access;
- `FlightRecorderMXBean`: remote management under a secured, versioned management boundary;
- `jcmd`/`jfr`: operational control and inspection.

`RecordingStream.start()` blocks until stream completion; `startAsync()` starts a consumer
thread. Neither solves callback backpressure. Event handlers must be fast, bounded, exception-
safe, and decoupled from network I/O. Define queue/drop/spool/shutdown behavior and monitor
consumer delay, drops, callback errors, memory, and repository retention.

For graceful stream draining on Java 20+, use `RecordingStream.stop()` from lifecycle code,
never from a callback; `close()` can discard unconsumed events. Neither drains an external
export queue. See the consumer reference for Java 17 compatibility and shutdown limits.

Closing a stream/recording, process exit, and diskless/disk-backed behavior have distinct data
survival semantics. Test dump/readability on the deployed JDK; do not call a memory-only
recording a durable circular buffer without proving retention and failure behavior.

## Parsing and schema evolution

Prefer the typed consumer API for robust Java processing. With CLI JSON/XML:

- inspect the output schema from the exact JDK/tool/version/options;
- parse duration/data/timestamp content types semantically, not by assumed numeric units;
- handle nested values, null stack/thread, arrays, experimental fields, and unknown fields;
- reject malformed/non-finite data and duplicate/unexpected types according to policy;
- assert expected event population and coverage, but distinguish “valid zero events” from
  configuration/parser failure using a positive control or manifest;
- preserve raw recording and converter command.

Specific fields such as GC pause summaries or virtual-thread reasons can change. Query metadata
descriptors and use versioned adapters rather than a global table of names.

## Java 25 considerations

JDK 25 delivered:

- JEP 509, experimental JFR CPU-time profiling on supported Linux systems;
- JEP 518, cooperative JFR sampling, changing execution-sampling internals without adding a
  user-facing “cooperative” event;
- JEP 520, method timing and tracing through selective bytecode instrumentation.

Discover event annotations/settings/platform support in the deployed build. CPU-time sample
throttle, lost/quality fields, and stock enablement must be read from metadata/JFC/source for
that update. Method timing/tracing cost scales with selected invocation rate, transformation,
stack/threshold settings, and class behavior; use narrow filters and a canary/bounded window.
Generic Java 17/21 readers can discover many new event types through recording metadata, but
format compatibility, event interpretation and command options still require fixture tests.
Examples use Java 17-compatible core JFR APIs unless a newer minimum is stated; inspect project
toolchains before applying newer features, without implicitly upgrading Java or enabling experiments.

## Troubleshooting

| Symptom                                        | Distinguish                                                                           | Action                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| No events                                      | event absent/unregistered/disabled/thresholded/unsupported, no workload, parser wrong | metadata + active settings + positive control + raw summary               |
| File huge/latency rises                        | event rate, stack trace, threshold/period, concurrent recording, chunk/export         | disable highest amplification, retain diagnostics, recalibrate            |
| Fine contention absent                         | threshold censoring or wrong wait mechanism                                           | map code state to event; lower on canary and count rate                   |
| Custom event allocated but absent              | duration below threshold, no active recording, schema/reader mismatch                 | call `shouldCommit()` after end; inspect metadata/settings and test event |
| RecordingStream falls behind                   | slow callbacks/network, unbounded queue, event burst                                  | bounded handoff/drop policy; consumer-lag health; reduce event volume     |
| Old parser breaks after JDK update             | event/field/content-type/JSON schema changed                                          | version adapter from metadata; preserve raw file                          |
| Continuous baseline cost jumps during incident | second recording's permissive effective settings                                      | inventory concurrent recordings; stop/rollback targeted escalation        |

## Definition of done

Resolve the requested configuration, schema or consumer question with the smallest adequate
evidence. Reuse matching recordings, metadata and fixture results. Apply the checks below only
to the paths changed or claims made; do not introduce custom events, a live consumer or a new
capture merely to fill this list. Report necessary checks that remain unexecuted.

- [ ] Relevant target event/schema/settings and their build or recording provenance are known.
- [ ] Changed threshold/period/throttle/stack/filter choices trace to the observable effect.
- [ ] Applicable controls establish the claimed population, fields, weight or censoring.
- [ ] Claimed overhead/retention/loss/lag budgets have representative measurements.
- [ ] Recording changes account for overlap; custom-event changes check dynamic enablement.
- [ ] Added custom fields meet unit, schema, correlation and privacy contracts.
- [ ] Changed consumer/storage paths exercise relevant backpressure, exception, shutdown,
      disk-full, restart or malformed-input conditions.
- [ ] Relevant raw artifacts, settings, commands, versions, checksums and extraction assertions
      are retained; completion claims distinguish observed results from remaining limits.

## References

- [Event discovery and configuration](references/event-catalogue.md) — when selecting settings,
  calibrating coverage or validating a parser against a target JDK.
- [Custom events and consumers](references/custom-events-and-streaming.md) — when defining events
  or implementing recording/streaming/offline consumers.
- [JFR API Programmer's Guide](https://docs.oracle.com/en/java/javase/25/jfapi/)
- [JFR package API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/package-summary.html)
- [JFR consumer package](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/package-summary.html)
- [JDK 25 `jfr` tool](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JDK 25 `jcmd` tool](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
