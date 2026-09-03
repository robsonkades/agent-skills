# Sources, orientations, and artifact diagnosis

## Width semantics by event family

The same rendered graph can carry different quantities:

| Event family                | Typical selection                                        | Width may represent                      | Key caveats                                                                |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| CPU/perf sample             | CPU/event counter overflow or CPU-time timer             | count or weighted CPU/event exposure     | skid, multiplexing, kernel/user eligibility, lost samples                  |
| JFR execution/native sample | JDK sampler policy for eligible Java/native threads      | sample count under that JDK's policy     | not automatically CPU-proportional; implementation/version/state semantics |
| Wall sample                 | periodic eligible-thread observation                     | elapsed-residency sample count           | idle population, batching/subsampling, state transitions                   |
| Allocation                  | sampled JVM allocation events/TLAB mechanisms            | count or estimated/total allocated bytes | sampling weight, TLAB/outside-TLAB, no retention conclusion                |
| Lock/wait                   | qualifying contention/wait event                         | events or sampled/thresholded duration   | threshold bias, supported primitive coverage, no causal owner by itself    |
| Off-CPU interval            | blocked interval start/end or state-filtered wall sample | duration or sample count                 | blocked cause/owner, overlap across threads, censoring                     |
| PMU                         | selected hardware counter overflow                       | sampled event count                      | CPU model, multiplexing, skid, event definition                            |

Inspect event metadata and converter aggregation. `--samples` versus `--total`, threshold
weight, or JFR event duration can change width while the visual style stays identical.

### JFR execution samples

Do not encode one JDK implementation's thread-sampling constants as a universal model. JFR
sampling changed in JDK 25 with cooperative sampling, and CPU-time sampling is a separate
experimental feature on supported platforms. For the deployed build:

```bash
jfr metadata recording.jfr
jfr summary recording.jfr
jfr print --events jdk.ExecutionSample,jdk.NativeMethodSample,jdk.CPUTimeSample recording.jfr
```

Check event fields, thread state, period/throttle settings, lost-sample events, and which
events the converter includes. A “hot methods” view may combine or select event types
differently from an async-profiler CPU graph.

### Async-profiler

Async-profiler engine, stack walker, wall batching, thread filtering, and output options are
release-sensitive. Preserve `asprof -v`, exact command, profiler log/metrics, and original JFR.
Current VM-aware stack walking and virtual-thread limitations differ from historical
AsyncGetCallTrace assumptions. Follow `async-profiler-advanced`.

## Orientations are two independent choices

Separate **aggregation direction** from **drawing direction**:

```text
root-oriented aggregation: merge common roots/call paths
leaf-oriented (reversed/bottom-up) aggregation: merge common leaves/mechanisms

flame drawing: roots/bases at bottom
icicle drawing: roots/bases at top
```

A tool can invert drawing without reversing aggregation, or reverse aggregation and choose an
icicle layout. Read its legend/options. Bottom-up is valuable for a leaf such as copy, hash,
allocator, syscall, or lock mechanism scattered across many callers; caller branches above it
show ownership.

Recursion complicates inclusive percentages: the same method can appear multiple times in one
stack. A search that sums displayed frames can double-count a sample. Prefer tool-supported
unique-stack/sample aggregation and state recursive semantics.

## Thread and task populations

### Platform threads

Whole-process CPU graphs include JVM service, GC, compiler, and native threads if the producer
samples them. Whole-process wall graphs can be dominated by idle workers. Split by thread ID/
role/state using original metadata; a frame-name include filter is not necessarily a thread
collector filter.

### Virtual threads

Collector/JDK combinations may capture carrier stacks, mounted virtual-thread stacks, or only
partial logical ancestry; unmounted virtual threads do not consume an OS thread. Thread-local
labels and names can refer to carriers rather than logical tasks. Verify using a synthetic
virtual-thread workload with known mounted/parked/pinned phases, and correlate with JFR events
and application task/trace context.

Do not convert a carrier's width into one request's latency or CPU.

## Truncation and missing frames

Possible mechanisms:

- configured maximum depth or “keep top N after deep stack” policy;
- producer storage/memory limit or converter display minimum;
- unsafe/unsupported Java/JIT/native/kernel stack walk;
- missing unwind metadata/frame pointers/VM metadata;
- missing symbols/build IDs/JIT load-unload mapping;
- include/exclude filter that clips/rejects stacks;
- event rate limiting, buffer loss, or corrupt/incomplete recording;
- converter unsupported event/schema/version.

Diagnose from raw event flags/counts/logs before raising depth. Greater depth increases stack
walk, repository/file, symbol, and backend costs; it does not repair an unwinder failure.

If deep stacks retain only the leaf side, common roots disappear and the base fragments. If
the producer retains roots and clips leaves, self attribution becomes false. Determine actual
behavior from the target tool/JDK, not a remembered default such as 64 frames.

## Unknown and unresolved frames

Classify by layer:

| Appearance                | Likely layer                                          | Evidence                                                                   |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| unknown/not-walkable Java | Java/JIT walker or redefinition/unsupported runtime   | producer error categories, JDK/profiler matrix, alternate validated walker |
| hex native address        | native symbolization                                  | module map, build ID, debug symbols, ASLR/container image                  |
| hex JIT address           | time-varying JIT symbol lifecycle                     | perf map/jitdump/JFR code events and capture timing                        |
| hex kernel address        | kernel-symbol policy/permissions                      | kallsyms policy, perf user-only mode, build symbols                        |
| runtime stub/adapter      | legitimate VM transition or incomplete semantic frame | caller path, JIT/assembly/runtime event                                    |

A “high unknown fraction” is a warning, but impact depends on where unknowns occur. Quantify
weight by event/population and whether they hide the candidate path. Do not discard known
subtrees unrelated to the failure; constrain conclusions to what remains observable.

## Symptom table

| Graph symptom                            | Hypotheses                                                                  | Discriminator                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Almost all idle wait                     | wall population mostly idle; expected queue wait; saturated dependency      | active/request cohort, queue/lease/timeout data, CPU view               |
| Many disconnected bases                  | truncation, filtered roots, converter orientation                           | raw stacks/flags, depth settings, unfiltered test                       |
| Wide interpreter/adapters                | cold/phase-specific compilation, deopt/exclusion, normal low-use code       | same-window JFR/JIT logs and repeated lifecycle-matched run             |
| GC/compiler workers wide                 | real runtime CPU or mixed population                                        | split threads; GC allocation/live set and compiler queue/deopt evidence |
| One native leaf wide                     | real syscall/native work, blocked native sample, symbol/truncation boundary | event/state semantics, native/off-CPU/OS evidence                       |
| Narrow candidate disappears between runs | sampling uncertainty, inlining, renamed symbol, load mix                    | absolute counts, repeated trials, JIT log/assembly, stable grouping     |
| Differential changes almost everywhere   | denominator/load/config/tool epoch or broad real shift                      | raw totals/work, synthetic sign test, matched repeated trials           |
| One thread is 100% one function          | dedicated role or incorrect grouping                                        | thread lifecycle/role and whole-service contribution                    |

## Artifact provenance

Store:

```text
raw profile checksum and access classification
producer, runtime, OS/CPU, converter versions
exact collection and conversion commands/configuration
time range, target identity/start time, workload/deploy markers
event type/weight/unit and total
filters, stack depth/walker, symbol/build/JIT metadata
lost/dropped/truncated/unknown summary
derived graph checksum and sign/normalization convention
```

Without the raw profile, a rendered graph cannot usually be re-filtered, re-symbolized, or
audited after a converter defect is found.

## Authoritative references

- [JEP 518: JFR Cooperative Sampling](https://openjdk.org/jeps/518)
- [JEP 509: JFR CPU-Time Profiling](https://openjdk.org/jeps/509)
- [JFR event metadata API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/EventType.html)
- [JDK `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [async-profiler releases](https://github.com/async-profiler/async-profiler/releases)
- [FlameGraph source](https://github.com/brendangregg/FlameGraph)
