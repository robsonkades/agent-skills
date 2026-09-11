---
name: async-profiler-advanced
description: >
  Configure and validate async-profiler when recordings are empty, idle-heavy,
  truncated, permission-blocked, containerized, multi-event, or version-sensitive.
  Choose event weights and engines, bound collection overhead, diagnose missing stacks,
  and verify conversions and differentials. Does not own initial profiler selection
  (jfr-and-async-profiler), visual interpretation (flame-graph-analysis), or JDK Flight
  Recorder configuration.
---

# Async-Profiler Advanced

## Purpose

Choose a collection mechanism whose signal corresponds to the engineering question, prove
what the runtime actually enabled, and state what the recording cannot establish. An
async-profiler file is a sample of selected events under a particular stack walker, filter,
rate limit, and access envelope—not a complete account of elapsed time.

Async-profiler evolves quickly. Pin its release, keep the matching binary and converter, run
`asprof -v`, `asprof list <pid>`, and `asprof --help`, and consult that tag's documentation.
Never make a runbook depend on `master`, a historical option name, or an assumed fallback.

The command reference is authored against async-profiler v4.5 for supported HotSpot targets
on Linux/macOS; it is not a promise of support for native Windows, other JVM implementations,
or every JDK update. Inspect the actual runtime build, container image, architecture and JVM
flags; build toolchains alone may describe a different JVM. Keep profiler build requirements,
target-JVM support and the converter's Java runtime separate. Do not upgrade the application,
profiler or dependencies merely to make an example fit.

## Ownership boundary

- Use `jfr-and-async-profiler` to choose the least-privileged first instrument.
- Use this skill to configure and validate async-profiler itself.
- Use `flame-graph-analysis` to reason from stack aggregates and differentials.
- Use `allocation-profiling`, `concurrency-diagnostics`, and `off-heap-memory` for the owning
  diagnosis once the event identifies the domain.
- Use `ebpf-for-jvm` when the question is system-wide or cannot be answered from the JVM
  process alone.

## Start with a question contract

| Question                              | Primary event                        | Weight means                                 | Major blind spot                                          |
| ------------------------------------- | ------------------------------------ | -------------------------------------------- | --------------------------------------------------------- |
| Where is on-CPU work?                 | `cpu` or supported CPU timer         | samples/CPU-event weight                     | off-CPU delay                                             |
| Where is elapsed waiting?             | `wall` with thread identity/state    | sampled elapsed residency                    | causality and queue ownership                             |
| Who allocates Java heap?              | `alloc`                              | samples or estimated bytes                   | retention/liveness unless explicitly selected             |
| Where is contended waiting?           | `lock`                               | sampled completed wait count or duration     | ongoing waits, unsupported synchronizers, non-lock queues |
| What native allocation remains?       | `nativemem`, then converter `--leak` | tracked count or bytes without matching free | pre-window allocations, unhooked allocators, ownership    |
| Which selected calls exceed a bound?  | `--trace METHOD[:T]`                 | recorded calls or duration                   | instrumentation of calls below the threshold also costs   |
| Which PMU event co-locates with code? | named perf event                     | sampled hardware/software events             | counter multiplexing/skid/model dependence                |

Write the target process, load window, event, interval/threshold, stack mode, filters, output,
rate/memory limit, expected sample volume, and validation metric before collection.

If versions, command/logs, event weight, workload window, or session ownership are missing,
reuse suitable supplied artifacts and project evidence first, then request only missing facts
that could change the command or conclusion. Continue checks those unknowns do not block.
Provide a conditional plan where needed. Do not invent an engine,
zero-loss result, safe interval, or diagnosis from an HTML filename. Separate observations
from hypotheses; for each proposed adjustment name evidence that would confirm or refute it.

## Engine selection

For CPU attribution on Linux, prefer the supported perf-events engine when kernel/user stack
coverage and per-thread CPU accounting matter. Use `ctimer` when perf events are unavailable
and current Linux/tool support is confirmed; use `itimer` where the platform lacks the better
alternatives or for compatibility. These engines do not have identical selection probability,
resolution, kernel visibility, resource cost, or failure behavior.

Use wall-clock collection for off-CPU residency and latency investigations. Wall mode samples
eligible threads regardless of whether they are running, parked, sleeping, or blocked.
`--threads` changes output grouping for non-JFR output; `--filter` changes eligible thread IDs
where supported. They are different controls.

Do not assert that a requested event ran. Inspect start diagnostics, available `status`/`metrics`,
output event types, weights, and kernel/native frame presence. Status and JFR event class alone
may not identify the CPU engine. Mark unavailable loss counters or engine evidence as unknown. Current
versions may choose a fallback for a generic CPU request; explicit event requests, platforms,
and releases differ.

Read [Sampling engines, events, and access](references/engines-and-events.md) when choosing
an engine, interpreting lock/live/native events, diagnosing access or missing stacks, or
checking PMU and virtual-thread coverage.

## Access model and least privilege

Dynamic attach and event acquisition are independent:

- attach requires PID-namespace visibility, compatible filesystem `/tmp` view, attach enabled,
  target-compatible credentials, and readable/loadable profiler library/output paths;
- Linux perf events additionally depend on kernel policy, capabilities, seccomp/LSM, resource
  limits, PMU virtualization, and symbol policy;
- native/kernel symbolization requires matching binaries/build IDs and permissions beyond
  merely opening the event.

Diagnose the failing syscall/layer. `SYS_PTRACE` is not a universal fix for
`perf_event_open`; `CAP_PERFMON`, `CAP_SYS_ADMIN`, `--all-user`, or an fd-transfer helper have
different scope and security consequences. Avoid privileged containers when a CPU-timer or
JFR recording answers the question. Record every exception and restore it after collection.

## Sampling economics

Estimate event volume before profiling:

```text
CPU-like samples ~= active CPU time / interval
wall candidates  ~= eligible threads * duration / interval
allocation events ~= allocated bytes / allocation interval
trace events      ~= selected invocations passing threshold
```

These are planning estimates, not guaranteed counts. Wall-clock cost can grow with eligible
thread count; this matters acutely with large platform-thread populations. Batching, filters,
rate limits, stack depth, memory limits, and longer intervals trade fidelity for overhead and
file size. Instrumentation modes (`--trace`, native-allocation interception) incur work on intercepted
calls, including calls rejected by duration/output filters. Bound a trial using total invocation
rate, not just emitted events; method retransformation can also perturb compilation.

For a new collection configuration, calibrate overhead against the affected workload/lifecycle
using an unprofiled control and contrasting collection intensities. Reuse applicable calibration
evidence; a conversion-only request needs no new capture. Compare throughput, latency distribution,
CPU, allocation/GC, and dropped/lost events. During live degradation, use the existing capture
budget and stop rule; do not delay authorized mitigation for complete calibration or a recording.
If the budget cannot support collection, use existing evidence or a controlled reproduction.
“Low overhead” is not an authorization to run every event in production.

## Multi-event recordings and time

JFR output is appropriate when several async-profiler event classes or synchronized JDK JFR
events need one timeline. Verify which combinations the pinned release supports; conflicts,
rate budgets, and output semantics change. `--jfrsync` coordinates a JDK recording with the
profiler, but configuration and event replacement semantics must be checked in that release.

Clock domains, timestamp preservation, chunking, conversion, and rate limits determine
whether cross-event temporal claims remain valid. A collapsed stack file destroys most event
metadata and timestamps. Preserve the original JFR plus exact command before conversion.

## Differential evidence

A differential flame graph is descriptive evidence, not a performance test. Before/after must
share workload, duration or valid normalization, warm-up state, event configuration, filters,
stack semantics, build symbolization, and enough samples. Prefer paired repetitions and
validate the performance outcome separately.

Normalization removes unequal total-sample tint; it cannot repair changed load mix or a
different probability of selecting stacks. Positive/negative colors depend on converter and
argument order—verify with a synthetic folded-stack pair rather than memorizing a palette.

## Failure modes and troubleshooting

| Symptom                                                          | Distinguish                                                   | Action                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cannot attach                                                    | PID/tmp namespace, credentials, disabled attach, library path | Prove attach separately; align namespaces/UID; use startup agent if approved          |
| Perf event denied                                                | seccomp/LSM, paranoid policy, capability, PMU virtualization  | Inspect actual denial; use least privilege or explicit timer/JFR alternative          |
| Profile unexpectedly lacks kernel frames                         | selected engine, user-only mode, symbol restrictions          | Inspect diagnostics/event type; do not infer successful perf collection from filename |
| Wall profile is huge/perturbing                                  | eligible threads × interval, batching, depth                  | Filter justified roles, increase interval, bound file/rate/memory, remeasure overhead |
| Mostly idle frames                                               | expected thread population versus incident cohort             | Group/filter by role/state; correlate with requests and queues                        |
| Unknown/truncated stacks                                         | walker support, depth/memory limits, redefinition, symbols    | Reproduce with a supported alternate walker; test any version change separately       |
| Allocation profile finds hot allocators but heap grows elsewhere | allocation versus retention question                          | Switch to live/heap-dump evidence; follow `allocation-profiling`                      |
| Differential is one-sided everywhere                             | sample totals, argument order, workload mismatch              | Test converter on synthetic input; normalize only after comparability is proven       |
| No virtual-thread application frames                             | mounted state and tool/JDK capability                         | Use JFR task/context evidence; avoid carrier-as-request conclusions                   |

## Anti-patterns

**Anti-pattern: grant capabilities until it works.** It conflates attach, event access, and
symbols while expanding blast radius. Identify the failed layer, choose the least-privileged
event, and make elevated access temporary and auditable.

**Anti-pattern: fixed 60-second recording.** Rare behavior may need longer or trigger-based
capture; high-frequency instrumentation may need seconds. Choose duration from event rate,
minimum useful sample count, incident window, overhead, and storage budget.

**Anti-pattern: percentages without denominators.** A 0.3% frame may be a handful of samples;
wall and CPU percentages answer different questions. Report event, weight, total, interval,
confidence limits where appropriate, and corroborating system metric.

**Anti-pattern: latest converter over old recording without provenance.** Converter semantics
and event schemas evolve. Keep original file, producer version, converter version, command,
and checksum; investigate differences before replacing prior output.

## Minimum result

For a command request, return the bounded command, prerequisites, event/weight interpretation,
ownership/stop rule, and success check. For a diagnostic review, add:

- observed evidence with artifact/window/versions and missing information;
- the leading hypothesis, competing explanation, and consequence;
- a proposed adjustment and a check that could confirm or refute it;
- what actually ran, artifact location, and remaining limits on the conclusion.

A proposed experiment is not a measured result. A successful conversion is not proof that
collection captured the intended population.
If a validated recording/conversion already answers the question, report the result, its limits
and any revisit condition; do not invent a configuration change or another capture to finish.

Read [Session, output, and conversion protocol](references/output-and-conversion.md) before
providing capture/lifecycle commands, multi-event settings, native/trace instrumentation,
conversion, or a differential comparison. Read
[Validation cases](references/validation-cases.md) when evaluating changes to this skill;
these cases are not a required incident report.

## References

- [async-profiler repository](https://github.com/async-profiler/async-profiler) — release,
  source, supported platforms, and matching documentation.
- [Profiler options](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/ProfilerOptions.md) — use the document from the pinned release tag.
- [Troubleshooting](https://github.com/async-profiler/async-profiler/blob/v4.5/docs/Troubleshooting.md) — official failure guidance; correlate with the installed release.
- [Linux perf security](https://docs.kernel.org/admin-guide/perf-security.html) — authoritative
  capability and `perf_event_paranoid` model.
