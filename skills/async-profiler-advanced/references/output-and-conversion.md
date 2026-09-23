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

Use the help and documentation from that exact release. The command templates below use the
v4.5 interface. Replace `<pid>` before execution (angle brackets are shell syntax), run from
the intended namespace with target-compatible credentials, and replace output names with
unique absolute paths writable by the target. Verify platform/JDK support, free disk, session
ownership, and overhead in a representative trial; these are not validated production defaults.

When a profiler is already loaded, compare `asprof -v <pid>` with local `asprof -v` under the
agreed attach permissions. v4.5 documents the PID form as querying the loaded agent. A new
launcher on disk does not establish which agent produced the recording. Coordinate any
mismatch with the session owner; do not replace or stop their session to align versions.

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

Contended waits sampled at a cumulative wait-time interval (not an individual wait cutoff):

```bash
asprof -e lock --lock 2ms -d 60 -f lock.jfr <pid>
```

The values are examples, not safe defaults. Choose them from minimum useful observations,
thread/allocation/event rate, acceptable perturbation, incident duration, and storage budget.

For an externally aligned experiment, use explicit lifecycle only after coordinating exclusive
session ownership and arranging a maximum duration/cleanup path:

```bash
asprof start -e cpu -f profile.jfr <pid>
# start/mark the workload using the experiment controller
asprof status <pid>
asprof stop <pid>
```

Only one compatible profiler session may control a JVM at a time in typical deployments.
Check status and coordinate with continuous profilers/JFR agents before starting. Status is
not an ownership lock: serialize controllers. If `start` fails or a session already exists,
do not issue `stop`, `resume`, or replacement commands against it. A cleanup handler may stop
only the session this controller successfully started while it still owns that session.

`-d` is a client-side start/wait/stop sequence, not a guarantee that the target stops when the
client is killed. Use the pinned release's documented agent-side timeout (v4.5 supports
`--timeout`) or an independently supervised stop path, and test controller loss in staging.
In v4.5, the [launcher](https://github.com/async-profiler/async-profiler/blob/v4.5/src/main/main.cpp)
makes an implicit collection command start asynchronously with `--timeout`, even with `-d`;
launcher exit confirms the start attempt, not completed output. Check target status and the file.
Keep recording duration separate from loop rotation: `--loop 1h` below repeats indefinitely.

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

In v4.5, `--memlimit` bounds call-trace storage, not total profiler memory, JVM RSS or file size.
Once exhausted, new stack traces are no longer recorded; an apparently stable profile can omit
new workload paths. `--chunksize` and `--chunktime` rotate JFR chunks within a recording, not
enforce a total disk quota. Define an independent disk/retention limit and stop condition;
record any trace-storage exhaustion as incomplete coverage. See the tagged
[option scopes](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/ProfilerOptions.md).

## Native and instrumentation sessions

Method tracing and native-allocation/lock interception are instrumentation, not ordinary
fixed-rate sampling. Scope them by exact method/library/process, threshold, duration, rate,
and memory limit. First reproduce in staging or canary. Measure overhead and failure behavior
at peak event rate, not only average traffic.

For v4.5 method latency, use `--trace 'com.example.Service.handle:10ms'`, replacing the
method with an actual instrumentable target; do not invent `-e trace`. This filters recorded
calls by duration, but every instrumented invocation still incurs work. Runtime
retransformation may deoptimize code; include compilation behavior in the comparison.
Use warmed controls for steady-state claims; for a startup or cold-path question preserve that
lifecycle phase in the control and instrumented runs rather than warming away the affected work.

For native leak candidates, retain frees and convert explicitly:

```bash
jfrconv --nativemem --leak --total native.jfr native-unmatched-bytes.html
```

This requires a readable native-allocation JFR with free events and the matching converter.
Do not use `--nofree` for this question. `--total` selects bytes; without it the view counts
tracked allocations. The default leak tail exclusion (10%) and missing pre-window allocations
limit the inference. Producer `--live` is Java live-object profiling, not native leak mode.
Keep the window, GC/free timing, and workload context; unmatched allocations are candidates,
not proof of a leak. See [v4.5 profiling modes](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/ProfilingModes.md).

## Conversion

Use the converter shipped with or explicitly tested against the profiler recording. Before a
bulk conversion:

1. checksum and retain the original;
2. record producer/converter versions and command;
3. enumerate input event classes/counts;
4. convert without overwriting the original or prior derived artifact;
5. compare selected-event weights and rejected/unknown event diagnostics (mark unavailable
   diagnostics as unknown);
6. test one known stack/thread/state/time slice.

For a v4.5 multi-event JFR, select the intended view rather than accepting a default:

```bash
jfrconv --wall --threads recording.jfr wall.html
jfrconv --lock --total recording.jfr lock-duration.html
jfrconv --live --total recording.jfr live-sampled-bytes.html
```

Inputs must actually contain the selected events. Batched wall record counts need not equal
expanded sample totals. A lock duration view is accumulated sampled wait time, not the
number of requests delayed. Verify a known thread/stack and weight before interpreting.

The live conversion requires `profiler.LiveObject` events captured with producer `--live`;
it cannot reconstruct liveness from an ordinary allocation recording. Its byte total is
sampled surviving object size, not estimated retained heap. Read the
[live tracker limits](engines-and-events.md#java-allocation-live-objects-native-memory-and-locks)
before making quantitative claims. Converter `--alloc` and `--live` select different event
populations; inspect each separately rather than combining their totals.

Converter upgrades can legitimately change names, stack reconstruction, batching expansion,
colors, filters, and supported events. Treat a changed graph after converter upgrade as a
tooling change until proven otherwise.

## Differential protocol

Capture repeated A/B trials with comparable event selection, workload mix, warm-up, duration,
filters, symbols, and tool/JDK versions. Prefer original time-bearing recordings; export
collapsed stacks only as a derived aggregate.

If using folded stacks, first test argument order with synthetic files. Create
`baseline.collapsed` containing `root;old 100` and `candidate.collapsed` containing two
lines: `root;old 80` and `root;new 20`. With the v4.5 converter:

```bash
jfrconv --diff baseline.collapsed candidate.collapsed diff.collapsed
jfrconv --diff baseline.collapsed candidate.collapsed diff.html
```

The collapsed result must contain `root;old 100 80` and `root;new 0 20` (order irrelevant):
baseline first, candidate second. Reverse the inputs: v4.5 emits `root;old 80 100` but
omits `new`, because it exists only in the baseline of that reversed comparison. The
[differential implementation](https://github.com/async-profiler/async-profiler/blob/v4.5/src/converter/one/convert/FlameGraph.java)
walks the candidate tree. Compare both original aggregates (and, when useful, both directions)
to account for disappeared stacks; do not infer completeness from one differential view.
Inspect the HTML tooltip/legend before assigning a color meaning. In v4.5 `--norm`
normalizes hidden-class/lambda **names**, not sample totals; do not use it as exposure
normalization. See the [converter entrypoint](https://github.com/async-profiler/async-profiler/blob/v4.5/src/converter/one/convert/Main.java).

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

- [Profiler options](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/ProfilerOptions.md)
- [async-profiler troubleshooting](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/Troubleshooting.md)
- [async-profiler releases](https://github.com/async-profiler/async-profiler/releases)
- [JDK `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html) —
  inspect/print/assemble/disassemble behavior for JDK 25; use the target JDK documentation.
