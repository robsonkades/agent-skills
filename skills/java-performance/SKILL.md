---
name: java-performance
description: >
  Evidence-first triage and routing for ambiguous Java/JVM performance symptoms: defining the
  affected population and work, separating latency/throughput/resource/error dimensions,
  checking measurement and recent-change validity, preserving live-incident evidence, mapping
  competing hypotheses to discriminating signals, and handing each confirmed mechanism to its
  owning skill. Use for “it is slow,” regressions, saturation, memory/RSS growth, startup,
  uneven instances, or post-JDK/deploy changes when the cause is unknown. This is a router, not
  a substitute for performance-methodology or specialist JVM/OS/database/distributed skills.
---

# Java Performance

## Purpose

Turn a vague symptom into a bounded investigation with competing hypotheses, a minimal evidence
set, and the correct specialist owners. Do not route directly from one symptom to one cause:
production regressions frequently combine load mix, queues, GC, compilation, I/O, dependencies,
resource limits, observability, and deployment lifecycle.

This skill should leave context once the investigation protocol and specialist set are clear.
`performance-methodology` owns the causal workflow from hypothesis through validation.

## Triage contract

Before choosing a tool or owner, record:

```text
user/business symptom and SLO impact:
metric definition, unit, aggregation, sample count, source, and clock:
affected percentiles/throughput/errors/cost and time interval:
offered load, completed work, operation/data/tenant mix, concurrency:
affected versions/instances/zones/hosts/clients and healthy controls:
startup/warm/steady/shutdown or incident lifecycle phase:
recent code/config/JDK/dependency/data/infrastructure/deploy changes:
resource demand/limits/queues and downstream health:
recovery deadline and evidence-preservation budget:
```

If the process is degrading and remediation is imminent, invoke `incident-evidence-capture`
before an ordinary investigation. If the measurement cannot be trusted, route first to
`latency-statistics`, `coordinated-omission`, `load-testing`, or
`performance-methodology`.

## First classification

Use four independent axes rather than a single label:

| Axis       | Questions                                                                              |
| ---------- | -------------------------------------------------------------------------------------- |
| Outcome    | latency distribution, throughput/goodput, errors/timeouts, startup/readiness, cost     |
| Demand     | offered versus accepted/completed work, mix, burst, fanout, payload/data size          |
| Resource   | CPU user/system/throttled, heap/native/RSS, allocation/GC, disk/network, pools         |
| Scope/time | one/fleet, version/host/zone, transient/permanent/periodic, load/lifecycle correlation |

“CPU low” is not “idle,” “throughput unchanged” is not equal work, and exit 137 is not by itself
proof of OOM. Normalize resource by completed work where meaningful and preserve failures/
timeouts/cancellations.

## Evidence selection

Choose the cheapest **safe** evidence that separates the leading hypotheses in this system.
There is no universal bundle such as “GC log plus two-minute `settings=profile` JFR.” Existing
continuous logs/JFR/profiles can be cheapest; a new profile/JFR can be inappropriate under disk,
CPU, thread-count, privacy, or recovery pressure.

Useful parallel views, when already available or safely collectable:

- service-level latency/throughput/errors and workload mix;
- per-instance/container/cgroup CPU, memory, pressure, I/O, network, lifecycle;
- GC/JFR/runtime and thread/task evidence;
- dependency/database/queue/pool metrics and traces;
- code/config/JDK/dependency/deployment diff;
- one affected instance versus a genuinely comparable control.

Every collection has a time, overhead, privilege, survivability, and perturbation budget.

## Routing map

| Established question/mechanism                      | Primary owner                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Investigation design, causal experiment, validation | `performance-methodology`                                                                    |
| Metric/percentile/tail validity                     | `latency-statistics`, `tail-latency-analysis`                                                |
| Load model/generator/omission                       | `load-testing`, `load-testing-advanced`, `coordinated-omission`                              |
| Evidence before restart/OOM/remediation             | `incident-evidence-capture`                                                                  |
| Which profiler/event to use                         | `jfr-and-async-profiler`                                                                     |
| JFR configuration/event internals                   | `jfr-advanced`                                                                               |
| Existing flame graph interpretation                 | `flame-graph-analysis`                                                                       |
| Host/kernel gap in JVM evidence                     | `linux-for-jvm`, then `ebpf-for-jvm`                                                         |
| GC confirmed as material path                       | `gc-log-analysis`, `jvm-gc-tuning`; collector internals as needed                            |
| Allocation source/lifetime/retention                | `allocation-profiling`, `heap-dump-analysis`, `java-reference-types-and-leaks`               |
| Heap/non-heap/native/RSS region                     | `jvm-memory-regions`, `metaspace-internals`, `off-heap-memory`                               |
| Safepoint/TTSP/felt pause mismatch                  | `safepoints`, `pause-attribution`                                                            |
| JIT warm-up/compilation/inlining/deopt/code cache   | `jit-compilation` and the matching specialist                                                |
| Startup/readiness/checkpoint/AOT                    | `startup-cds-crac-leyden`, `graalvm-native-image` where relevant                             |
| Lock/deadlock/liveness/thread state                 | `concurrency-diagnostics`                                                                    |
| Pools/virtual threads/carriers/pinning              | `thread-sizing-and-virtual-threads`, `virtual-thread-migration`, `virtual-threads-internals` |
| CPU scaling/cache/NUMA/affinity                     | `cpu-cache-and-numa`, `numa-and-cpu-affinity`, `false-sharing-and-contended` after evidence  |
| Blocking/nonblocking/native I/O path                | `blocking-and-nonblocking-io`, `io-uring-and-zero-copy` after evidence                       |
| Database query/plan/ORM/pool                        | `sql-query-performance`, `orm-fetch-and-batching-performance`, `connection-pool-sizing`      |
| Cache topology/effectiveness                        | `caching-strategies`, distributed cache skills as needed                                     |
| Serialization cost                                  | `serialization-performance`                                                                  |
| Instrumentation/tracing cost                        | `opentelemetry-performance`                                                                  |
| Capacity/queues/concurrency bounds                  | `littles-law-and-queueing`, `queueing-models`, `capacity-planning`                           |
| JDK/runtime migration discontinuity                 | `jdk-upgrade-impact`, `jvm-performance-review`                                               |
| Microbenchmark or CI gate                           | `jmh-microbenchmarks`, `jmh-advanced`, `performance-regression-ci`                           |

See [Triage map](references/triage-map.md) for ambiguous symptom forks and
[Specialist map](references/depth-ladder.md) for the knowledge graph. The specialist map is
not a mandatory shallow-to-deep ladder; load the minimum skills that own the actual questions.

## Core rules

- Classify the measured outcome and work denominator before optimizing.
- Maintain multiple hypotheses until one is discriminated; correlated signals are not
  automatically causal.
- A deploy changes more than code: process age/JIT, caches, connections, traffic shifting,
  replicas, image/JDK/dependencies/config, data/schema, sidecars, and host placement.
- High latency with low average CPU can be downstream wait, a queue/pool, throttling, pauses,
  load-balancer skew, synchronization, network loss, client timing, or idle low demand. Measure.
- Worse scaling with more threads can be locks, shared resources, coherence/NUMA, GC,
  oversubscription, quotas, I/O, downstream saturation, or workload change—not automatically
  hardware cache effects.
- Pause frequency changes do not prove allocation changed; workload, heap occupancy, sizing,
  collector policy, humongous objects, promotion, concurrent-cycle progress, and explicit GC
  also matter.
- A restart that “fixes” performance resets much more than JIT/code cache: heap/live state,
  pools/connections, caches, leaks, queues, circuit state, load placement, native resources, and
  agents.
- A healthy CPU profile does not rule out elapsed wait; a healthy GC log does not rule out
  safepoint, OS pause, dependency, or measurement error.
- Never recommend a JVM flag, pool size, cache, virtual threads, SQL index, or architecture
  change from symptom shape alone.

## Severity and decision path

```text
live user impact and remediation imminent?
  -> preserve bounded evidence under incident authority

measurement invalid/ambiguous?
  -> repair definition/load/timing/omission before causal analysis

affected cohort and timeline known?
  -> compare affected versus compatible controls and recent-change epochs

leading mechanisms identified?
  -> collect one discriminating evidence set per surviving branch

mechanism materially contributes?
  -> hand off to owner; define intervention and validation

outcome improved under representative/repeated conditions?
  -> document evidence, trade-offs, guardrail/regression prevention
```

## Troubleshooting triage failures

| Failure                | Symptom                                          | Correction                                                                       |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Premature routing      | team tunes GC/threads from one dashboard         | restore alternative hypotheses and separating signals                            |
| Aggregate hides cohort | fleet mean normal, some users/pods fail          | segment by version/instance/operation/failure domain with cardinality discipline |
| Denominator drift      | CPU/samples rise with traffic or retries         | normalize by accepted/completed work and retain errors/timeouts                  |
| Lifecycle confound     | only new pods slow                               | compare uptime/JIT/cache/readiness/traffic ramp, not steady-state fleet          |
| Evidence mismatch      | metrics/JFR/profile use different windows/clocks | align markers and state uncertainty; recollect if decision-critical              |
| Tool perturbation      | capture worsens tail or disappears after drain   | measure overhead; preserve pre-action data; use safer/sparser instrument         |
| Restart folklore       | restart helps, code cache blamed                 | enumerate every reset state and design a discriminating recurrence test          |

## Handoff contract

Give the specialist:

```text
precise symptom and affected cohort/window
metric and workload definitions with raw/normalized values
leading hypothesis and alternatives
evidence already collected, provenance, loss, and perturbation
why this evidence routes to that owner
recovery/experiment constraints
success, guardrail, and rollback criteria
```

Do not hand off only “high CPU” or a screenshot.

## Definition of done

- [ ] Symptom, scope, time, work denominator, lifecycle, and recent changes are explicit.
- [ ] Measurement validity and live-incident evidence risk were checked first.
- [ ] At least plausible alternative hypotheses and discriminating signals are recorded.
- [ ] Affected/control cohorts and resource/dependency views are aligned.
- [ ] Specialist owners are selected by established questions, not presumed causes.
- [ ] No optimization or flag is proposed before material mechanism evidence.
- [ ] Handoff includes validation/rollback criteria and evidence limitations.

## References

- [Triage map](references/triage-map.md)
- [Specialist map](references/depth-ladder.md)
- [Worked example: tail regression after deploy](references/latency-regression.md)
- [JDK 25 troubleshooting guide](https://docs.oracle.com/en/java/javase/25/troubleshoot/)
- [JDK Mission Control documentation](https://docs.oracle.com/en/java/java-components/jdk-mission-control/)
