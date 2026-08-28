---
name: jfr-advanced
description: >
  JDK Flight Recorder beyond the stock profiles: authoring a custom `.jfc`, event thresholds
  and periods, custom events extending `jdk.jfr.Event`, `RecordingStream` for live
  consumption, and programmatic `Recording` control. Use when an event name was guessed
  rather than checked (`jdk.GCPauseL3`, a `pause` field on `jdk.GarbageCollection`), when
  `enable()` silently produced no data, when `settings=continuous` or `duration=0` stopped
  the JVM from starting, when contention under 10 ms is invisible in a recording, when a
  custom event is allocated in a hot path without `isEnabled()`, when `stackTrace` was
  turned on for a high-frequency event, or when a `jfr print --json` parser returns an empty
  table. Does not cover choosing which profile to take or the production baseline
  configuration (jfr-and-async-profiler), the async-profiler engine
  (async-profiler-advanced), or always-on fleet profiling infrastructure
  (continuous-profiling).
---

# JFR Advanced

## Purpose

Decide what a recording is allowed to prove. A JFR file only contains what its settings
enabled, at the threshold they enabled it with — so the configuration is chosen before
the incident, and an investigation that needs an event the `.jfc` suppressed cannot be
rescued after the fact.

The specific failure this prevents is the silent one. `Recording.enable("jdk.GCPauseL3")`
and `RecordingStream.enable()` accept any string, throw nothing, and record nothing; a
`threshold` default of 10 ms hides the fine-grained contention that matters in aggregate;
a JSON parser reading `duration` at the event root finds nothing and prints an empty
table. All three look like "no problem found".

## Workflow

1. **Read the existing recording before proposing new instrumentation.** `jfr summary`
   on the most recent file gives the event types present and their rate. A built-in event
   already covering the question makes a custom event unnecessary.
2. **Verify every event and field name against `jfr metadata` for this build.** Not from
   memory, not from documentation. Do it before writing the analysis code, not after it
   "does not work".
3. **Set the thresholds the question needs.** Copy `profile.jfc`, lower `threshold` on
   the contention events if sub-10 ms waits matter, disable `stackTrace` on high-frequency
   events, then pass the file as `settings=<file>.jfc`.
4. **Map each wait to its own event.** Blocked on `synchronized` → `jdk.JavaMonitorEnter`;
   `Object.wait()` → `jdk.JavaMonitorWait`; anything `j.u.c.` including connection pools →
   `jdk.ThreadPark`. Treating them as interchangeable is the most expensive diagnostic
   error in this domain.
5. **Add a custom event only for correlation the JVM cannot supply** — a `requestId` or
   `tenantId` tying application work to JVM events. Guard every instantiation with
   `isEnabled()` and declare `@StackTrace(false)`.
6. **Choose the consumer by the moment.** `RecordingStream` for live reaction,
   `RecordingFile` for offline analysis, an in-memory circular `Recording` with
   `dump()` on alert for incidents you cannot predict.
7. **Assert the sample count in every extraction script.** A pipeline that finds zero
   events must abort, not print an empty table.

## Rules

- Never use an event or field name that has not been confirmed by `jfr metadata` on the
  target build. `enable()` of a non-existent name throws nothing and produces nothing.
- `jdk.GarbageCollection` has **no `pause` field**. The duration fields are `sumOfPauses`
  and `longestPause`; read both, or a collector doing many short pauses is
  indistinguishable from one doing a single long one.
- The fine-grained G1 pause sub-phase event is `jdk.GCPhasePauseLevel3`, not
  `jdk.GCPauseL3`. TLAB allocation is `jdk.ObjectAllocationInNewTLAB` and
  `jdk.ObjectAllocationOutsideTLAB`.
- There is no settings profile called `continuous`. The JDK ships exactly `default.jfc`
  and `profile.jfc` in `$JAVA_HOME/lib/jfr/`. `settings=continuous` and `duration=0` both
  abort JVM startup with `Error occurred during initialization of VM`.
- Continuous recording is expressed by **omitting `duration`** and bounding retention:
  `-XX:StartFlightRecording=filename=x.jfr,maxsize=512m,maxage=1h,settings=profile.jfc`.
- The three contention events default to a `threshold` of 10 ms in `profile.jfc` and
  20 ms in `default.jfc`. Contention finer than that is invisible until the `.jfc` lowers
  it explicitly.
- Guard every custom-event instantiation with `if (XEvent.isEnabled())`. `commit()` on a
  disabled event is 1–2 ns, but `new XEvent()` still allocates.
- `@StackTrace(true)` is forbidden above roughly 10³ events/second. Raise `threshold`
  instead of enabling stack traces when the rate is unknown — a recording whose overhead
  was 0.1% of CPU has been pushed into SLO violation by exactly this change.
- `rs.start()` blocks the calling thread until `close()`. Use `rs.startAsync()`.
- Duration access differs by event shape: a plain begin/end event exposes
  `getDuration()` with no argument; an event carrying named duration fields requires
  `getDuration("longestPause")`.
- In `jfr print --json` output, fields live nested under `"values"` and durations are
  ISO-8601 **strings** (`"PT0.015927S"`), not nanosecond numbers. Inspect one raw event
  before writing the parser.
- After starting with a custom `settings=`, confirm the JVM actually came up with
  `jcmd <pid> JFR.check` — a missing `.jfc` filename fails at startup, not at record time.

## References

- [JFR event catalogue and CLI recipes](references/event-catalogue.md) — the verified
  event and field names by category, the three contention channels and their thresholds,
  and the `jfr metadata` / `summary` / `print` commands. Read before naming any event in
  code or writing an extraction pipeline.
- [Custom events, settings files and streaming](references/custom-events-and-streaming.md)
  — the annotated event class, the enabled/disabled cost table, a custom `.jfc`, the
  circular in-memory recording with dump-on-alert, and what JDK 25's JEPs 509, 518 and
  520 change. Read when adding instrumentation or building a live consumer.
