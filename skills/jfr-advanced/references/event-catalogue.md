# Event discovery and configuration

## Generate a catalogue per JDK epoch

Do not maintain a timeless handwritten table. For every supported vendor/build/platform:

1. enumerate registered event types and setting descriptors in a small Java probe;
2. retain shipped JFC files and their checksums;
3. generate metadata from a positive-control recording;
4. record platform/experimental annotations and command/tool help;
5. test readers/converters and store schema fixtures.

Programmatic skeleton:

```java
FlightRecorder.getFlightRecorder().getEventTypes().stream()
    .sorted(Comparator.comparing(EventType::getName))
    .forEach(type -> {
        System.out.println(type.getName() + " enabled=" + type.isEnabled());
        type.getSettingDescriptors().forEach(setting ->
            System.out.println("  setting " + setting.getName()
                + " default=" + setting.getDefaultValue()));
        type.getFields().forEach(field ->
            System.out.println("  field " + field.getName()
                + " type=" + field.getTypeName()
                + " content=" + field.getContentType()));
    });
```

Registration can be dynamic and class-loader-specific; capture after relevant custom event
classes/libraries are loaded. Event type IDs are JVM-instance-specific and must not be persisted
as portable identifiers.

## Command-line inspection

```bash
jcmd <pid> JFR.check
jcmd <pid> help JFR.start
jfr metadata recording.jfr
jfr summary recording.jfr
jfr print --events '<verified-filter>' --json recording.jfr
jfr view <verified-view> recording.jfr
```

`jfr metadata recording.jfr` describes schemas available in that recording; `jfr summary`
shows actual counts/bytes by event type. Metadata presence does not prove event occurrence.
Summary absence can mean disabled/thresholded/unsupported/no workload or a wrong capture window.

Avoid piping huge JSON into ad hoc text tools as the primary parser. Use `RecordingFile` or a
streaming parser and assert schema/count/units.

## Map question to event family

Verify exact names/fields on the target:

| Question                   | Event family                                                | Required interpretation                                                     |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| GC pause/cycle/phase       | GC collection, pause and phase events                       | collector, cause, phase nesting, duration/summary semantics                 |
| heap occupancy/allocation  | heap summary, allocation sample/TLAB events                 | before/after-GC timing, sampling weight, TLAB coverage                      |
| compilation/deoptimization | compilation, inlining, deoptimization, code cache           | tier, reason, queue/elapsed, code-cache segment                             |
| monitor/park/wait          | monitor enter/wait, thread park                             | Java mechanism, threshold censoring, previous owner/timeout where available |
| file/socket I/O            | file/socket read/write                                      | duration, bytes, address/path privacy, blocking API coverage                |
| CPU/execution              | execution/native/CPU-time sample, CPU load                  | selection policy, weight, platform/experimental status, loss                |
| virtual threads            | start/end/pinned/submit-failed and scheduler-related events | JDK version, threshold, carrier/logical context and post-JEP-491 meaning    |
| class loading              | load/define/unload/class-loader statistics                  | event rate/startup scope and loader identity                                |
| safepoints                 | safepoint begin/state/synchronization/cleanup/end           | TTSP versus operation duration and event ordering                           |

Names that look plausible are not evidence. Even historically stable names can gain fields or
change settings/defaults.

## Threshold and period calibration

### Duration thresholds

Collect a bounded canary at progressively lower thresholds and retain:

```text
threshold
event count/rate and summed recorded duration
stack-present fraction and stack depth
recording bytes/s and chunk rate
process CPU/allocation/GC/tail latency delta
known synthetic event count/duration distribution
```

Recorded summed duration is a lower bound when sub-threshold events are omitted. Extrapolating
their aggregate needs a sampling/model design; do not multiply the threshold by a guessed count.

### Periodic events

A configured period is a request/settings value, not proof that every thread/resource is
visited or that events occur exactly periodically. Scheduler delays, cooperative sampling,
population selection, throttling, and collector implementation matter. Validate actual event
timestamp gaps/counts and known hot threads.

### Throttled/weighted events

Count and weight can answer different questions. Allocation samples may carry a weight
representing bytes; CPU-time/other sampling may expose lost/quality information. Inspect field
annotations and JEP/event documentation. Summing event count when weight is required can invert
rankings.

## Stack trace policy

Estimate:

```text
event rate * average frames * encoded/storage/index amplification
```

Enable stacks when caller attribution changes the decision. Disable for self-describing
periodic aggregates or when event rate is too high, and correlate via bounded application
events instead. Test actual stack walk and file/backend cost. Increasing global stack depth can
affect every stack-bearing event and may require startup-time configuration depending on JDK;
discover `JFR.configure`/`FlightRecorderOptions` behavior on the target.

Truncation policy and default depth are version inputs. Inspect raw stack `truncated` metadata
and unknown frames rather than assuming “64 leaf frames.”

## Configuration build protocol

```bash
# Explore supported named options/settings on this JDK.
jfr help configure
jfr configure --interactive

# Produce a reviewed file from an explicit base; exact option names are target-specific.
jfr configure --input /path/to/base.jfc --output service-incident.jfc \
  '<verified-event>#<verified-setting>=<value>'
```

Then start a disposable JVM using the exact operational invocation, confirm it remains healthy,
inspect active recording/settings, trigger positive/negative workload, stop/dump, validate with
summary/metadata/typed reader, and measure overhead.

Do not claim that hand editing is always wrong: JFC is the source format and advanced/event-
specific settings may require it. Review against the schema/parser in the target JDK and test.

## Multiple configurations and recordings

Test these cases explicitly:

- base JFC plus override JFC/inline setting precedence;
- unknown event/setting and missing JFC behavior;
- `none` plus explicit event settings;
- two simultaneous recordings with different threshold/stack values;
- stopping the high-detail recording while baseline continues;
- dynamically registered custom event while recording is active;
- same event name across class loaders;
- reader from Java 17/21 consuming Java 25/custom events.

Effective production cost follows what the JVM must collect for all active recordings, not
only the file later analyzed.

## Parser validation

Typed API example:

```java
long matches = 0;
try (RecordingFile file = new RecordingFile(path)) {
    while (file.hasMoreEvents()) {
        RecordedEvent event = file.readEvent();
        if (!event.getEventType().getName().equals(expectedName)) {
            continue;
        }
        matches++;
        // Resolve verified descriptors and content types before typed access.
    }
}
if (requiresPositiveControl && matches == 0) {
    throw new IllegalStateException("Expected control event is absent");
}
```

Some valid incident windows can have zero events. Use a manifest/control event, recording
health and expected opportunity count to distinguish valid zero from broken extraction.

CLI JSON may nest values and encode durations/timestamps as formatted strings; exact schema is
tool-version-specific. Parse one fixture from each supported JDK and reject silent missing
paths.

## JDK 25 feature checks

- JEP 509 events are experimental and supported on specified Linux environments. Confirm
  annotations, event fields/settings, stock enablement, throttling and lost/failed/biased sample
  semantics in the deployed update.
- JEP 518 changes sampling internals. It aims to improve safe stack walking while minimizing
  safepoint bias; it does not imply perfect/unbiased coverage.
- JEP 520 instruments selected methods for timing/tracing. Confirm filter grammar, supported
  methods, transformation interactions, aggregation/chunk semantics, thresholds/stacks, and
  overhead with the target JDK.

## Authoritative references

- [JFR event runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/runtime.html)
- [`EventType`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/EventType.html)
- [`SettingDescriptor`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/SettingDescriptor.html)
- [JDK `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JEP 509](https://openjdk.org/jeps/509), [JEP 518](https://openjdk.org/jeps/518), and [JEP 520](https://openjdk.org/jeps/520)
