# Session, output, and conversion protocol

## Prepare the capture

Record the following before running anything:

```text
hypothesis and event:
target PID/container/pod/host:
load and incident correlation window:
duration or start/stop trigger:
interval/threshold and expected volume:
thread/frame filters:
stack walker and symbol source:
output, chunk/rate/memory limits, free disk:
approved privilege and rollback:
```

Confirm the installed interface:

```bash
asprof -v
asprof list <pid>
asprof --help
```

Use the help and documentation from that exact release. Examples below express intent; test
them against the installed binary before production use.

## Bounded sessions

CPU hotspot:

```bash
asprof -e cpu -d 30 -f cpu.jfr <pid>
```

Elapsed residency grouped by thread for HTML/collapsed analysis:

```bash
asprof -e wall --threads -i 20ms -d 30 -f wall.html <pid>
```

Allocation source with an explicit sampling interval:

```bash
asprof -e alloc --alloc 2m -d 60 -f alloc.jfr <pid>
```

Contended waits above a declared threshold:

```bash
asprof -e lock --lock 2ms -d 60 -f lock.jfr <pid>
```

The values are examples, not safe defaults. Choose them from minimum useful observations,
thread/allocation/event rate, acceptable perturbation, incident duration, and storage budget.

For an externally aligned experiment, use explicit lifecycle:

```bash
asprof start -e cpu -f profile.jfr <pid>
# start/mark the workload using the experiment controller
asprof status <pid>
asprof stop <pid>
```

Only one compatible profiler session may control a JVM at a time in typical deployments.
Check status and coordinate with continuous profilers/JFR agents before starting. A failed
`start` must not be followed by an assumed-valid `stop` artifact.

## Event combinations

Current releases can put multiple profiler event classes in JFR, for example a primary event
plus wall/allocation/lock options, and can synchronize selected JDK JFR settings. The exact
syntax, conflicts, replacement behavior, thresholds, and rate-limit categories are
release-specific.

Protocol:

1. verify the combination in `ProfilerOptions.md` for the pinned tag;
2. run a small synthetic workload that emits every expected class;
3. inspect the JFR summary/event types and profiler metrics;
4. verify timestamps/thread identity and counts before incident use;
5. calibrate combined overhead—costs need not add linearly;
6. avoid “collect everything” continuously unless volume and perturbation are proven safe.

When `--jfrsync` is used, retain the JFC/settings input. Confirm which execution-sample events
come from async-profiler versus the JDK and whether duplicate/replaced sampling changes the
analysis.

## Output selection

| Output           | Preserve when                                                         | Loses/risks                                                           |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| JFR              | timestamps, threads, states, multiple event classes, later conversion | schema/version/tool compatibility; chunk/file management              |
| Collapsed stacks | interoperable aggregate/differential tooling                          | event metadata, temporal ordering, many fields                        |
| Interactive HTML | immediate human exploration                                           | hard to recompute/audit without original data                         |
| Tree/flat/traces | fast targeted inspection                                              | aggressive aggregation/selection                                      |
| OTLP             | backend ingestion and correlation                                     | exporter availability, batching/drop, backend schema/cardinality/cost |

Preserve the richest original that policy permits plus checksum, command, log, producer
version, and converter version. An HTML graph alone is not an auditable incident artifact.

File extension can select output in some versions, but make intent explicit for automation.
`asprof -o` controls producer dump format; converter options belong to the converter. Do not
mix their option namespaces.

## Rotation and continuous capture

For a loop/continuous session:

```bash
asprof --loop 1h -e cpu -f '/var/log/profiles/app-%p-%t.jfr' <pid>
```

Use a timestamp or sequence token so iterations cannot overwrite each other. Also define:

- local quota and minimum free space;
- chunk/recording maximum duration and size;
- upload retry/backpressure and deletion-after-verified-upload;
- retention, encryption, access, and possible source/argument/PII exposure;
- target restart/PID reuse and profiler-agent lifecycle;
- behavior on disk full, backend outage, process crash, and clock step;
- health metrics for active session, output age, bytes, events, drops, and upload lag.

A file pattern prevents overwrite; it does not provide retention or backpressure. Continuous
profiling ownership belongs to `continuous-profiling`.

## Native and instrumentation sessions

Method tracing and native-allocation/lock interception are instrumentation, not ordinary
fixed-rate sampling. Scope them by exact method/library/process, threshold, duration, rate,
and memory limit. First reproduce in staging or canary. Measure overhead and failure behavior
at peak event rate, not only average traffic.

Live native/Java allocation views are censored by recording end and collection/free timing.
Keep the window and GC/load context. A surviving allocation is a candidate for ownership
analysis, not proof of a leak.

## Conversion

Use the converter shipped with or explicitly tested against the profiler recording. Before a
bulk conversion:

1. checksum and retain the original;
2. record producer/converter versions and command;
3. enumerate input event classes/counts;
4. convert without overwriting the original or prior derived artifact;
5. compare output totals and rejected/unknown event diagnostics;
6. test one known stack/thread/state/time slice.

Converter upgrades can legitimately change names, stack reconstruction, batching expansion,
colors, filters, and supported events. Treat a changed graph after converter upgrade as a
tooling change until proven otherwise.

## Differential protocol

Capture repeated A/B trials with comparable event selection, workload mix, warm-up, duration,
filters, symbols, and tool/JDK versions. Prefer original time-bearing recordings; export
collapsed stacks only as a derived aggregate.

If using folded stacks, first test argument order and sign with synthetic files:

```text
baseline: root;old 100
candidate: root;old 80
candidate: root;new 20
```

Verify that the converter labels `old` as decreased and `new` as increased. Normalize unequal
sample totals only if event exposure is intended to be compared proportionally. Do not
normalize away a genuine difference in completed work; instead compare per operation or use a
controlled fixed-work design.

Report:

```text
event and weighting
sample/event totals for A and B
normalization and sign convention
number of independent trials
changed stacks and absolute weights
business outcome with uncertainty
known stack/filter/converter limitations
```

## Validation after capture

- Confirm the file is complete/readable and its checksum is stored.
- Confirm expected event classes, target PID/process, duration, and time range.
- Compare observed with expected sample/event order of magnitude; explain gaps.
- Inspect profiler logs/metrics for lost, dropped, truncated, rate-limited, or memory-limited
  observations.
- Confirm load markers, throughput, errors, and latency overlap the recording window.
- Check stack depth, unknown-frame fraction, native/kernel symbols, and thread-role coverage.
- Compare profiled versus control workload to bound perturbation.
- Retain negative evidence: an empty/failed recording is not deletion-worthy noise.

## Troubleshooting sequence

```text
empty or implausible output
  -> did attach/start succeed and target the intended PID?
  -> did the requested event exist and remain active?
  -> did filters exclude the population?
  -> did rate/memory/disk limits discard evidence?
  -> did load overlap the window?
  -> did conversion reject or hide the event class?
  -> did stack walking/symbolization fail after samples were captured?
```

Keep these stages separate. Retrying with more privilege does not fix a converter filter;
changing stack walker does not fix a non-overlapping load window.

## Security and privacy

Profiles can expose class/method/package names, thread names, native symbols, environment-derived
file paths, process topology, and potentially user-derived labels. Method arguments should not
be assumed absent from every extension/exporter. Classify artifacts, minimize labels, encrypt
transport/storage, restrict access, and expire them. Never embed credentials in output URLs or
commands that appear in process listings/logs.

## Authoritative references

- [Profiler options](https://github.com/async-profiler/async-profiler/blob/master/docs/ProfilerOptions.md)
- [async-profiler troubleshooting](https://github.com/async-profiler/async-profiler/blob/master/docs/Troubleshooting.md)
- [async-profiler releases](https://github.com/async-profiler/async-profiler/releases)
- [JDK `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html) —
  inspect/print/assemble/disassemble behavior for JDK 25; use the target JDK documentation.
