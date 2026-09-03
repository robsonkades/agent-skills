# Custom events and consumers

## Custom event selection

Use a custom JFR event only when it supplies application semantics needed to correlate a
decision and when event frequency/payload/privacy can be bounded. Prefer existing built-in
events, metrics, traces, or logs when they already provide the relationship at lower cost.

| Need                                            | Design                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| duration of an application operation            | durational custom event with threshold and bounded fields                      |
| exact count/aggregate of a hot method in JDK 25 | evaluate JEP 520 method timing before source instrumentation                   |
| individual selected calls with stack            | narrow JEP 520/custom trace window; high perturbation review                   |
| relation between two custom event types         | custom metadata annotation marked `@Relational`                                |
| periodic application state                      | periodic event/hook or bounded scheduled emission; avoid per-request event     |
| unique request correlation                      | sampled/bounded token or trace join, not every raw trace/request ID by default |

## Correct relational metadata

`@Relational` targets annotation types, not event fields:

```java
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import jdk.jfr.Label;
import jdk.jfr.MetadataDefinition;
import jdk.jfr.Name;
import jdk.jfr.Relational;

@MetadataDefinition
@Relational
@Name("com.example.CorrelationId")
@Label("Correlation ID")
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface CorrelationId {}
```

Apply `@CorrelationId` to compatible fields on related events. Define value namespace,
collision/reuse, missing value, cardinality, privacy, and retention. Tools may use the metadata
to relate values; JFR does not enforce a foreign key or guarantee both events were recorded.

## Event schema

```java
import jdk.jfr.Category;
import jdk.jfr.DataAmount;
import jdk.jfr.Description;
import jdk.jfr.Event;
import jdk.jfr.Label;
import jdk.jfr.Name;
import jdk.jfr.StackTrace;

@Name("com.example.RequestOperation")
@Label("Request Operation")
@Description("Bounded application-operation outcome")
@Category({"Application", "Request"})
@StackTrace(false)
public final class RequestOperationEvent extends Event {
    @Label("Operation")
    String operation; // canonical route/enum; never a raw URI

    @Label("Outcome")
    String outcome; // bounded enum-like value

    @Label("Response Bytes")
    @DataAmount(DataAmount.BYTES)
    long responseBytes;
}
```

Use primitive/String/Class/Thread field types supported by the JFR API and content-type
annotations for units. Avoid mutable objects, payloads, exception messages, arbitrary headers,
or `toString()` values. Event schema/name changes need versioned reader tests; adding a field is
usually more compatible than changing meaning/unit under the same name.

## Hot-path emission

Correct duration-aware pattern:

```java
RequestOperationEvent event = new RequestOperationEvent();
event.begin();
try {
    response = service.handle(request);
} finally {
    event.end();
    if (event.shouldCommit()) {
        event.operation = canonicalOperation(request);
        event.outcome = canonicalOutcome(response);
        event.responseBytes = boundedResponseSize(response);
        event.commit();
    }
}
```

Subtleties:

- `Event.isEnabled()` and `shouldCommit()` are instance methods. The latter includes duration
  threshold and should be evaluated after timing.
- If creating/canonicalizing the event's payload is expensive, do it only after
  `shouldCommit()`. The measured operation itself cannot be skipped.
- A static `EventType` coarse guard can avoid allocation/preamble when disabled, but event
  registration and dynamic concurrent settings must be tested. It cannot know a duration
  threshold before execution.
- If `handle` throws, populate outcome in a catch/finally design without swallowing/changing the
  exception. Ensure `response` is initialized and avoid the simplified snippet's null hazard in
  production code.
- Multiple recordings use the most permissive active need for whether application event work
  may execute. Test enabling/disabling dynamically.

The JFR documentation notes disabled-event allocation can be eliminated by the JIT; verify with
JMH/assembly/allocation profiling if it matters. Do not replace evidence with fixed ns/cycle
claims.

## `isEnabled` versus `shouldCommit`

| Check                   | Use                                                          | Does not prove                                      |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `EventType.isEnabled()` | coarse type-level active enablement before expensive prework | this instance exceeds threshold/filter              |
| `event.isEnabled()`     | instance type currently enabled                              | duration threshold satisfied                        |
| `event.shouldCommit()`  | enabled and duration/settings allow this instance            | callback/backend will process it or privacy is safe |

Settings can change during operation. Design fields so a late `shouldCommit` decision remains
valid and never let telemetry affect business correctness.

## Custom settings

Advanced events can define `@SettingDefinition` methods backed by `SettingControl`. This allows
custom filtering/combination across recordings, but parsing, `combine(Set<String>)`, dynamic
changes, thread safety, allocation, and failure semantics are part of the event API. Use only
when standard threshold/stack/period controls and bounded fields cannot express the decision.
Test multiple simultaneous recording values and malformed strings.

## Programmatic `Recording`

Lifecycle:

```java
try (Recording recording = new Recording()) {
    recording.setName("bounded-incident");
    recording.enable("com.example.RequestOperation")
        .withThreshold(Duration.ofMillis(5))
        .withoutStackTrace();
    recording.setMaxAge(Duration.ofMinutes(15));
    recording.setMaxSize(256L * 1024 * 1024);
    recording.setDestination(destination);
    recording.start();
    // externally bounded operation/window
    recording.stop();
}
```

Exact destination/dump/retention/disk behavior and when data becomes readable must be tested on
the target JDK. `maxAge`/`maxSize` are retention bounds, not guaranteed history; high event rate,
chunks, disk failure, process exit, and memory-only mode affect survivability.

Do not perform long blocking disk/network work in a request thread to dump a recording. Trigger
an owned bounded worker, deduplicate alerts, verify free space, and checksum/read the result.

## `RecordingStream`

Use for live local reactions/export when callback processing is bounded:

```java
try (RecordingStream stream = new RecordingStream()) {
    stream.enable("com.example.RequestOperation")
        .withThreshold(Duration.ofMillis(5))
        .withoutStackTrace();
    stream.onEvent("com.example.RequestOperation", event -> {
        if (!handoff.offer(minimize(event))) {
            dropped.increment();
        }
    });
    stream.onError(error -> consumerErrors.increment());
    stream.startAsync();
    // own stream lifetime and orderly close elsewhere
}
```

The callback example intentionally performs no network I/O. `minimize` must copy only required
values because `RecordedEvent`/repository lifetime and queue retention need explicit ownership.
Use a bounded queue; track oldest-event lag, drops, exceptions, memory, export retries, and
shutdown deadline. Event ordering across threads/types is not equivalent to causal ordering.

`start()` blocks the caller until close; that can be correct on a dedicated owned thread. Use
`startAsync()` when lifecycle code must continue, and retain/control the returned future/thread
according to the API.

## Offline `RecordingFile`

Build readers from descriptors:

```java
try (RecordingFile file = new RecordingFile(path)) {
    while (file.hasMoreEvents()) {
        RecordedEvent event = file.readEvent();
        EventType type = event.getEventType();
        if (!supportedSchemas.contains(type.getName())) {
            continue; // or fail under a strict contract
        }
        ValueDescriptor field = type.getField("operation");
        if (field == null) {
            throw new IllegalArgumentException("incompatible event schema");
        }
        // typed access under the selected schema adapter
    }
}
```

Handle null stack/thread, truncation, experimental/unknown fields, renamed event versions, and
custom event absence. Validate complete/readable files before processing and preserve raw
recordings.

## MXBean and remote control

`FlightRecorderMXBean` provides remote management but expands the security and failure surface:
authentication/authorization, TLS, network exposure, recording ownership conflicts, stale
clients, payload size, and target overhead. Prefer an authenticated control plane with
allowlisted configurations/durations/limits rather than arbitrary remote settings. Audit who
started/stopped/dumped what.

## Failure tests

- event disabled, below/above threshold, and settings change mid-operation;
- two recordings with different thresholds/stack settings;
- event burst and callback/exporter slowdown;
- callback exception and queue full;
- disk full/unwritable destination/process shutdown during chunk/dump;
- malformed/unknown JFC/event/setting;
- old/new reader against old/new custom schema and Java 25 events;
- sensitive/high-cardinality field rejection;
- custom event class in multiple class loaders;
- no positive-control events versus a genuinely valid zero-event window.

## Authoritative references

- [Custom events guide](https://docs.oracle.com/en/java/javase/25/jfapi/creating-events.html)
- [Custom annotations guide](https://docs.oracle.com/en/java/javase/25/jfapi/custom-annotations.html)
- [`Event`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/Event.html)
- [`EventType`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/EventType.html)
- [`Recording`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/Recording.html)
- [`RecordingStream`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/RecordingStream.html)
- [`FlightRecorderMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management.jfr/jdk/management/jfr/FlightRecorderMXBean.html)
