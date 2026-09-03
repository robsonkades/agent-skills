---
name: continuous-profiling
description: >
  Designing and operating always-on production profiling: question-driven signal choice,
  permanent overhead and coverage budgets, in-process versus host collection, context-label
  propagation, profile schemas, storage and cardinality, retention and incident preservation,
  deploy-aware comparisons, trust boundaries, and evidence-quality SLOs. Use when historical
  CPU/allocation/lock evidence must survive an incident, when profile cost or tenant labels
  can grow without bound, when a backend or agent is being selected, or when two time windows
  are compared as a regression claim. Does not teach one-off capture mechanics
  (jfr-and-async-profiler), async-profiler engines (async-profiler-advanced), JFR tuning
  (jfr-advanced), or graph interpretation (flame-graph-analysis).
---

# Continuous Profiling

## Purpose

Continuous profiling moves a bounded set of collection decisions before an incident so that
historical code-resource evidence remains queryable afterward. It does not make every future
question answerable: the chosen event, interval, context, retention, stack fidelity, and
backend schema define the evidence envelope.

Treat it as a production telemetry system. It consumes CPU, memory, network, disk, backend
compute, and operational attention on every instance; it can expose sensitive code and tenant
metadata; and it can fail silently while its dashboard remains available.

## Ownership boundary

This skill owns collection architecture, permanent budgets, context dimensions, storage,
retention, comparison protocol, security, and operational health. Delegate:

- event/engine mechanics to `async-profiler-advanced` and `jfr-advanced`;
- one-off collection choice to `jfr-and-async-profiler`;
- statistical interpretation and differential graphs to `latency-statistics` and
  `flame-graph-analysis`;
- metric-label economics to `metrics-and-cardinality`;
- system-wide eBPF/JIT symbol mechanics to `ebpf-for-jvm`.

## Define the retroactive questions

Start with decisions, not a vendor:

| Question                                            | Required evidence                                              | Common missing dimension                            |
| --------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Which deploy increased CPU per completed operation? | CPU stack weight, version, workload denominator, deploy marker | work mix and completed operations                   |
| Why did latency rise while CPU stayed flat?         | wall/off-CPU stacks, thread/task context, queues/I/O timeline  | wait cause, not just parked location                |
| Which code creates allocation pressure?             | allocation stack/weight, rate, version                         | lifetime/retention and GC context                   |
| Which tenant/operation drives cost?                 | bounded approved context propagated to samples                 | context loss across async/virtual-thread boundaries |
| What changed before an incident ended?              | pre-incident retained window and immutable snapshot            | clock alignment and evidence loss                   |

For each question declare: event, weight semantics, population, interval/threshold, required
dimensions, comparison denominator, retention horizon, minimum detectable contribution, and
known omissions. If the system cannot retain the required context safely, narrow the question
instead of adding unbounded labels.

## Architecture decision

Choose among in-process profiler/agent, native JFR, host/eBPF collector, or managed service by
capability and ownership—not by a universal decision tree.

| Dimension                | In-process profiler     | Native JFR pipeline   | Host/eBPF                                | Managed service         |
| ------------------------ | ----------------------- | --------------------- | ---------------------------------------- | ----------------------- |
| JVM/JIT awareness        | Usually strong          | Strong for JFR events | Requires JIT symbols/context integration | Product-specific        |
| Multi-language/host view | Per-runtime             | JVM only              | Strong                                   | Product-specific        |
| Process modification     | library/agent or attach | JDK facility/API      | host collector                           | usually agent/collector |
| Privilege/blast radius   | process-level           | process-level         | host/kernel policy                       | product-specific        |
| Backend/query work       | included or self-hosted | must build/integrate  | often included/self-hosted               | delegated               |
| Context propagation      | SDK/runtime-specific    | custom events/context | difficult from kernel alone              | product-specific        |
| Portability              | runtime/platform matrix | JDK/JVM matrix        | kernel/architecture matrix               | vendor matrix           |

Hybrids are normal: low-cost JFR for JVM chronology, sampled CPU profiles for code cost, and
short elevated capture for incidents. See
[Architecture and cost model](references/architecture-choice.md).

## Permanent overhead budget

Budget every channel from event opportunity, selected rate, stack depth, encoding, export,
and backend amplification:

```text
collection CPU ~= selected events/s * collection cost/event
ingest bytes    ~= events/s * encoded bytes/event
storage         ~= ingest bytes/s * retention * replication/compression factor
query cost      ~= series/stack partitions touched * window * resolution
```

Approximate opportunity rates:

```text
CPU samples       ~ consumed CPU time / interval
wall candidates   ~ eligible thread population * elapsed time / interval
allocation events ~ allocated bytes / sampling interval
lock events       ~ qualifying contentions under threshold/sampling policy
```

The implementation may batch, throttle, skip, or bias these opportunities. Measure actual
events, drops, CPU seconds per operation, allocation/GC effects, latency percentiles,
export bytes, and backend cost on a representative canary. Repeat at peak thread/allocation
rate and during exporter/backend failure.

Do not install universal thresholds such as `512k` allocation or `10ms` wall sampling. A
safe setting on one service can be useless or destabilizing on another. Start with CPU or a
low-overhead JFR configuration only after calibration; enable allocation, wall, lock, method
trace, and native-memory channels according to a budgeted question and rollout policy.

## Coverage budget

Overhead and coverage are duals. Increasing intervals or thresholds reduces cost but can make
short-lived/rare stacks invisible. Estimate the number of weighted observations expected for
the smallest contribution worth detecting, then validate with synthetic known workloads.

JFR sampling details can change between JDK releases. JDK 25 introduced experimental CPU-time
profiling (JEP 509) and cooperative sampling (JEP 518), and experimental method timing/tracing
(JEP 520); event availability, defaults, settings, platform support, and implementation caps
must be discovered from the deployed JDK. Internal constants are not stable coverage SLAs.

Monitor evidence quality itself:

- active profilers versus expected targets;
- event/sample rate by version/host class;
- lost, dropped, throttled, truncated, or unknown stacks;
- context-present ratio and cardinality;
- export queue depth, oldest-unexported age, errors, bytes, and backoff;
- backend ingest lag, rejected samples, retention and query freshness;
- symbolization/JIT-map freshness and unresolved-frame fraction.

## Context and cardinality

Profile context is not ordinary metric labeling. Attaching a tenant or request dimension to
every stack can multiply storage by unique context combinations and leak sensitive data.

Choose the minimum bounded set per question:

- stable service/version/environment identifiers;
- low-cardinality operation/route template, not raw URI;
- workload class or sampled cohort;
- tenant tier/hash/cohort only when governance and cardinality budgets permit—not tenant ID by
  default;
- trace/exemplar linkage only when sampled and supported, not a unique label on every profile
  series.

For each dimension define source, normalization, maximum active/churn cardinality, missing
value, retention, privacy class, and propagation boundary. Test executor, reactive, servlet
async, coroutine/continuation, virtual-thread, and cancellation handoffs. Thread-local context
does not automatically follow logical work, and carrier-thread identity is not request
identity.

Cardinality controls include allowlists, route aggregation, cohorts, hashing with a bounded
bucket count, sampling, per-tenant opt-in, and dropping at the producer before backend cost is
incurred. Never solve profiling cardinality by moving raw identifiers into thread names.

## Retention and incident preservation

Use two horizons:

- **rolling operational retention** sized for normal comparison and cost;
- **incident/legal hold snapshots** immutable, access-controlled, checksum/provenance-bearing,
  and explicitly expired/released.

Local JFR `maxage`/`maxsize` or profiler loops bound a process-local repository only. They do
not guarantee export, cluster-wide retention, or survival of pod/node loss. Define behavior
for disk full, clock change, restart/PID reuse, exporter outage, backend throttling, partial
upload, duplicate delivery, schema change, and encryption-key loss.

Retention must preserve deploy markers and enough pre/post history for the comparison cadence.
Long retention without symbol/build provenance can leave undecodable addresses; retain image
digest, JDK/profiler version, build IDs/maps, configuration, and source commit.

## Query and comparison protocol

Before comparing windows, establish:

1. same event/weight/schema/symbolization and compatible tool epoch;
2. workload mix, offered load, successful work, errors/timeouts, and capacity state;
3. equal filters/context availability and comparable lifecycle/warm-up phase;
4. deploy/config/dependency/infrastructure differences;
5. enough independent windows and observations for the claim;
6. normalization appropriate to the question (per CPU time, wall time, request, byte, or
   completed operation).

“Same weekday one week apart” is only a candidate control; it does not prove comparable load.
A percent change in profile samples can reflect more traffic, fewer samples elsewhere, a new
sampling rate, or a changed denominator. Differential graphs localize changed stack weight;
they do not estimate user impact without business metrics and a controlled comparison.

Prefer deploy-aware repeated before/after blocks or matched windows. Preserve total weights,
not only normalized percentages. If a backend exposes only normalized flame graphs, retrieve
raw sample/weight counts and collection health before quantitative conclusions.

## Security and trust

Profiles reveal code structure, library versions, native symbols, process roles, and possibly
tenant/operation context. Treat them as sensitive telemetry:

- authenticate producers and bind service identity to accepted labels;
- authorize queries by environment/tenant sensitivity;
- encrypt transit/storage and govern cross-region transfer;
- prevent label spoofing and query injection;
- sign/attest agents and collector configuration;
- isolate host collectors and minimize kernel capabilities;
- redact/drop disallowed context before export;
- audit access, incident holds, and deletions.

A compromised workload must not be able to publish profiles under another service/version or
poison a trusted regression baseline.

## Failure modes and troubleshooting

| Symptom                                    | Distinguish                                                                    | Action                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Dashboard has no incident data             | collector inactive, rolling data overwritten, export lag/drop, query mismatch  | Follow target→collector→queue→backend→query and preserve local remnants             |
| CPU profile disagrees with host CPU        | missing processes/native/kernel frames, throttling, sample loss, normalization | Reconcile CPU-time accounting and scope; complement with host/JFR evidence          |
| Cost explodes                              | event rate, stack/context cardinality, retention, query fanout                 | Disable highest-amplification dimension/channel; preserve a bounded incident sample |
| Tenant attribution vanishes                | context propagation break or unsupported profiler context                      | Test each handoff; report unknown rather than inherit wrong thread context          |
| Deploy diff colors everything              | sampling/config/load/denominator changed                                       | Stop causal claim; compare raw totals and rebuild matched controls                  |
| Backend appears healthy but coverage drops | silent throttling, target churn, symbol/JIT-map lag                            | Alert on expected-target and evidence-quality SLOs, not API uptime alone            |
| Profiler worsens tail latency              | event burst, exporter pause/backpressure, wall thread fanout                   | Roll back channel/interval; reproduce on canary and bound failure mode              |

## Anti-patterns

**Anti-pattern: permanent CPU everywhere, other channels behind one global threshold.** Service
shapes differ, and even CPU collection can violate a tight budget. Use per-workload calibration,
staged rollout, dynamic kill switch, and question-specific channels.

**Anti-pattern: tenant, endpoint, region, environment, and version as a universal minimum.**
This can expose identifiers and multiply partitions. Define context from a concrete query with
active/churn budgets and privacy approval.

**Anti-pattern: a home-grown `RecordingStream` counter is “a profiler backend.”** Counting only
top frames discards full stacks, thread/time context, weights, loss evidence, and provenance;
slow callbacks can perturb or backlog delivery. Either build the complete telemetry contract or
retain/query JFR through a proven pipeline.

**Anti-pattern: alert on sample-rate ratio with `offset 1w`.** Sampling configuration and load
change the numerator, and calendar offset does not control them. Alert first on absolute
business/resource guardrails and use profiles for attribution; regression automation belongs
to `performance-regression-ci`.

## Definition of done

- [ ] Retroactive questions, event semantics, minimum detectable contribution, and omissions
      are documented.
- [ ] Architecture and privilege choices are justified against alternatives.
- [ ] Per-channel collection, transport, storage, and query budgets were measured at peak.
- [ ] Context propagation, missing context, privacy, and cardinality limits were tested.
- [ ] Rolling retention and immutable incident preservation survive restart and backend outage.
- [ ] Evidence-quality SLOs detect missing targets, drops, lag, unresolved frames, and schema
      incompatibility.
- [ ] Before/after queries use compatible epochs, matched work, raw denominators, and repeated
      evidence.
- [ ] Kill switch, staged rollout, rollback, access control, and incident runbook are exercised.

## References

- [Architecture and cost model](references/architecture-choice.md)
- [Collection, context, storage, and query protocol](references/setup-and-queries.md)
- [JDK 25 `java` command: Flight Recording settings](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html) — `default.jfc` versus `profile.jfc`; use deployed-JDK docs.
- [JFR `RecordingStream` API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/RecordingStream.html)
- [JEP 509: JFR CPU-Time Profiling](https://openjdk.org/jeps/509)
- [JEP 518: JFR Cooperative Sampling](https://openjdk.org/jeps/518)
- [JEP 520: JFR Method Timing & Tracing](https://openjdk.org/jeps/520)
