---
name: jfr-and-async-profiler
description: >
  Selecting the least-perturbing JVM evidence source that matches the question: JFR events and
  timeline versus async-profiler sampling, CPU versus elapsed/off-CPU, allocation versus
  retention, lock versus queue/I/O, startup versus steady state, and one-off versus continuous
  capture. Covers adequacy, positive controls, target scope, version discovery, container
  access, overhead, artifact integrity, and cross-tool reconciliation. Use before a JVM profile
  is collected or when an empty/disagreeing recording may be a configuration artifact. Graph
  interpretation, JFR internals, async-profiler engines, and fleet operations have separate
  owners.
---

# JFR and async-profiler

## Purpose

Choose an observation whose event population and weighting answer the stated performance
question, then prove that the capture was active, adequate, bounded, and correlated to the
symptom. A CPU profile can be perfectly valid while saying nothing about off-CPU latency; an
empty contention event can mean no qualifying waits or a disabled/thresholded/wrong event.

Neither tool is categorically better. JFR provides JVM event chronology and correlations;
async-profiler provides targeted sampled stacks and additional native/perf/allocation/lock
modes. They can overlap and perturb each other. Start with the lowest-risk existing evidence
that separates hypotheses.

## Ownership boundary

- This skill owns first-instrument and capture-envelope selection.
- `jfr-advanced` owns JFC/event/schema/API details.
- `async-profiler-advanced` owns engine/stack/access/conversion details.
- `flame-graph-analysis` owns aggregate stack interpretation.
- `continuous-profiling` owns always-on fleet storage/query operations.
- `incident-evidence-capture` owns live-incident ordering and recovery budget.
- `performance-methodology` owns causal investigation and validation.

## Question contract

Before selecting a tool, write:

```text
symptom, decision, outcome metric, and affected window:
CPU, elapsed latency, allocation, retention, contention, I/O, startup, or chronology question:
target population: process/thread/task/operation/version/instance:
event/sample weight and denominator required:
minimum contribution/duration/rate worth detecting:
workload, completed work, warm-up/lifecycle and control:
collection duration/trigger and expected observations:
overhead, storage, privilege, privacy, and recovery budget:
```

“Where is time going?” is incomplete: CPU time, thread elapsed residency, request critical-path
time, and summed parallel wait are different quantities.

## Selection matrix

| Question                                 | Start with                                            | Add/switch when                                                                    |
| ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Broad intermittent JVM incident/history  | existing rolling JFR                                  | event/threshold/stack coverage is insufficient; use targeted profile/JFC           |
| On-CPU Java/native/kernel work           | async-profiler CPU or validated JFR CPU-time sampling | platform/access or stack fidelity requires alternative/correlation                 |
| Latency with low CPU / off-CPU residency | JFR duration events + wall/off-CPU profile            | queue/dependency/task ownership remains ambiguous                                  |
| GC/pause chronology                      | GC log + JFR GC/safepoint events                      | allocation/live-set attribution needed                                             |
| Allocation source                        | sampled allocation JFR/async-profiler                 | exact TLAB/lifetime/retention question requires escalation                         |
| Retained heap/leak                       | GC/live-set trend, object statistics                  | heap dump/dominator paths—not allocation profile alone                             |
| Java contention                          | JFR monitor/wait/park + thread/lock profile           | logical resource/owner requires application/pool evidence                          |
| Startup/class loading/JIT                | JFR from process start                                | targeted compilation/profile/assembly after phase localization                     |
| Native/OS scheduling gap                 | async-profiler native/kernel + host metrics           | targeted eBPF when JVM-local view cannot distinguish                               |
| Very hot selected method calls           | sampling first                                        | JDK 25 method timing/trace or custom instrumentation for a narrow bounded question |

Use both tools only when the extra dimension can change the decision and combined cost is
calibrated. “Always take CPU plus allocation” wastes budget and can perturb the incident.

## CPU, wall, and duration events

CPU sampling selects runnable/on-CPU or CPU-event consumption according to its engine. It ranks
where CPU/event samples land, not response time. Wall sampling observes eligible threads over
elapsed time, including idle/waiting states; its volume and denominator depend on thread
population and implementation. JFR duration events record qualifying operations with start/
duration and fields; thresholds censor shorter events.

For latency, combine:

- end-to-end latency/trace/queue measurement for critical path;
- JFR I/O/monitor/park/safepoint/GC events for typed intervals;
- wall/off-CPU stacks for code locations and thread roles;
- CPU stacks for actual compute;
- dependency, pool, cgroup, and host evidence for ownership.

Summed waits across concurrent threads can exceed wall time. A parked frame can be healthy idle
capacity. A socket event duration may overlap scheduler delay. Do not convert stack percentage
directly to request latency without scope/correlation.

## Allocation, GC, and retention

Allocation sampling attributes creation under its sampling/weight mechanism. Use weights when
the event provides them; event count alone may mis-rank sites. Allocation does not prove
retention or leak. GC logs/JFR establish allocation pressure, occupancy, collector phases,
pause/concurrent CPU, promotion/humongous/reference work; object statistics/heap dump establish
retained paths.

Allocation changes can affect GC frequency and collection work/duration. Do not infer “small
CPU frame + large allocation frame = GC is the cause” until GC/resource and user-impact
evidence align.

## Contention and waits

Map the code mechanism to target-JDK event types rather than one generic “blocking” event:

- monitor enter contention;
- `Object.wait`/notify protocol;
- `LockSupport.park`-based locks, synchronizers, pools, and queues;
- sleep;
- socket/file operations;
- virtual-thread pinning/scheduling/submit failures where supported;
- application/executor/connection/remote queues not automatically represented by JVM events.

Check event existence, enablement, threshold, stack setting, and workload opportunity. Zero
events can be a valid result only after positive-control/configuration/coverage validation.
Lower thresholds on a canary or bounded window while measuring event volume and overhead.

## Warm-up and phase selection

Do not require steady state when startup, readiness, class loading, cache priming, deoptimization,
or phase transition is the question. For steady-state comparisons, define warm-up by observed
outcomes and runtime state—throughput/latency, compilation activity, GC/live set, caches,
connections, and workload mix—not a sleep or one compiler-queue snapshot.

Capture phase markers and process uptime. Reprofiling a warmed candidate against a cold baseline
is not a valid differential.

## Adequacy

Plan expected selected observations for the smallest frame/event contribution worth detecting.
Sample-count uncertainty is not universally `1/sqrt(n)`: samples can be weighted,
autocorrelated, batched, throttled, clustered, filtered, and lost. Report absolute count/weight,
duration/work denominator, unknown/truncated/lost fraction, and independent recordings.

Use synthetic positive/negative controls:

- known CPU loop should appear in CPU sampling, not off-CPU;
- known sleep/park/I/O should appear in appropriate wall/JFR event coverage;
- known allocation site should appear with correct weight semantics;
- known below/above-threshold contention should demonstrate censoring;
- target/non-target threads/processes should prove scope.

Run until the design has sufficient evidence, not until one frame reaches a folklore count.

## JFR baseline decision

Continuous JFR is valuable when retroactive questions justify permanent measured cost and
durable handling. It is not mandatory for every JVM. `default.jfc` is designed as a low-overhead
starting point, not a workload-independent percentage guarantee; added events/periods/stacks and
concurrent recordings can change cost.

JFR is available in mainstream JDKs since 11, but a live `jcmd JFR.start` still depends on the
actual JVM/build, attach enabled, PID namespace, credentials, tooling, process responsiveness,
and storage. Some repository/stack/buffer configuration and evidence needed from startup cannot
be retrofitted safely. Test capture and survival before incidents.

Do not assert that `settings=default` is unsuitable or `profile` is required for all method
profiling. Inspect target JFC/event settings, question resolution, overhead, and positive
controls. Java 25 JFR CPU-time sampling and method timing/tracing are additional choices with
platform/experimental/instrumentation constraints; follow `jfr-advanced`.

## Async-profiler decision

Pin/download async-profiler through an approved artifact supply chain with release checksum/
provenance. Discover `asprof -v`, `list`, and help on the target. Generic CPU, perf-events,
`ctimer`, `itimer`, wall, stack walkers, batching, virtual-thread support, and converter options
change by release/platform.

Container failure can be attach, PID/filesystem namespace, UID, seccomp/LSM, perf policy,
capabilities, PMU virtualization, limits, or symbols. `ctimer` may avoid perf-event privilege but
also changes selection/resolution/kernel visibility; it is not “same result minus kernel
stacks.” Prefer the least-privileged engine that meets the question and prove what actually ran.

Async-profiler typically allows one controlled session per target library/JVM at a time; JFR
supports multiple recordings. Coordinate with existing agents/profilers and test supported
multi-event JFR output rather than launching competing sessions.

## Instrumentation versus sampling

Instrumentation cost generally scales with selected invocation/allocation/event rate and can
change inlining/transformation behavior; sampling cost generally scales with sampling/event
rate and stack work. Neither is universally safe/unsafe in production. APM and JFR custom/method
events can be production-appropriate when narrow, calibrated, bounded, and reversible.

Use instrumentation when exact call/duration semantics are required and sampling cannot answer
the decision. Measure control, enabled, burst, exception, retransformation, agent-interaction,
and tail-latency arms. Never say “instrumenting agents are forbidden in production.”

## Thread dumps are not profiles

Repeated thread dumps can show persistence/progress/ownership and are valuable for deadlocks/
liveness. They are not a statistically designed sampler, and capture/output cost can be material
with large platform/virtual-thread populations. Modern JDK dump commands/formats and virtual-
thread coverage differ. Do not claim every `jstack` invocation necessarily uses one global
safepoint; inspect target implementation/impact and use `concurrency-diagnostics`.

## Cross-tool disagreement

Disagreement can come from different clocks/populations/weights, thresholds, filters, time
windows, stack walking/symbols, JDK/tool versions, lost events, or genuine multi-layer behavior.
Reconcile this table before choosing one result:

| Dimension                            | JFR result | async-profiler result |
| ------------------------------------ | ---------- | --------------------- |
| exact interval/load/process uptime   |            |                       |
| event/engine and eligible population |            |                       |
| weight/unit/threshold/period         |            |                       |
| thread/state/context filters         |            |                       |
| stack depth/walker/symbol coverage   |            |                       |
| event/sample totals and loss         |            |                       |
| tool/JDK/config epoch                |            |                       |

The disagreement is a diagnostic lead, not automatically a finding and never permission to
select the convenient graph.

## Capture workflow

1. Preserve existing telemetry and incident window.
2. State the question contract and surviving hypotheses.
3. Select least-risk event/clock/tool and target cohort.
4. Discover target capabilities/settings/access; run controls.
5. Bound duration, event/sample rate, disk/memory, privilege, and abort threshold.
6. Capture workload/outcome markers and profiler/JFR health concurrently.
7. Verify file/readability, counts/weights, loss, scope, timestamps, checksum, and privacy.
8. Interpret through owning skill and validate any change with repeated external outcomes.

## Anti-patterns

**Anti-pattern: CPU profile closes a latency investigation.** It sees compute, not off-CPU/
dependency/queue critical path. Add typed duration and wall/trace evidence.

**Anti-pattern: allocation profile on every investigation.** It adds cost and answers a different
question. Require allocation/GC/memory hypothesis.

**Anti-pattern: zero event count proves absence.** Validate event schema/settings/threshold,
capture opportunity, and positive control.

**Anti-pattern: copy exact JFR/async-profiler defaults and percentages.** Settings and engines
are version/workload dependent. Discover, calibrate, fingerprint, and preserve effective config.

## Definition of done

- [ ] Question names clock/event, population, weight, minimum contribution, and decision.
- [ ] Tool choice and alternatives are justified by information gain and risk.
- [ ] Runtime/tool/settings/access were discovered from pinned target versions.
- [ ] Positive/negative controls, adequate observation count/weight, and loss checks pass.
- [ ] Capture aligns to workload/lifecycle/outcome and has bounded overhead/storage/privilege.
- [ ] Artifact is readable, checksummed, provenance-bearing, privacy-classified, and durable.
- [ ] Cross-tool results are reconciled by semantics before causal interpretation.

## References

- [Choosing a profile](references/choosing-a-profile.md)
- [Command and production capture protocol](references/commands.md)
- [JFR API Programmer's Guide](https://docs.oracle.com/en/java/javase/25/jfapi/)
- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [async-profiler repository](https://github.com/async-profiler/async-profiler)
